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
    * @param {number} cutoutEnd the cutout cube faces (the solid faces' format) are from xQuadEnd to here
    */
    constructor(mTranslation, data, solidEnd, liquidEnd, xQuadEnd, cutoutEnd) {
        super();
        this.mTranslation = mTranslation;        
        this.data = data;
        this.solidEnd = solidEnd;
        this.liquidEnd = liquidEnd;
        this.xQuadEnd = xQuadEnd;
        this.cutoutEnd = cutoutEnd;
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
            cutoutEnd: uintMeshData.cutoutEnd,
            mTranslation: uintMeshData.mTranslation,
            data: uintMeshData.data.buffer
        };
        return new TransferObject(transferData, [uintMeshData.data.buffer]);
    }

    createFrom(data) {
        return new UIntMeshData(vec3(data.mTranslation.x, data.mTranslation.y, data.mTranslation.z), new Uint32Array(data.data), data.solidEnd, data.liquidEnd, data.xQuadEnd, data.cutoutEnd);
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
        const cutoutLen = (meshData.cutoutEnd - meshData.xQuadEnd) >> 1;
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
        gl.bufferData(gl.ARRAY_BUFFER, meshData.data, gl.STATIC_DRAW, meshData.liquidEnd, meshData.xQuadEnd - meshData.liquidEnd);
        gl.vertexAttribIPointer(this.#aInXQuads, 1, gl.UNSIGNED_INT, false, 0, 0);
        gl.bindVertexArray(null);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);

        // cutout cube faces: the solid faces' format, the cube program's attribute (the cutout program is its variant)
        let vaCutout = null, vbCutout = null;
        if (cutoutLen > 0) {
            vaCutout = gl.createVertexArray();
            vbCutout = gl.createBuffer();
            gl.bindVertexArray(vaCutout);
            gl.enableVertexAttribArray(this.#aIn);
            gl.bindBuffer(gl.ARRAY_BUFFER, vbCutout);
            gl.bufferData(gl.ARRAY_BUFFER, meshData.data, gl.STATIC_DRAW, meshData.xQuadEnd, meshData.cutoutEnd - meshData.xQuadEnd);
            gl.vertexAttribIPointer(this.#aIn, 2, gl.UNSIGNED_INT, false, 0, 0);
            gl.bindVertexArray(null);
            gl.bindBuffer(gl.ARRAY_BUFFER, null);
        }

        return new UIntMesh(va, vb, vaWater, vbWater, vaXQuads, vbXQuads, vaCutout, vbCutout, meshData.mTranslation,
            solidLen, liquidLen, xQuadLen, cutoutLen);
    }

    /**
     * @param {UIntMesh} mesh 
     */
    dispose(mesh) {
        const gl = this.#gl;
        gl.deleteBuffer(mesh.vb);
        gl.deleteVertexArray(mesh.va);
        gl.deleteBuffer(mesh.vbWater);
        gl.deleteVertexArray(mesh.vaWater);
        gl.deleteBuffer(mesh.vbXQuads);
        gl.deleteVertexArray(mesh.vaXQuads);
        gl.deleteBuffer(mesh.vbCutout);
        gl.deleteVertexArray(mesh.vaCutout);
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
    /** @type {WebGLVertexArrayObject | null} null: no cutout faces */
    vaCutout;
    /** @type {WebGLBuffer | null} */
    vbCutout;
    mTranslation;

    /**
     * @param {WebGLVertexArrayObject} va 
     * @param {WebGLBuffer} vb 
     * @param {WebGLVertexArrayObject} vaWater
     * @param {WebGLBuffer} vbWater
     * @param {WebGLVertexArrayObject} vaXQuads
     * @param {WebGLBuffer} vbXQuads
     * @param {WebGLVertexArrayObject | null} vaCutout
     * @param {WebGLBuffer | null} vbCutout
     * @param {FVec3} translation 
     * @param {number} solidLen
     * @param {number} liquidLen
     * @param {number} xQuadLen
     * @param {number} cutoutLen
     */
    constructor(va, vb, vaWater, vbWater, vaXQuads, vbXQuads, vaCutout, vbCutout, translation, solidLen, liquidLen, xQuadLen, cutoutLen) {
        super();
        this.va = va;
        this.vb = vb;
        this.vaWater = vaWater;
        this.vbWater = vbWater;
        this.vaXQuads = vaXQuads;
        this.vbXQuads = vbXQuads;
        this.vaCutout = vaCutout;
        this.vbCutout = vbCutout;
        this.mTranslation = translation;
        this.solidLen = solidLen;
        this.liquidLen = liquidLen;
        this.xQuadLen = xQuadLen;
        this.cutoutLen = cutoutLen;
    }

    get modelTranslation() {
        return this.mTranslation;
    }
}


export class UIntMesher extends ChunkMesher {
    #lastMeshTime = 0;

    /**
      * @param {ChunkDataExt} chunkData
      * @return {{data: Uint32Array, solidEnd: number, liquidEnd: number, xQuadEnd: number, cutoutEnd: number}}
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
        return new UIntMeshData(vec3(position.x * CHUNK_SIZE, position.y * CHUNK_SIZE, position.z * CHUNK_SIZE),
            meshData.data, meshData.solidEnd, meshData.liquidEnd, meshData.xQuadEnd, meshData.cutoutEnd);
    }

    lastMeshTime() {
        return this.#lastMeshTime;
    }
}

export class DrawStats {
    solidDraws = 0;
    solidTris = 0;
    waterDraws = 0;
    waterTris = 0;
    xQuadDraws = 0;
    xQuadTris = 0;
    cutoutDraws = 0;
    cutoutTris = 0;
    /** particles drawn (one instanced draw) */
    particles = 0;

    reset() {
        this.solidDraws = 0;
        this.solidTris = 0;
        this.waterDraws = 0;
        this.waterTris = 0;
        this.xQuadDraws = 0;
        this.xQuadTris = 0;
        this.cutoutDraws = 0;
        this.cutoutTris = 0;
        this.particles = 0;
    }
}

export class UIntMeshDrawer {
    #gl;
    #uTranslation;
    #uXQuadsTranslation;
    #uWaterTranslation;
    #uCutoutTranslation;
    stats = new DrawStats();
    /**
     * @param {WebGL2RenderingContext} gl
     * @param {WebGLUniformLocation} uTranslation
     * @param {WebGLUniformLocation} uXQuadsTranslation
     * @param {WebGLUniformLocation} uWaterTranslation
     * @param {WebGLUniformLocation} uCutoutTranslation
     */
    constructor(gl, uTranslation, uXQuadsTranslation, uWaterTranslation, uCutoutTranslation) {
        this.#gl = gl;
        this.#uTranslation = uTranslation;
        this.#uXQuadsTranslation = uXQuadsTranslation;
        this.#uWaterTranslation = uWaterTranslation;
        this.#uCutoutTranslation = uCutoutTranslation;
    }
    
    /**
     * @param {UIntMesh} mesh 
     */
    draw(mesh) {
        if (mesh.solidLen === 0)
            return;
        const gl = this.#gl;
        gl.bindVertexArray(mesh.va);
        const modelTranslation = mesh.modelTranslation;
        gl.uniform3f(this.#uTranslation, modelTranslation.x, modelTranslation.y, modelTranslation.z);
        gl.drawArrays(gl.TRIANGLES, 0, mesh.solidLen);
        this.stats.solidDraws++;
        this.stats.solidTris += mesh.solidLen / 3;
    }

    /**
     * @param {UIntMesh} mesh 
     * @param {WebGLUniformLocation} [uTranslation] the translation uniform of the program in use, when it's not the
     *   water program (the water depth-only pre-pass)
     */
    drawNonSolids(mesh, uTranslation = this.#uWaterTranslation) {
        if (mesh.liquidLen === 0)
            return;
        const gl = this.#gl;
        gl.bindVertexArray(mesh.vaWater);
        const modelTranslation = mesh.modelTranslation;
        gl.uniform3f(uTranslation, modelTranslation.x, modelTranslation.y, modelTranslation.z);
        gl.drawArrays(gl.TRIANGLES, 0, mesh.liquidLen);
        this.stats.waterDraws++;
        this.stats.waterTris += mesh.liquidLen / 3;
    }

    /**
     * The cutout cube faces (leaves with holes), with the cutout program.
     * @param {UIntMesh} mesh
     */
    drawCutout(mesh) {
        if (mesh.cutoutLen === 0)
            return;
        const gl = this.#gl;
        gl.bindVertexArray(mesh.vaCutout);
        const modelTranslation = mesh.modelTranslation;
        gl.uniform3f(this.#uCutoutTranslation, modelTranslation.x, modelTranslation.y, modelTranslation.z);
        gl.drawArrays(gl.TRIANGLES, 0, mesh.cutoutLen);
        this.stats.cutoutDraws++;
        this.stats.cutoutTris += mesh.cutoutLen / 3;
    }

    /**
     * @param {UIntMesh} mesh 
     */
    drawXQuads(mesh) {
        if (mesh.xQuadLen === 0)
            return;
        const gl = this.#gl;
        gl.bindVertexArray(mesh.vaXQuads);
        const modelTranslation = mesh.modelTranslation;
        gl.uniform3f(this.#uXQuadsTranslation, modelTranslation.x, modelTranslation.y, modelTranslation.z);
        gl.drawArrays(gl.TRIANGLES, 0, mesh.xQuadLen);
        this.stats.xQuadDraws++;
        this.stats.xQuadTris += mesh.xQuadLen / 3;
    }
}

