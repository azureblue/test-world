import { BLOCK_IDS, BLOCKS, isSolid, isSolidInt } from "./blocks.js";
import { Direction, DirXY, Vec2, vec3, Vec3 } from "./geom.js";
import { Array2D, Array3D, UInt32Buffer } from "./utils.js";

export const CHUNK_SIZE_BIT_POS = 4 | 0;
export const CHUNK_SIZE = 16 | 0;
export const CHUNK_HEIGHT = 128 | 0;
const CHUNK_PLANE_SIZE = CHUNK_SIZE * CHUNK_SIZE | 0;

export function posToKey(x, y) {
    return (x + 32767) << 16 | (y + 32767);
}

export function keyToX(key) {
    return (key >>> 16) - 32767;
}

export function keyToY(key) {
    return (key & 0xFFFF) - 32767;
}

const BLOCK_EMPTY = BLOCK_IDS.EMPTY;
const BLOCK_CHUNK_EDGE = BLOCK_IDS.CHUNK_EDGE;
const BLOCK_WATER = BLOCK_IDS.WATER;


/**
 * 00 10 12
 * 01 11 21
 */

export class ChunkData extends Array3D {

    #maxHeight

    /**
     * @param {Uint32Array} [data]
     */
    constructor(data = null) {
        super(CHUNK_SIZE, CHUNK_HEIGHT, data);
    }

    /**
     * @param {number} h 
     * @param {number} x 
     * @param {number} y 
     */
    getCheck(h, x, y) {
        if (h >= CHUNK_HEIGHT || h < 0 || x < 0 || x >= CHUNK_SIZE || y < 0 || y >= CHUNK_SIZE)
            return BLOCK_CHUNK_EDGE;
        return this.get(h, x, y);
    }

    peak(x, y) {
        for (let peek = CHUNK_HEIGHT - 1; peek > 0; peek--)
            if (this.get(peek, x, y) !== BLOCK_EMPTY)
                return peek;
        return 0;
    }

    updateMaxHeight() {
        for (let i = this.data.length - 1; i >= 0; i--) {
            if (this.data[i] !== 0) {
                this.#maxHeight = Math.floor(i / CHUNK_PLANE_SIZE) + 1;
                return;
            }
        }
        this.#maxHeight = 0;
    }

    get maxHeight() {
        return this.#maxHeight;
    }
}

export class UIntMeshData {

    /**
    * @param {Vec3} mTranslation 
    * @param {Uint32Array} data 
    */
    constructor(mTranslation, data) {
        this.mTranslation = mTranslation;
        this.input = data;
    }
}

export class UIntMesh {

    /** @type {WebGL2RenderingContext} */
    static #gl;
    static #a_in;

    /** @type {WebGLVertexArrayObject} */
    #va;
    /** @type {WebGLBuffer} */
    #vb;
    #mTranslation;
    #len;

    /**
     * @param {WebGLVertexArrayObject} va 
     * @param {WebGLBuffer} vb 
     * @param {Vec3} translation 
     * @param {number} len 
     */
    constructor(va, vb, translation, len) {
        this.#va = va;
        this.#vb = vb;
        this.#mTranslation = translation;
        this.#len = len;
    }

    bindVA() {
        UIntMesh.#gl.bindVertexArray(this.#va);
    }

    get modelTranslation() {
        return this.#mTranslation;
    }

    get len() {
        return this.#len;
    }

    /**
     * @param {WebGL2RenderingContext} gl
     */
    static setGL(gl, a_in) {
        UIntMesh.#gl = gl;
        UIntMesh.#a_in = a_in;
    }

    /**
     * @param {Uint32Array} inputData
     * @param {Vec3} translation 
     */
    static load(inputData, translation) {
        const gl = UIntMesh.#gl;
        const va = gl.createVertexArray();
        const vb = gl.createBuffer();
        gl.bindVertexArray(va);
        gl.enableVertexAttribArray(UIntMesh.#a_in);
        gl.bindBuffer(gl.ARRAY_BUFFER, vb);
        gl.bufferData(gl.ARRAY_BUFFER, inputData, gl.STATIC_DRAW);
        gl.vertexAttribIPointer(UIntMesh.#a_in, 2, gl.UNSIGNED_INT, false, 0, 0);
        gl.bindVertexArray(null);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);

        return new UIntMesh(va, vb, translation, inputData.length >> 1);
    }

    static unbind() {
        this.#gl.bindVertexArray(null);
    }
}

export class ChunkDataLoader {
    /** @type {Map<number, ChunkData>} */
    #cache = new Map();

