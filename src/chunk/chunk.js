import { Dir27, fvec3, FVec3, IVec3, Vec3, vec3 } from "../geom.js";
import { ChunkMesh, MeshData } from "../mesh/mesh.js";
import { TransferObject } from "../transfer.js";
import { Array3D, FixedSizeMap, MovingAverage } from "../utils.js";

export const CHUNK_SIZE_BIT_LEN = 5 | 0;
export const CHUNK_SIZE = 32 | 0;
export const CHUNK_H = 32 | 0;
export const TEX_ID_BIT_LEN = 9 | 0;

export const CHUNK_SIZE_MASK = (CHUNK_SIZE - 1) | 0;

/** a block column's top when it has no solid block (ChunkGenerator.solidTops, world/skyTops.js) */
export const NO_TOP = -0x80000000;

export function posToKey3(cx, cy, cz) {
    return `${cx},${cy},${cz}`;
}

export class ChunkBlockData extends Array3D {
    /**
     * @param {Uint32Array | null} data - The raw block data for the chunk. If null, a new buffer will be created.
     */
    constructor(data = null) {
        super(CHUNK_SIZE, CHUNK_SIZE, CHUNK_SIZE, data);
    }
}

export class ChunkGenerator {
    /** the world's seed: every generation from the same seed is the same */
    seed;

    /** no block is generated above this height (the default {@link solidTops}) */
    get maxHeight() {
        return 256;
    }

    /**
     * Per block column of a chunk column (index y * 32 + x), a height no generated solid block is above (NO_TOP: none
     * in the column): the sky light looks for the column's highest solid block from there down
     * (world/skyTops.js). Exact or a little above is best: every chunk between it and the real top is generated to
     * look. The default is {@link maxHeight} everywhere; a generator that knows its surface returns that.
     * @returns {Int32Array}
     */
    solidTops(cx, cy) {
        return new Int32Array(CHUNK_SIZE * CHUNK_SIZE).fill(this.maxHeight);
    }

    /** @param {number} seed an integer */
    constructor(seed) {
        this.seed = seed;
    }

    /**
     * @param {Vec3} chunkPos
     * @return {ChunkBlockData}
     */
    generateChunk(chunkPos) {
    }

    /**
     * @param {number} seed an integer, the world's seed
     * @param {object} [params] the generator's own options
     * @returns {Promise<ChunkGenerator>}
     */
    static async create(seed, params = {}) {

    }
}

export class ChunkDataFactory {
    /**
     * @param {ChunkBlockData} chunkBlockData
     * @returns {ChunkData}
     */
    createChunkDataFrom(chunkBlockData) {
    }
}

/**
 * @interface
 */
export class ChunkData {

    /**
     * @return {ArrayBuffer}
     */
    rawData() {
    }

    /**
     * @param {ArrayBuffer} rawData
     */
    setRawData(rawData) {
    }


    /**
     * @returns {{minH:number, maxH:number, minY:number, maxY:number, minX:number, maxX:number} | null} 
     */
    calculateBounds() {
    }

    getVoxelXYZ(x, y, z) {
    }

    setVoxelXYZ(x, y, z, value) {
    }

    /**
     * @param {number} dir27
     * @param {ChunkData} chunkData
     */
    updateAdjChunkData(dir27, chunkData) {
    }

    /**
     * @param {number} dir27
     * @param {ChunkBlockData} chunkBlockData
     */
    updateAdjBlockData(dir27, chunkBlockData) {
    }


    updateAdjVoxel(x, y, z, value) {
    }
}

export class ChunkDataTransfer {
    /**
     * @param {ChunkData} chunkData
     * @returns {TransferObject}
     */
    transfer(chunkData) {
    }

    /**
     * @param {TransferObject} transferObject
     * @returns {ChunkData}
     */
    createFrom(transferObject) {
    }
}

export class ChunkDataProvider {

    /**
     * @param {number} cx 
     * @param {number} cy 
     * @param {number} cz 
     * @returns {ChunkData}
     */
    getChunk(cx, cy, cz) {
        throw new Error("not implemented");
    }
}

