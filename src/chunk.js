import { Dir27, fvec3, FVec3, IVec3 } from "./geom.js";
// import { ChunkMesher } from "./mesher.js";
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

    #bounds = null;
    #boundsValid = false;


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
        return this.getHXY(h, x, y);
    }

    peak(x, y) {
        for (let peek = CHUNK_SIZE - 1; peek > 0; peek--)
            if (this.getHXY(peek, x, y) !== BLOCK_EMPTY)
                return peek;
        return 0;
    }

    /**     
     * @returns {minH:number, maxH:number, minY:number, maxY:number, minX:number, maxX:number} | null
     */
    bounds() {
        if (this.#boundsValid) return this.#bounds;
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
            this.#bounds = null;
        else
            this.#bounds = { minH: minH, maxH: maxH, minY, maxY, minX, maxX };
        this.#boundsValid = true;
        return this.#bounds;
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


export class ChunkDataExtended extends Array3D {

    constructor() {
        super(CHUNK_SIZE + 2, CHUNK_SIZE + 2);
    }


    /**
     * @param {number} dir27
     * @param {ChunkData} chunkData
     */
    setAdjData(dir27, chunkData) {
        const E = CHUNK_SIZE + 1;
        const e = CHUNK_SIZE - 1;

        switch (dir27) {

            case 0: this.setXYZ(0, 0, 0, chunkData.getXYZ(e, e, e)); break;
            case 2: this.setXYZ(E, 0, 0, chunkData.getXYZ(0, e, e)); break;
            case 6: this.setXYZ(0, E, 0, chunkData.getXYZ(e, 0, e)); break;
            case 8: this.setXYZ(E, E, 0, chunkData.getXYZ(0, 0, e)); break;
            case 18: this.setXYZ(0, 0, E, chunkData.getXYZ(e, e, 0)); break;
            case 20: this.setXYZ(E, 0, E, chunkData.getXYZ(0, e, 0)); break;
            case 24: this.setXYZ(0, E, E, chunkData.getXYZ(e, 0, 0)); break;
            case 26: this.setXYZ(E, E, E, chunkData.getXYZ(0, 0, 0)); break;

            case 4:
                for (let y = 0; y < CHUNK_SIZE; y++)
                    for (let x = 0; x < CHUNK_SIZE; x++)
                        this.setXYZ(x + 1, y + 1, 0, chunkData.getXYZ(x, y, e));
                break;
            case 10:
                for (let z = 0; z < CHUNK_SIZE; z++)
                    for (let x = 0; x < CHUNK_SIZE; x++)
                        this.setXYZ(x + 1, 0, z + 1, chunkData.getXYZ(x, e, z));
                break;
            case 12:
                for (let z = 0; z < CHUNK_SIZE; z++)
                    for (let y = 0; y < CHUNK_SIZE; y++)
                        this.setXYZ(0, y + 1, z + 1, chunkData.getXYZ(e, y, z));
                break;
            case 14:
                for (let z = 0; z < CHUNK_SIZE; z++)
                    for (let y = 0; y < CHUNK_SIZE; y++)
                        this.setXYZ(E, y + 1, z + 1, chunkData.getXYZ(0, y, z));
                break;
            case 16:
                for (let z = 0; z < CHUNK_SIZE; z++)
                    for (let x = 0; x < CHUNK_SIZE; x++)
                        this.setXYZ(x + 1, E, z + 1, chunkData.getXYZ(x, 0, z));
                break;
            case 22:
                for (let y = 0; y < CHUNK_SIZE; y++)
                    for (let x = 0; x < CHUNK_SIZE; x++)
                        this.setXYZ(x + 1, y + 1, E, chunkData.getXYZ(x, y, 0));
                break;

            case 1:
                for (let x = 0; x < CHUNK_SIZE; x++)
                    this.setXYZ(x + 1, 0, 0, chunkData.getXYZ(x, e, e));
                break;

            case 3:
                for (let y = 0; y < CHUNK_SIZE; y++)
                    this.setXYZ(0, y + 1, 0, chunkData.getXYZ(e, y, e));
                break;

            case 5:
                for (let y = 0; y < CHUNK_SIZE; y++)
                    this.setXYZ(E, y + 1, 0, chunkData.getXYZ(0, y, e));
                break;

            case 7:
                for (let x = 0; x < CHUNK_SIZE; x++)
                    this.setXYZ(x + 1, E, 0, chunkData.getXYZ(x, 0, e));
                break;


            case 9:
                for (let z = 0; z < CHUNK_SIZE; z++)
                    this.setXYZ(0, 0, z + 1, chunkData.getXYZ(e, e, z));
                break;

            case 11:
                for (let z = 0; z < CHUNK_SIZE; z++)
                    this.setXYZ(E, 0, z + 1, chunkData.getXYZ(0, e, z));
                break;

            case 15:
                for (let z = 0; z < CHUNK_SIZE; z++)
                    this.setXYZ(0, E, z + 1, chunkData.getXYZ(e, 0, z));
                break;

            case 17:
                for (let z = 0; z < CHUNK_SIZE; z++)
                    this.setXYZ(E, E, z + 1, chunkData.getXYZ(0, 0, z));
                break;

            case 19:
                for (let x = 0; x < CHUNK_SIZE; x++)
                    this.setXYZ(x + 1, 0, E, chunkData.getXYZ(x, e, 0));
                break;

            case 21:
                for (let y = 0; y < CHUNK_SIZE; y++)
                    this.setXYZ(0, y + 1, E, chunkData.getXYZ(e, y, 0));
                break;

            case 23:
                for (let y = 0; y < CHUNK_SIZE; y++)
                    this.setXYZ(E, y + 1, E, chunkData.getXYZ(0, y, 0));
                break;

            case 25:
                for (let x = 0; x < CHUNK_SIZE; x++)
                    this.setXYZ(x + 1, E, E, chunkData.getXYZ(x, 0, 0));
                break;

            case 13:
                for (let z = 0; z < CHUNK_SIZE; z++)
                    for (let y = 0; y < CHUNK_SIZE; y++)
                        for (let x = 0; x < CHUNK_SIZE; x++)
                            this.setXYZ(x + 1, y + 1, z + 1, chunkData.getXYZ(x, y, z));
                break;
        }
    }

    static load(chunkDataProvider, cx, cy, cz) {
        const chunkData = chunkDataProvider(cx, cy, cz);
        const chunkDataExtended = new ChunkDataExtended();
        const bounds = chunkData.bounds();
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
                const adjChunkData = chunkDataProvider(cx + dirOffset.x, cy + dirOffset.y, cz + dirOffset.z);
                if (!adjChunkData) continue;
                chunkDataExtended.setAdjData(dir27, adjChunkData);
            }
        }
        return chunkDataExtended;
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
            this.#cache.set(key, chunkData);
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
        const bounds = this.data.bounds();
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
        const chunkDataExtended = ChunkDataExtended.load((cx, cy, cz) => this.#chunkLoader.getChunkSync(cx, cy, cz), cx, cy, cz);
        
        const now = performance.now();
        const meshData = this.#chunkMesher.createMeshes(
            position, chunkDataExtended
        );
        this.#avgTime.add(performance.now() - now);
        // console.log(`data:${meshData.input.length}, average mesh time: ${this.#avgTime.average().toFixed(0)} ms`);
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