    /** @type {function(number, number): ChunkData} */
    #generator

    /**
     * @param {function(number, number): ChunkData} generator 
     */
    constructor(generator) {
        this.#generator = generator;
    }

    /**
     * @param {number} x 
     * @param {number} y 
     * @returns {ChunkData}
     */
    async getChunk(x, y) {
        const key = posToKey(x, y);
        let chunkData = this.#cache.get(key);
        if (chunkData === undefined) {
            chunkData = this.#generator(x, y);
            this.#cache.set(key, chunkData);
        }
        return chunkData;
    }
}

export class Chunk {
    #data
    #mesh
    #position

    /**@type {Vec3} */
    #worldCenterPosition

    /**@type {Array<Vec3>} */
    #worldCoordCorners

    /** @type {Float32Array} */
    worldCornersData = new Float32Array(8 * 4);

    /**
     * @param {Vec2} position 
     * @param {ChunkData} data
     * @param {UIntMesh} mesh
     */
    constructor(position, data, mesh) {
        this.#data = data;
        this.#data.updateMaxHeight();
        this.#position = position
        this.#mesh = mesh;
        this.#worldCenterPosition = vec3(position.x * CHUNK_SIZE + CHUNK_SIZE / 2, CHUNK_HEIGHT / 2, -position.y * CHUNK_SIZE - CHUNK_SIZE / 2);
        this.#updateCornersData();
    }

    #updateCornersData() {
        const position = this.#position;
        this.#worldCoordCorners = [
            /*
            0, 0
            0, 0, 0, 16, 0, 0, 16, -16, 0, 0, -16, 0
            */
            // bottom
            new Vec3(position.x * CHUNK_SIZE, 0, -position.y * CHUNK_SIZE),
            new Vec3((position.x + 1) * CHUNK_SIZE, 0, -position.y * CHUNK_SIZE),
            new Vec3((position.x + 1) * CHUNK_SIZE, 0, -(position.y + 1) * CHUNK_SIZE),
            new Vec3(position.x * CHUNK_SIZE, 0, -(position.y + 1) * CHUNK_SIZE),
            //top
            new Vec3(position.x * CHUNK_SIZE, this.#data.maxHeight, -position.y * CHUNK_SIZE),
            new Vec3((position.x + 1) * CHUNK_SIZE, this.#data.maxHeight, -position.y * CHUNK_SIZE),
            new Vec3((position.x + 1) * CHUNK_SIZE, this.#data.maxHeight, -(position.y + 1) * CHUNK_SIZE),
            new Vec3(position.x * CHUNK_SIZE, this.#data.maxHeight, -(position.y + 1) * CHUNK_SIZE)
        ];

        this.#worldCoordCorners.forEach((corner, idx) => {
            const offset = idx << 2;
            this.worldCornersData[offset] = corner.x;
            this.worldCornersData[offset + 1] = corner.y;
            this.worldCornersData[offset + 2] = corner.z;
        });
    }

    peek(x, y) {
        return this.#data.peak(x, y);
    }

    get worldCenterPosition() {
        return this.#worldCenterPosition;
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
        return this.#position;
    }

    get worldCoordCorners() {
        return this.#worldCoordCorners;
    }
}

export class ChunkSpec {
    /**
     * @param {ChunkData} chunkData 
     * @param {UIntMeshData} meshData 
     */
    constructor(chunkData, meshData) {
        this.chunkData = chunkData;
        this.meshData = meshData;
    }
}

export class ChunkManager {
    #chunkLoader
    #chunkMesher

    /**
     * @param {ChunkDataLoader} chunkLoader 
     * @param {UIntChunkMesher} chunkMesher 
     */
    constructor(chunkLoader, chunkMesher) {
        this.#chunkLoader = chunkLoader;
        this.#chunkMesher = chunkMesher;
    }

