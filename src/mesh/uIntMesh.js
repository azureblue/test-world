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
    * @param {number} liquidEnd
    * @param {number} xQuadEnd
    */
    constructor(mTranslation, data, solidEnd, liquidEnd, xQuadEnd) {
        super();
        this.mTranslation = mTranslation;        
        this.data = data;
        this.solidEnd = solidEnd;
        this.liquidEnd = liquidEnd;
        this.xQuadEnd = xQuadEnd;
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
            liquidEnd: uintMeshData.liquidEnd,
            xQuadEnd: uintMeshData.xQuadEnd,
            mTranslation: uintMeshData.mTranslation,
            data: uintMeshData.data.buffer
        };
        return new TransferObject(transferData, [uintMeshData.data.buffer]);
    }

    createFrom(data) {
        return new UIntMeshData(vec3(data.mTranslation.x, data.mTranslation.y, data.mTranslation.z), new Uint32Array(data.data), data.solidEnd, data.liquidEnd, data.xQuadEnd);
    }
}


export class UIntMeshHandler extends MeshHandler {
     /** @type {WebGL2RenderingContext} */
    #gl;
    /** @type {number} */
    #aIn;
    /** @type {number} */
    #aInXQuads;
    /** @type {number} */
    #aInWater;

    /**
     * @param {WebGL2RenderingContext} gl 
     * @param {number} aIn 
     * @param {number} aInXQuads
     * @param {number} aInWater
     */
    constructor(gl, aIn, aInXQuads, aInWater) {
        super();
        this.#gl = gl;
        this.#aIn = aIn;
        this.#aInXQuads = aInXQuads;
        this.#aInWater = aInWater;
    }

