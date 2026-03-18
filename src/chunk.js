import { isSolidInt } from "./blocks.js";
import { Dir27, DIR27_IDXS, fvec3, FVec3, IVec3 } from "./geom.js";
import { ChunkMesher } from "./mesher/mesher.js";
import { Array3D, MovingAverage, perfDiff } from "./utils.js";

export const CHUNK_SIZE_BIT_LEN = 5 | 0;
export const CHUNK_SIZE = 32 | 0;
export const PLANE_SIZE = (CHUNK_SIZE * CHUNK_SIZE) | 0;
export const CHUNK_SIZE_E = CHUNK_SIZE + 2 | 0;
export const TEX_ID_BIT_LEN = 9 | 0;

export const CHUNK_SIZE_MASK = (CHUNK_SIZE - 1) | 0;

const DIR27_RAW_OFFSETS = new Int32Array([-1057, -1056, -1055, -1025, -1024, -1023, -993, -992, -991, -33, -32, -31, -1, 0, 1, 31, 32, 33, 991, 992, 993, 1023, 1024, 1025, 1055, 1056, 1057]);

export function posToKey3(cx, cy, cz) {
    return `${cx},${cy},${cz}`;
}

export class ChunkData extends Array3D {

    #bounds = null;
    adjData = new Array3D(CHUNK_SIZE, CHUNK_SIZE);
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

    setHXY(h, x, y, v) {
        super.setHXY(h, x, y, v);
        // this.setVoxelUpdateBitsXYZ(x, y, h, v);
    }

    setVoxelHXY(h, x, y, v) {
        this.setHXY(h, x, y, v);
        this.setVoxelUpdateBitsXYZ(x, y, h, v);
    }

