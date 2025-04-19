import { Direction, DirXY, Vec2, vec3, Vec3 } from "./geom.js";
import { Array2D, UInt32Buffer } from "./utils.js";

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

class ChunkData {

    data = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_HEIGHT);
    #maxHeight

    /**
     * @param {number} h 
     * @param {number} x 
     * @param {number} y 
     */
    atCheck(h, x, y) {
        if (h >= CHUNK_HEIGHT || h < 0 || x < 0 || x >= CHUNK_SIZE || y < 0 || y >= CHUNK_SIZE)
            return BLOCK_CHUNK_EDGE;
        return this.data[CHUNK_PLANE_SIZE * h + y * CHUNK_SIZE + x];
    }

    /**
     * @param {number} h 
     * @param {number} x 
     * @param {number} y 
     */
    at(h, x, y) {
        return this.data[CHUNK_PLANE_SIZE * h + y * CHUNK_SIZE + x];
    }

    /**
     * @param {number} x 
     * @param {number} y 
     * @returns {number}
     */
    peak(x, y) {
        for (let peek = CHUNK_HEIGHT - 1; peek > 0; peek--)
            if (this.at(peek, x, y) !== BLOCK_EMPTY)
                return peek;
        return 0;
    }

    set(h, x, y, id) {
        this.data[CHUNK_PLANE_SIZE * h + y * CHUNK_SIZE + x] = id;
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
        this.#len = input.length / 2;
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
        this.#worldCenterPosition = vec3(position.x * CHUNK_SIZE + CHUNK_SIZE / 2, CHUNK_HEIGHT / 2, -position.y * CHUNK_SIZE - CHUNK_SIZE / 2)
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

        const mesh = this.#chunkMesher.createMeshes(
            position, new BlockAdjs(chunks)
        );
        return new Chunk(chunks[4], position, mesh);
    }
}

export class BlockAdjs {

    /**@type {Array<ChunkData>} */
    #chunks
    #x;
    #y;
    #h;

    /**
     * @param {Array<ChunkData>} data 
     */
    constructor(chunks) {
        this.#chunks = chunks;
    }

    setPosition(h, x, y) {
        this.#h = h;
        this.#x = x;
        this.#y = y;
    }

    get(dh, dx, dy) {
        const h = this.#h + dh;
        if (h < 0 || h >= CHUNK_HEIGHT)
            return BLOCK_CHUNK_EDGE;
        let chunk = 4;
        let px = this.#x + dx;
        let py = this.#y + dy;
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
        return this.#chunks[chunk].at(h, px, py);
    }
}

class UIntChunkMesher {

    /**
     * @type {UInt32Buffer}
     */
    #buffer
    #tmpArr = new Uint32Array(12);

    /*
     mmfshttttTTTTnnnzzzzzzzzxxxxyyyy
     01234567890123456789012345678901
    */

    /**
     * @param {number} textureIdx
     * @param {number} h 
     * @param {number} x 
     * @param {number} y 
     * @param {number} direction
     */
    #encode(textureIdx, h, x, y, direction, shadows = 0, width = 1, height = 1) {
        const dirBits = Direction.directions[direction].bits;
        let flipRect = 0
            | ((textureIdx & 0b11111111) << 19)
            | ((dirBits & 0b111) << 16)
            | ((h & 0b11111111) << 8)
            | ((y & 0b1111) << 4)
            | ((x & 0b1111));

        const corner0Shadow = shadows & 0b11;
        const corner1Shadow = (shadows >> 2) & 0b11;
        const corner2Shadow = (shadows >> 4) & 0b11;
        const corner3Shadow = (shadows >> 6) & 0b11;
        const mergeBits = (height - 1 << 4) | (width - 1);

        if (corner0Shadow + corner2Shadow > corner1Shadow + corner3Shadow) {
            flipRect |= (0b1 << 29);
            this.#tmpArr[0 * 2] = flipRect | (corner1Shadow << 27);
            this.#tmpArr[0 * 2 + 1] = mergeBits
            this.#tmpArr[1 * 2] = flipRect | (corner2Shadow << 27);
            this.#tmpArr[1 * 2 + 1] = mergeBits
            this.#tmpArr[2 * 2] = flipRect | (corner3Shadow << 27);
            this.#tmpArr[2 * 2 + 1] = mergeBits
            this.#tmpArr[3 * 2] = flipRect | (corner1Shadow << 27);
            this.#tmpArr[3 * 2 + 1] = mergeBits
            this.#tmpArr[4 * 2] = flipRect | (corner3Shadow << 27);
            this.#tmpArr[4 * 2 + 1] = mergeBits
            this.#tmpArr[5 * 2] = flipRect | (corner0Shadow << 27);
            this.#tmpArr[5 * 2 + 1] = mergeBits
        } else {
            this.#tmpArr[0 * 2] = flipRect | (corner0Shadow << 27);
            this.#tmpArr[0 * 2 + 1] = mergeBits
            this.#tmpArr[1 * 2] = flipRect | (corner1Shadow << 27);
            this.#tmpArr[1 * 2 + 1] = mergeBits
            this.#tmpArr[2 * 2] = flipRect | (corner2Shadow << 27);
            this.#tmpArr[2 * 2 + 1] = mergeBits
            this.#tmpArr[3 * 2] = flipRect | (corner0Shadow << 27);
            this.#tmpArr[3 * 2 + 1] = mergeBits
            this.#tmpArr[4 * 2] = flipRect | (corner2Shadow << 27);
            this.#tmpArr[4 * 2 + 1] = mergeBits
            this.#tmpArr[5 * 2] = flipRect | (corner3Shadow << 27);
            this.#tmpArr[5 * 2 + 1] = mergeBits
        }

