import { Direction, DirXY, Vec2, vec3, Vec3 } from "./geom.js";
import { Array2D, Array3D, UInt32Buffer } from "./utils.js";

const CHUNK_SIZE = 16;
const CHUNK_HEIGHT = 128;
const CHUNK_PLANE_SIZE = CHUNK_SIZE * CHUNK_SIZE;

export const BLOCKS = {
    BLOCK_EMPTY: 0,
    BLOCK_DIRT: 1,
    BLOCK_DIRT_GRASS: 2,
    BLOCK_GRASS: 3,
    BLOCK_ROCK: 4,
    BLOCK_CHUNK_EDGE: 255
}

const BLOCK_EMPTY = BLOCKS.BLOCK_EMPTY;
const BLOCK_CHUNK_EDGE = BLOCKS.BLOCK_CHUNK_EDGE;

function isSolid(block) {
    return (block != BLOCK_EMPTY && block != BLOCK_CHUNK_EDGE);
}

function isSolidInt(block) {
    return (block != BLOCK_EMPTY && block != BLOCK_CHUNK_EDGE) ? 1 : 0;
}

const BLOCK_TEXTURE_MAP = [
    [0, 0, 0], // 0
    [1, 1, 1], // 1
    [3, 2, 1], // 2
    [3, 3, 3], // 3
    [4, 4, 4], // 4
]

/**
 * 00 10 12
 * 01 11 21
 */

class ChunkData extends Array3D {

    #maxHeight

