import { ChunkGenerator } from "../gen/generator.js";
import { Dir27, fvec3, FVec3, IVec3, vec3 } from "../geom.js";
import { ChunkMesh, MeshData } from "../mesh/mesh.js";
import { TransferObject } from "../transfer.js";
import { Array3D, FixedSizeMap, MovingAverage } from "../utils.js";

export const CHUNK_SIZE_BIT_LEN = 5 | 0;
export const CHUNK_SIZE = 32 | 0;
export const CHUNK_H = 32 | 0;
export const TEX_ID_BIT_LEN = 9 | 0;

export const CHUNK_SIZE_MASK = (CHUNK_SIZE - 1) | 0;

export function posToKey3(cx, cy, cz) {
    return `${cx},${cy},${cz}`;
}

export class ChunkBlockData extends Array3D {
    constructor() {
        super(CHUNK_SIZE, CHUNK_SIZE, CHUNK_SIZE);
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

export class Chunk {
    #data
    #mesh
    #chunkPosition
    /** @type {{minH:number, maxH:number, minY:number, maxY:number, minX:number, maxX:number} | null} */
    #bounds = null;
    #boundsValid = false;

    /**@type {FVec3} */
    #worldCenterPosition
    #worldAABBData = new Float32Array(6);

    extra = {}

    /**
     * @param {IVec3} chunkPosition 
     * @param {ChunkData} data
     * @param {ChunkMesh} mesh
     */
    constructor(chunkPosition, data, mesh) {
        this.#data = data;
        this.#chunkPosition = chunkPosition
        this.#mesh = mesh;
        this.#worldCenterPosition = fvec3(chunkPosition.x * CHUNK_SIZE + CHUNK_SIZE / 2, chunkPosition.z * CHUNK_SIZE + CHUNK_SIZE / 2, -chunkPosition.y * CHUNK_SIZE - CHUNK_SIZE / 2);
        this.#updateCornersData();
    }

    bounds() {
        if (!this.#boundsValid) {
            this.#bounds = this.#data.calculateBounds();
            this.#boundsValid = true;
        }
        return this.#bounds;
    }

    #updateCornersData() {
        const bounds = this.bounds()
        if (!bounds) {
            return;
        }

        const cp = this.#chunkPosition;
        const minX = cp.x * CHUNK_SIZE + bounds.minX;
        const maxX = cp.x * CHUNK_SIZE + bounds.maxX;

        const minY = cp.z * CHUNK_SIZE + bounds.minH;
        const maxY = cp.z * CHUNK_SIZE + bounds.maxH;

        const maxZ = -cp.y * CHUNK_SIZE - bounds.minY;
        const minZ = -cp.y * CHUNK_SIZE - bounds.maxY;

        const arr = this.#worldAABBData;
        arr[0] = minX; arr[1] = minY; arr[2] = minZ;
        arr[3] = maxX; arr[4] = maxY; arr[5] = maxZ;
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

export class ChunkDataLoader {
    #avgTime = new MovingAverage(200);

    /** @type {FixedSizeMap<string, ChunkBlockData>} */
    #blockDataCache = new FixedSizeMap(27 * 30);

    /** @type {ChunkGenerator} */
    #generator;
    /** @type {ChunkDataFactory} */
    #chunkDataFactory;

    /**
     * @param {ChunkGenerator} generator 
     * @param {ChunkDataFactory} chunkDataFactory
     */
    constructor(generator, chunkDataFactory) {
        this.#generator = generator;
        this.#chunkDataFactory = chunkDataFactory;
    }

    /**
     * @param {number} cx chunk x 
     * @param {number} cy chunk y
     * @param {number} cz chunk z 
     * @returns {ChunkBlockData}
     */
    #loadChunkBlockData(cx, cy, cz) {
        const key = posToKey3(cx, cy, cz);
        let chunkBlockData = this.#blockDataCache.get(key);
        if (chunkBlockData === undefined) {
            chunkBlockData = this.#generator.generateChunk(vec3(cx, cy, cz));
            this.#blockDataCache.set(key, chunkBlockData);
        }

        return chunkBlockData;
    }

    /**
     * @returns {ChunkData}
     */
    loadChunk(cx, cy, cz) {
        const chunkBlockData = this.#loadChunkBlockData(cx, cy, cz);
        const chunkData = this.#chunkDataFactory.createChunkDataFrom(chunkBlockData);
        this.#updateAdjData(chunkData, cx, cy, cz);
        return chunkData;
    }

    /**
     * @param {ChunkData} chunkData
     */
    #updateAdjData(chunkData, cx, cy, cz) {
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
                const adjChunkBlockData = this.#loadChunkBlockData(cx + dirOffset.x, cy + dirOffset.y, cz + dirOffset.z);
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
