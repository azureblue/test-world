import { BLOCK_IDS } from "../blocks.js";
import { CHUNK_SIZE, CHUNK_SIZE_BIT_LEN, CHUNK_SIZE_MASK } from "../chunk/chunk.js";
import { ChunkDataExt } from "../chunk/extChunk.js";
import { vec3 } from "../geom.js";
import { Logger } from "../logging.js";
import { MeshHandler } from "../mesh/mesh.js";
import { UIntExtWasmMesher } from "../mesh/uIntWasmMesher.js";
import { Settings } from "../settings.js";
import { perfDiff } from "../utils.js";
import { ChunkResponse } from "../worker/common.js";
import { ChunkEntry } from "./chunkEntry.js";
import { ChunkManager } from "./chunkManager.js";
import { WorldClient } from "./worldClient.js";

const logger = new Logger("ChunkEditor");

// unoptimized but fast mesher for predicted edits; the optimized mesh comes from the world worker
const editMesher = await UIntExtWasmMesher.createFastMesher({ cutout: Settings.render.cutoutLeaves });

/**
 * The client's own block edits. The world worker owns the world, so an edit is sent there, and predicted here until
 * the worker's chunk messages include it: the client's chunk data changes right away (reads see it at once), and the
 * chunks whose data contains the block get a quick, unoptimized mesh in the next {@link update}, once per frame
 * however many edits they got.
 *
 * Every edit has a seq, and every chunk message says the last seq the worker had applied (editAck). A message is a
 * snapshot of the worker's world, so it replaces the client's data; edits after its editAck aren't in it yet and are
 * applied again on top ({@link onChunkData}).
 */
export class ChunkEditor {
    #chunks;
    #worldClient;
    #meshHandler;
    /** edits sent and not acknowledged by the worker yet, in seq order
     * @type {Array<{seq: number, ix: number, iy: number, iz: number, value: number}>} */
    #pendingEdits = [];
    /** loaded chunks whose data changed since the last update, get a quick mesh in it
     * @type {Set<ChunkEntry>} */
    #quickMeshQueue = new Set();

    /**
     * @param {ChunkManager} chunks
     * @param {WorldClient} worldClient
     * @param {MeshHandler} meshHandler
     */
    constructor(chunks, worldClient, meshHandler) {
        this.#chunks = chunks;
        this.#worldClient = worldClient;
        this.#meshHandler = meshHandler;
    }