        this.#buffer.add(this.#tmpArr);
    }

    /**
     * @param {Vec2} position 
     * @param {BlockAdjs} adj
     * 
     * @returns {UIntMesh}
     */
    createMeshes(position, adj) {
        this.#buffer = new UInt32Buffer(4);
        const now = performance.now();

        const sideDir0 = new DirXY();
        const sideDir1 = new DirXY();
        const cornerDir = new DirXY();

        const topRow = new Uint32Array(CHUNK_SIZE);
        const currentRow = new Uint32Array(CHUNK_SIZE);

        const layer = new Array2D(CHUNK_SIZE);
        const layerDown = new Array2D(CHUNK_SIZE);

        for (let h = 0; h < CHUNK_HEIGHT; h++) {            
            layer.fill(0);
            layerDown.fill(0);
            for (let y = 0; y < CHUNK_SIZE; y++)
                for (let x = 0; x < CHUNK_SIZE; x++) {
                    adj.setPosition(h, x, y);
                    const blockType = adj.get(0, 0, 0);
                    if (blockType == BLOCK_EMPTY)
                        continue;

                    const blockTextureUp = BLOCK_TEXTURE_MAP[blockType][0];
                    const blockTextureSide = BLOCK_TEXTURE_MAP[blockType][1];
                    const blockTextureDown = BLOCK_TEXTURE_MAP[blockType][2];
                    const above = adj.get(1, 0, 0);
                    const below = adj.get(-1, 0, 0);

                    layer.set(x, y, 0);
                    if (above === BLOCK_EMPTY || above === BLOCK_CHUNK_EDGE) {
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
                        layer.set(x, y, (blockTextureUp << 8) | (shadows));
                    }

                    if (below === BLOCK_EMPTY || below === BLOCK_CHUNK_EDGE) {
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

                        // layer.set(x, y, (blockTextureDown << 8) | (shadows));
                        // this.#encode(blockTextureDown, i, x, y, Direction.DOWN, shadows);
                        layerDown.set(x, y, (blockTextureDown << 8) | (shadows));
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

                        this.#encode(blockTextureSide, h, x, y, Direction.RIGHT, shadows);
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

                        this.#encode(blockTextureSide, h, x, y, Direction.LEFT, shadows);
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

                        this.#encode(blockTextureSide, h, x, y, Direction.FRONT, shadows);
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

                        this.#encode(blockTextureSide, h, x, y, Direction.BACK, shadows);
                    }
                }

            layer.getRow(0, topRow);
            for (let i = 0; i < CHUNK_SIZE; i++) {
                let j = i + 1;
                for (; j < CHUNK_SIZE; j++) {
                    if (topRow[i] != topRow[j])
                        break;
                    topRow[j] = 0;
                }
                if (topRow[i] == 0)
                    continue;
                topRow[i] |= ((j - i) << 16);
                topRow[i] |= (1 << 24);
                i = j - 1;
            }

            for (let y = 1; y < CHUNK_SIZE; y++) {
                layer.getRow(y, currentRow);
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
                        this.#encode((top >> 8) & 0xFF, h, i, y - topH, Direction.UP, (top & 0xFF), topW, topH);
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
                this.#encode((top >> 8) & 0xFF, h, i, CHUNK_SIZE - topH, Direction.UP, (top & 0xFF), topW, topH);
            }

            layerDown.getRow(0, topRow);
            for (let i = 0; i < CHUNK_SIZE; i++) {
                let j = i + 1;
                for (; j < CHUNK_SIZE; j++) {
                    if (topRow[i] != topRow[j])
                        break;
                    topRow[j] = 0;
                }
                if (topRow[i] == 0)
                    continue;
                topRow[i] |= ((j - i) << 16);
                topRow[i] |= (1 << 24);
                i = j - 1;
            }

            for (let y = 1; y < CHUNK_SIZE; y++) {
                layerDown.getRow(y, currentRow);
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
                        this.#encode((top >> 8) & 0xFF, h, i, y - topH, Direction.DOWN, (top & 0xFF), topW, topH);
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
                this.#encode((top >> 8) & 0xFF, h, i, CHUNK_SIZE - topH, Direction.DOWN, (top & 0xFF), topW, topH);
            }

        }

        const meshTime = performance.now() - now;
        return new UIntMesh(new Vec3(position.x * CHUNK_SIZE + 0.5, 0.5, -position.y * CHUNK_SIZE - 0.5),
            this.#buffer.trimmed());
    }
}

export {
    Chunk, CHUNK_SIZE, ChunkData, ChunkDataLoader, ChunkManager, UIntChunkMesher, UIntMesh
};