    /**
     * @param {UIntMeshData} meshData 
     * @return {UIntMesh}
     */
    upload(meshData) {
        const solidLen = meshData.solidEnd >> 1;
        const liquidLen = (meshData.liquidEnd - meshData.solidEnd) >> 1;
        const xQuadLen = (meshData.xQuadEnd - meshData.liquidEnd);
        const gl = this.#gl;
        const va = gl.createVertexArray();
        const vb = gl.createBuffer();
        gl.bindVertexArray(va);
        gl.enableVertexAttribArray(this.#aIn);
        gl.bindBuffer(gl.ARRAY_BUFFER, vb);
        gl.bufferData(gl.ARRAY_BUFFER, meshData.data, gl.STATIC_DRAW, 0, meshData.solidEnd);
        gl.vertexAttribIPointer(this.#aIn, 2, gl.UNSIGNED_INT, false, 0, 0);
        gl.bindVertexArray(null);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);

        const vaWater = gl.createVertexArray();
        const vbWater = gl.createBuffer();
        gl.bindVertexArray(vaWater);
        gl.enableVertexAttribArray(this.#aInWater);
        gl.bindBuffer(gl.ARRAY_BUFFER, vbWater);
        gl.bufferData(gl.ARRAY_BUFFER, meshData.data, gl.STATIC_DRAW, meshData.solidEnd, meshData.liquidEnd - meshData.solidEnd);
        gl.vertexAttribIPointer(this.#aInWater, 2, gl.UNSIGNED_INT, false, 0, 0);
        gl.bindVertexArray(null);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);


        const vaXQuads = gl.createVertexArray();
        const vbXQuads = gl.createBuffer();
        gl.bindVertexArray(vaXQuads);
        gl.enableVertexAttribArray(this.#aInXQuads);
        gl.bindBuffer(gl.ARRAY_BUFFER, vbXQuads);
        gl.bufferData(gl.ARRAY_BUFFER, meshData.data, gl.STATIC_DRAW, meshData.liquidEnd);
        gl.vertexAttribIPointer(this.#aInXQuads, 1, gl.UNSIGNED_INT, false, 0, 0);
        gl.bindVertexArray(null);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
        
        return new UIntMesh(va, vb, vaWater, vbWater, vaXQuads, vbXQuads, meshData.mTranslation, solidLen, liquidLen, xQuadLen);
    }

    /**
     * @param {UIntMesh} mesh 
     */
    dispose(mesh) {
        const gl = this.#gl;
        gl.deleteBuffer(mesh.vb);
        gl.deleteVertexArray(mesh.va);
        gl.deleteBuffer(mesh.vbXQuads);
        gl.deleteVertexArray(mesh.vaXQuads);
    }

    static unbind(gl) {
        gl.bindVertexArray(null);
    }
}

export class UIntMesh extends ChunkMesh {
    /** @type {WebGLVertexArrayObject} */
    va;
    /** @type {WebGLVertexArrayObject} */
    vaWater;
    /** @type {WebGLBuffer} */
    vaXQuads;
        /** @type {WebGLVertexArrayObject} */
    vb;
    /** @type {WebGLBuffer} */
    vbWater;
    /** @type {WebGLBuffer} */
    vbXQuads;
    mTranslation;

    /**
     * @param {WebGLVertexArrayObject} va 
     * @param {WebGLBuffer} vb 
     * @param {WebGLVertexArrayObject} vaWater
     * @param {WebGLBuffer} vbWater
     * @param {WebGLVertexArrayObject} vaXQuads
     * @param {WebGLBuffer} vbXQuads
     * @param {FVec3} translation 
     * @param {number} solidLen
     * @param {number} liquidLen
     * @param {number} xQuadLen
     */
    constructor(va, vb, vaWater, vbWater, vaXQuads, vbXQuads, translation, solidLen, liquidLen, xQuadLen) {
        super();
        this.va = va;
        this.vb = vb;
        this.vaWater = vaWater;
        this.vbWater = vbWater;
        this.vaXQuads = vaXQuads;
        this.vbXQuads = vbXQuads;
        this.mTranslation = translation;
        this.solidLen = solidLen;
        this.liquidLen = liquidLen;
        this.xQuadLen = xQuadLen;
    }

    get modelTranslation() {
        return this.mTranslation;
    }
}


export class UIntMesher extends ChunkMesher {
    #lastMeshTime = 0;

    /**
      * @param {ChunkDataExt} chunkData
      * @return {{data: Uint32Array, solidEnd: number, liquidEnd: number, xQuadEnd: number}}
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
        return new UIntMeshData(vec3(position.x * CHUNK_SIZE, position.z * CHUNK_SIZE, -position.y * CHUNK_SIZE),
            meshData.data, meshData.solidEnd, meshData.liquidEnd, meshData.xQuadEnd);
    }

    lastMeshTime() {
        return this.#lastMeshTime;
    }
}

export class UIntMeshDrawer {
    #gl;
    #uTranslation;
    #uXQuadsTranslation;
    #uWaterTranslation;
    /**
     * @param {WebGL2RenderingContext} gl
     * @param {WebGLUniformLocation} uTranslation
     * @param {WebGLUniformLocation} uXQuadsTranslation
     * @param {WebGLUniformLocation} uWaterTranslation
     */
    constructor(gl, uTranslation, uXQuadsTranslation, uWaterTranslation) {
        this.#gl = gl;
        this.#uTranslation = uTranslation;
        this.#uXQuadsTranslation = uXQuadsTranslation;
        this.#uWaterTranslation = uWaterTranslation;
    }
    
    /**
     * @param {UIntMesh} mesh 
     */
    draw(mesh) {
        const gl = this.#gl;
        gl.bindVertexArray(mesh.va);        
        const modelTranslation = mesh.modelTranslation;
        gl.uniform3f(this.#uTranslation, modelTranslation.x, modelTranslation.y, modelTranslation.z);        
        gl.drawArrays(gl.TRIANGLES, 0, mesh.solidLen);
    }

    /**
     * @param {UIntMesh} mesh 
     */
    drawNonSolids(mesh) {
        const gl = this.#gl;
        gl.bindVertexArray(mesh.vaWater);        
        const modelTranslation = mesh.modelTranslation;
        gl.uniform3f(this.#uWaterTranslation, modelTranslation.x, modelTranslation.y, modelTranslation.z);
        gl.drawArrays(gl.TRIANGLES, 0, mesh.liquidLen);
    }

    /**
     * @param {UIntMesh} mesh 
     */
    drawXQuads(mesh) {
        const gl = this.#gl;
        gl.bindVertexArray(mesh.vaXQuads);        
        const modelTranslation = mesh.modelTranslation;
        gl.uniform3f(this.#uXQuadsTranslation, modelTranslation.x, modelTranslation.y, modelTranslation.z);
        gl.drawArrays(gl.TRIANGLES, 0, mesh.xQuadLen);
    }
}