    constructor() {
        super(CHUNK_SIZE, CHUNK_HEIGHT);
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

class UIntMesh {

    /** @type {WebGL2RenderingContext} */
    static #gl;
    static #a_in;

    /** @type {Array<WebGLVertexArrayObject>} */
    #va;
    #mTranslation;
    #len;

    /**
     * @param {Vec3} mTranslation 
     * @param {Uint32Array} input 
     */
    constructor(mTranslation, input) {
        this.#mTranslation = mTranslation;
        const gl = UIntMesh.#gl;
        this.#va = gl.createVertexArray();
        const vb = gl.createBuffer();

        gl.bindVertexArray(this.#va);
        gl.enableVertexAttribArray(UIntMesh.#a_in);
        gl.bindBuffer(gl.ARRAY_BUFFER, vb);
        gl.vertexAttribIPointer(UIntMesh.#a_in, 2, gl.UNSIGNED_INT, false, 0, 0);
        gl.bindVertexArray(null);
        gl.bindBuffer(gl.ARRAY_BUFFER, vb);
        gl.bufferData(gl.ARRAY_BUFFER, input, gl.STATIC_DRAW);
        this.#len = input.length >> 1;
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
}


class ChunkDataLoader {
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
        const key = (x << 15) + y;
        let chunkData = this.#cache.get(key);
        if (chunkData === undefined) {
            chunkData = this.#generator(x, y);
            this.#cache.set(key, chunkData);
        }
        return chunkData;
    }
}

class Chunk {
    #data
    #mesh
    #position

    /**@type {Vec3} */
    #worldCenterPosition

    /**@type {Array<Vec3>} */
    #worldCoordCorners

    /** @type {Float32Array} */
    worldCorners = new Float32Array(8 * 4);

    /**
     * @param {ChunkData} data 
     * @param {Vec2} position 
     * @param {UIntMesh} mesh
     */
    constructor(data, position, mesh) {
        this.#data = data;
        this.#data.updateMaxHeight();
        this.#position = position
        this.#mesh = mesh;
        this.#worldCenterPosition = vec3(position.x * CHUNK_SIZE + CHUNK_SIZE / 2, CHUNK_HEIGHT / 2, -position.y * CHUNK_SIZE - CHUNK_SIZE / 2);
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
            this.worldCorners[offset] = corner.x;
            this.worldCorners[offset + 1] = corner.y;
            this.worldCorners[offset + 2] = corner.z;
        });
    }

    get worldCenterPosition() {
        return this.#worldCenterPosition;
    }

    get mesh() {
        return this.#mesh;
    }

    get data() {
        return this.#data;
    }

    get position() {
        return this.#position;
    }

    get worldCoordCorners() {
        return this.#worldCoordCorners;
    }
}

class ChunkManager {
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

    async loadChunk(cx, cy) {
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
        const mesh = this.#chunkMesher.createMeshes(
            position, dataAdj
        );
        return new Chunk(chunks[4], position, mesh);
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

class UIntChunkMesher {

    /**
     * @type {UInt32Buffer}
     */
    #buffer = new UInt32Buffer(4);
    #tmpArr = new Uint32Array(12);
    #upLayer = new Array2D(CHUNK_SIZE);
    #downLayer = new Array2D(CHUNK_SIZE);
    #layers = [new Array3D(CHUNK_SIZE, 4), new Array3D(CHUNK_SIZE, 4)];
    #topRow = new Uint32Array(CHUNK_SIZE);
    #currentRow = new Uint32Array(CHUNK_SIZE);
    #directionEncode = new Int32Array([
        1, 0, 0, 0, 1, 0,
        0, 1, 0, -1, 0, CHUNK_SIZE - 1,
        -1, 0, CHUNK_SIZE - 1, 0, -1, CHUNK_SIZE - 1,
        0, -1, CHUNK_SIZE - 1, 1, 0, 0
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
    #encode(data, h, x, y, direction, width = 1, height = 1) {
        const dirBits = direction;
        const textureId = data >> 8;
        const shadows = data & 0b11111111;
        const corner0Shadow = shadows & 0b11;
        const corner1Shadow = (shadows >> 2) & 0b11;
        const corner2Shadow = (shadows >> 4) & 0b11;
        const corner3Shadow = (shadows >> 6) & 0b11;
        const mergeBitsWidth = (width - 1);
        const mergeBitsHeight = (height - 1 << 4);
        const flip = corner0Shadow + corner2Shadow > corner1Shadow + corner3Shadow;
        const flipBit = (flip ? 1 : 0);

        let bits = 0
            | ((flipBit & 0b1) << 29)
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
            this.#tmpArr[2 * 2 + 1] = 0;
            this.#tmpArr[3 * 2] = bits | (corner1Shadow << 27);
            this.#tmpArr[3 * 2 + 1] = mergeBitsWidth | mergeBitsHeight;
            this.#tmpArr[4 * 2] = bits | (corner3Shadow << 27);
            this.#tmpArr[4 * 2 + 1] = mergeBitsHeight;
            this.#tmpArr[5 * 2] = bits | (corner0Shadow << 27);
            this.#tmpArr[5 * 2 + 1] = 0;
        } else {
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
        }
        this.#buffer.add(this.#tmpArr);
    }

    /**
     * @param {Vec2} position 
     * @param {DataAdj} adj
     * 
     * @returns {UIntMesh}
     */
    createMeshes(position, adj) {
        this.#buffer.reset();
        const now = performance.now();
        this.#upLayer.fill(0);
        this.#downLayer.fill(0);

        const layers = this.#layers;
        layers[0].fill(0);

        const sideDir0 = new DirXY();
        const sideDir1 = new DirXY();
        const cornerDir = new DirXY();

        let topRow = this.#topRow;
        let currentRow = this.#currentRow;

        for (let h = 0; h < CHUNK_HEIGHT; h++) {
            this.#upLayer.fill(0);
            this.#downLayer.fill(0);
            const topLayer = h & 1;
            const currentLayer = 1 - topLayer;
            const layersTop = layers[topLayer];
            const layersCurrent = layers[currentLayer];
            layersCurrent.fill(0);

            for (let y = 0; y < CHUNK_SIZE; y++)
                for (let x = 0; x < CHUNK_SIZE; x++) {
                    adj.setPosition(h, x, y);
                    const blockType = adj.get(0, 0, 0);
                    if (blockType == BLOCK_EMPTY)
                        continue;

                    const blockTextureUp = BLOCK_TEXTURE_MAP[blockType][0];
                    const blockTextureSide = BLOCK_TEXTURE_MAP[blockType][1];
                    const blockTextureDown = BLOCK_TEXTURE_MAP[blockType][2];

                    this.#upLayer.set(x, y, 0);
                    if (adj.get(1, 0, 0) === BLOCK_EMPTY || adj.get(1, 0, 0) === BLOCK_CHUNK_EDGE) {
                        sideDir0.set(-1, 0);
                        sideDir1.set(0, -1);
                        cornerDir.set(-1, -1);
                        let shadows = 0;
                        for (let v = 0; v < 4; v++) {
                            let s0 = isSolidInt(adj.get(1, sideDir0.x, sideDir0.y));
                            let s1 = isSolidInt(adj.get(1, sideDir1.x, sideDir1.y));
                            let c = isSolidInt(adj.get(1, cornerDir.x, cornerDir.y));
                            shadows |= ((s0 + s1 == 2) ? 3 : (s0 + s1 + c)) << (v * 2);
                            sideDir0.rotateCCW();
                            sideDir1.rotateCCW();
                            cornerDir.rotateCCW();
                        }
                        this.#upLayer.set(x, y, (blockTextureUp << 8) | (shadows));
                    }

                    if (adj.get(-1, 0, 0) === BLOCK_EMPTY || adj.get(-1, 0, 0) === BLOCK_CHUNK_EDGE) {
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

                        this.#downLayer.set(x, CHUNK_SIZE - y - 1, (blockTextureDown << 8) | (shadows));
                    }

                    if (adj.get(0, 1, 0) === BLOCK_EMPTY) {
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
                        layersCurrent.set(Direction.RIGHT, y, CHUNK_SIZE - 1 - x, (blockTextureSide << 8) | (shadows));
                    }

                    if (adj.get(0, -1, 0) === BLOCK_EMPTY) {
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
                        layersCurrent.set(Direction.LEFT, CHUNK_SIZE - 1 - y, x, (blockTextureSide << 8) | (shadows));
                    }

                    if (adj.get(0, 0, -1) === BLOCK_EMPTY) {
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
                        layersCurrent.set(Direction.FRONT, x, y, (blockTextureSide << 8) | shadows);
                    }

                    if (adj.get(0, 0, 1) === BLOCK_EMPTY) {
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
                        layersCurrent.set(Direction.BACK, CHUNK_SIZE - 1 - x, CHUNK_SIZE - 1 - y, (blockTextureSide << 8) | shadows);
                    }
                }

            const layerLen = CHUNK_SIZE * CHUNK_SIZE;
            const layersCurrentData = layersCurrent.data;
            const layersTopData = layersTop.data;

            for (let dir = 0; dir < 4; dir++) {
                const layerStartIdx = layersCurrent.planeIdx(dir);
                const layerEndIdx = layerStartIdx + layerLen;
                const dirXXMul = this.#directionEncode[dir * 6];
                const dirXYMul = this.#directionEncode[dir * 6 + 1];
                const dirXAdd = this.#directionEncode[dir * 6 + 2];
                const dirYXMul = this.#directionEncode[dir * 6 + 3];
                const dirYYMul = this.#directionEncode[dir * 6 + 4];
                const dirYAdd = this.#directionEncode[dir * 6 + 5];

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

                        this.#encode(top & 0xFFFF, h - topH,
                            dirXAdd + dirXXMul * x + dirXYMul * y,
                            dirYAdd + dirYXMul * x + dirYYMul * y,
                            dir, (top >> 16) & 0xFF, topH);
                    }
                }
            }

            topRow.fill(0);
            for (let y = 0; y < CHUNK_SIZE; y++) {
                this.#upLayer.getRow(y, currentRow);
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
                        this.#encode(top & 0xFFFF, h, i, y - topH, Direction.UP, topW, topH);
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
                this.#encode(top & 0xFFFF, h, i, CHUNK_SIZE - topH, Direction.UP, topW, topH);
            }

            topRow.fill(0);
            for (let y = 0; y < CHUNK_SIZE; y++) {
                this.#downLayer.getRow(y, currentRow);
                for (let i = 0; i < CHUNK_SIZE; i++) {
                    let j = i + 1;
                    for (; j < CHUNK_SIZE; j++) {
                        if (currentRow[i] != currentRow[j])
                            break;
                        currentRow[j] = 0;
                    }
                    if (currentRow[i] == 0)
                        continue;
                    currentRow[i] |= ((j - i) << 16);
                    currentRow[i] |= (1 << 24);
                    i = j - 1;
                }
                for (let i = 0; i < CHUNK_SIZE; i++) {
                    const top = topRow[i];
                    if (top === 0)
                        continue;
                    const topH = top >> 24;
                    let cur = currentRow[i];
                    if ((top & 0x00FFFFFF) == (cur & 0x00FFFFFF)) {
                        currentRow[i] = (cur & 0x00FFFFFF) | ((topH + 1) << 24);
                    } else {
                        const topW = (top >> 16) & 0xFF;
                        this.#encode(top & 0xFFFF, h, i, CHUNK_SIZE - 1 - y + topH, Direction.DOWN, topW, topH);
                    }
                }
                topRow.set(currentRow);
            }

            for (let i = 0; i < CHUNK_SIZE; i++) {
                const top = topRow[i];
                if (top === 0)
                    continue;
                const topH = top >> 24;
                const topW = (top >> 16) & 0xFF;
                this.#encode(top & 0xFFFF, h, i, topH - 1, Direction.DOWN, topW, topH);
            }
        }