/**
 * @typedef {Object} ChunkCullBounds
 * @property {number} minZ - Minimum Z coordinate of the chunk
 * @property {number} maxZ - Maximum Z coordinate of the chunk
 * @property {number} minY - Minimum Y coordinate of the chunk
 * @property {number} maxY - Maximum Y coordinate of the chunk
 * @property {number} minX - Minimum X coordinate of the chunk
 * @property {number} maxX - Maximum X coordinate of the chunk
 * @property {number} sphereCenterX - X coordinate of the bounding sphere center
 * @property {number} sphereCenterY - Y coordinate of the bounding sphere center
 * @property {number} sphereCenterZ - Z coordinate of the bounding sphere center
 * @property {number} sphereRadius - Radius of the bounding sphere
 */

export class Chunk {
    #data
    #mesh
    #chunkPosition
    /** @type {{minH:number, maxH:number, minY:number, maxY:number, minX:number, maxX:number} | null} */
    #bounds = null;
    #boundsValid = false;

    /** @type {ChunkCullBounds} */
    cullBounds;

    /**@type {FVec3} */
    #worldCenterPosition
    #worldAABBData = new Float32Array(6);

    extra = {}

    /**
     * @param {IVec3} chunkPosition 
     * @param {ChunkData} data
     * @param {ChunkMesh} [mesh] Optional mesh for this chunk
     */
    constructor(chunkPosition, data, mesh = null) {
        this.#data = data;
        this.#chunkPosition = chunkPosition
        this.#mesh = mesh;
        this.#worldCenterPosition = fvec3(chunkPosition.x * CHUNK_SIZE + CHUNK_SIZE / 2, chunkPosition.y * CHUNK_SIZE + CHUNK_SIZE / 2, chunkPosition.z * CHUNK_SIZE + CHUNK_SIZE / 2);
        this.#updateCornersData();
    }

    bounds() {
        if (!this.#boundsValid) {
            this.#bounds = this.#data.calculateBounds();
            this.#boundsValid = true;
        }
        return this.#bounds;
    }

    /**
     * Grows the bounds (and the culling box) to include a block placed at chunk local x, y, h.
     * Removed blocks don't shrink them, which keeps culling correct, just less tight.
     */
    includeBlock(x, y, h) {
        const b = this.bounds();
        if (b === null) {
            this.#bounds = { minH: h, maxH: h + 1, minY: y, maxY: y + 1, minX: x, maxX: x + 1 };
        } else {
            b.minH = Math.min(b.minH, h); b.maxH = Math.max(b.maxH, h + 1);
            b.minY = Math.min(b.minY, y); b.maxY = Math.max(b.maxY, y + 1);
            b.minX = Math.min(b.minX, x); b.maxX = Math.max(b.maxX, x + 1);
        }
        this.#updateCornersData();
    }

    #updateCornersData() {
        const bounds = this.bounds()
        if (!bounds) {
            return;
        }

        const cp = this.#chunkPosition;
        const minX = cp.x * CHUNK_SIZE + bounds.minX;
        const maxX = cp.x * CHUNK_SIZE + bounds.maxX;

        const minY = cp.y * CHUNK_SIZE + bounds.minY;
        const maxY = cp.y * CHUNK_SIZE + bounds.maxY;

        const minZ = cp.z * CHUNK_SIZE + bounds.minH;
        const maxZ = cp.z * CHUNK_SIZE + bounds.maxH;

        const arr = this.#worldAABBData;
        arr[0] = minX; arr[1] = minY; arr[2] = minZ;
        arr[3] = maxX; arr[4] = maxY; arr[5] = maxZ;
        const dx = maxX - minX;
        const dy = maxY - minY;
        const dz = maxZ - minZ;

        this.cullBounds = {
            minZ: minZ, maxZ: maxZ,
            minY: minY, maxY: maxY,
            minX: minX, maxX: maxX,
            sphereCenterX: (minX + maxX) / 2,
            sphereCenterY: (minY + maxY) / 2,
            sphereCenterZ: (minZ + maxZ) / 2,
            sphereRadius: Math.sqrt(dx * dx + dy * dy + dz * dz) / 2                
        }
    }

    peek(x, y) {
        return this.#data.peak(x, y);
    }

    get worldCenterPosition() {
        return this.#worldCenterPosition;
    }

    get worldAABBMinMax() {
        return this.#worldAABBData;
    }

    get mesh() {
        return this.#mesh;
    }

    set mesh(mesh) {
        this.#mesh = mesh;
    }

    get data() {
        return this.#data;
    }

    set data(data) {
        this.#data = data;
    }

    get position() {
        return this.#chunkPosition;
    }
}