    async load(cx, cy) {
        const position = new Vec2(cx, cy);
        const chunks = [
            await this.#chunkLoader.getChunk(cx - 1, cy + 1),
            await this.#chunkLoader.getChunk(cx, cy + 1),
            await this.#chunkLoader.getChunk(cx + 1, cy + 1),
            await this.#chunkLoader.getChunk(cx - 1, cy),
            await this.#chunkLoader.getChunk(cx, cy),
            await this.#chunkLoader.getChunk(cx + 1, cy),
            await this.#chunkLoader.getChunk(cx - 1, cy - 1),
            await this.#chunkLoader.getChunk(cx, cy - 1),
            await this.#chunkLoader.getChunk(cx + 1, cy - 1)
        ];
        const dataAdj = new BlockAdjsLoader(chunks).load();
        const meshData = this.#chunkMesher.createMeshes(
            position, dataAdj
        );

        return new ChunkSpec(chunks[4], meshData);
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

export class BlockAdjsLoader {

    /**@type {Array<ChunkData>} */
    #chunks
    #x;
    #y;
    #h;

    #cache = new Int32Array((CHUNK_HEIGHT + 2) * cachePlaneSize);
    /**
     * @param {Array<ChunkData>} data 
     */
    constructor(chunks) {
        this.#chunks = chunks;
        this.#cache.fill(-1);
    }

    setPosition(h, x, y) {
        this.#h = h;
        this.#x = x;
        this.#y = y;
    }

    get(dh, dx, dy) {
        let px = this.#x + dx;
        let py = this.#y + dy;
        const h = this.#h + dh;
        const cachePos = cacheStartIdx + h * cachePlaneSize + py * cacheRowSize + px;
        let cacheData = this.#cache[cachePos];
        if (cacheData != -1)
            return cacheData;
        if (h < 0 || h >= CHUNK_HEIGHT)
            return BLOCK_CHUNK_EDGE;
        let chunk = 4;
        if (px < 0) {
            px += CHUNK_SIZE;
            chunk -= 1;
        } else if (px >= CHUNK_SIZE) {
            px -= CHUNK_SIZE;
            chunk += 1;
        }
        if (py < 0) {
            py += CHUNK_SIZE;
            chunk += 3;
        } else if (py >= CHUNK_SIZE) {
            py -= CHUNK_SIZE;
            chunk -= 3;
        }
        cacheData = this.#chunks[chunk].get(h, px, py);
        this.#cache[cachePos] = cacheData;
        return cacheData;
    }

    getAbsolute(h, px, py) {
        // if (h < 0 || h >= CHUNK_HEIGHT)
        //     return BLOCK_CHUNK_EDGE;
        let chunk = 4;
        if (px < 0) {
            px += CHUNK_SIZE;
            chunk -= 1;
        } else if (px >= CHUNK_SIZE) {
            px -= CHUNK_SIZE;
            chunk += 1;
        }
        if (py < 0) {
            py += CHUNK_SIZE;
            chunk += 3;
        } else if (py >= CHUNK_SIZE) {
            py -= CHUNK_SIZE;
            chunk -= 3;
        }

        return this.#chunks[chunk].get(h, px, py);
    }

    load() {
        const row = new Uint32Array(CHUNK_SIZE);
        const arr3d = new Array3D(CHUNK_SIZE + 2, CHUNK_HEIGHT + 2);
        const ch = this.#chunks[4];
        arr3d.fill(BLOCKS.BLOCK_CHUNK_EDGE);
        for (let h = 0; h < CHUNK_HEIGHT; h++)
            for (let y = 0; y < CHUNK_SIZE; y++) {
                ch.fetch(h, 0, y, row, CHUNK_SIZE);
                arr3d.put(h + 1, 1, y + 1, row, CHUNK_SIZE);
            }

        const leftChunk = this.#chunks[3];
        const rightChunk = this.#chunks[5];
        const upChunk = this.#chunks[1];
        const downChunk = this.#chunks[7];

        for (let h = 0; h < CHUNK_HEIGHT; h++) {
            for (let i = 0; i < CHUNK_SIZE; i++) {
                arr3d.set(h + 1, 0, i + 1, leftChunk.get(h, 15, i));
                arr3d.set(h + 1, 17, i + 1, rightChunk.get(h, 0, i));
                arr3d.set(h + 1, i + 1, 0, downChunk.get(h, i, 15));
                arr3d.set(h + 1, i + 1, 17, upChunk.get(h, i, 0));
            }
            arr3d.set(h + 1, 0, 0, this.getAbsolute(h, -1, -1));
            arr3d.set(h + 1, 17, 0, this.getAbsolute(h, 16, -1));
            arr3d.set(h + 1, 17, 17, this.getAbsolute(h, 16, 16));
            arr3d.set(h + 1, 0, 17, this.getAbsolute(h, -1, 16));
        }

        return new DataAdj(arr3d);
    }
}

export class UIntChunkMesher {

