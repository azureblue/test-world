import { BLOCK_HEIGHT_FULL, BLOCK_IDS, blockHeight, isLiquid, isSolid, isXQuads } from "../blocks.js";
import { Chunk, CHUNK_SIZE, CHUNK_SIZE_BIT_LEN, CHUNK_SIZE_MASK } from "../chunk/chunk.js";
import { FVec3 } from "../geom.js";
import { MeshHandler } from "../mesh/mesh.js";
import { Settings } from "../settings.js";
import { ChunkEditor } from "./chunkEditor.js";
import { ChunkManager } from "./chunkManager.js";

/**
 * The world as the rest of the game sees it: blocks to read and change, raycasts, the chunks to draw. It's the
 * client's copy: the world worker (worker/worldWorker.js) owns the world and runs the simulation (flowing water);
 * chunks come from it through {@link ChunkManager}, the client's edits go to it through {@link ChunkEditor}, which
 * predicts them until the worker's chunk messages include them.
 *
 * Coordinates are the blocks' everywhere: x, y on the ground, z the height; the block (ix, iy, iz) fills
 * [ix, ix + 1) x [iy, iy + 1) x [iz, iz + 1). Only the camera's view matrix turns that into the screen's y up.
 */
export class World {
    #chunks;
    #editor;

    /**
     * @param {MeshHandler} meshHandler
     */
    constructor(meshHandler) {
        this.#chunks = new ChunkManager(meshHandler, (entry, response) => this.#editor.onChunkData(entry, response));
        this.#editor = new ChunkEditor(this.#chunks, this.#chunks.worldClient, meshHandler);
    }

    /** the number of chunks in the render range */
    get chunksInView() {
        return this.#chunks.chunksInRange;
    }

    /** the number of chunks in the render range that are loaded */
    get chunksLoaded() {
        return this.#chunks.loadedInRange;
    }

    /** the quick mesher's time per chunk (edits), ms, a moving average */
    get quickMeshTime() {
        return this.#editor.quickMeshTime;
    }

    /** chunk messages received from the world worker so far */
    get chunkMessages() {
        return this.#chunks.messagesReceived;
    }

