import { isLiquidInt, isSolidInt } from "../blocks.js";
import { Dir27, DIR27_IDXS_ENCODED } from "../geom.js";
import { TransferObject } from "../transfer.js";
import { Array3D, setBit } from "../utils.js";
import { CHUNK_SIZE, ChunkBlockData, ChunkData, ChunkDataFactory, ChunkDataTransfer } from "./chunk.js";

export const CHUNK_ADJ_DATA_LEN = CHUNK_SIZE ** 3 * 2;

const DIR27_RAW_OFFSETS = new Int32Array([-1057, -1056, -1055, -1025, -1024, -1023, -993, -992, -991, -33, -32, -31, -1, 0, 1, 31, 32, 33, 991, 992, 993, 1023, 1024, 1025, 1055, 1056, 1057]);
const PLANE_SIZE = CHUNK_SIZE * CHUNK_SIZE;
const LIQUID_ABOVE_BIT = 30;

export class ChunkAdjData extends ChunkData {

    array3d;
    adjData
    /**
     * @param {Uint32Array} data
     */
    constructor(data = null) {
        super();
        if (data !== null) {
            if (data.length !== CHUNK_ADJ_DATA_LEN) {
                throw new Error(`Data length (${data.length}) does not match expected size (${CHUNK_ADJ_DATA_LEN})`);
            }
            this.array3d = new Array3D(CHUNK_SIZE, CHUNK_SIZE, CHUNK_SIZE * 2, data);
        } else {
            this.array3d = new Array3D(CHUNK_SIZE, CHUNK_SIZE, CHUNK_SIZE * 2);
        }
        this.adjData = new Array3D(CHUNK_SIZE, CHUNK_SIZE, CHUNK_SIZE,
            this.array3d.data.subarray(this.array3d.data.length / 2));
    }

    /**
    * @returns {{minH:number, maxH:number, minY:number, maxY:number, minX:number, maxX:number} | null} 
    */
    calculateBounds() {
    }

    getVoxelXYZ(x, y, z) {
        return this.array3d.getHXY(z, x, y);
    }

    setVoxelXYZ(x, y, z, value) {
        throw new Error("setVoxelXYZ is not implemented in ChunkAdjData");
    }

    getXYZ(x, y, z) {
        return this.array3d.getXYZ(x, y, z);
    }

    rawData() {
        return this.array3d.data.buffer;
    }

    setRawData(rawData) {
        if (rawData.byteLength !== CHUNK_ADJ_DATA_LEN * 4) {
            throw new Error(`Raw data byte length (${rawData.byteLength}) does not match expected size (${CHUNK_ADJ_DATA_LEN * 4})`);
        }
        this.array3d.data = new Uint32Array(rawData);
    }

    #updateAdjInside() {
        const data = this.array3d.data;
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

