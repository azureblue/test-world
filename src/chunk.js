import { fvec3, FVec3, IVec3 } from "./geom.js";
import { ChunkMesher } from "./mesher.js";
import { Array3D, MovingAverage } from "./utils.js";

export const CHUNK_SIZE_BIT_LEN = 5 | 0;
export const CHUNK_SIZE = 32 | 0;
export const CHUNK_H = 32 | 0;
export const TEX_ID_BIT_LEN = 9 | 0;

export const CHUNK_SIZE_MASK = (CHUNK_SIZE - 1) | 0;

export function posToKey3(cx, cy, cz) {
    return `${cx},${cy},${cz}`;
}

export class ChunkData extends Array3D {

    /**
     * @param {Uint32Array} [data]
     */
    constructor(data = null) {
        super(CHUNK_SIZE, CHUNK_SIZE, data);
    }

    /**
     * @param {number} h 
     * @param {number} x 
     * @param {number} y 
     */
    getCheck(h, x, y) {
        if (h >= CHUNK_SIZE || h < 0 || x < 0 || x >= CHUNK_SIZE || y < 0 || y >= CHUNK_SIZE)
            return BLOCK_CHUNK_EDGE;
        return this.get(h, x, y);
    }

    peak(x, y) {
        for (let peek = CHUNK_SIZE - 1; peek > 0; peek--)
            if (this.get(peek, x, y) !== BLOCK_EMPTY)
                return peek;
        return 0;
    }

    findBoundsNonZero() {
        const data = this.data;

        let minH = CHUNK_SIZE, maxH = -1;
        let minY = CHUNK_SIZE, maxY = -1;
        let minX = CHUNK_SIZE, maxX = -1;

        for (let h = 0; h < this.height; h++)
            for (let y = 0; y < this.size; y++)
                for (let x = 0; x < this.size; x++) {
                    const idx = this.planeIdx(h) + y * this.size + x;
                    if (data[idx] === 0) continue;
                    if (h < minH) minH = h;
                    if (h + 1 > maxH) maxH = h + 1;
                    if (y < minY) minY = y;
                    if (y + 1 > maxY) maxY = y + 1;
                    if (x < minX) minX = x;
                    if (x + 1 > maxX) maxX = x + 1;
                }


        if (maxH < 0)
            return null;
        return { minH: minH, maxH: maxH, minY, maxY, minX, maxX };
    }
}

export class ChunkDataLoader {
    /** @type {Map<string, ChunkData>} */
    #cache = new Map();

    /** @type {(cx:number, cy:number, cz:number) => ChunkData} */
    #generator;

    constructor(generator) {
        this.#generator = generator;
    }

    getChunkSync(cx, cy, cz) {
        const key = posToKey3(cx, cy, cz);
        let chunkData = this.#cache.get(key);
        if (chunkData === undefined) {
            chunkData = this.#generator(cx, cy, cz);
            // this.#cache.set(key, chunkData);
        }
        return chunkData;
    }

    async getChunkAsync(cx, cy, cz) {
        return this.getChunkSync(cx, cy, cz);
    }
}

export class Chunk {
    #data
    #mesh
    #chunkPosition

    /**@type {FVec3} */
    #worldCenterPosition
    #worldAABBData = new Float32Array(6);

    extra = {}

    /**
     * @param {IVec3} chunkPosition 
     * @param {ChunkData} data
     * @param {UIntMesh} mesh
     */
    constructor(chunkPosition, data, mesh) {
        this.#data = data;
        this.#chunkPosition = chunkPosition
        this.#mesh = mesh;
        this.#worldCenterPosition = fvec3(chunkPosition.x * CHUNK_SIZE + CHUNK_SIZE / 2, chunkPosition.z * CHUNK_SIZE + CHUNK_SIZE / 2, -chunkPosition.y * CHUNK_SIZE - CHUNK_SIZE / 2);
        this.#updateCornersData();
    }

    #updateCornersData() {
        const bounds = this.data.findBoundsNonZero();
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
     * @param {any} meshData 
     */
    constructor(chunkData, meshData) {
        this.chunkData = chunkData;
        this.meshData = meshData;
    }
}

export class ChunkManager {
    #chunkLoader
    #chunkMesher
    #avgTime = new MovingAverage(200);

    /**
     * @param {ChunkDataLoader} chunkLoader 
     * @param {ChunkMesher} chunkMesher 
     */
    constructor(chunkLoader, chunkMesher) {
        this.#chunkLoader = chunkLoader;
        this.#chunkMesher = chunkMesher;
    }

    async load(cx, cy, cz) {
        const position = new IVec3(cx, cy, cz);

        const chunkData = this.#chunkLoader.getChunkSync(cx, cy, cz);
        const now = performance.now();
        const meshData = this.#chunkMesher.createMeshes(
            position, this.#chunkLoader
        );
        this.#avgTime.add(performance.now() - now);
        console.log(`${this.#avgTime.average().toFixed(0)}`);

        return new ChunkSpec(chunkData, meshData);
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
