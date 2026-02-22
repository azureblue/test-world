import { BLOCK_IDS } from "../blocks.js";
import { CHUNK_SIZE, ChunkDataExtended, ChunkDataLoader } from "../chunk.js";
import { FVec3, IVec3, Vec3, vec3 } from "../geom.js";
import { perfDiff } from "../utils.js";
import { UIntWasmMesher } from "./uIntWasmMesher.js";


const BLOCK_EMPTY = BLOCK_IDS.EMPTY;
const BLOCK_CHUNK_EDGE = BLOCK_IDS.CHUNK_EDGE;
const BLOCK_WATER = BLOCK_IDS.WATER;

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
     * @param {FVec3} translation 
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

    dispose() {
        const gl = UIntMesh.#gl;
        gl.deleteBuffer(this.#vb);
        gl.deleteVertexArray(this.#va);
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
     * @param {FVec3} translation 
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

export class ChunkMesher {
    /**
     * @param {IVec3} position
     * @param {ChunkDataLoader} chunkLoader
     * @returns {UIntMeshData}
     */
    createMeshes(position, chunkLoader) {
        throw new Error("Not implemented");
    }
}

export class UIntMesher extends ChunkMesher {
    #lastMeshTime = 0;

    /**
      * @param {ChunkDataExtended} chunkData
      * @return {Uint32Array}
      */
    mesh(chunkData) {
        throw new Error("Not implemented");
    }

    /**
     * @param {IVec3} position 
     * @param {ChunkDataExtended} chunkData
     * 
     * @returns {UIntMeshData}
     */
    createMeshes(position, chunkData) {
        const meshStart = performance.now();
        const meshData = this.mesh(chunkData);
        this.#lastMeshTime = perfDiff(meshStart);
        return new UIntMeshData(vec3(position.x * CHUNK_SIZE + 0.5, position.z * CHUNK_SIZE + 0.5, -position.y * CHUNK_SIZE - 0.5),
            meshData);
    }

    lastMeshTime() {
        return this.#lastMeshTime;
    }
}

export { UIntWasmMesher as DefaultMesher };