    #updateAdjBorder(dir27, x, y, z) {
        const data = this.array3d.data;
        const adjData = this.adjData.data;
        let bits = 0;
        const baseIdx = dir27 * 32;
        const end = baseIdx + DIR27_IDXS_ENCODED[baseIdx] + 1;
        const idx = z * PLANE_SIZE + y * CHUNK_SIZE + x;
        for (let i = baseIdx + 1; i < end; i++) {
            const dir27 = DIR27_IDXS_ENCODED[i];
            const idxOffset = DIR27_RAW_OFFSETS[dir27];
            bits |= isSolidInt(data[idx + idxOffset]) << dir27;
        }
        adjData[idx] = bits;
    }

    updateLiquidAboveBits() {
        const data = this.array3d.data;
        const adjData = this.adjData.data;
        for (let h = 0; h < CHUNK_SIZE - 1; h++)
            for (let y = 0; y < CHUNK_SIZE; y++) {
                const rowIdx = this.array3d.rowIdx(h, y);
                for (let x = 0; x < CHUNK_SIZE; x++) {
                    adjData[rowIdx + x] = setBit(
                        adjData[rowIdx + x],
                         LIQUID_ABOVE_BIT, 
                         isLiquidInt(data[rowIdx + x + PLANE_SIZE])
                        );
                }
            }
    }


    updateAdjBitsInside() {
        const E = CHUNK_SIZE - 1;
        this.#updateAdjInside();

        for (let a = 1; a < CHUNK_SIZE - 1; a++) {
            for (let b = 1; b < CHUNK_SIZE - 1; b++) {
                this.#updateAdjBorder(4, b, a, 0);
                this.#updateAdjBorder(10, b, 0, a);
                this.#updateAdjBorder(12, 0, b, a);
                this.#updateAdjBorder(14, E, b, a);
                this.#updateAdjBorder(16, b, E, a);
                this.#updateAdjBorder(22, b, a, E);
            }
            this.#updateAdjBorder(1, a, 0, 0);
            this.#updateAdjBorder(3, 0, a, 0);
            this.#updateAdjBorder(5, E, a, 0);
            this.#updateAdjBorder(7, a, E, 0);
            this.#updateAdjBorder(9, 0, 0, a);
            this.#updateAdjBorder(11, E, 0, a);
            this.#updateAdjBorder(15, 0, E, a);
            this.#updateAdjBorder(17, E, E, a);
            this.#updateAdjBorder(19, a, 0, E);
            this.#updateAdjBorder(21, 0, a, E);
            this.#updateAdjBorder(23, E, a, E);
            this.#updateAdjBorder(25, a, E, E);
        }
        this.#updateAdjBorder(0, 0, 0, 0);
        this.#updateAdjBorder(2, E, 0, 0);
        this.#updateAdjBorder(6, 0, E, 0);
        this.#updateAdjBorder(8, E, E, 0);
        this.#updateAdjBorder(18, 0, 0, E);
        this.#updateAdjBorder(20, E, 0, E);
        this.#updateAdjBorder(24, 0, E, E);
        this.#updateAdjBorder(26, E, E, E);
        this.updateLiquidAboveBits();
    }

    setVoxelUpdateBitsXYZ(x, y, z, v) {
        const bit = isSolidInt(v);
        const liquidBitValue = isLiquidInt(v);
        for (let dir27 = 0; dir27 < 27; dir27++) {
            const dirOffset = Dir27[dir27];
            const adjH = z + dirOffset.z;
            const adjX = x + dirOffset.x;
            const adjY = y + dirOffset.y;
            this.adjData.setBitHXYChecked(adjH, adjX, adjY, 27 - dir27 - 1, bit);            
        }
        if (liquidBitValue === 1) {
            this.adjData.setBitHXYChecked(z - 1, x, y, LIQUID_ABOVE_BIT, liquidBitValue);
        }
    }

    /**
     * @param {number} dir27
     * @param {Array3D} chunkData
     */
    #updateAdjData(dir27, chunkData) {
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

    /**
     * @param {number} dir27
     * @param {ChunkAdjData} chunkData
     */
    updateAdjChunkData(dir27, chunkData) {
        this.#updateAdjData(dir27, chunkData.array3d);
    }

    /**
     * @param {number} dir27
     * @param {ChunkBlockData} chunkBlockData
     */
    updateAdjBlockData(dir27, chunkBlockData) {
        this.#updateAdjData(dir27, chunkBlockData);
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
    calculateBounds() {
        const data = this.array3d.data;

        let minH = CHUNK_SIZE, maxH = -1;
        let minY = CHUNK_SIZE, maxY = -1;
        let minX = CHUNK_SIZE, maxX = -1;

        for (let h = 0; h < CHUNK_SIZE; h++)
            for (let y = 0; y < CHUNK_SIZE; y++) {
                const rowIdx = this.array3d.rowIdx(h, y)
                for (let x = 0; x < CHUNK_SIZE; x++) {
                    const idx = rowIdx + x;
                    if (data[idx] === 0) continue;
                    if (h < minH) minH = h;
                    if (h + 1 > maxH) maxH = h + 1;
                    if (y < minY) minY = y;
                    if (y + 1 > maxY) maxY = y + 1;
                    if (x < minX) minX = x;
                    if (x + 1 > maxX) maxX = x + 1;
                }
            }

        if (maxH < 0)
            return null;
        return { minH: minH, maxH: maxH, minY, maxY, minX, maxX };
    }
}

export class ChunkAdjDataTransfer extends ChunkDataTransfer {
    /**
     * @param {ChunkAdjData} chunkData
     * @returns {TransferObject}
     */
    transfer(chunkData) {
        const buffer = chunkData.array3d.data.buffer;
        return new TransferObject(buffer, [buffer]);
    }

    /**
     * @param {any} data
     * @returns {ChunkAdjData}
     */
    createFrom(data) {
        const adjData = new ChunkAdjData(new Uint32Array(data));
        return adjData;
    }
}

export class ChunkAdjDataFactory extends ChunkDataFactory {

    /**
     * @param {ChunkBlockData} chunkBlockData
     * @returns {ChunkAdjData}
     */
    createChunkDataFrom(chunkBlockData) {
        const adjData = new ChunkAdjData();
        const dst = adjData.array3d.data;
        const src = chunkBlockData.data;

        for (let h = 0; h < CHUNK_SIZE; h++) {
            for (let y = 0; y < CHUNK_SIZE; y++) {
                let dstRow = adjData.array3d.index(h, 0, y);
                let srcRow = chunkBlockData.index(h, 0, y);
                for (let x = 0; x < CHUNK_SIZE; x++) {
                    dst[dstRow + x] = src[srcRow + x];
                }
            }
        }
        adjData.updateAdjBitsInside();
        return adjData;
    }
}
