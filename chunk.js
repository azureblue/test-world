import { CubeGen, Direction } from "./cube.js";
import { Vec2, vec3, Vec3 } from "./geom.js";
import { Float32Buffer, UInt16Buffer, UInt32Buffer } from "./utils.js";

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
}

class Mesh {

    /** @type {WebGL2RenderingContext} */
    static #gl;
    static #a_pos;
    static #a_norm;
    static #a_uv;

    /** @type {Array<WebGLVertexArrayObject>} */
    #va;
    #textureId;
    #idxsLen;
    #mTranslation;

    /**
     * 
     * @param {Vec3} mTranslation 
     * @param {number} textureId 
     * @param {Float32Array} verts 
     * @param {Float32Array} uvs 
     * @param {Float32Array} normals 
     * @param {Uint16Array} idxs
     */
    constructor(mTranslation, textureId, verts, uvs, normals, idxs) {
        this.#mTranslation = mTranslation;
        this.#textureId = textureId;
        const gl = Mesh.#gl;
        this.#va = gl.createVertexArray();
        const vb = gl.createBuffer();
        const vn = gl.createBuffer();
        const uvb = gl.createBuffer();
        const ib = gl.createBuffer();

        gl.bindVertexArray(this.#va);
        gl.enableVertexAttribArray(Mesh.#a_pos);
        gl.enableVertexAttribArray(Mesh.#a_uv);
        gl.enableVertexAttribArray(Mesh.#a_norm);
        gl.bindBuffer(gl.ARRAY_BUFFER, vb);
        gl.vertexAttribPointer(Mesh.#a_pos, 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, vn);
        gl.vertexAttribPointer(Mesh.#a_norm, 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, uvb);
        gl.vertexAttribPointer(Mesh.#a_uv, 2, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
        gl.bindVertexArray(null);

        gl.bindBuffer(gl.ARRAY_BUFFER, vb);
        gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, uvb);
        gl.bufferData(gl.ARRAY_BUFFER, uvs, gl.STATIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, vn);
        gl.bufferData(gl.ARRAY_BUFFER, normals, gl.STATIC_DRAW);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idxs, gl.STATIC_DRAW);

        this.#idxsLen = idxs.length;
    }

    bindVA() {
        Mesh.#gl.bindVertexArray(this.#va);
    }

    get textureId() {
        return this.#textureId;
    }

    get idxsLen() {
        return this.#idxsLen;
    }

    get modelTranslation() {
        return this.#mTranslation;
    }

    /**
     * @param {WebGL2RenderingContext} gl 
     */
    static setGL(gl, a_pos, a_norm, a_uv) {
        Mesh.#gl = gl;
        Mesh.#a_pos = a_pos;
        Mesh.#a_norm = a_norm;
        Mesh.#a_uv = a_uv;
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
        gl.vertexAttribIPointer(UIntMesh.#a_in, 1, gl.UNSIGNED_INT, false, 0, 0);
        gl.bindVertexArray(null);
        gl.bindBuffer(gl.ARRAY_BUFFER, vb);
        gl.bufferData(gl.ARRAY_BUFFER, input, gl.STATIC_DRAW);
        this.#len = input.length;
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
     * 
     * @param {WebGL2RenderingContext} gl 
     */
    static setGL(gl, a_in) {
        UIntMesh.#gl = gl;
        UIntMesh.#a_in = a_in;
    }
}

class Buffer {
    constructor() {
        this.vs = new Float32Buffer();
        this.uvs = new Float32Buffer();
        this.norms = new Float32Buffer();
        this.idxs = new UInt16Buffer();
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
    // /** @type {Float32Array} */
    // worldCornersX = new Float32Array(8);
    // /** @type {Float32Array} */
    // worldCornersY = new Float32Array(8);
    // /** @type {Float32Array} */
    // worldCornersZ = new Float32Array(8);

    /**
     * @param {ChunkData} data 
     * @param {Vec2} position 
     * @param {UIntMesh} mesh
     */
    constructor(data, position, mesh) {
        this.#data = data;
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
            new Vec3(position.x * CHUNK_SIZE, CHUNK_HEIGHT, -position.y * CHUNK_SIZE),
            new Vec3((position.x + 1) * CHUNK_SIZE, CHUNK_HEIGHT, -position.y * CHUNK_SIZE),
            new Vec3((position.x + 1) * CHUNK_SIZE, CHUNK_HEIGHT, -(position.y + 1) * CHUNK_SIZE),
            new Vec3(position.x * CHUNK_SIZE, CHUNK_HEIGHT, -(position.y + 1) * CHUNK_SIZE)
        ];

        this.#worldCoordCorners.forEach((corner, idx) => {
            // this.worldCornersX[idx] = corner.x;
            // this.worldCornersY[idx] = corner.y;
            // this.worldCornersZ[idx] = corner.z
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

    #chunks
    #x;
    #y;
    #h;

    /**
     * @param {ArrayLike} data 
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
        return this.#chunks[chunk].atCheck(dh + this.#h, px, py);
    }
}

class Scene {
    #chunkMap = new Map();

    iterateChunks() {

    }

}

class ChunkMesher {

    /**
     * @type {Array<Buffer>}
     */
    #buffers = new Array(128);
    #cubeGen = new CubeGen()
    /**
     * @param {Vec2} position 
     * @param {ChunkData} chunkData 
     * @param {ChunkData} chunkDataLeft
     * @param {ChunkData} chunkDataRight
     * @param {ChunkData} chunkDataUp
     * @param {ChunkData} chunkDataDown
     * 
     * @returns {Array<Mesh>}
     */
    createMeshes(position, chunkData, chunkDataLeft, chunkDataRight, chunkDataUp, chunkDataDown) {
        const now = performance.now();
        this.#buffers.fill(null);
        const H = CHUNK_HEIGHT;
        const S = CHUNK_SIZE;
        const pos = new Vec3(0, 0, 0);

        for (let i = 0; i < H; i++)
            for (let y = 0; y < S; y++)
                for (let x = 0; x < S; x++) {
                    const blockType = chunkData.atCheck(i, x, y);
                    pos.x = x; pos.y = i; pos.z = -y;
                    if (blockType == BLOCK_EMPTY)
                        continue;
                    const blockTextureUp = BLOCK_TEXTURE_MAP[blockType][0];
                    const blockTextureSide = BLOCK_TEXTURE_MAP[blockType][1];
                    const blockTextureDown = BLOCK_TEXTURE_MAP[blockType][2];
                    const above = chunkData.atCheck(i + 1, x, y);
                    const below = chunkData.atCheck(i - 1, x, y);
                    if (above === BLOCK_EMPTY || above === BLOCK_CHUNK_EDGE) {
                        const buf = this.#bufferAt(blockTextureUp);
                        this.#cubeGen.genFace(Direction.UP, buf.vs, buf.norms, buf.uvs, buf.idxs, pos);
                    }
                    if (below === BLOCK_EMPTY || below === BLOCK_CHUNK_EDGE) {
                        const buf = this.#bufferAt(blockTextureDown);
                        this.#cubeGen.genFace(Direction.DOWN, buf.vs, buf.norms, buf.uvs, buf.idxs, pos);
                    }
                    const buf = this.#bufferAt(blockTextureSide);
                    const right = (x == CHUNK_SIZE - 1 ? chunkDataRight.at(i, 0, y) : chunkData.at(i, x + 1, y));
                    if (right === BLOCK_EMPTY) {
                        this.#cubeGen.genFace(Direction.RIGHT, buf.vs, buf.norms, buf.uvs, buf.idxs, pos);
                    }

                    const left = (x == 0 ? chunkDataLeft.at(i, CHUNK_SIZE - 1, y) : chunkData.at(i, x - 1, y));
                    if (left === BLOCK_EMPTY) {
                        this.#cubeGen.genFace(Direction.LEFT, buf.vs, buf.norms, buf.uvs, buf.idxs, pos);
                    }

                    const down = (y == 0 ? chunkDataDown.at(i, x, CHUNK_SIZE - 1) : chunkData.at(i, x, y - 1));
                    if (down === BLOCK_EMPTY) {
                        this.#cubeGen.genFace(Direction.FRONT, buf.vs, buf.norms, buf.uvs, buf.idxs, pos);
                    }

                    const up = (y == CHUNK_SIZE - 1 ? chunkDataUp.at(i, x, 0) : chunkData.at(i, x, y + 1));
                    if (up === BLOCK_EMPTY) {
                        this.#cubeGen.genFace(Direction.BACK, buf.vs, buf.norms, buf.uvs, buf.idxs, pos);
                    }
                }
        const meshes = [];
        for (let id = 0; id < 128; id++) {
            const buf = this.#buffers[id];
            if (buf !== null) {
                meshes.push(new Mesh(new Vec3(position.x * CHUNK_SIZE + 0.5, 0.5, -position.y * CHUNK_SIZE - 0.5), id, buf.vs.trimmed(), buf.uvs.trimmed(), buf.norms.trimmed(), buf.idxs.trimmed()));
            }
        }
        const meshTime = performance.now() - now;

        // console.debug("chunk " + chunk.position.toPosString() + " gen time: " + (performance.now() - now));
        return meshes;
    }

    #bufferAt(idx) {
        if (this.#buffers[idx] == null)
            return this.#buffers[idx] = new Buffer();
        else
            return this.#buffers[idx];
    }
}

class UIntChunkMesher {

    /**
     * @type {UInt32Buffer}
     */
    #buffer
    #tmpArr = new Uint32Array(6);

    /*
      shadttttTTTTnnnzzzzzzzzxxxxyyyy
     01234567890123456789012345678901
    */

    /**
     * @param {number} textureIdx
     * @param {number} h 
     * @param {number} x 
     * @param {number} y 
     * @param {number} direction
     */
    #encode(textureIdx, h, x, y, direction, shadows = 0) {
        const dirBits = Direction.directions[direction].bits;
        const bits = 0
            | ((textureIdx & 0b11111111) << 19)
            | ((dirBits & 0b111) << 16)
            | ((h & 0b11111111) << 8)
            | ((x & 0b1111) << 4)
            | ((y & 0b1111));

        let corner0 = 0;
        if ((shadows & 0b1001_0000) == 0b1001_0000)
            corner0 = 4;
        else if ((shadows & 0b1000_0000) == 0b1000_0000)
            corner0 = 2;
        else if ((shadows & 0b0001_0000) == 0b0001_0000)
            corner0 = 3;
        else if ((shadows & 0b0000_0001) == 0b0000_0001)
            corner0 = 1;

        let corner1 = 0;
        if ((shadows & 0b011_0000) == 0b0011_0000)
            corner1 = 4;
        else if ((shadows & 0b0001_0000) == 0b0001_0000)
            corner1 = 2;
        else if ((shadows & 0b0010_0000) == 0b0010_0000)
            corner1 = 3;
        else if ((shadows & 0b0000_0010) == 0b0000_0010)
            corner1 = 1;

        let corner2 = 0;
        if ((shadows & 0b0110_0000) == 0b0110_0000)
            corner2 = 4;
        else if ((shadows & 0b0010_0000) == 0b0010_0000)
            corner2 = 2;
        else if ((shadows & 0b0100_0000) == 0b0100_0000)
            corner2 = 3;
        else if ((shadows & 0b0000_0100) == 0b0000_0100)
            corner2 = 1;

        let corner3 = 0;
        if ((shadows & 0b1100_0000) == 0b1100_0000)
            corner3 = 4;
        else if ((shadows & 0b0100_0000) == 0b0100_0000)
            corner3 = 2;
        else if ((shadows & 0b1000_0000) == 0b1000_0000)
            corner3 = 3;
        else if ((shadows & 0b0000_1000) == 0b0000_1000)
            corner3 = 1;


        this.#tmpArr[0] = bits | (corner0 << 27);
        this.#tmpArr[1] = bits | (corner1 << 27);
        this.#tmpArr[2] = bits | (corner2 << 27);
        this.#tmpArr[3] = bits | (corner0 << 27);
        this.#tmpArr[4] = bits | (corner2 << 27);
        this.#tmpArr[5] = bits | (corner3 << 27)
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
        const H = CHUNK_HEIGHT;
        const S = CHUNK_SIZE;

        for (let i = 0; i < H; i++)
            for (let y = 0; y < S; y++)
                for (let x = 0; x < S; x++) {
                    adj.setPosition(i, x, y);
                    const blockType = adj.get(0, 0, 0);
                    if (blockType == BLOCK_EMPTY)
                        continue;

                    const blockTextureUp = BLOCK_TEXTURE_MAP[blockType][0];
                    const blockTextureSide = BLOCK_TEXTURE_MAP[blockType][1];
                    const blockTextureDown = BLOCK_TEXTURE_MAP[blockType][2];
                    const above = adj.get(1, 0, 0);
                    const below = adj.get(-1, 0, 0);
                    if (above === BLOCK_EMPTY || above === BLOCK_CHUNK_EDGE) {
                        let shadows = 0;
                        if (isSolid(adj.get(1, 0, -1)))/**/ shadows |= 0b0001_0000;
                        if (isSolid(adj.get(1, 1, 0)))/**/  shadows |= 0b0010_0000;
                        if (isSolid(adj.get(1, 0, 1)))/**/  shadows |= 0b0100_0000;
                        if (isSolid(adj.get(1, -1, 0)))/**/ shadows |= 0b1000_0000;

                        if (isSolid(adj.get(1, -1, -1)))/**/shadows |= 0b0000_0001;
                        if (isSolid(adj.get(1, 1, -1)))/**/ shadows |= 0b0000_0010;
                        if (isSolid(adj.get(1, 1, 1)))/**/  shadows |= 0b0000_0100;
                        if (isSolid(adj.get(1, -1, 1)))/**/ shadows |= 0b0000_1000;

                        this.#encode(blockTextureUp, i, x, y, Direction.UP, shadows);
                    }

                    if (below === BLOCK_EMPTY || below === BLOCK_CHUNK_EDGE) {
                        this.#encode(blockTextureDown, i, x, y, Direction.DOWN);
                    }

                    if (adj.get(0, 1, 0) === BLOCK_EMPTY) {
                        let shadows = 0;
                        if (isSolid(adj.get(-1, 1, 0)))/**/ shadows |= 0b0001_0000;
                        if (isSolid(adj.get(0, 1, 1)))/**/  shadows |= 0b0010_0000;
                        if (isSolid(adj.get(1, 1, 0)))/**/  shadows |= 0b0100_0000;
                        if (isSolid(adj.get(0, 1, -1)))/**/ shadows |= 0b1000_0000;

                        if (isSolid(adj.get(-1, 1, -1)))/**/shadows |= 0b0000_0001;
                        if (isSolid(adj.get(-1, 1, 1)))/**/ shadows |= 0b0000_0010;
                        if (isSolid(adj.get(1, 1, 1)))/**/  shadows |= 0b0000_0100;
                        if (isSolid(adj.get(1, 1, -1)))/**/ shadows |= 0b0000_1000;
                        this.#encode(blockTextureSide, i, x, y, Direction.RIGHT, shadows);
                    }

                    if (adj.get(0, -1, 0) === BLOCK_EMPTY) {
                        let shadows = 0;
                        if (isSolid(adj.get(-1, -1, 0)))/**/ shadows |= 0b0001_0000;
                        if (isSolid(adj.get(0, -1, -1)))/**/  shadows |= 0b0010_0000;
                        if (isSolid(adj.get(1, -1, 0)))/**/  shadows |= 0b0100_0000;
                        if (isSolid(adj.get(0, -1, 1)))/**/ shadows |= 0b1000_0000;

                        if (isSolid(adj.get(-1, -1, 1)))/**/shadows |= 0b0000_0001;
                        if (isSolid(adj.get(-1, -1, -1)))/**/ shadows |= 0b0000_0010;
                        if (isSolid(adj.get(1, -1, -1)))/**/  shadows |= 0b0000_0100;
                        if (isSolid(adj.get(1, -1, 1)))/**/ shadows |= 0b0000_1000;
                        this.#encode(blockTextureSide, i, x, y, Direction.LEFT, shadows);
                    }

                    if (adj.get(0, 0, -1) === BLOCK_EMPTY) {
                        let shadows = 0;
                        if (isSolid(adj.get(-1, 0, -1)))/**/ shadows |= 0b0001_0000;
                        if (isSolid(adj.get(0, 1, -1)))/**/  shadows |= 0b0010_0000;
                        if (isSolid(adj.get(1, 0, -1)))/**/  shadows |= 0b0100_0000;
                        if (isSolid(adj.get(0, -1, -1)))/**/ shadows |= 0b1000_0000;

                        if (isSolid(adj.get(-1, -1, -1)))/**/shadows |= 0b0000_0001;
                        if (isSolid(adj.get(-1, 1, -1)))/**/ shadows |= 0b0000_0010;
                        if (isSolid(adj.get(1, 1, -1)))/**/  shadows |= 0b0000_0100;
                        if (isSolid(adj.get(1, -1, -1)))/**/ shadows |= 0b0000_1000;
                        this.#encode(blockTextureSide, i, x, y, Direction.FRONT, shadows);
                    }

                    if (adj.get(0, 0, 1) === BLOCK_EMPTY) {
                        let shadows = 0;
                        if (isSolid(adj.get(-1, 0, 1)))/**/ shadows |= 0b0001_0000;
                        if (isSolid(adj.get(0, -1, 1)))/**/  shadows |= 0b0010_0000;
                        if (isSolid(adj.get(1, 0, 1)))/**/  shadows |= 0b0100_0000;
                        if (isSolid(adj.get(0, 1, 1)))/**/ shadows |= 0b1000_0000;

                        if (isSolid(adj.get(-1, 1, 1)))/**/shadows |= 0b0000_0001;
                        if (isSolid(adj.get(-1, -1, 1)))/**/ shadows |= 0b0000_0010;
                        if (isSolid(adj.get(1, -1, 1)))/**/  shadows |= 0b0000_0100;
                        if (isSolid(adj.get(1, 1, 1)))/**/ shadows |= 0b0000_1000;
                        this.#encode(blockTextureSide, i, x, y, Direction.BACK, shadows);
                    }
                }
        const meshTime = performance.now() - now;
        return new UIntMesh(new Vec3(position.x * CHUNK_SIZE + 0.5, 0.5, -position.y * CHUNK_SIZE - 0.5),
            this.#buffer.trimmed());
    }
}

export {
    Chunk, CHUNK_SIZE, ChunkData, ChunkDataLoader, ChunkManager, ChunkMesher, Mesh, UIntChunkMesher, UIntMesh
};

