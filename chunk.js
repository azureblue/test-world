import { CubeGen, Direction } from "./cube.js";
import { Mat4, Vec2, Vec3 } from "./geom.js";
import { Float32Buffer, UInt16Buffer } from "./utils.js";

const MAX_IDX_VALUE = 65535;
const CHUNK_SIZE = 16;
const CHUNK_HEIGHT = 128;
const CHUNK_PLANE_SIZE = CHUNK_SIZE * CHUNK_SIZE;
const BLOCK_CHUNK_EDGE = 255;
const BLOCK_EMPTY = 0, BLOCK_DIRT = 1, BLOCK_DIRT_GRASS = 2, BLOCK_GRASS = 3;

const BLOCK_TEXTURE_MAP = [
    [],
    [1, 1, 1],
    [3, 2, 1],
    [3, 3, 3],
]

/**
 * 00 10 12
 * 01 11 21
 * 
 * 
 */

class ChunkData {

    data = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_HEIGHT);
    #position = new Vec2(0, 0);

    /**
     * 
     * @param {Vec2} position
     */
    constructor(position) {
        this.#position = position;
    }

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

    }

    set(h, x, y, id) {
        this.data[CHUNK_PLANE_SIZE * h + y * CHUNK_SIZE + x] = id;
    }

    get position() {
        return this.#position;
    }
}

class Mesh {

    /** @type {WebGL2RenderingContext} */
    static #gl;
    static #a_pos;
    static #a_norm;
    static #a_uv;

    /** @type {Array<WebGLVertexArrayObject>} */
    #va = [];
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
     * 
     * @param {WebGL2RenderingContext} gl 
     */
    static setGL(gl, a_pos, a_norm, a_uv) {
        Mesh.#gl = gl;
        Mesh.#a_pos = a_pos;
        Mesh.#a_norm = a_norm;
        Mesh.#a_uv = a_uv;
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
    #meshes

    /**
     * @param {ChunkData} data 
     * @param {Array<Mesh>} meshes
     */
    constructor(data, meshes) {
        this.#data = data;
        this.#meshes = meshes;
    }

    get meshes() {
        return this.#meshes;
    }

    get data() {
        return this.#data;
    }
}

class ChunkManager {
    #chunkLoader
    #chunkMesher

    /**
     * @param {ChunkDataLoader} chunkLoader 
     * @param {ChunkMesher} chunkMesher 
     */
    constructor(chunkLoader, chunkMesher) {
        this.#chunkLoader = chunkLoader;
        this.#chunkMesher = chunkMesher;
    }

    async loadChunk(x, y) {
        const data = await this.#chunkLoader.getChunk(x, y);
        const meshes = this.#chunkMesher.createMeshes(
            data,
            await this.#chunkLoader.getChunk(x - 1, y),
            await this.#chunkLoader.getChunk(x + 1, y),
            await this.#chunkLoader.getChunk(x, y + 1),
            await this.#chunkLoader.getChunk(x, y - 1)
        );
        return new Chunk(data, meshes);
    }
}

class ChunkMesher {

    /**
     * @type {Array<Buffer>}
     */
    #buffers = new Array(128);
    #cubeGen = new CubeGen()
    /**
     * @param {ChunkData} chunk 
     * @param {ChunkData} chunkLeft
     * @param {ChunkData} chunkRight
     * @param {ChunkData} chunkUp
     * @param {ChunkData} chunkDown
     * 
     * @returns {Array<Mesh>}
     */
    createMeshes(chunk, chunkLeft, chunkRight, chunkUp, chunkDown) {
        const now = performance.now();
        this.#buffers.fill(null);
        const H = CHUNK_HEIGHT;
        const S = CHUNK_SIZE;
        const pos = new Vec3(0, 0, 0);

        for (let i = 0; i < H; i++)
            for (let y = 0; y < S; y++)
                for (let x = 0; x < S; x++) {
                    const blockType = chunk.atCheck(i, x, y);
                    pos.x = x; pos.y = i; pos.z = -y;
                    if (blockType == BLOCK_EMPTY)
                        continue;
                    const blockTextureUp = BLOCK_TEXTURE_MAP[blockType][0];
                    const blockTextureSide = BLOCK_TEXTURE_MAP[blockType][1];
                    const blockTextureDown = BLOCK_TEXTURE_MAP[blockType][2];
                    const above = chunk.atCheck(i + 1, x, y);
                    const below = chunk.atCheck(i - 1, x, y);
                    if (above === BLOCK_EMPTY || above === BLOCK_CHUNK_EDGE) {
                        const buf = this.#bufferAt(blockTextureUp);
                        this.#cubeGen.genFace(Direction.UP, buf.vs, buf.norms, buf.uvs, buf.idxs, pos);
                    }
                    if (below === BLOCK_EMPTY || below === BLOCK_CHUNK_EDGE) {
                        const buf = this.#bufferAt(blockTextureDown);
                        this.#cubeGen.genFace(Direction.DOWN, buf.vs, buf.norms, buf.uvs, buf.idxs, pos);
                    }
                    const buf = this.#bufferAt(blockTextureSide);
                    const right = (x == CHUNK_SIZE - 1 ? chunkRight.at(i, 0, y) : chunk.at(i, x + 1, y));
                    if (right === BLOCK_EMPTY) {
                        this.#cubeGen.genFace(Direction.RIGHT, buf.vs, buf.norms, buf.uvs, buf.idxs, pos);
                    }

                    const left = (x == 0 ? chunkLeft.at(i, CHUNK_SIZE - 1, y) : chunk.at(i, x - 1, y));
                    if (left === BLOCK_EMPTY) {
                        this.#cubeGen.genFace(Direction.LEFT, buf.vs, buf.norms, buf.uvs, buf.idxs, pos);
                    }

                    const down = (y == 0 ? chunkDown.at(i, x, CHUNK_SIZE - 1) : chunk.at(i, x, y - 1));
                    if (down === BLOCK_EMPTY) {
                        this.#cubeGen.genFace(Direction.FRONT, buf.vs, buf.norms, buf.uvs, buf.idxs, pos);
                    }

                    const up = (y == CHUNK_SIZE - 1 ? chunkUp.at(i, x, 0) : chunk.at(i, x, y + 1));
                    if (up === BLOCK_EMPTY) {
                        this.#cubeGen.genFace(Direction.BACK, buf.vs, buf.norms, buf.uvs, buf.idxs, pos);
                    }
                }
        const meshes = [];
        for (let id = 0; id < 128; id++) {
            const buf = this.#buffers[id];
            if (buf !== null) {
                meshes.push(new Mesh(new Vec3(chunk.position.x * CHUNK_SIZE + 0.5, 0.5, -chunk.position.y * CHUNK_SIZE - 0.5), id, buf.vs.trimmed(), buf.uvs.trimmed(), buf.norms.trimmed(), buf.idxs.trimmed()));
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

export {
    BLOCK_DIRT, BLOCK_DIRT_GRASS, BLOCK_EMPTY, BLOCK_GRASS, CHUNK_SIZE, ChunkData, ChunkDataLoader, ChunkManager, ChunkMesher, Mesh
};