    /**
     * Changes a block in a loaded chunk. Chunk space coordinates (iz is the height).
     * @returns {boolean} whether the block was changed
     */
    setBlock(ix, iy, iz, value) {
        const start = performance.now();
        value >>>= 0; // BLOCK_IDS with the solid bit are negative, chunk data (Uint32Array) returns them unsigned
        const entry = this.#chunks.getLoaded(ix >> CHUNK_SIZE_BIT_LEN, iy >> CHUNK_SIZE_BIT_LEN, iz >> CHUNK_SIZE_BIT_LEN);
        if (entry === undefined)
            return false;
        const bx = ix & CHUNK_SIZE_MASK;
        const by = iy & CHUNK_SIZE_MASK;
        const bh = iz & CHUNK_SIZE_MASK;
        if (entry.chunk.data.getVoxelXYZ(bx, by, bh) === value)
            return false;

        const seq = this.#worldClient.edit(vec3(ix, iy, iz), value);
        this.#pendingEdits.push({ seq, ix, iy, iz, value });

        // the chunk loads a neighbour's border only if it has blocks next to that side; a placed block may be the
        // first one there, so take the cells around it from the loaded neighbours (its faces and shading need them)
        this.#syncBorderAround(entry, bx, by, bh);
        let changed = 0;
        const cx = entry.position.x, cy = entry.position.y, cz = entry.position.z;
        for (let dz = -1; dz <= 1; dz++)
            for (let dy = -1; dy <= 1; dy++)
                for (let dx = -1; dx <= 1; dx++) {
                    const neighbour = this.#chunks.getLoaded(cx + dx, cy + dy, cz + dz);
                    if (neighbour !== undefined && this.#apply(neighbour, ix, iy, iz, value))
                        changed++;
                }

        logger.debug(() => `block (${ix}, ${iy}, ${iz}) set, ${changed} chunks changed in ${perfDiff(start)} ms`);
        return true;
    }

    /**
     * After a chunk message was applied: drops the acknowledged edits, applies the others to the new data.
     * @param {ChunkEntry | undefined} entry undefined if the message wasn't applied
     * @param {ChunkResponse} response
     */
    onChunkData(entry, response) {
        let acknowledged = 0;
        while (acknowledged < this.#pendingEdits.length && this.#pendingEdits[acknowledged].seq <= response.editAck)
            acknowledged++;
        if (acknowledged > 0)
            this.#pendingEdits.splice(0, acknowledged);
        if (entry === undefined)
            return;
        for (const edit of this.#pendingEdits)
            this.#apply(entry, edit.ix, edit.iy, edit.iz, edit.value);
    }

    /**
     * Quick meshes for the chunks changed since the last update. Call once per frame, after the chunk manager applied
     * chunk messages.
     */
    update() {
        if (this.#quickMeshQueue.size === 0)
            return;
        const start = performance.now();
        for (const entry of this.#quickMeshQueue)
            if (entry.loaded && this.#chunks.contains(entry))
                this.#replaceMesh(entry);
        logger.debug(() => `${this.#quickMeshQueue.size} quick meshes in ${perfDiff(start)} ms`);
        this.#quickMeshQueue.clear();
    }

    /**
     * Writes a block into the chunk's extended data if it's in it (inside or in the border) and different there.
     * @param {ChunkEntry} entry a loaded chunk
     * @returns {boolean} whether the data changed
     */
    #apply(entry, ix, iy, iz, value) {
        // the block's cell in this chunk's extended data (32^3 plus a 1 block border from the neighbours)
        const ex = ix - (entry.position.x << CHUNK_SIZE_BIT_LEN) + 1;
        const ey = iy - (entry.position.y << CHUNK_SIZE_BIT_LEN) + 1;
        const eh = iz - (entry.position.z << CHUNK_SIZE_BIT_LEN) + 1;
        if (ex < 0 || ex > CHUNK_SIZE + 1 || ey < 0 || ey > CHUNK_SIZE + 1 || eh < 0 || eh > CHUNK_SIZE + 1)
            return false;
        const data = /** @type {ChunkDataExt} */ (entry.chunk.data);
        if (data.getExtVoxel(ex, ey, eh) === value)
            return false;
        data.setExtVoxel(ex, ey, eh, value);
        const inside = ex >= 1 && ex <= CHUNK_SIZE && ey >= 1 && ey <= CHUNK_SIZE && eh >= 1 && eh <= CHUNK_SIZE;
        if (inside && value !== BLOCK_IDS.EMPTY)
            entry.chunk.includeBlock(ex - 1, ey - 1, eh - 1);
        this.#quickMeshQueue.add(entry);
        return true;
    }

    /**
     * Copies the border cells of the chunk's extended data around a block from the loaded neighbours.
     * @param {ChunkEntry} entry
     */
    #syncBorderAround(entry, bx, by, bh) {
        const data = /** @type {ChunkDataExt} */ (entry.chunk.data);
        const p = entry.position;
        for (let oz = -1; oz <= 1; oz++)
            for (let oy = -1; oy <= 1; oy++)
                for (let ox = -1; ox <= 1; ox++) {
                    const ex = bx + 1 + ox, ey = by + 1 + oy, eh = bh + 1 + oz;
                    // which neighbour the cell belongs to (0: inside this chunk)
                    const dx = ex === 0 ? -1 : (ex === CHUNK_SIZE + 1 ? 1 : 0);
                    const dy = ey === 0 ? -1 : (ey === CHUNK_SIZE + 1 ? 1 : 0);
                    const dz = eh === 0 ? -1 : (eh === CHUNK_SIZE + 1 ? 1 : 0);
                    if (dx === 0 && dy === 0 && dz === 0)
                        continue;
                    const neighbour = this.#chunks.getLoaded(p.x + dx, p.y + dy, p.z + dz);
                    if (neighbour === undefined)
                        continue;
                    const value = neighbour.chunk.data.getVoxelXYZ(ex - 1 - dx * CHUNK_SIZE, ey - 1 - dy * CHUNK_SIZE, eh - 1 - dz * CHUNK_SIZE);
                    data.setExtVoxel(ex, ey, eh, value);
                }
    }

    /**
     * Replaces the chunk's mesh with a quick one from its current data.
     * @param {ChunkEntry} entry
     */
    #replaceMesh(entry) {
        const meshData = editMesher.createMesh(entry.position, /** @type {ChunkDataExt} */ (entry.chunk.data));
        const oldMesh = entry.chunk.mesh;
        entry.chunk.mesh = meshData.isEmpty() ? null : this.#meshHandler.upload(meshData);
        if (oldMesh)
            this.#meshHandler.dispose(oldMesh);
    }
}
