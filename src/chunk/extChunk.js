import { TransferObject } from "../transfer.js";
import { Array3D } from "../utils.js";
import { CHUNK_SIZE, ChunkBlockData, ChunkData, ChunkDataFactory, ChunkDataTransfer } from "./chunk.js";

export const CHUNK_SIZE_E = 34;

export class ChunkDataExt extends ChunkData {

    /** @type {Array3D} */
    array3d;


    /**
     * @param {Uint32Array} data
     */
    constructor(data = null) {
        super();
        if (data !== null) {
            if (data.length !== CHUNK_SIZE_E * CHUNK_SIZE_E * CHUNK_SIZE_E) {
                throw new Error(`Data length (${data.length}) does not match expected size (${CHUNK_SIZE_E * CHUNK_SIZE_E * CHUNK_SIZE_E})`);
            }
            this.array3d = new Array3D(CHUNK_SIZE_E, CHUNK_SIZE_E, CHUNK_SIZE_E, data);
        } else {
            this.array3d = new Array3D(CHUNK_SIZE_E, CHUNK_SIZE_E, CHUNK_SIZE_E);
        }
    }

    /**
     * @return {ArrayBuffer}
     */
    rawData() {
        return this.array3d.data.buffer;
    }

    /**
     * @param {ArrayBuffer} rawData
     */
    setRawData(rawData) {
        this.array3d.data = new Uint32Array(rawData);
    }

    peak(x, y) {
        const a3d = this.array3d;
        for (let peek = CHUNK_SIZE - 1; peek > 0; peek--)
            if (a3d.getHXY(peek + 1, x + 1, y + 1) !== BLOCK_EMPTY)
                return peek;
        return 0;
    }

    getVoxelXYZ(x, y, z) {
        return this.array3d.getHXY(z + 1, x + 1, y + 1);
    }

    setVoxelXYZ(x, y, z, value) {
        throw new Error("setVoxelXYZ is not implemented in ChunkDataExt");
        // this.array3d.setHXY(z + 1, x + 1, y + 1, value);
    }

    updateBorderVoxel(x, y, z, value) {

    }