    /**
     * Moves the center of the loaded range to the chunk of a position.
     */
    moveTo(x, y, z) {
        this.#chunks.setCenter(
            Math.floor(x) >> CHUNK_SIZE_BIT_LEN,
            Math.floor(y) >> CHUNK_SIZE_BIT_LEN,
            Math.floor(z) >> CHUNK_SIZE_BIT_LEN);
    }

    /** Call once per frame. */
    update() {
        // chunk messages first, so a chunk with edits applied again on top gets its quick mesh in the same frame
        this.#chunks.update();
        this.#editor.update();
    }

    /**
     * @param {(chunk: Chunk) => void} chunkProcessor
     */
    forEachChunkInRangeFarToNear(chunkProcessor) {
        this.#chunks.forEachChunkInRangeFarToNear(chunkProcessor);
    }

    /**
     * @param {(chunk: Chunk) => void} chunkProcessor
     */
    forEachChunkInRangeNearToFar(chunkProcessor) {
        this.#chunks.forEachChunkInRangeNearToFar(chunkProcessor);
    }

    /**
     * Performs voxel-accurate DDA raycast without integer casting.
     * @param {FVec3} pos 
     * @param {FVec3} dir 
     * @param {number} maxDist - Maximum ray distance
     * Any non-empty block except water stops the ray (solid blocks, plants as full cubes, also plants in water); the
     * starting cell stops it only if it's solid (standing in a plant's cell doesn't keep targeting the plant).
     * @returns {{hit: boolean, x: number, y: number, z: number, block: number, nx: number, ny: number, nz: number} | null}
     *   the hit block and the normal of the face the ray entered through
     *   (pointing back towards the ray origin; all 0 when the origin itself is inside the block)
     */
    raycasti(pos, dir, maxDist = 5) {
        let x = Math.floor(pos.x);
        let y = Math.floor(pos.y);
        let z = Math.floor(pos.z);

        // Direction of step in each axis (+1 or -1)
        const stepX = Math.sign(dir.x);
        const stepY = Math.sign(dir.y);
        const stepZ = Math.sign(dir.z);

        // How far along the ray we must move in order to cross a voxel boundary on each axis
        const tDeltaX = dir.x !== 0 ? Math.abs(1 / dir.x) : Infinity;
        const tDeltaY = dir.y !== 0 ? Math.abs(1 / dir.y) : Infinity;
        const tDeltaZ = dir.z !== 0 ? Math.abs(1 / dir.z) : Infinity;

        // Calculate initial tMax values: distance to the first voxel boundary
        const tMaxX = dir.x !== 0
            ? ((stepX > 0 ? (x + 1 - pos.x) : (pos.x - x)) * tDeltaX)
            : Infinity;
        const tMaxY = dir.y !== 0
            ? ((stepY > 0 ? (y + 1 - pos.y) : (pos.y - y)) * tDeltaY)
            : Infinity;
        const tMaxZ = dir.z !== 0
            ? ((stepZ > 0 ? (z + 1 - pos.z) : (pos.z - z)) * tDeltaZ)
            : Infinity;

        let tMax = { x: tMaxX, y: tMaxY, z: tMaxZ };
        let t = 0;
        // the face the ray entered the current voxel through is opposite to the last step
        let nx = 0, ny = 0, nz = 0;
        let first = true;

        while (t <= maxDist) {
            const block = this.blockAt(x, y, z);
            const stops = first ? isSolid(block) : block !== BLOCK_IDS.EMPTY && (!isLiquid(block) || isXQuads(block));
            if (stops) {
                return { hit: true, x, y, z, block, nx, ny, nz };
            }
            first = false;

            // Step to the next voxel
            if (tMax.x < tMax.y && tMax.x < tMax.z) {
                x += stepX;
                t = tMax.x;
                tMax.x += tDeltaX;
                nx = -stepX; ny = 0; nz = 0;
            } else if (tMax.y < tMax.z) {
                y += stepY;
                t = tMax.y;
                tMax.y += tDeltaY;
                nx = 0; ny = -stepY; nz = 0;
            } else {
                z += stepZ;
                t = tMax.z;
                tMax.z += tDeltaZ;
                nx = 0; ny = 0; nz = -stepZ;
            }
        }

        return null;
    }

    /**
     * Changes a block in a loaded chunk, see {@link ChunkEditor}.
     * @returns {boolean} whether the block was changed
     */
    setBlock(ix, iy, iz, value) {
        return this.#editor.setBlock(ix, iy, iz, value);
    }

    /**
     * Saves the changed chunks of a saved world now (the world worker also does every Settings.world.saveInterval, if
     * it's above 0); the edits made before are in it.
     * @returns {Promise<number>} the chunks written
     */
    save() {
        return this.#chunks.worldClient.save();
    }

    /**
     * Whether the chunk holding a block is loaded (blockAt returns EMPTY for blocks of chunks that aren't).
     */
    isLoaded(ix, iy, iz) {
        return this.#chunks.getLoaded(ix >> CHUNK_SIZE_BIT_LEN, iy >> CHUNK_SIZE_BIT_LEN, iz >> CHUNK_SIZE_BIT_LEN) !== undefined;
    }

    /**
     * Whether a point is under the water surface: in a water cell, below its level (as the mesher draws it).
     */
    isInWater(x, y, z) {
        const iz = Math.floor(z);
        const block = this.blockAt(Math.floor(x), Math.floor(y), iz);
        return isLiquid(block) && z - iz < blockHeight(block) / BLOCK_HEIGHT_FULL;
    }

    /**
     * @returns {number} the block, EMPTY in chunks that aren't loaded
     */
    blockAt(ix, iy, iz) {
        const entry = this.#chunks.getLoaded(ix >> CHUNK_SIZE_BIT_LEN, iy >> CHUNK_SIZE_BIT_LEN, iz >> CHUNK_SIZE_BIT_LEN);
        if (entry === undefined)
            return BLOCK_IDS.EMPTY;
        return entry.chunk.data.getVoxelXYZ(ix & CHUNK_SIZE_MASK, iy & CHUNK_SIZE_MASK, iz & CHUNK_SIZE_MASK);
    }

    /**
     * The brightness of a cell's light, 0..1, as cube_solid.vert works it out (without the faces' shading): full in
     * chunks without light or not loaded.
     */
    brightnessAt(ix, iy, iz) {
        const entry = this.#chunks.getLoaded(ix >> CHUNK_SIZE_BIT_LEN, iy >> CHUNK_SIZE_BIT_LEN, iz >> CHUNK_SIZE_BIT_LEN);
        if (entry?.light == null)
            return 1;
        // the cell in the light, the chunk with a 1 block border
        const size = CHUNK_SIZE + 2;
        const l = entry.light[(((iz & CHUNK_SIZE_MASK) + 1) * size + (iy & CHUNK_SIZE_MASK) + 1) * size + (ix & CHUNK_SIZE_MASK) + 1];
        const { falloff, sun } = Settings.light;
        // sky light 0..15 from falloff ^ 7 to 1; block light 0..15 on the lightmap curve, from sky light 0's darkness
        const dark = Math.pow(falloff, 7), r = 1 - (l >> 4) / 15;
        return Math.max(Math.pow(falloff, (15 - (15 - (l & 15)) * sun) * 7 / 15), dark + (1 - dark) * (1 - r) / (r * 3 + 1));
    }
}

/**
 * A position, and the block, chunk and block in its chunk holding it.
 */
export class Position {
    x = 0; y = 0; z = 0;

    set(x, y, z) {
        this.x = x;
        this.y = y;
        this.z = z;
    }

    get ix() {
        return Math.floor(this.x);
    }

    get iy() {
        return Math.floor(this.y);
    }

    get iz() {
        return Math.floor(this.z);
    }

    get cx() {
        return this.ix >> CHUNK_SIZE_BIT_LEN;
    }

    get cy() {
        return this.iy >> CHUNK_SIZE_BIT_LEN;
    }

    get cz() {
        return this.iz >> CHUNK_SIZE_BIT_LEN;
    }

    get bx() {
        return this.ix & CHUNK_SIZE_MASK;
    }

    get by() {
        return this.iy & CHUNK_SIZE_MASK;
    }

    get bz() {
        return this.iz & CHUNK_SIZE_MASK;
    }
}