    #updateAdjInside() {
        const data = this.data;
        const adjData = this.adjData.data;
        for (let h = 1; h < CHUNK_SIZE - 1; h++)
            for (let y = 1; y < CHUNK_SIZE - 1; y++)
                for (let x = 1; x < CHUNK_SIZE - 1; x++) {
                    const idx = h * PLANE_SIZE + y * CHUNK_SIZE + x;
                    let bits = 0;
                    for (let dir27 = 0; dir27 < 27; dir27++) {
                        const idxOffset = DIR27_RAW_OFFSETS[dir27];
                        bits |= isSolidInt(data[idx + idxOffset]) << dir27;
                    }
                    adjData[idx] = bits;
                }
    }

    #updateAdjBorder(dir27Idxs, x, y, z) {
        const data = this.data;
        const adjData = this.adjData.data;
        let bits = 0;
        const len = dir27Idxs.length;
        const idx = z * PLANE_SIZE + y * CHUNK_SIZE + x;
        for (let i = 0; i < len; i++) {
            const dir27 = dir27Idxs[i];
            const idxOffset = DIR27_RAW_OFFSETS[dir27];
            bits |= isSolidInt(data[idx + idxOffset]) << dir27;
        }
        adjData[idx] = bits;
    }

    updateAdjBitsInside() {
        const E = CHUNK_SIZE - 1;
        this.#updateAdjInside();

        for (let y = 0; y < CHUNK_SIZE; y++)
            for (let x = 0; x < CHUNK_SIZE; x++)
                this.#updateAdjBorder(DIR27_IDXS[4], x, y, 0);
        for (let z = 0; z < CHUNK_SIZE; z++)
            for (let x = 0; x < CHUNK_SIZE; x++)
                this.#updateAdjBorder(DIR27_IDXS[10], x, 0, z);
        for (let z = 0; z < CHUNK_SIZE; z++)
            for (let y = 0; y < CHUNK_SIZE; y++)
                this.#updateAdjBorder(DIR27_IDXS[12], 0, y, z);
        for (let z = 0; z < CHUNK_SIZE; z++)
            for (let y = 0; y < CHUNK_SIZE; y++)
                this.#updateAdjBorder(DIR27_IDXS[14], E, y, z);
        for (let z = 0; z < CHUNK_SIZE; z++)
            for (let x = 0; x < CHUNK_SIZE; x++)
                this.#updateAdjBorder(DIR27_IDXS[16], x, E, z);
        for (let y = 0; y < CHUNK_SIZE; y++)
            for (let x = 0; x < CHUNK_SIZE; x++)
                this.#updateAdjBorder(DIR27_IDXS[22], x, y, E);
        for (let x = 0; x < CHUNK_SIZE; x++)
            this.#updateAdjBorder(DIR27_IDXS[1], x, 0, 0);
        for (let y = 0; y < CHUNK_SIZE; y++)
            this.#updateAdjBorder(DIR27_IDXS[3], 0, y, 0);
        for (let y = 0; y < CHUNK_SIZE; y++)
            this.#updateAdjBorder(DIR27_IDXS[5], E, y, 0);
        for (let x = 0; x < CHUNK_SIZE; x++)
            this.#updateAdjBorder(DIR27_IDXS[7], x, E, 0);
        for (let z = 0; z < CHUNK_SIZE; z++)
            this.#updateAdjBorder(DIR27_IDXS[9], 0, 0, z);
        for (let z = 0; z < CHUNK_SIZE; z++)
            this.#updateAdjBorder(DIR27_IDXS[11], E, 0, z);
        for (let z = 0; z < CHUNK_SIZE; z++)
            this.#updateAdjBorder(DIR27_IDXS[15], 0, E, z);
        for (let z = 0; z < CHUNK_SIZE; z++)
            this.#updateAdjBorder(DIR27_IDXS[17], E, E, z);
        for (let x = 0; x < CHUNK_SIZE; x++)
            this.#updateAdjBorder(DIR27_IDXS[19], x, 0, E);
        for (let y = 0; y < CHUNK_SIZE; y++)
            this.#updateAdjBorder(DIR27_IDXS[21], 0, y, E);
        for (let y = 0; y < CHUNK_SIZE; y++)
            this.#updateAdjBorder(DIR27_IDXS[23], E, y, E);
        for (let x = 0; x < CHUNK_SIZE; x++)
            this.#updateAdjBorder(DIR27_IDXS[25], x, E, E);
        this.#updateAdjBorder(DIR27_IDXS[0], 0, 0, 0);
        this.#updateAdjBorder(DIR27_IDXS[2], E, 0, 0);
        this.#updateAdjBorder(DIR27_IDXS[6], 0, E, 0);
        this.#updateAdjBorder(DIR27_IDXS[8], E, E, 0);
        this.#updateAdjBorder(DIR27_IDXS[18], 0, 0, E);
        this.#updateAdjBorder(DIR27_IDXS[20], E, 0, E);
        this.#updateAdjBorder(DIR27_IDXS[24], 0, E, E);
        this.#updateAdjBorder(DIR27_IDXS[26], E, E, E);
    }

    setVoxelUpdateBitsXYZ(x, y, z, v) {
        const bit = isSolidInt(v);
        for (let dir27 = 0; dir27 < 27; dir27++) {
            const dirOffset = Dir27[dir27];
            const adjH = z + dirOffset.z;
            const adjX = x + dirOffset.x;
            const adjY = y + dirOffset.y;

            this.adjData.setBitHXYChecked(adjH, adjX, adjY, 27 - dir27 - 1, bit);
        }
        this.#boundsValid = false;
    }


    /**
     * @param {number} dir27
     * @param {ChunkData} chunkData
     */
    updateAdjData(dir27, chunkData) {
        const E = CHUNK_SIZE - 1;
        const dirOffset = Dir27[dir27];
        const opDirOffset = Dir27[26 - dir27];

        switch (dir27) {
            case 0:
            case 2:
            case 6:
            case 8:
            case 18:
            case 20:
            case 24:
            case 26:
                const dx = ((dirOffset.x + 1) >> 1) * 31;
                const dy = ((dirOffset.y + 1) >> 1) * 31;
                const dz = ((dirOffset.z + 1) >> 1) * 31;
                const sx = ((opDirOffset.x + 1) >> 1) * 31;
                const sy = ((opDirOffset.y + 1) >> 1) * 31;
                const sz = ((opDirOffset.z + 1) >> 1) * 31;
                this.adjData.setBitXYZ(dx, dy, dz, dir27, isSolidInt(chunkData.getXYZ(sx, sy, sz)));
                break;

            case 4:
                for (let y = 0; y < CHUNK_SIZE; y++)
                    for (let x = 0; x < CHUNK_SIZE; x++)
                        this.setVoxelUpdateBitsXYZ(x, y, -1, chunkData.getXYZ(x, y, E));
                break;
            case 10:
                for (let z = 0; z < CHUNK_SIZE; z++)
                    for (let x = 0; x < CHUNK_SIZE; x++)
                        this.setVoxelUpdateBitsXYZ(x, -1, z, chunkData.getXYZ(x, E, z));
                break;
            case 12:
                for (let z = 0; z < CHUNK_SIZE; z++)
                    for (let y = 0; y < CHUNK_SIZE; y++)
                        this.setVoxelUpdateBitsXYZ(-1, y, z, chunkData.getXYZ(E, y, z));
                break;
            case 14:
                for (let z = 0; z < CHUNK_SIZE; z++)
                    for (let y = 0; y < CHUNK_SIZE; y++)
                        this.setVoxelUpdateBitsXYZ(E + 1, y, z, chunkData.getXYZ(0, y, z));
                break;
            case 16:
                for (let z = 0; z < CHUNK_SIZE; z++)
                    for (let x = 0; x < CHUNK_SIZE; x++)
                        this.setVoxelUpdateBitsXYZ(x, E + 1, z, chunkData.getXYZ(x, 0, z));
                break;
            case 22:
                for (let y = 0; y < CHUNK_SIZE; y++)
                    for (let x = 0; x < CHUNK_SIZE; x++)
                        this.setVoxelUpdateBitsXYZ(x, y, E + 1, chunkData.getXYZ(x, y, 0));
                break;
            case 1:
                for (let x = 0; x < CHUNK_SIZE; x++)
                    this.setVoxelUpdateBitsXYZ(x, -1, -1, chunkData.getXYZ(x, E, E));
                break;

            case 3:
                for (let y = 0; y < CHUNK_SIZE; y++)
                    this.setVoxelUpdateBitsXYZ(-1, y, -1, chunkData.getXYZ(E, y, E));
                break;

            case 5:
                for (let y = 0; y < CHUNK_SIZE; y++)
                    this.setVoxelUpdateBitsXYZ(E + 1, y, -1, chunkData.getXYZ(0, y, E));
                break;
            case 7:
                for (let x = 0; x < CHUNK_SIZE; x++)
                    this.setVoxelUpdateBitsXYZ(x, E + 1, -1, chunkData.getXYZ(x, 0, E));
                break;

            case 9:
                for (let z = 0; z < CHUNK_SIZE; z++)
                    this.setVoxelUpdateBitsXYZ(-1, -1, z, chunkData.getXYZ(E, E, z));
                break;
            case 11:
                for (let z = 0; z < CHUNK_SIZE; z++)
                    this.setVoxelUpdateBitsXYZ(E + 1, -1, z, chunkData.getXYZ(0, E, z));
                break;

            case 15:
                for (let z = 0; z < CHUNK_SIZE; z++)
                    this.setVoxelUpdateBitsXYZ(-1, E + 1, z, chunkData.getXYZ(E, 0, z));
                break;

            case 17:
                for (let z = 0; z < CHUNK_SIZE; z++)
                    this.setVoxelUpdateBitsXYZ(E + 1, E + 1, z, chunkData.getXYZ(0, 0, z));
                break;

            case 19:
                for (let x = 0; x < CHUNK_SIZE; x++)
                    this.setVoxelUpdateBitsXYZ(x, -1, E + 1, chunkData.getXYZ(x, E, 0));
                break;

            case 21:
                for (let y = 0; y < CHUNK_SIZE; y++)
                    this.setVoxelUpdateBitsXYZ(-1, y, E + 1, chunkData.getXYZ(E, y, 0));
                break;

            case 23:
                for (let y = 0; y < CHUNK_SIZE; y++)
                    this.setVoxelUpdateBitsXYZ(E + 1, y, E + 1, chunkData.getXYZ(0, y, 0));
                break;

            case 25:
                for (let x = 0; x < CHUNK_SIZE; x++)
                    this.setVoxelUpdateBitsXYZ(x, E + 1, E + 1, chunkData.getXYZ(x, 0, 0));
                break;
        }
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

    /**
     * @param {ChunkData} chunkData 
     * @returns {ChunkDataExtended}
     */
    static fromChunkData(chunkData) {
        const chunkDataExtended = new ChunkDataExtended();
        const data = chunkData.data;
        const dataE = chunkDataExtended.data;
        for (let z = 0; z < CHUNK_SIZE; z++)
            for (let y = 0; y < CHUNK_SIZE; y++) {
                const rowOffset = chunkData.rowIdx(z, y);
                const rowOffsetE = chunkDataExtended.rowIdx(z + 1, y + 1) + 1;
                for (let x = 0; x < CHUNK_SIZE; x++)
                    dataE[rowOffsetE + x] = data[rowOffset + x];
            }
        return chunkDataExtended;
    }

    /**
     * @param {(number, number, number) => ChunkData} chunkDataProvider 
     * @param {number} cx 
     * @param {number} cy 
     * @param {number} cz 
     * @returns {ChunkData}
     */
    static load(chunkDataProvider, cx, cy, cz) {

        const chunkData = chunkDataProvider(cx, cy, cz);

        // const chunkDataExtended = new ChunkDataExtended();
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
                chunkData.updateAdjData(dir27, adjChunkData);
            }
        }
        return chunkData;
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
    /** @type {ChunkMesher} */
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
        const meshData = this.#chunkMesher.createMesh(
            position, chunkDataExtended
        );
        const meshTime = perfDiff(now);
        this.#avgTime.add(meshTime);
        if (meshData.input.length > 0) {
            // Logger.log(() => `m: ${meshTime.toFixed(1)}, s: ${meshData.input.length}`);
            // console.log(`data:${meshData.input.length}, average mesh time: ${this.#avgTime.average().toFixed(0)} ms`);
            // Logger.log(() => `${this.#avgTime.average().toFixed(4)}`);
        }


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
