import { CubeGen, Direction } from "./cube.js";
import { Vec2, Vec3, Mat4 } from "./geom.js";
import { Float32Buffer, UInt16Buffer } from "./utils.js";

const MAX_IDX_VALUE = 65535;
const CHUNK_SIZE = 16;
const CHUNK_HEIGHT = 128;
const CHUNK_PLANE_SIZE = CHUNK_SIZE * CHUNK_SIZE;
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

class Mesh {

    /** @type {WebGL2RenderingContext} */
    static #gl;
    static #a_pos;
    static #a_uv;

    /** @type {Array<WebGLVertexArrayObject>} */
    #va = [];
    #textureId;
    #idxsLen;
    #mModel;

    /**
     * 
     * @param {Mat4} mModel 
     * @param {number} textureId 
     * @param {Float32Array} verts 
     * @param {Float32Array} uvs 
     * @param {Float32Array} normals 
     * @param {Uint16Array} idxs
     */
    constructor(mModel, textureId, verts, uvs, normals, idxs) {
        this.#mModel = mModel;
        this.#textureId = textureId;
        const gl = Mesh.#gl;
        this.#va = gl.createVertexArray();
        const vb = gl.createBuffer();
        const uvb = gl.createBuffer();
        const ib = gl.createBuffer();

        gl.bindVertexArray(this.#va);
        gl.enableVertexAttribArray(Mesh.#a_pos);
        gl.enableVertexAttribArray(Mesh.#a_uv);
        gl.bindBuffer(gl.ARRAY_BUFFER, vb);
        gl.vertexAttribPointer(Mesh.#a_pos, 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, uvb);
        gl.vertexAttribPointer(Mesh.#a_uv, 2, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
        gl.bindVertexArray(null);

        gl.bindBuffer(gl.ARRAY_BUFFER, vb);
        gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, uvb);
        gl.bufferData(gl.ARRAY_BUFFER, uvs, gl.STATIC_DRAW);
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

    get modelMatrix() {
        return this.#mModel;
    }

    /**
     * 
     * @param {WebGL2RenderingContext} gl 
     */
    static setGL(gl, a_pos, a_uv) {
        Mesh.#gl = gl;
        Mesh.#a_pos = a_pos;
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

class Chunk {

    data = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_HEIGHT);
    #position = new Vec2(0, 0);
    #mesh;

    /**
     * 
     * @param {Vec2} position
     */
    constructor(position) {
        this.#position = position;
    }

    /**
     * 
     * @param {number} h 
     * @param {number} x 
     * @param {number} y 
     */
    at(h, x, y) {
        if (h >= CHUNK_HEIGHT || h < 0 || x < 0 || x >= CHUNK_SIZE || y < 0 || y >= CHUNK_SIZE)
            return BLOCK_EMPTY;
        return this.data[CHUNK_PLANE_SIZE * h + y * CHUNK_SIZE + x];
    }

    set(h, x, y, id) {
        this.data[CHUNK_PLANE_SIZE * h + y * CHUNK_SIZE + x] = id;
    }

    remesh() {

    }

    get position() {
        return this.#position;
    }
}

class ChunkManager {

}

class ChunkMesher {

    /**
     * @type {Array<Buffer>}
     */
    #buffers = new Array(128);
    #cubeGen = new CubeGen()
    /**
     * @param {Chunk} chunk 
     * @returns {Array<Mesh>}
     */
    createMeshes(chunk) {
        const now = performance.now();
        this.#buffers.fill(null);
        const H = CHUNK_HEIGHT;
        const S = CHUNK_SIZE;
        const pos = new Vec3(0, 0, 0);

        for (let i = 0; i < H; i++)
            for (let y = 0; y < S; y++)
                for (let x = 0; x < S; x++) {
                    const blockType = chunk.at(i, x, y);
                    pos.x = x; pos.y = i; pos.z = y;
                    if (blockType == BLOCK_EMPTY)
                        continue;
                    const blockTextureUp = BLOCK_TEXTURE_MAP[blockType][0];
                    const blockTextureSide = BLOCK_TEXTURE_MAP[blockType][1];
                    const blockTextureDown = BLOCK_TEXTURE_MAP[blockType][2]
                    if (chunk.at(i + 1, x, y) === BLOCK_EMPTY) {
                        const buf = this.#bufferAt(blockTextureUp);
                        this.#cubeGen.genFace(Direction.UP, buf.vs, buf.norms, buf.uvs, buf.idxs, pos);
                    }
                    if (chunk.at(i - 1, x, y) === BLOCK_EMPTY) {
                        const buf = this.#bufferAt(blockTextureDown);
                        this.#cubeGen.genFace(Direction.DOWN, buf.vs, buf.norms, buf.uvs, buf.idxs, pos);
                    }
                    const buf = this.#bufferAt(blockTextureSide);
                    if (chunk.at(i, x + 1, y) === BLOCK_EMPTY) {
                        this.#cubeGen.genFace(Direction.RIGHT, buf.vs, buf.norms, buf.uvs, buf.idxs, pos);
                    }
                    if (chunk.at(i, x - 1, y) === BLOCK_EMPTY) {
                        this.#cubeGen.genFace(Direction.LEFT, buf.vs, buf.norms, buf.uvs, buf.idxs, pos);
                    }
                    if (chunk.at(i, x, y - 1) === BLOCK_EMPTY) {
                        this.#cubeGen.genFace(Direction.BACK, buf.vs, buf.norms, buf.uvs, buf.idxs, pos);
                    }
                    if (chunk.at(i, x, y + 1) === BLOCK_EMPTY) {
                        this.#cubeGen.genFace(Direction.FRONT, buf.vs, buf.norms, buf.uvs, buf.idxs, pos);
                    }
                }
        const meshes = [];
        const translation = new Vec3(chunk.position.x + 0.5, 0.5, chunk.position.y + 0.5);
        for (let id = 0; id < 128; id++) {
            const buf = this.#buffers[id];
            if (buf !== null) {                
                meshes.push(new Mesh(Mat4.translation(translation.x, translation.y, translation.z), id, buf.vs.trimmed(), buf.uvs.trimmed(), buf.norms.trimmed(), buf.idxs.trimmed()));
            }
        }
        return meshes;
    }

    #bufferAt(idx) {
        if (this.#buffers[idx] == null)
            return this.#buffers[idx] = new Buffer();
        else
            return this.#buffers[idx];
    }
}

export { Chunk, ChunkMesher, Mesh, BLOCK_EMPTY, BLOCK_DIRT, BLOCK_GRASS, BLOCK_DIRT_GRASS };