    /**
     * @type {UInt32Buffer}
     */
    #bufferSolid = new UInt32Buffer(1024);
    #bufferWater = new UInt32Buffer(1024);
    #tmpArr = new Uint32Array(12);
    #upDownLayers = [new Array2D(CHUNK_SIZE), new Array2D(CHUNK_SIZE)];
    #sideLayers = [new Array3D(CHUNK_SIZE, 5), new Array3D(CHUNK_SIZE, 5)];
    #grasslike = new UInt32Buffer(1024);
    #topRow = new Uint32Array(CHUNK_SIZE);
    #currentRow = new Uint32Array(CHUNK_SIZE);
    #directionEncode = new Int32Array([
        0, 0, 0, 0, 0, 0, 0, 0,
        1, 0, 0, 0, 1, 0, 0, 0,
        0, 1, 0, -1, 0, CHUNK_SIZE - 1, 0, 0,
        -1, 0, CHUNK_SIZE - 1, 0, -1, CHUNK_SIZE - 1, 0, 0,
        0, -1, CHUNK_SIZE - 1, 1, 0, 0, 0, 0
    ]);

    /*
       fshttttTTTTnnnzzzzzzzzxxxxyyyy
     01234567890123456789012345678901
    */

    /**
     * @param {number} data 8 bits (2nd lsb) texture + 8 bits (1st lsb) shadows
     * @param {number} h 
     * @param {number} x 
     * @param {number} y 
     * @param {number} direction
     */
    #addFace(data, h, x, y, direction, width, height, reverseWinding = false) {
        const dirBits = direction;
        const textureId = data >> 8;
        const shadows = data & 0b11111111;
        const corner0Shadow = shadows & 0b11;
        const corner1Shadow = (shadows >> 2) & 0b11;
        const corner2Shadow = (shadows >> 4) & 0b11;
        const corner3Shadow = (shadows >> 6) & 0b11;
        const mergeBitsWidth = width;
        const mergeBitsHeight = height << 5;        
        const flip = corner0Shadow + corner2Shadow > corner1Shadow + corner3Shadow;
        let lower = 0;
        if (textureId == BLOCK_WATER && direction == Direction.UP)
            lower = 2;
        else if (textureId == BLOCKS[BLOCK_IDS.GRASS_SHORT].textureIds[1]) {
            lower = 1;
        }

        let bits = 0
            | (lower << 29)
            | ((textureId & 0b11111111) << 19)
            | ((dirBits & 0b111) << 16)
            | ((h & 0b11111111) << 8)
            | ((y & 0b1111) << 4)
            | ((x & 0b1111));