        const layerLen = CHUNK_SIZE * CHUNK_SIZE;
        const layersTop = this.#layers[CHUNK_HEIGHT & 1];
        const layersTopData = layersTop.data;

        for (let dir = 0; dir < 4; dir++) {
            const layerStartIdx = layersTop.planeIdx(dir);
            const dirEncodeBaseIdx = dir * 6;
            const dirXXMul = this.#directionEncode[dirEncodeBaseIdx];
            const dirXYMul = this.#directionEncode[dirEncodeBaseIdx + 1];
            const dirXAdd = this.#directionEncode[dirEncodeBaseIdx + 2];
            const dirYXMul = this.#directionEncode[dirEncodeBaseIdx + 3];
            const dirYYMul = this.#directionEncode[dirEncodeBaseIdx + 4];
            const dirYAdd = this.#directionEncode[dirEncodeBaseIdx + 5];

            for (let i = 0; i < layerLen; i++) {
                const top = layersTopData[layerStartIdx + i];
                if (top === 0)
                    continue;
                const topH = top >> 24;
                let x = i & 0xF;
                let y = i >> 4;
                this.#encode(top & 0xFFFF, CHUNK_HEIGHT - topH,
                    dirXAdd + dirXXMul * x + dirXYMul * y,
                    dirYAdd + dirYXMul * x + dirYYMul * y,
                    dir, (top >> 16) & 0xFF, topH);
            }
        }

        const meshTime = performance.now() - now;
        // console.log(meshTime);
        return new UIntMesh(new Vec3(position.x * CHUNK_SIZE + 0.5, 0.5, -position.y * CHUNK_SIZE - 0.5),
            this.#buffer.trimmed());
    }
}

export {
    Chunk, CHUNK_SIZE, ChunkData, ChunkDataLoader, ChunkManager, UIntChunkMesher, UIntMesh
};