    /**     
     * @returns {minH:number, maxH:number, minY:number, maxY:number, minX:number, maxX:number} | null
     */
    calculateBounds() {
        let minH = CHUNK_SIZE, maxH = -1;
        let minY = CHUNK_SIZE, maxY = -1;
        let minX = CHUNK_SIZE, maxX = -1;
        const a3d = this.array3d;

        for (let h = 0; h < CHUNK_SIZE; h++)
            for (let y = 0; y < CHUNK_SIZE_E; y++)
                for (let x = 0; x < CHUNK_SIZE_E; x++) {
                    const data = a3d.getHXY(h + 1, x + 1, y + 1);
                    if (data === 0) continue;
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

    /**
     * @param {number} dir27
     * @param {ChunkBlockData} chunkBlockData
     */
    updateAdjBlockData(dir27, chunkBlockData) {
        const E = CHUNK_SIZE + 1;
        const e = CHUNK_SIZE - 1;
        const a = this.array3d;
        const b = chunkBlockData;

        switch (dir27) {
            case 0: a.setXYZ(0, 0, 0, b.getXYZ(e, e, e)); break;
            case 2: a.setXYZ(E, 0, 0, b.getXYZ(0, e, e)); break;
            case 6: a.setXYZ(0, E, 0, b.getXYZ(e, 0, e)); break;
            case 8: a.setXYZ(E, E, 0, b.getXYZ(0, 0, e)); break;
            case 18: a.setXYZ(0, 0, E, b.getXYZ(e, e, 0)); break;
            case 20: a.setXYZ(E, 0, E, b.getXYZ(0, e, 0)); break;
            case 24: a.setXYZ(0, E, E, b.getXYZ(e, 0, 0)); break;
            case 26: a.setXYZ(E, E, E, b.getXYZ(0, 0, 0)); break;
            case 4:
                for (let y = 1; y < E; y++)
                    for (let x = 1; x < E; x++)
                        a.setXYZ(x, y, 0, b.getXYZ(x - 1, y - 1, e));
                break;
            case 10:
                for (let z = 1; z < E; z++)
                    for (let x = 1; x < E; x++)
                        a.setXYZ(x, 0, z, b.getXYZ(x - 1, e, z - 1));
                break;
            case 12:
                for (let z = 1; z < E; z++)
                    for (let y = 1; y < E; y++)
                        a.setXYZ(0, y, z, b.getXYZ(e, y - 1, z - 1));
                break;
            case 14:
                for (let z = 1; z < E; z++)
                    for (let y = 1; y < E; y++)
                        a.setXYZ(E, y, z, b.getXYZ(0, y - 1, z - 1));
                break;
            case 16:
                for (let z = 1; z < E; z++)
                    for (let x = 1; x < E; x++)
                        a.setXYZ(x, E, z, b.getXYZ(x - 1, 0, z - 1));
                break;
            case 22:
                for (let y = 1; y < E; y++)
                    for (let x = 1; x < E; x++)
                        a.setXYZ(x, y, E, b.getXYZ(x - 1, y - 1, 0));
                break;

            case 1:
                for (let x = 1; x < E; x++)
                    a.setXYZ(x, 0, 0, b.getXYZ(x - 1, e, e));
                break;

            case 3:
                for (let y = 1; y < E; y++)
                    a.setXYZ(0, y, 0, b.getXYZ(e, y - 1, e));
                break;

            case 5:
                for (let y = 1; y < E; y++)
                    a.setXYZ(E, y, 0, b.getXYZ(0, y - 1, e));
                break;

            case 7:
                for (let x = 1; x < E; x++)
                    a.setXYZ(x, E, 0, b.getXYZ(x - 1, 0, e));
                break;

            case 9:
                for (let z = 1; z < E; z++)
                    a.setXYZ(0, 0, z, b.getXYZ(e, e, z - 1));
                break;

            case 11:
                for (let z = 1; z < E; z++)
                    a.setXYZ(E, 0, z, b.getXYZ(0, e, z - 1));
                break;

            case 15:
                for (let z = 1; z < E; z++)
                    a.setXYZ(0, E, z, b.getXYZ(e, 0, z - 1));
                break;

            case 17:
                for (let z = 1; z < E; z++)
                    a.setXYZ(E, E, z, b.getXYZ(0, 0, z - 1));
                break;

            case 19:
                for (let x = 1; x < E; x++)
                    a.setXYZ(x, 0, E, b.getXYZ(x - 1, e, 0));
                break;

            case 21:
                for (let y = 1; y < E; y++)
                    a.setXYZ(0, y, E, b.getXYZ(e, y - 1, 0));
                break;
            case 23:
                for (let y = 1; y < E; y++)
                    a.setXYZ(E, y, E, b.getXYZ(0, y - 1, 0));
                break;

            case 25:
                for (let x = 1; x < E; x++)
                    a.setXYZ(x, E, E, b.getXYZ(x - 1, 0, 0));
                break;
        }
    }

    /**
     * @param {number} dir27
     * @param {ChunkDataExt} chunkData
     */
    updateAdjChunkData(dir27, chunkData) {
        const E = CHUNK_SIZE + 1;
        const e = CHUNK_SIZE;
        const a = this.array3d;
        const b = chunkData.array3d;

        switch (dir27) {
            case 0: a.setXYZ(0, 0, 0, b.getXYZ(e, e, e)); break;
            case 2: a.setXYZ(E, 0, 0, b.getXYZ(1, e, e)); break;
            case 6: a.setXYZ(0, E, 0, b.getXYZ(e, 1, e)); break;
            case 8: a.setXYZ(E, E, 0, b.getXYZ(1, 1, e)); break;
            case 18: a.setXYZ(0, 0, E, b.getXYZ(e, e, 1)); break;
            case 20: a.setXYZ(E, 0, E, b.getXYZ(1, e, 1)); break;
            case 24: a.setXYZ(0, E, E, b.getXYZ(e, 1, 1)); break;
            case 26: a.setXYZ(E, E, E, b.getXYZ(1, 1, 1)); break;
            case 4:
                for (let y = 1; y < E; y++)
                    for (let x = 1; x < E; x++)
                        a.setXYZ(x, y, 0, b.getXYZ(x, y, e));
                break;
            case 10:
                for (let z = 1; z < E; z++)
                    for (let x = 1; x < E; x++)
                        a.setXYZ(x, 0, z, b.getXYZ(x, e, z));
                break;
            case 12:
                for (let z = 1; z < E; z++)
                    for (let y = 1; y < E; y++)
                        a.setXYZ(0, y, z, b.getXYZ(e, y, z));
                break;
            case 14:
                for (let z = 1; z < E; z++)
                    for (let y = 1; y < E; y++)
                        a.setXYZ(E, y, z, b.getXYZ(1, y, z));
                break;
            case 16:
                for (let z = 1; z < E; z++)
                    for (let x = 1; x < E; x++)
                        a.setXYZ(x, E, z, b.getXYZ(x, 1, z));
                break;
            case 22:
                for (let y = 1; y < E; y++)
                    for (let x = 1; x < E; x++)
                        a.setXYZ(x, y, E, b.getXYZ(x, y, 1));
                break;

            case 1:
                for (let x = 1; x < E; x++)
                    a.setXYZ(x, 0, 0, b.getXYZ(x, e, e));
                break;

            case 3:
                for (let y = 1; y < E; y++)
                    a.setXYZ(0, y, 0, b.getXYZ(e, y, e));
                break;

            case 5:
                for (let y = 1; y < E; y++)
                    a.setXYZ(E, y, 0, b.getXYZ(1, y, e));
                break;

            case 7:
                for (let x = 1; x < E; x++)
                    a.setXYZ(x, E, 0, b.getXYZ(x, 1, e));
                break;

            case 9:
                for (let z = 1; z < E; z++)
                    a.setXYZ(0, 0, z, b.getXYZ(e, e, z));
                break;

            case 11:
                for (let z = 1; z < E; z++)
                    a.setXYZ(E, 0, z, b.getXYZ(1, e, z));
                break;

            case 15:
                for (let z = 1; z < E; z++)
                    a.setXYZ(0, E, z, b.getXYZ(e, 1, z));
                break;

            case 17:
                for (let z = 1; z < E; z++)
                    a.setXYZ(E, E, z, b.getXYZ(1, 1, z));
                break;

            case 19:
                for (let x = 1; x < E; x++)
                    a.setXYZ(x, 0, E, b.getXYZ(x, e, 1));
                break;

            case 21:
                for (let y = 1; y < E; y++)
                    a.setXYZ(0, y, E, b.getXYZ(e, y, 1));
                break;
            case 23:
                for (let y = 1; y < E; y++)
                    a.setXYZ(E, y, E, b.getXYZ(1, y, 1));
                break;

            case 25:
                for (let x = 1; x < E; x++)
                    a.setXYZ(x, E, E, b.getXYZ(x, 1, 1));
                break;
        }
    }
}

export class ChunkDataExtTransfer extends ChunkDataTransfer {
    /**
     * @param {ChunkDataExt} chunkData
     * @returns {TransferObject}
     */
    transfer(chunkData) {
        const buffer = chunkData.array3d.data.buffer;
        return new TransferObject(buffer, [buffer]);
    }

    /**
     * @param {any} data
     * @returns {ChunkDataExt}
     */
    createFrom(data) {
        const extData = new ChunkDataExt(new Uint32Array(data));
        return extData;
    }
}

export class ChunkExtDataFactory extends ChunkDataFactory {

    /**
     * @param {ChunkBlockData} chunkBlockData
     * @returns {ChunkDataExt}
     */
    createChunkDataFrom(chunkBlockData) {
        const extData = new ChunkDataExt();
        const dst = extData.array3d.data;
        const src = chunkBlockData.data;

        for (let h = 0; h < CHUNK_SIZE; h++) {
            let dstRow = extData.array3d.index(h + 1, 1, 1);
            let srcRow = chunkBlockData.index(h, 0, 0);

            for (let y = 0; y < CHUNK_SIZE; y++, dstRow += CHUNK_SIZE_E, srcRow += CHUNK_SIZE) {
                for (let x = 0; x < CHUNK_SIZE; x++) {
                    dst[dstRow + x] = src[srcRow + x];
                }
            }
        }

        return extData;
    }
}
