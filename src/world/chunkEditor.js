import { BLOCK_IDS } from "../blocks.js";
import { vec3 } from "../geom.js";
import { Logger } from "../logging.js";
import { MeshHandler } from "../mesh/mesh.js";
import { UIntExtWasmMesher } from "../mesh/uIntWasmMesher.js";
import { Settings } from "../settings.js";
import { perfDiff } from "../utils.js";
import { CHUNK_SIZE, CHUNK_SIZE_BIT_LEN, CHUNK_SIZE_MASK } from "../chunk/chunk.js";
import { ChunkEntry } from "./chunkEntry.js";
import { ChunkDataExt } from "../chunk/extChunk.js";
import { ChunkLoaderClient } from "./chunkLoaderClient.js";
import { ChunkManager } from "./chunkManager.js";

const logger = new Logger("ChunkEditor");

// unoptimized but fast mesher for edits on the main thread; the optimized mesh comes from the chunk loader
const editMesher = await UIntExtWasmMesher.createFastMesher();

/**
 * Block edits in the loaded chunks. An edit takes effect right away: the chunk and the neighbours that have the block
 * in their border data get a quick, unoptimized mesh now, and are requested again from the chunk loader, which sends
 * them with the edit and an optimized mesh, once they haven't been edited for Settings.world.editRequestDelay (or at
 * the latest Settings.world.editRequestMaxDelay after the first edit). Neighbours not loaded yet are requested again
 * right away. The loader keeps the edit, so it survives reloads and appears in neighbours loaded later.
 */
export class ChunkEditor {
    #chunks;
    #loader;
    #meshHandler;
    /** loaded chunks changed by edits and not requested again yet
     * @type {Map<ChunkEntry, {firstEdit: number, lastEdit: number}>} */
    #editedChunks = new Map();

    /**
     * @param {ChunkManager} chunks
     * @param {ChunkLoaderClient} loader
     * @param {MeshHandler} meshHandler
     */
    constructor(chunks, loader, meshHandler) {
        this.#chunks = chunks;
        this.#loader = loader;
        this.#meshHandler = meshHandler;
    }

    /**
     * Changes a block in a loaded chunk. Chunk space coordinates (iz is the height).
     * @returns {boolean} whether the block was changed
     */
    setBlock(ix, iy, iz, value) {
        const start = performance.now();
        value >>>= 0; // BLOCK_IDS with the solid bit are negative, chunk data (Uint32Array) returns them unsigned
        const cx = ix >> CHUNK_SIZE_BIT_LEN;
        const cy = iy >> CHUNK_SIZE_BIT_LEN;
        const cz = iz >> CHUNK_SIZE_BIT_LEN;
        const entry = this.#chunks.getLoaded(cx, cy, cz);
        if (entry === undefined)
            return false;
        const bx = ix & CHUNK_SIZE_MASK;
        const by = iy & CHUNK_SIZE_MASK;
        const bh = iz & CHUNK_SIZE_MASK;
        if (entry.chunk.data.getVoxelXYZ(bx, by, bh) === value)
            return false;

        // before any re-request below, so the loader already has the edit when it generates them
        this.#loader.edit(vec3(ix, iy, iz), value);

        // the chunk loads a neighbour's border only if it has blocks next to that side; a placed block may be the
        // first one there, so take the cells around it from the loaded neighbours (its faces and shading need them)
        this.#syncBorderAround(entry, bx, by, bh);
        if (value !== BLOCK_IDS.EMPTY)
            entry.chunk.includeBlock(bx, by, bh);

        const outdatedRequestIds = [];
        let remeshed = 0;
        for (let dz = -1; dz <= 1; dz++)
            for (let dy = -1; dy <= 1; dy++)
                for (let dx = -1; dx <= 1; dx++) {
                    // the block's cell in this chunk's extended data (32^3 plus a 1 block border from the neighbours)
                    const ex = bx + 1 - dx * CHUNK_SIZE;
                    const ey = by + 1 - dy * CHUNK_SIZE;
                    const eh = bh + 1 - dz * CHUNK_SIZE;
                    if (ex < 0 || ex > CHUNK_SIZE + 1 || ey < 0 || ey > CHUNK_SIZE + 1 || eh < 0 || eh > CHUNK_SIZE + 1)
                        continue;
                    const neighbour = this.#chunks.get(cx + dx, cy + dy, cz + dz);
                    if (neighbour === undefined)
                        continue;
                    // below, a pending request is cancelled, and a response that may already be on the way without the
                    // edit is dropped by the new request id
                    if (!neighbour.loaded) {
                        // requested again right away, waiting for the edits to stop could keep it from loading
                        outdatedRequestIds.push(neighbour.requestId);
                        this.#loader.request(neighbour);
                        continue;
                    }
                    const data = /** @type {ChunkDataExt} */ (neighbour.chunk.data);
                    if (data.getExtVoxel(ex, ey, eh) === value)
                        continue; // border not loaded on this side (no blocks next to it), nothing to update
                    data.setExtVoxel(ex, ey, eh, value);
                    this.#replaceMesh(neighbour);
                    neighbour.dirty = true;
                    remeshed++;
                    // the optimized mesh comes from the loader once the edits stop (see update)
                    outdatedRequestIds.push(neighbour.requestId);
                    neighbour.requestId = this.#loader.nextRequestId();
                    const edited = this.#editedChunks.get(neighbour);
                    if (edited === undefined)
                        this.#editedChunks.set(neighbour, { firstEdit: start, lastEdit: start });
                    else
                        edited.lastEdit = start;
                }
        if (outdatedRequestIds.length > 0)
            this.#loader.cancel(outdatedRequestIds);

        logger.debug(() => `block (${ix}, ${iy}, ${iz}) set, ${remeshed} chunks remeshed in ${perfDiff(start)} ms`);
        return true;
    }

    /**
     * Requests the edited chunks that haven't been edited for Settings.world.editRequestDelay, or were first edited
     * Settings.world.editRequestMaxDelay ago, under the request id given at their last edit. Call once per frame.
     */
    update() {
        if (this.#editedChunks.size === 0)
            return;
        const now = performance.now();
        const { editRequestDelay, editRequestMaxDelay } = Settings.world;
        for (const [entry, edited] of this.#editedChunks) {
            if (now - edited.lastEdit < editRequestDelay && now - edited.firstEdit < editRequestMaxDelay)
                continue;
            this.#editedChunks.delete(entry);
            if (!this.#chunks.contains(entry))
                continue; // dropped meanwhile
            this.#loader.requestAgain(entry);
        }
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