        if (flip) {
            this.#tmpArr[0 * 2] = bits | (corner1Shadow << 27);
            this.#tmpArr[0 * 2 + 1] = mergeBitsWidth;

            this.#tmpArr[1 * 2] = bits | (corner2Shadow << 27);
            this.#tmpArr[1 * 2 + 1] = mergeBitsWidth | mergeBitsHeight;

            this.#tmpArr[2 * 2] = bits | (corner3Shadow << 27);
            this.#tmpArr[2 * 2 + 1] = mergeBitsHeight;

            this.#tmpArr[3 * 2] = bits | (corner1Shadow << 27);
            this.#tmpArr[3 * 2 + 1] = mergeBitsWidth;

            this.#tmpArr[4 * 2] = bits | (corner3Shadow << 27);
            this.#tmpArr[4 * 2 + 1] = mergeBitsHeight;

            this.#tmpArr[5 * 2] = bits | (corner0Shadow << 27);
            this.#tmpArr[5 * 2 + 1] = 0;
        } else {
            if (!reverseWinding) {
                this.#tmpArr[0 * 2] = bits | (corner0Shadow << 27);
                this.#tmpArr[0 * 2 + 1] = 0;

                this.#tmpArr[1 * 2] = bits | (corner1Shadow << 27);
                this.#tmpArr[1 * 2 + 1] = mergeBitsWidth;

                this.#tmpArr[2 * 2] = bits | (corner2Shadow << 27);
                this.#tmpArr[2 * 2 + 1] = mergeBitsWidth | mergeBitsHeight;

                this.#tmpArr[3 * 2] = bits | (corner0Shadow << 27);
                this.#tmpArr[3 * 2 + 1] = 0;

                this.#tmpArr[4 * 2] = bits | (corner2Shadow << 27);
                this.#tmpArr[4 * 2 + 1] = mergeBitsWidth | mergeBitsHeight;

                this.#tmpArr[5 * 2] = bits | (corner3Shadow << 27);
                this.#tmpArr[5 * 2 + 1] = mergeBitsHeight;
            } else {
                this.#tmpArr[5 * 2] = bits | (corner0Shadow << 27);
                this.#tmpArr[5 * 2 + 1] = 0;

                this.#tmpArr[4 * 2] = bits | (corner1Shadow << 27);
                this.#tmpArr[4 * 2 + 1] = mergeBitsWidth;

                this.#tmpArr[3 * 2] = bits | (corner2Shadow << 27);
                this.#tmpArr[3 * 2 + 1] = mergeBitsWidth | mergeBitsHeight;

                this.#tmpArr[2 * 2] = bits | (corner0Shadow << 27);
                this.#tmpArr[2 * 2 + 1] = 0;

                this.#tmpArr[1 * 2] = bits | (corner2Shadow << 27);
                this.#tmpArr[1 * 2 + 1] = mergeBitsWidth | mergeBitsHeight;

                this.#tmpArr[0 * 2] = bits | (corner3Shadow << 27);
                this.#tmpArr[0 * 2 + 1] = mergeBitsHeight;
            }
        }
        if (textureId == BLOCK_WATER)
            this.#bufferWater.add(this.#tmpArr);
        else
            this.#bufferSolid.add(this.#tmpArr);
    }

    /**
     * @param {Vec2} position 
     * @param {DataAdj} adj
     * 
     * @returns {UIntMeshData}
     */
    createMeshes(position, adj) {
        this.#bufferSolid.reset();
        this.#bufferWater.reset();
        const now = performance.now();
        const layers = this.#sideLayers;
        layers[0].fill(0);
        this.#grasslike.reset();

        const upLayer = this.#upDownLayers[0];
        const downLayer = this.#upDownLayers[1];

        const sideDir0 = new DirXY();
        const sideDir1 = new DirXY();
        const cornerDir = new DirXY();

        let topRow = this.#topRow;
        let currentRow = this.#currentRow;

        for (let h = 0; h < CHUNK_HEIGHT; h++) {
            upLayer.fill(0);
            downLayer.fill(0);
            const topLayer = h & 1;
            const currentLayer = 1 - topLayer;
            const layersTop = layers[topLayer];
            const layersCurrent = layers[currentLayer];
            layersCurrent.fill(0);

            for (let y = 0; y < CHUNK_SIZE; y++)
                for (let x = 0; x < CHUNK_SIZE; x++) {
                    adj.setPosition(h, x, y);
                    const blockId = adj.get(0, 0, 0);
                    if (blockId == BLOCK_EMPTY)
                        continue;

                    if (blockId == 8) {
                        this.#grasslike.put(blockId << 16 | h << 8 | y << 4 | x);
                        continue;
                    }

                    const block = BLOCKS[blockId];
                    const blockTextures = block.textureIds;
                    const isWater = blockId == BLOCK_WATER;
                    const above = adj.get(1, 0, 0);
                    if (!isSolid(above)) {
                        if (isWater && above != BLOCK_EMPTY)
                            continue;
                        sideDir0.set(-1, 0);
                        sideDir1.set(0, -1);
                        cornerDir.set(-1, -1);
                        let shadows = 0;
                        if (!isWater) {
                            for (let v = 0; v < 4; v++) {
                                let s0 = isSolidInt(adj.get(1, sideDir0.x, sideDir0.y));
                                let s1 = isSolidInt(adj.get(1, sideDir1.x, sideDir1.y));
                                let c = isSolidInt(adj.get(1, cornerDir.x, cornerDir.y));
                                shadows |= ((s0 + s1 == 2) ? 3 : (s0 + s1 + c)) << (v * 2);
                                sideDir0.rotateCCW();
                                sideDir1.rotateCCW();
                                cornerDir.rotateCCW();
                            }
                        }
                        upLayer.set(x, y, (blockTextures[0] << 8) | (shadows));
                    }

                    if (isWater)
                        continue;

                    if (!isSolid(adj.get(-1, 0, 0))) {
                        sideDir0.set(-1, 0);
                        sideDir1.set(0, -1);
                        cornerDir.set(-1, -1);
                        let shadows = 0;
                        for (let v = 0; v < 4; v++) {
                            let s0 = isSolidInt(adj.get(-1, sideDir0.x, -sideDir0.y));
                            let s1 = isSolidInt(adj.get(-1, sideDir1.x, -sideDir1.y));
                            let c = isSolidInt(adj.get(-1, cornerDir.x, -cornerDir.y));
                            shadows |= ((s0 + s1 == 2) ? 3 : (s0 + s1 + c)) << (v * 2);
                            sideDir0.rotateCCW();
                            sideDir1.rotateCCW();
                            cornerDir.rotateCCW();
                        }

                        downLayer.set(x, CHUNK_SIZE - y - 1, (blockTextures[5] << 8) | (shadows));
                    }

                    if (!isSolid(adj.get(0, 0, -1))) {
                        sideDir0.set(-1, 0);
                        sideDir1.set(0, -1);
                        cornerDir.set(-1, -1);
                        let shadows = 0;
                        for (let v = 0; v < 4; v++) {
                            let s0 = isSolidInt(adj.get(sideDir0.y, sideDir0.x, -1));
                            let s1 = isSolidInt(adj.get(sideDir1.y, sideDir1.x, -1));
                            let c = isSolidInt(adj.get(cornerDir.y, cornerDir.x, -1));
                            shadows |= ((s0 + s1 == 2) ? 3 : (s0 + s1 + c)) << (v * 2);
                            sideDir0.rotateCCW();
                            sideDir1.rotateCCW();
                            cornerDir.rotateCCW();
                        }
                        layersCurrent.set(Direction.FRONT, x, y, (blockTextures[1] << 8) | shadows);
                    }

                    if (!isSolid(adj.get(0, -1, 0))) {
                        sideDir0.set(-1, 0);
                        sideDir1.set(0, -1);
                        cornerDir.set(-1, -1);
                        let shadows = 0;
                        for (let v = 0; v < 4; v++) {
                            let s0 = isSolidInt(adj.get(sideDir0.y, -1, -sideDir0.x));
                            let s1 = isSolidInt(adj.get(sideDir1.y, -1, -sideDir1.x));
                            let c = isSolidInt(adj.get(cornerDir.y, -1, -cornerDir.x));
                            shadows |= ((s0 + s1 == 2) ? 3 : (s0 + s1 + c)) << (v * 2);
                            sideDir0.rotateCCW();
                            sideDir1.rotateCCW();
                            cornerDir.rotateCCW();
                        }
                        layersCurrent.set(Direction.LEFT, CHUNK_SIZE - 1 - y, x, (blockTextures[2] << 8) | (shadows));
                    }

                    if (!isSolid(adj.get(0, 0, 1))) {
                        sideDir0.set(-1, 0);
                        sideDir1.set(0, -1);
                        cornerDir.set(-1, -1);
                        let shadows = 0;
                        for (let v = 0; v < 4; v++) {
                            let s0 = isSolidInt(adj.get(sideDir0.y, -sideDir0.x, 1));
                            let s1 = isSolidInt(adj.get(sideDir1.y, -sideDir1.x, 1));
                            let c = isSolidInt(adj.get(cornerDir.y, -cornerDir.x, 1));
                            shadows |= ((s0 + s1 == 2) ? 3 : (s0 + s1 + c)) << (v * 2);
                            sideDir0.rotateCCW();
                            sideDir1.rotateCCW();
                            cornerDir.rotateCCW();
                        }
                        layersCurrent.set(Direction.BACK, CHUNK_SIZE - 1 - x, CHUNK_SIZE - 1 - y, (blockTextures[3] << 8) | shadows);
                    }

                    if (!isSolid(adj.get(0, 1, 0))) {
                        sideDir0.set(-1, 0);
                        sideDir1.set(0, -1);
                        cornerDir.set(-1, -1);
                        let shadows = 0;
                        for (let v = 0; v < 4; v++) {
                            let s0 = isSolidInt(adj.get(sideDir0.y, 1, sideDir0.x));
                            let s1 = isSolidInt(adj.get(sideDir1.y, 1, sideDir1.x));
                            let c = isSolidInt(adj.get(cornerDir.y, 1, cornerDir.x));
                            shadows |= ((s0 + s1 == 2) ? 3 : (s0 + s1 + c)) << (v * 2);
                            sideDir0.rotateCCW();
                            sideDir1.rotateCCW();
                            cornerDir.rotateCCW();
                        }
                        layersCurrent.set(Direction.RIGHT, y, CHUNK_SIZE - 1 - x, (blockTextures[4] << 8) | (shadows));
                    }
                }

            const layerLen = CHUNK_SIZE * CHUNK_SIZE;
            const layersCurrentData = layersCurrent.data;
            const layersTopData = layersTop.data;

            for (let dir = 1; dir < 5; dir++) {
                const layerStartIdx = layersCurrent.planeIdx(dir);
                const layerEndIdx = layerStartIdx + layerLen;
                const dirEncodeBaseIdx = dir << 3;
                const dirXXMul = this.#directionEncode[dirEncodeBaseIdx + 0];
                const dirXYMul = this.#directionEncode[dirEncodeBaseIdx + 1];
                const dirXXAdd = this.#directionEncode[dirEncodeBaseIdx + 2];
                const dirYXMul = this.#directionEncode[dirEncodeBaseIdx + 3];
                const dirYYMul = this.#directionEncode[dirEncodeBaseIdx + 4];
                const dirYYAdd = this.#directionEncode[dirEncodeBaseIdx + 5];

                for (let y = layerStartIdx; y < layerEndIdx; y += CHUNK_SIZE) {
                    const rowEnd = y + CHUNK_SIZE;
                    for (let i = y; i < rowEnd; i++) {
                        let j = i + 1;
                        for (; j < rowEnd; j++) {
                            if (layersCurrentData[i] != layersCurrentData[j])
                                break;
                            layersCurrentData[j] = 0;
                        }
                        if (layersCurrentData[i] == 0)
                            continue;
                        layersCurrentData[i] |= (1 << 24) | ((j - i) << 16);
                        i = j - 1;
                    }
                }

                for (let i = 0; i < layerLen; i++) {
                    const top = layersTopData[layerStartIdx + i];
                    if (top === 0)
                        continue;
                    const topH = top >> 24;
                    let cur = layersCurrentData[layerStartIdx + i];
                    if ((top & 0x00FFFFFF) == (cur & 0x00FFFFFF) && topH < 16) {
                        layersCurrentData[layerStartIdx + i] = (cur & 0x00FFFFFF) | ((topH + 1) << 24);
                    } else {
                        let x = i & 0xF;
                        let y = i >> 4;

                        this.#addFace(top & 0xFFFF, h - topH,
                            dirXXAdd + dirXXMul * x + dirXYMul * y,
                            dirYYAdd + dirYXMul * x + dirYYMul * y,
                            dir, (top >> 16) & 0xFF, topH);
                    }
                }
            }

            for (let upDown = 0; upDown < 2; upDown++) {
                topRow.fill(0);
                const layer = this.#upDownLayers[upDown];
                for (let y = 0; y < CHUNK_SIZE; y++) {
                    layer.getRow(y, currentRow);
                    for (let i = 0; i < CHUNK_SIZE; i++) {
                        if (currentRow[i] == 0)
                            continue;
                        let j = i + 1;
                        for (; j < CHUNK_SIZE; j++) {
                            if (currentRow[i] != currentRow[j])
                                break;
                            currentRow[j] = 0;
                        }
                        currentRow[i] |= (j - i) << 16 | 1 << 24;
                        i = j - 1;
                    }
                    for (let i = 0; i < CHUNK_SIZE; i++) {
                        const top = topRow[i];
                        if (top === 0)
                            continue;
                        const topH = top >> 24;
                        let cur = currentRow[i];
                        if ((top & 0x00_FF_FF_FF) == (cur & 0x00_FF_FF_FF)) {
                            currentRow[i] = cur & 0x00_FF_FF_FF | (topH + 1) << 24;
                        } else {
                            const topW = top >> 16 & 0xFF;
                            const yy = (y - topH) * (0b1 - (upDown << 1)) + (CHUNK_SIZE - 1) * (upDown);
                            this.#addFace(top & 0xFFFF, h, i, yy, Direction.UP + upDown * 5, topW, topH);
                        }
                    }
                    const tmp = currentRow;
                    currentRow = topRow;
                    topRow = tmp;
                }

                for (let i = 0; i < CHUNK_SIZE; i++) {
                    const top = topRow[i];
                    if (top === 0)
                        continue;
                    const topH = top >> 24;
                    const topW = top >> 16 & 0xFF;
                    const y = (CHUNK_SIZE - topH) * (0b1 - (upDown << 1)) + (CHUNK_SIZE - 1) * (upDown);
                    this.#addFace(top & 0xFFFF, h, i, y, Direction.UP + upDown * 5, topW, topH);
                }
            }
        }

        const layerLen = CHUNK_SIZE * CHUNK_SIZE;
        const layersTop = this.#sideLayers[CHUNK_HEIGHT & 1];
        const layersTopData = layersTop.data;

        for (let dir = 0; dir < 4; dir++) {
            const layerStartIdx = layersTop.planeIdx(dir);
            const dirEncodeBaseIdx = dir * 6;
            const dirXXMul = this.#directionEncode[dirEncodeBaseIdx];
            const dirXYMul = this.#directionEncode[dirEncodeBaseIdx + 1];
            const dirXXAdd = this.#directionEncode[dirEncodeBaseIdx + 2];
            const dirYXMul = this.#directionEncode[dirEncodeBaseIdx + 3];
            const dirYYMul = this.#directionEncode[dirEncodeBaseIdx + 4];
            const dirYYAdd = this.#directionEncode[dirEncodeBaseIdx + 5];

            for (let i = 0; i < layerLen; i++) {
                const top = layersTopData[layerStartIdx + i];
                if (top === 0)
                    continue;
                const topH = top >> 24;
                let x = i & 0xF;
                let y = i >> 4;
                this.#addFace(top & 0xFFFF, CHUNK_HEIGHT - topH,
                    dirXXAdd + dirXXMul * x + dirXYMul * y,
                    dirYYAdd + dirYXMul * x + dirYYMul * y,
                    dir, (top >> 16) & 0xFF, topH);
            }
        }

        const meshTime = performance.now() - now;
        for (let g of this.#grasslike) {
            //blockId << 16 | h << 8 | y << 4 | x
            const x = g & 0xF;
            const y = (g >> 4) & 0xF;
            const h = (g >> 8) & 0xFF;
            const blockId = (g >> 16) & 0xFFFF;
            this.#addFace(blockId << 8, h, x, y, Direction.DIAGONAL_0, 1, 1);
            this.#addFace(blockId << 8, h, x, y, Direction.DIAGONAL_0, 1, 1, true);
            this.#addFace(blockId << 8, h, x, y, Direction.DIAGONAL_1, 1, 1);
            this.#addFace(blockId << 8, h, x, y, Direction.DIAGONAL_1, 1, 1, true);
        }
        const solids = this.#bufferSolid.trimmed();
        const waters = this.#bufferWater.trimmed();
        const resultData = new Uint32Array(waters.length + solids.length);
        resultData.set(solids);
        resultData.set(waters, solids.length);
        // console.log(meshTime);
        return new UIntMeshData(new Vec3(position.x * CHUNK_SIZE + 0.5, 0.5, -position.y * CHUNK_SIZE - 0.5),
            resultData);
    }
}