export class ChunkSpec {
    /**
     * @param {ChunkData} chunkData 
     * @param {MeshData} meshData 
     */
    constructor(chunkData, meshData) {
        this.chunkData = chunkData;
        this.meshData = meshData;
    }
}

/**
 * Where a saved world's chunks are (save/savedChunks.js): the loader takes a chunk from it instead of generating it,
 * and puts changed chunks into it.
 * @typedef {object} ChunkStore
 * @property {(key: string) => Uint32Array | null} blocks a chunk's blocks (a new array), null if it isn't saved
 * @property {(key: string, data: Uint32Array) => any} put keeps a chunk's blocks, returns the saved form
 */

export class ChunkDataLoader {
    #avgTime = new MovingAverage(200);

    /** generated block data with the edits applied, least recently used dropped first; dropped chunks are generated
     * again (the generators are deterministic) and get their edits again
     * @type {FixedSizeMap<string, ChunkBlockData>} */
    #blockDataCache = new FixedSizeMap(27 * 30);

    /** @type {ChunkGenerator} */
    #generator;
    /** @type {ChunkDataFactory} */
    #chunkDataFactory;

    /**
     * Block edits per chunk, applied on top of every generation of the chunk (or of its saved blocks), until the chunk
     * is put into the store ({@link saveChanged}).
     * @type {Map<string, Map<number, number>>} chunk key -> (index in ChunkBlockData -> block)
     */
    #edits = new Map();

    /** a saved world's chunks, taken instead of generating them; null: nothing is saved
     * @type {ChunkStore | null} */
    #store;
    /** with a store, the chunks changed since they were put into it: key -> position
     * @type {Map<string, Vec3>} */
    #changed = new Map();

    /**
     * @param {ChunkGenerator} generator 
     * @param {ChunkDataFactory} chunkDataFactory
     * @param {ChunkStore | null} [store] a saved world's chunks (save/savedChunks.js)
     */
    constructor(generator, chunkDataFactory, store = null) {
        this.#generator = generator;
        this.#chunkDataFactory = chunkDataFactory;
        this.#store = store;
    }

    /** whether chunks changed since they were last saved (always false without a store) */
    get hasChanges() {
        return this.#changed.size > 0;
    }

