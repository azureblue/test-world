import { CHUNK_SIZE } from "../chunk/chunk.js";
import { ChunkDataExt } from "../chunk/extChunk.js";
import { FVec3, IVec3, Vec3, vec3 } from "../geom.js";
import { TransferObject } from "../transfer.js";
import { perfDiff } from "../utils.js";
import { ChunkMesh, ChunkMesher, MeshData, MeshDataTransfer, MeshHandler } from "./mesh.js";

export class UIntMeshData extends MeshData {

    /**
    * @param {Vec3} mTranslation 
    * @param {Uint32Array} data 
    * @param {number} solidEnd
    */
    constructor(mTranslation, data, solidEnd) {
        super();
        this.mTranslation = mTranslation;        
        this.data = data;
        this.solidEnd = solidEnd;
    }

    isEmpty() {
        return this.data.length === 0;
    }
}

export class UIntMeshDataTransfer extends MeshDataTransfer {

    /**
     * @param {MeshData} meshData
     * @returns {TransferObject}
     */
    transfer(meshData) {
        const uintMeshData = /** @type {UIntMeshData} */ (meshData);
        const transferData = {
            solidEnd: uintMeshData.solidEnd,
            mTranslation: uintMeshData.mTranslation,
            data: uintMeshData.data.buffer
        };
        return new TransferObject(transferData, [uintMeshData.data.buffer]);
    }

    createFrom(data) {
        return new UIntMeshData(vec3(data.mTranslation.x, data.mTranslation.y, data.mTranslation.z), new Uint32Array(data.data), data.solidEnd);
    }
}


export class UIntMeshHandler extends MeshHandler {
     /** @type {WebGL2RenderingContext} */
    #gl;
    /** @type {number} */
    #aIn;

    /**
     * @param {WebGL2RenderingContext} gl 
     * @param {number} aIn 
     */
    constructor(gl, aIn) {
        super();
        this.#gl = gl;
        this.#aIn = aIn;
    }

    /**
     * @param {UIntMeshData} meshData 
     */
    upload(meshData) {
        const gl = this.#gl;
        const va = gl.createVertexArray();
        const vb = gl.createBuffer();
        gl.bindVertexArray(va);
        gl.enableVertexAttribArray(this.#aIn);
        gl.bindBuffer(gl.ARRAY_BUFFER, vb);
        gl.bufferData(gl.ARRAY_BUFFER, meshData.data, gl.STATIC_DRAW);
        gl.vertexAttribIPointer(this.#aIn, 2, gl.UNSIGNED_INT, false, 0, 0);
        gl.bindVertexArray(null);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
        return new UIntMesh(va, vb, meshData.solidEnd >> 1, meshData.mTranslation, meshData.data.length >> 1);
    }

    /**
     * @param {UIntMesh} mesh 
     */
    dispose(mesh) {
        const gl = this.#gl;
        gl.deleteBuffer(mesh.vb);
        gl.deleteVertexArray(mesh.va);
    }

    static unbind(gl) {
        gl.bindVertexArray(null);
    }
}

export class UIntMesh extends ChunkMesh {
    /** @type {WebGLVertexArrayObject} */
    va;
    /** @type {WebGLBuffer} */
    vb;
    mTranslation;
    len;

    /**
     * @param {WebGLVertexArrayObject} va 
     * @param {WebGLBuffer} vb 
     * @param {FVec3} translation 
     * @param {number} solidEnd
     * @param {number} len 
     */
    constructor(va, vb, solidEnd, translation, len) {
        super();
        this.va = va;
        this.vb = vb;
        this.solidEnd = solidEnd;
        this.mTranslation = translation;
        this.len = len;
    }

    get modelTranslation() {
        return this.mTranslation;
    }

    get len() {
        return this.len;
    }    
}


export class UIntMesher extends ChunkMesher {
    #lastMeshTime = 0;

    /**
      * @param {ChunkDataExt} chunkData
      * @return {{data: Uint32Array, solidEnd: number}}
      */
    mesh(chunkData) {
        throw new Error("Not implemented");
    }

    /**
     * @param {IVec3} position 
     * @param {ChunkDataExt} chunkData
     * 
     * @returns {UIntMeshData}
     */
    createMesh(position, chunkData) {
        const meshStart = performance.now();
        const meshData = this.mesh(chunkData);
        this.#lastMeshTime = perfDiff(meshStart);
        return new UIntMeshData(vec3(position.x * CHUNK_SIZE + 0.5, position.z * CHUNK_SIZE + 0.5, -position.y * CHUNK_SIZE - 0.5),
            meshData.data, meshData.solidEnd);
    }

    lastMeshTime() {
        return this.#lastMeshTime;
    }
}

export class UIntMeshDrawer {
    #gl;
    #uTranslation;
    /**
     * @param {WebGL2RenderingContext} gl
     * @param {WebGLUniformLocation} uTranslation
     */
    constructor(gl, uTranslation) {
        this.#gl = gl;
        this.#uTranslation = uTranslation;
    }
    
    /**
     * @param {UIntMesh} mesh 
     */
    draw(mesh) {
        const gl = this.#gl;
        gl.bindVertexArray(mesh.va);        
        const modelTranslation = mesh.modelTranslation;
        gl.uniform3f(this.#uTranslation, modelTranslation.x, modelTranslation.y, modelTranslation.z);        
        gl.drawArrays(gl.TRIANGLES, 0, mesh.solidEnd);
    }

    /**
     * @param {UIntMesh} mesh 
     */
    drawNonSolids(mesh) {
        const gl = this.#gl;
        gl.bindVertexArray(mesh.va);        
        const modelTranslation = mesh.modelTranslation;
        gl.uniform3f(this.#uTranslation, modelTranslation.x, modelTranslation.y, modelTranslation.z);
        gl.drawArrays(gl.TRIANGLES, mesh.solidEnd, mesh.len - mesh.solidEnd);
    }
}