    /**
     * Puts the chunks changed since the last call into the store, whole (their edits aren't needed any more: the
     * store has them).
     * @returns {Array<{position: Vec3, saved: any}>} the chunks and what the store made of them, to write somewhere
     */
    saveChanged() {
        const out = [];
        for (const [key, position] of this.#changed) {
            const data = this.#loadChunkBlockData(position).data;
            out.push({ position, saved: this.#store.put(key, data) });
            this.#edits.delete(key);
        }
        this.#changed.clear();
        return out;
    }

    /**
     * Marks chunks changed again: what {@link saveChanged} gave couldn't be written, the next call gives them again.
     * @param {Iterable<Vec3>} positions
     */
    markChanged(positions) {
        for (const p of positions)
            this.#changed.set(posToKey3(p.x, p.y, p.z), p);
    }

    /**
     * Records a block edit. It's applied to the cached chunk now and to every later generation of the chunk,
     * so it survives cache eviction and reloads, and neighbours loaded later get it in their border data.
     * @param {number} ix block position in chunk space
     * @param {number} iy
     * @param {number} iz height
     * @param {number} value
     */
    setBlock(ix, iy, iz, value) {
        const key = posToKey3(ix >> CHUNK_SIZE_BIT_LEN, iy >> CHUNK_SIZE_BIT_LEN, iz >> CHUNK_SIZE_BIT_LEN);
        const index = ((iz & CHUNK_SIZE_MASK) * CHUNK_SIZE + (iy & CHUNK_SIZE_MASK)) * CHUNK_SIZE + (ix & CHUNK_SIZE_MASK);
        let chunkEdits = this.#edits.get(key);
        if (chunkEdits === undefined) {
            chunkEdits = new Map();
            this.#edits.set(key, chunkEdits);
        }
        chunkEdits.set(index, value);
        if (this.#store !== null && !this.#changed.has(key))
            this.#changed.set(key, new Vec3(ix >> CHUNK_SIZE_BIT_LEN, iy >> CHUNK_SIZE_BIT_LEN, iz >> CHUNK_SIZE_BIT_LEN));
        const cached = this.#blockDataCache.get(key);
        if (cached !== undefined)
            cached.data[index] = value;
    }

    /**
     * A block, generating its chunk if it isn't cached. Chunk space coordinates (iz is the height).
     * @returns {number}
     */
    getBlock(ix, iy, iz) {
        const blockData = this.#loadChunkBlockData(new Vec3(ix >> CHUNK_SIZE_BIT_LEN, iy >> CHUNK_SIZE_BIT_LEN, iz >> CHUNK_SIZE_BIT_LEN));
        return blockData.data[((iz & CHUNK_SIZE_MASK) * CHUNK_SIZE + (iy & CHUNK_SIZE_MASK)) * CHUNK_SIZE + (ix & CHUNK_SIZE_MASK)];
    }

    /**
     * A chunk's blocks with the edits applied, generated if it isn't cached; don't change them (see setBlock).
     * @param {Vec3} chunkPos
     * @returns {ChunkBlockData}
     */
    blockData(chunkPos) {
        return this.#loadChunkBlockData(chunkPos);
    }

    /**
     * @param {Vec3} chunkPos
     * @returns {ChunkBlockData}
     */
    #loadChunkBlockData(chunkPos) {
        const key = posToKey3(chunkPos.x, chunkPos.y, chunkPos.z);
        let chunkBlockData = this.#blockDataCache.get(key);
        if (chunkBlockData === undefined) {
            const saved = this.#store?.blocks(key) ?? null;
            chunkBlockData = saved !== null ? new ChunkBlockData(saved) : this.#generator.generateChunk(chunkPos);
            const chunkEdits = this.#edits.get(key);
            if (chunkEdits !== undefined) {
                for (const [index, value] of chunkEdits)
                    chunkBlockData.data[index] = value;
            }
            this.#blockDataCache.set(key, chunkBlockData);
        }

        return chunkBlockData;
    }

    /**
     * @returns {ChunkData}
     */
    loadChunk(chunkPos) {
        const chunkBlockData = this.#loadChunkBlockData(chunkPos);
        const chunkData = this.#chunkDataFactory.createChunkDataFrom(chunkBlockData);
        this.#updateAdjData(chunkData, chunkPos);
        return chunkData;
    }

    /**
     * @param {ChunkData} chunkData
     * @param {Vec3} chunkPos
     */
    #updateAdjData(chunkData, chunkPos) {
        const bounds = chunkData.calculateBounds();

        let adj27Needed = (1 << 27) - 1
        if (bounds) {
            if (bounds.minH > 0) {
                adj27Needed &= 0b111111111111111111000000000;
            }
            if (bounds.maxH < CHUNK_SIZE) {
                adj27Needed &= 0b000000000111111111111111111;
            }
            if (bounds.minX > 0) {
                adj27Needed &= 0b110110110110110110110110110;
            }
            if (bounds.maxX < CHUNK_SIZE) {
                adj27Needed &= 0b011011011011011011011011011;
            }
            if (bounds.minY > 0) {
                adj27Needed &= 0b111111000111111000111111000;
            }
            if (bounds.maxY < CHUNK_SIZE) {
                adj27Needed &= 0b000111111000111111000111111;
            }

            for (let dir27 = 0; dir27 < 27; dir27++, adj27Needed >>>= 1) {
                if ((adj27Needed & 1) === 0) continue;
                const dirOffset = Dir27[dir27];
                const adjChunkBlockData = this.#loadChunkBlockData(chunkPos.add(dirOffset));
                if (!adjChunkBlockData) continue;
                chunkData.updateAdjBlockData(dir27, adjChunkBlockData);
            }
        }
    }
}

const cacheRowSize = (CHUNK_SIZE + 2) | 0;
const cachePlaneSize = cacheRowSize * cacheRowSize | 0;
const cacheStartIdx = cachePlaneSize + cacheRowSize + 1 | 0;

export class DataAdj {

    #arr
    #h; #x; #y;

    /**
     * @param {Array3D} arr3d 
     */
    constructor(arr3d) {
        this.#arr = arr3d;
    }

    setPosition(h, x, y) {
        this.#h = h + 1;
        this.#x = x + 1;
        this.#y = y + 1;
    }

    get(dh, dx, dy) {
        return this.#arr.get(this.#h + dh, this.#x + dx, this.#y + dy);
    }
}
