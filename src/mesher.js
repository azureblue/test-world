import { BLOCK_IDS, getBlockById, isSolid, isSolidInt } from "./blocks.js";
import { ChunkDataExtended, ChunkDataLoader } from "./chunk.js";
import { CHUNK_SIZE_BIT_LEN, CHUNK_SIZE_MASK } from "./consts.js";
import { CHUNK_SIZE } from "./consts.js";
import { Direction, DirXY, FVec3, IVec3, vec3 } from "./geom.js";
import { Array2D, Array3D, i32a, Resources, UInt32Buffer } from "./utils.js";


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

export class UIntChunkMesher0 extends ChunkMesher {

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

    vOffsets = [vec3(0, 0, 1), vec3(0, 0, 0), vec3(0, 1, 0), vec3(1, 1, 0), vec3(1, 0, 0), vec3(0, 1, 0), vec3(0, 0, 0), vec3(0, 1, 0)];
    wMV = [vec3(1, 0, 0), vec3(1, 0, 0), vec3(0, -1, 0), vec3(-1, 0, 0), vec3(0, 1, 0), vec3(1, 0, 0), vec3(1, 1, 0), vec3(1, -1, 0)];
    hMV = [vec3(0, 1, 0), vec3(0, 0, 1), vec3(0, 0, 1), vec3(0, 0, 1), vec3(0, 0, 1), vec3(0, -1, 0), vec3(0, 0, 1), vec3(0, 0, 1)];
    winding = [i32a(0, 1, 2, 0, 2, 3), i32a(3, 2, 0, 2, 1, 0), i32a(1, 2, 3, 1, 3, 0), i32a(0, 3, 1, 3, 2, 1)];

    wMergeMasks = i32a(0, 1, 1, 0);
    hMergeMasks = i32a(0, 0, 1, 1);
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
        const mergeBitsHeight = height << 7;
        const flip = (corner0Shadow + corner2Shadow > corner1Shadow + corner3Shadow) ? 1 : 0;
        const reversed = reverseWinding ? 1 : 0;
        const cornerShadows = [corner0Shadow, corner1Shadow, corner2Shadow, corner3Shadow];
        let lower = 0;
        if (textureId == BLOCK_WATER && direction == Direction.UP)
            lower = 2;
        else if (textureId == getBlockById(BLOCK_IDS.GRASS_SHORT).textureIds[1]) {
            lower = 1;
        }

        let bits = 0
            | (lower << 29)
            | ((textureId & 0b0_1111_1111) << 19)
            | ((dirBits & 0b111) << 16);

        const vns = this.winding[flip * 2 + reversed];

        for (let i = 0; i < 6; i++) {
            const vn = vns[i];
            const xb = x + this.vOffsets[direction].x + this.wMV[direction].x * width * this.wMergeMasks[vn] + this.hMV[direction].x * height * this.hMergeMasks[vn];
            const yb = y + this.vOffsets[direction].y + this.wMV[direction].y * width * this.wMergeMasks[vn] + this.hMV[direction].y * height * this.hMergeMasks[vn];
            const zb = h + this.vOffsets[direction].z + this.wMV[direction].z * width * this.wMergeMasks[vn] + this.hMV[direction].z * height * this.hMergeMasks[vn];
            const posBits = zb << 14 | yb << 7 | xb;
            this.#tmpArr[i * 2] = posBits;
            this.#tmpArr[i * 2 + 1] = bits | (mergeBitsWidth * this.wMergeMasks[vn]) | (mergeBitsHeight * this.hMergeMasks[vn]) | (cornerShadows[vn] << 27);
        }

        if (textureId == BLOCK_WATER)
            this.#bufferWater.add(this.#tmpArr);
        else
            this.#bufferSolid.add(this.#tmpArr);
    }

    /**
     * @param {IVec3} chunkPos
     * @param {ChunkDataLoader} chunkLoader
     * @returns {UIntMeshData}
     */
    createMeshes(chunkPos, chunkLoader) {
        const adj = new UIntChunkMesher0.Adj27(chunkLoader, chunkPos.x, chunkPos.y, chunkPos.z);
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

        for (let h = 0; h < CHUNK_SIZE; h++) {
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
                        this.#grasslike.put(blockId << 15 | h << 10 | y << 5 | x);
                        continue;
                    }

                    const block = getBlockById(blockId);
                    const blockTextures = block.textureIds;
                    const isWater = blockId == BLOCK_WATER;
                    const above = adj.get(1, 0, 0);
                    if (!isSolid(above)) {
                        if (isWater && above == BLOCK_WATER)
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
                        layersCurrent.setHXY(Direction.FRONT, x, y, (blockTextures[1] << 8) | shadows);
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
                        layersCurrent.setHXY(Direction.LEFT, CHUNK_SIZE - 1 - y, x, (blockTextures[2] << 8) | (shadows));
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
                        layersCurrent.setHXY(Direction.BACK, CHUNK_SIZE - 1 - x, CHUNK_SIZE - 1 - y, (blockTextures[3] << 8) | shadows);
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
                        layersCurrent.setHXY(Direction.RIGHT, y, CHUNK_SIZE - 1 - x, (blockTextures[4] << 8) | (shadows));
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
                        layersCurrentData[i] |= (1 << 25) | ((j - i) << 17);
                        i = j - 1;
                    }
                }

                for (let i = 0; i < layerLen; i++) {
                    const top = layersTopData[layerStartIdx + i];
                    if (top === 0)
                        continue;
                    const topH = top >> 25;
                    let cur = layersCurrentData[layerStartIdx + i];
                    if ((top & 0x01FFFFFF) == (cur & 0x01FFFFFF) && topH < CHUNK_SIZE) {
                        layersCurrentData[layerStartIdx + i] = (cur & 0x01FFFFFF) | ((topH + 1) << 25);
                    } else {
                        let x = i & CHUNK_SIZE_MASK;
                        let y = i >> CHUNK_SIZE_BIT_LEN;

                        this.#addFace(top & 0x1FFFF, h - topH,
                            dirXXAdd + dirXXMul * x + dirXYMul * y,
                            dirYYAdd + dirYXMul * x + dirYYMul * y,
                            dir, (top >> 17) & 0xFF, topH);
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
                        currentRow[i] |= (j - i) << 17 | 1 << 25;
                        i = j - 1;
                    }
                    for (let i = 0; i < CHUNK_SIZE; i++) {
                        const top = topRow[i];
                        if (top === 0)
                            continue;
                        const topH = top >> 25;
                        let cur = currentRow[i];
                        if ((top & 0x01_FF_FF_FF) == (cur & 0x01_FF_FF_FF)) {
                            currentRow[i] = cur & 0x01_FF_FF_FF | (topH + 1) << 25;
                        } else {
                            const topW = top >> 17 & 0xFF;
                            const yy = (y - topH) * (0b1 - (upDown << 1)) + (CHUNK_SIZE - 1) * (upDown);
                            this.#addFace(top & 0x1FFFF, h, i, yy, Direction.UP + upDown * 5, topW, topH);
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
                    const topH = top >> 25;
                    const topW = top >> 17 & 0xFF;
                    const y = (CHUNK_SIZE - topH) * (0b1 - (upDown << 1)) + (CHUNK_SIZE - 1) * (upDown);
                    this.#addFace(top & 0x1FFFF, h, i, y, Direction.UP + upDown * 5, topW, topH);
                }
            }
        }

        const layerLen = CHUNK_SIZE * CHUNK_SIZE;
        const layersTop = this.#sideLayers[CHUNK_SIZE & 1];
        const layersTopData = layersTop.data;

        for (let dir = 0; dir < 5; dir++) {
            const layerStartIdx = layersTop.planeIdx(dir);
            const dirEncodeBaseIdx = dir * 8;
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
                const topH = top >> 25;
                let x = i & CHUNK_SIZE_MASK;
                let y = i >> CHUNK_SIZE_BIT_LEN;
                this.#addFace(top & 0x1FFFF, CHUNK_SIZE - topH,
                    dirXXAdd + dirXXMul * x + dirXYMul * y,
                    dirYYAdd + dirYXMul * x + dirYYMul * y,
                    dir, (top >> 17) & 0xFF, topH);
            }
        }

        for (let g of this.#grasslike) {
            //blockId << 16 | h << 8 | y << 4 | x
            const x = g & 0x1F;
            const y = (g >> 5) & 0x1F;
            const h = (g >> 10) & 0x1F;
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
        return new UIntMeshData(vec3(chunkPos.x * CHUNK_SIZE + 0.5, chunkPos.z * CHUNK_SIZE + 0.5, -chunkPos.y * CHUNK_SIZE - 0.5),
            resultData);
    }

    static Adj27 = class {
        #loader;
        #cx; #cy; #cz;

        /** @type {(ChunkData|null)[]} */
        #ch = new Array(27).fill(null);

        #h; #x; #y;
        #currentGet

        constructor(loader, cx, cy, cz) {
            this.#loader = loader;
            this.#cx = cx;
            this.#cy = cy;
            this.#cz = cz;
            this.#ch[13] = loader.getChunkSync(cx, cy, cz);
            this.#currentGet = this.#ch[13].getHXY.bind(this.#ch[13]);
        }

        setPosition(h, x, y) {
            this.#h = h;
            this.#x = x;
            this.#y = y;
        }

        #idx(ox, oy, oz) {
            return (oz + 1) * 9 + (oy + 1) * 3 + (ox + 1);
        }

        #getChunk(ox, oy, oz) {
            const idx = this.#idx(ox, oy, oz);
            let c = this.#ch[idx];
            if (c !== null) return c;
            c = this.#loader.getChunkSync(this.#cx + ox, this.#cy + oy, this.#cz + oz);
            this.#ch[idx] = c;
            return c;
        }

        get(dh, dx, dy) {
            let h = (this.#h + dh) | 0;
            let x = (this.#x + dx) | 0;
            let y = (this.#y + dy) | 0;

            if (((h | x | y) & -32) === 0) {
                return this.#currentGet(h, x, y);
            }

            const sh = (h >> 5) & 1;
            const sx = (x >> 5) & 1;
            const sy = (y >> 5) & 1;

            const oz = sh * (1 - ((h & 1) << 1));
            const ox = sx * (1 - ((x & 1) << 1));
            const oy = sy * (1 - ((y & 1) << 1));

            return this.#getChunk(ox, oy, oz).getHXY(h & 31, x & 31, y & 31);
        }

        getChunkData() {
            return this.#ch[13];
        }
    }
}


export class UIntChunkMesher1 extends ChunkMesher {


    /**
     * @type {UInt32Buffer}
     */
    #bufferSolid = new UInt32Buffer(1024);
    #bufferWater = new UInt32Buffer(1024);
    #tmpArr = new Uint32Array(12);
    #upDownLayers = [new Array2D(CHUNK_SIZE), new Array2D(CHUNK_SIZE)];
    #sideLayers = [new Array3D(CHUNK_SIZE, 6), new Array3D(CHUNK_SIZE, 6)];
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

    vOffsets = [vec3(0, 0, 1), vec3(0, 0, 0), vec3(0, 1, 0), vec3(1, 1, 0), vec3(1, 0, 0), vec3(0, 1, 0), vec3(0, 0, 0), vec3(0, 1, 0)];
    wMV = [vec3(1, 0, 0), vec3(1, 0, 0), vec3(0, -1, 0), vec3(-1, 0, 0), vec3(0, 1, 0), vec3(1, 0, 0), vec3(1, 1, 0), vec3(1, -1, 0)];
    hMV = [vec3(0, 1, 0), vec3(0, 0, 1), vec3(0, 0, 1), vec3(0, 0, 1), vec3(0, 0, 1), vec3(0, -1, 0), vec3(0, 0, 1), vec3(0, 0, 1)];
    winding = [i32a(0, 1, 2, 0, 2, 3), i32a(3, 2, 0, 2, 1, 0), i32a(1, 2, 3, 1, 3, 0), i32a(0, 3, 1, 3, 2, 1)];

    wMergeMasks = i32a(0, 1, 1, 0);
    hMergeMasks = i32a(0, 0, 1, 1);
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
        const mergeBitsHeight = height << 7;
        const flip = (corner0Shadow + corner2Shadow > corner1Shadow + corner3Shadow) ? 1 : 0;
        const reversed = reverseWinding ? 1 : 0;
        const cornerShadows = [corner0Shadow, corner1Shadow, corner2Shadow, corner3Shadow];
        let lower = 0;
        if (textureId == BLOCK_WATER && direction == Direction.UP)
            lower = 2;
        else if (textureId == getBlockById(BLOCK_IDS.GRASS_SHORT).textureIds[1]) {
            lower = 1;
        }

        let bits = 0
            | (lower << 29)
            | ((textureId & 0b0_1111_1111) << 19)
            | ((dirBits & 0b111) << 16);

        const vns = this.winding[flip * 2 + reversed];

        for (let i = 0; i < 6; i++) {
            const vn = vns[i];
            const xb = x + this.vOffsets[direction].x + this.wMV[direction].x * width * this.wMergeMasks[vn] + this.hMV[direction].x * height * this.hMergeMasks[vn];
            const yb = y + this.vOffsets[direction].y + this.wMV[direction].y * width * this.wMergeMasks[vn] + this.hMV[direction].y * height * this.hMergeMasks[vn];
            const zb = h + this.vOffsets[direction].z + this.wMV[direction].z * width * this.wMergeMasks[vn] + this.hMV[direction].z * height * this.hMergeMasks[vn];
            const posBits = zb << 14 | yb << 7 | xb;
            this.#tmpArr[i * 2] = posBits;
            this.#tmpArr[i * 2 + 1] = bits | (mergeBitsWidth * this.wMergeMasks[vn]) | (mergeBitsHeight * this.hMergeMasks[vn]) | (cornerShadows[vn] << 27);
        }

        if (textureId == BLOCK_WATER)
            this.#bufferWater.add(this.#tmpArr);
        else
            this.#bufferSolid.add(this.#tmpArr);
    }

    /**
     * @param {IVec3} position 
     * @param {ChunkDataExtended} chunkData
     * 
     * @returns {UIntMeshData}
     */
    createMeshes(position, chunkData) {
        this.#bufferSolid.reset();
        this.#bufferWater.reset();
        const sideDir0 = new DirXY();
        const sideDir1 = new DirXY();
        const cornerDir = new DirXY();
        const layers = this.#sideLayers;
        layers[0].fill(0);
        this.#grasslike.reset();

        const upLayer = this.#upDownLayers[0];
        const downLayer = this.#upDownLayers[1];
        let topRow = this.#topRow;
        let currentRow = this.#currentRow;

        for (let h = 1; h < CHUNK_SIZE + 1; h++) {
            const realH = h - 1;
            upLayer.fill(0);
            downLayer.fill(0);
            const topLayer = realH & 1;
            const currentLayer = 1 - topLayer;
            const layersTop = layers[topLayer];
            const layersCurrent = layers[currentLayer];
            layersCurrent.fill(0);

            for (let y = 1; y < CHUNK_SIZE + 1; y++)
                for (let x = 1; x < CHUNK_SIZE + 1; x++) {
                    const realX = x - 1;
                    const realY = y - 1;
                    const blockId = chunkData.getHXY(h, x, y);
                    if (blockId == BLOCK_EMPTY)
                        continue;

                    if (blockId == 8) {
                        this.#grasslike.put(blockId << 15 | h << 10 | y << 5 | x);
                        continue;
                    }


                    const block = getBlockById(blockId);
                    const blockTextures = block.textureIds;
                    const isWater = blockId == BLOCK_WATER;
                    const above = chunkData.getHXY(h + 1, x, y)
                    if (!isSolid(above)) {
                        if (isWater && above == BLOCK_WATER)
                            continue;
                        let shadows = 0;
                        if (!isWater) {
                            for (let v = 0; v < 4; v++) {
                                let s0 = isSolidInt(chunkData.getHXY(h + 1, x + sideDir0.x, y + sideDir0.y));
                                let s1 = isSolidInt(chunkData.getHXY(h + 1, x + sideDir1.x, y + sideDir1.y));
                                let c = isSolidInt(chunkData.getHXY(h + 1, x + cornerDir.x, y + cornerDir.y));
                                shadows |= ((s0 + s1 == 2) ? 3 : (s0 + s1 + c)) << (v * 2);
                                sideDir0.rotateCCW();
                                sideDir1.rotateCCW();
                                cornerDir.rotateCCW();
                            }
                        }
                        upLayer.set(realX, realY, (blockTextures[0] << 8) | (shadows));
                    }

                    if (isWater)
                        continue;

                    if (!isSolid(chunkData.getHXY(h - 1, x, y))) {
                        sideDir0.set(-1, 0);
                        sideDir1.set(0, -1);
                        cornerDir.set(-1, -1);
                        let shadows = 0;
                        for (let v = 0; v < 4; v++) {
                            let s0 = isSolidInt(chunkData.getHXY(h - 1, x + sideDir0.x, y - sideDir0.y));
                            let s1 = isSolidInt(chunkData.getHXY(h - 1, x + sideDir1.x, y - sideDir1.y));
                            let c = isSolidInt(chunkData.getHXY(h - 1, x + cornerDir.x, y - cornerDir.y));
                            shadows |= ((s0 + s1 == 2) ? 3 : (s0 + s1 + c)) << (v * 2);
                            sideDir0.rotateCCW();
                            sideDir1.rotateCCW();
                            cornerDir.rotateCCW();
                        }

                        downLayer.set(realX, CHUNK_SIZE - realY - 1, (blockTextures[5] << 8) | (shadows));
                    }

                    if (!isSolid(chunkData.getHXY(h, x, y - 1))) {
                        sideDir0.set(-1, 0);
                        sideDir1.set(0, -1);
                        cornerDir.set(-1, -1);
                        let shadows = 0;
                        for (let v = 0; v < 4; v++) {
                            let s0 = isSolidInt(chunkData.getHXY(h + sideDir0.y, x + sideDir0.x, y - 1));
                            let s1 = isSolidInt(chunkData.getHXY(h + sideDir1.y, x + sideDir1.x, y - 1));
                            let c = isSolidInt(chunkData.getHXY(h + cornerDir.y, x + cornerDir.x, y - 1));
                            shadows |= ((s0 + s1 == 2) ? 3 : (s0 + s1 + c)) << (v * 2);
                            sideDir0.rotateCCW();
                            sideDir1.rotateCCW();
                            cornerDir.rotateCCW();
                        }
                        layersCurrent.setHXY(Direction.FRONT, realX, realY, (blockTextures[1] << 8) | shadows);
                    }

                    if (!isSolid(chunkData.getHXY(h, x - 1, y))) {
                        sideDir0.set(-1, 0);
                        sideDir1.set(0, -1);
                        cornerDir.set(-1, -1);
                        let shadows = 0;
                        for (let v = 0; v < 4; v++) {
                            let s0 = isSolidInt(chunkData.getHXY(h + sideDir0.y, x - 1, y - sideDir0.x));
                            let s1 = isSolidInt(chunkData.getHXY(h + sideDir1.y, x - 1, y - sideDir1.x));
                            let c = isSolidInt(chunkData.getHXY(h + cornerDir.y, x - 1, y - cornerDir.x));
                            shadows |= ((s0 + s1 == 2) ? 3 : (s0 + s1 + c)) << (v * 2);
                            sideDir0.rotateCCW();
                            sideDir1.rotateCCW();
                            cornerDir.rotateCCW();
                        }
                        layersCurrent.setHXY(Direction.LEFT, CHUNK_SIZE - 1 - realY, realX, (blockTextures[2] << 8) | (shadows));
                    }

                    if (!isSolid(chunkData.getHXY(h, x, y + 1))) {
                        sideDir0.set(-1, 0);
                        sideDir1.set(0, -1);
                        cornerDir.set(-1, -1);
                        let shadows = 0;
                        for (let v = 0; v < 4; v++) {
                            let s0 = isSolidInt(chunkData.getHXY(h + sideDir0.y, x - sideDir0.x, y + 1));
                            let s1 = isSolidInt(chunkData.getHXY(h + sideDir1.y, x - sideDir1.x, y + 1));
                            let c = isSolidInt(chunkData.getHXY(h + cornerDir.y, x - cornerDir.x, y + 1));
                            shadows |= ((s0 + s1 == 2) ? 3 : (s0 + s1 + c)) << (v * 2);
                            sideDir0.rotateCCW();
                            sideDir1.rotateCCW();
                            cornerDir.rotateCCW();
                        }
                        layersCurrent.setHXY(Direction.BACK, CHUNK_SIZE - 1 - realX, CHUNK_SIZE - 1 - realY, (blockTextures[3] << 8) | shadows);
                    }

                    if (!isSolid(chunkData.getHXY(h, x + 1, y))) {
                        sideDir0.set(-1, 0);
                        sideDir1.set(0, -1);
                        cornerDir.set(-1, -1);
                        let shadows = 0;
                        for (let v = 0; v < 4; v++) {
                            let s0 = isSolidInt(chunkData.getHXY(h + sideDir0.y, x + 1, y + sideDir0.x));
                            let s1 = isSolidInt(chunkData.getHXY(h + sideDir1.y, x + 1, y + sideDir1.x));
                            let c = isSolidInt(chunkData.getHXY(h + cornerDir.y, x + 1, y + cornerDir.x));
                            shadows |= ((s0 + s1 == 2) ? 3 : (s0 + s1 + c)) << (v * 2);
                            sideDir0.rotateCCW();
                            sideDir1.rotateCCW();
                            cornerDir.rotateCCW();
                        }
                        layersCurrent.setHXY(Direction.RIGHT, realY, CHUNK_SIZE - 1 - realX, (blockTextures[4] << 8) | (shadows));
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
                            if (layersCurrentData[i] !== layersCurrentData[j])
                                break;
                            layersCurrentData[j] = 0;
                        }
                        if (layersCurrentData[i] === 0)
                            continue;
                        layersCurrentData[i] |= (1 << 25) | ((j - i) << 17);
                        i = j - 1;
                    }
                }

                for (let i = 0; i < layerLen; i++) {
                    const top = layersTopData[layerStartIdx + i];
                    if (top === 0)
                        continue;
                    const topH = top >> 25;
                    let cur = layersCurrentData[layerStartIdx + i];
                    if ((top & 0x01FFFFFF) == (cur & 0x01FFFFFF) && topH < CHUNK_SIZE) {
                        layersCurrentData[layerStartIdx + i] = (cur & 0x01FFFFFF) | ((topH + 1) << 25);
                    } else {
                        let x = i & CHUNK_SIZE_MASK;
                        let y = i >> CHUNK_SIZE_BIT_LEN;

                        this.#addFace(top & 0x1FFFF, realH - topH,
                            dirXXAdd + dirXXMul * x + dirXYMul * y,
                            dirYYAdd + dirYXMul * x + dirYYMul * y,
                            dir, (top >> 17) & 0xFF, topH);
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
                        currentRow[i] |= (j - i) << 17 | 1 << 25;
                        i = j - 1;
                    }
                    for (let i = 0; i < CHUNK_SIZE; i++) {
                        const top = topRow[i];
                        if (top === 0)
                            continue;
                        const topH = top >> 25;
                        let cur = currentRow[i];
                        if ((top & 0x01_FF_FF_FF) == (cur & 0x01_FF_FF_FF)) {
                            currentRow[i] = cur & 0x01_FF_FF_FF | (topH + 1) << 25;
                        } else {
                            const topW = top >> 17 & 0xFF;
                            const yy = (y - topH) * (0b1 - (upDown << 1)) + (CHUNK_SIZE - 1) * (upDown);
                            this.#addFace(top & 0x1FFFF, realH, i, yy, Direction.UP + upDown * 5, topW, topH);
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
                    const topH = top >> 25;
                    const topW = top >> 17 & 0xFF;
                    const y = (CHUNK_SIZE - topH) * (0b1 - (upDown << 1)) + (CHUNK_SIZE - 1) * (upDown);
                    this.#addFace(top & 0x1FFFF, realH, i, y, Direction.UP + upDown * 5, topW, topH);
                }
            }
        }

        const layerLen = CHUNK_SIZE * CHUNK_SIZE;
        const layersTop = this.#sideLayers[CHUNK_SIZE & 1];
        const layersTopData = layersTop.data;

        for (let dir = 0; dir < 5; dir++) {
            const layerStartIdx = layersTop.planeIdx(dir);
            const dirEncodeBaseIdx = dir * 8;
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
                const topH = top >> 25;
                let x = i & CHUNK_SIZE_MASK;
                let y = i >> CHUNK_SIZE_BIT_LEN;
                this.#addFace(top & 0x1FFFF, CHUNK_SIZE - topH,
                    dirXXAdd + dirXXMul * x + dirXYMul * y,
                    dirYYAdd + dirYXMul * x + dirYYMul * y,
                    dir, (top >> 17) & 0xFF, topH);
            }
        }

        for (let g of this.#grasslike) {
            //blockId << 16 | h << 8 | y << 4 | x
            const x = g & 0x1F;
            const y = (g >> 5) & 0x1F;
            const h = (g >> 10) & 0x1F;
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
        return new UIntMeshData(vec3(position.x * CHUNK_SIZE + 0.5, position.z * CHUNK_SIZE + 0.5, -position.y * CHUNK_SIZE - 0.5),
            resultData);
    }
}

export class UIntChunkMesherQ extends ChunkMesher {

    /**
     * @type {UInt32Buffer}
     */
    #bufferSolid = new UInt32Buffer(1024);
    #bufferWater = new UInt32Buffer(1024);
    #tmpArr = new Uint32Array(12);
    #grasslike = new UInt32Buffer(1024);

    vOffsets = [vec3(0, 0, 1), vec3(0, 0, 0), vec3(0, 1, 0), vec3(1, 1, 0), vec3(1, 0, 0), vec3(0, 1, 0), vec3(0, 0, 0), vec3(0, 1, 0)];
    wMV = [vec3(1, 0, 0), vec3(1, 0, 0), vec3(0, -1, 0), vec3(-1, 0, 0), vec3(0, 1, 0), vec3(1, 0, 0), vec3(1, 1, 0), vec3(1, -1, 0)];
    hMV = [vec3(0, 1, 0), vec3(0, 0, 1), vec3(0, 0, 1), vec3(0, 0, 1), vec3(0, 0, 1), vec3(0, -1, 0), vec3(0, 0, 1), vec3(0, 0, 1)];
    winding = [i32a(0, 1, 2, 0, 2, 3), i32a(3, 2, 0, 2, 1, 0), i32a(1, 2, 3, 1, 3, 0), i32a(0, 3, 1, 3, 2, 1)];

    wMergeMasks = i32a(0, 1, 1, 0);
    hMergeMasks = i32a(0, 0, 1, 1);

    #addFace(direction, h, x, y, data, reverseWinding = false) {
        const width = 1;
        const height = 1;
        const dirBits = direction;
        const textureId = data >> 8;
        const shadows = data & 0b11111111;
        const corner0Shadow = shadows & 0b11;
        const corner1Shadow = (shadows >> 2) & 0b11;
        const corner2Shadow = (shadows >> 4) & 0b11;
        const corner3Shadow = (shadows >> 6) & 0b11;
        const mergeBitsWidth = width;
        const mergeBitsHeight = height << 7;
        const flip = (corner0Shadow + corner2Shadow > corner1Shadow + corner3Shadow) ? 1 : 0;
        const reversed = reverseWinding ? 1 : 0;
        const cornerShadows = [corner0Shadow, corner1Shadow, corner2Shadow, corner3Shadow];
        let lower = 0;
        if (textureId == BLOCK_WATER && direction == Direction.UP)
            lower = 2;
        else if (textureId == getBlockById(BLOCK_IDS.GRASS_SHORT).textureIds[1]) {
            lower = 1;
        }

        let bits = 0
            | (lower << 29)
            | ((textureId & 0b0_1111_1111) << 19)
            | ((dirBits & 0b111) << 16);

        const vns = this.winding[flip * 2 + reversed];

        for (let i = 0; i < 6; i++) {
            const vn = vns[i];
            const xb = x + this.vOffsets[direction].x + this.wMV[direction].x * width * this.wMergeMasks[vn] + this.hMV[direction].x * height * this.hMergeMasks[vn];
            const yb = y + this.vOffsets[direction].y + this.wMV[direction].y * width * this.wMergeMasks[vn] + this.hMV[direction].y * height * this.hMergeMasks[vn];
            const zb = h + this.vOffsets[direction].z + this.wMV[direction].z * width * this.wMergeMasks[vn] + this.hMV[direction].z * height * this.hMergeMasks[vn];
            const posBits = zb << 14 | yb << 7 | xb;
            this.#tmpArr[i * 2] = posBits;
            this.#tmpArr[i * 2 + 1] = bits | (mergeBitsWidth * this.wMergeMasks[vn]) | (mergeBitsHeight * this.hMergeMasks[vn]) | (cornerShadows[vn] << 27);
        }

        if (textureId == BLOCK_WATER)
            this.#bufferWater.add(this.#tmpArr);
        else
            this.#bufferSolid.add(this.#tmpArr);
    }

    /**
     * @param {IVec3} position 
     * @param {ChunkDataExtended} chunkData
     * 
     * @returns {UIntMeshData}
     */
    createMeshes(position, chunkData) {
        this.#bufferSolid.reset();
        this.#bufferWater.reset();
        this.#grasslike.reset();

        const sideDir0 = new DirXY();
        const sideDir1 = new DirXY();
        const cornerDir = new DirXY();

        for (let h = 1; h < CHUNK_SIZE + 1; h++)
            for (let y = 1; y < CHUNK_SIZE + 1; y++)
                for (let x = 1; x < CHUNK_SIZE + 1; x++) {
                    const realX = x - 1;
                    const realY = y - 1;
                    const realH = h - 1;
                    const blockId = chunkData.getHXY(h, x, y);
                    if (blockId == BLOCK_EMPTY)
                        continue;

                    if (blockId == 8) {
                        this.#grasslike.put(blockId << 15 | h << 10 | y << 5 | x);
                        continue;
                    }

                    const block = getBlockById(blockId);
                    const blockTextures = block.textureIds;
                    const isWater = blockId == BLOCK_WATER;
                    const above = chunkData.getHXY(h + 1, x, y)
                    if (!isSolid(above)) {
                        if (isWater && above == BLOCK_WATER)
                            continue;
                        sideDir0.set(-1, 0);
                        sideDir1.set(0, -1);
                        cornerDir.set(-1, -1);
                        let shadows = 0;
                        if (!isWater) {
                            for (let v = 0; v < 4; v++) {
                                let s0 = isSolidInt(chunkData.getHXY(h + 1, x + sideDir0.x, y + sideDir0.y));
                                let s1 = isSolidInt(chunkData.getHXY(h + 1, x + sideDir1.x, y + sideDir1.y));
                                let c = isSolidInt(chunkData.getHXY(h + 1, x + cornerDir.x, y + cornerDir.y));
                                shadows |= ((s0 + s1 == 2) ? 3 : (s0 + s1 + c)) << (v * 2);
                                sideDir0.rotateCCW();
                                sideDir1.rotateCCW();
                                cornerDir.rotateCCW();
                            }
                        }
                        this.#addFace(Direction.UP, realH, realX, realY, (blockTextures[0] << 8) | (shadows));
                    }

                    if (isWater)
                        continue;

                    if (!isSolid(chunkData.getHXY(h - 1, x, y))) {
                        sideDir0.set(-1, 0);
                        sideDir1.set(0, -1);
                        cornerDir.set(-1, -1);
                        let shadows = 0;
                        for (let v = 0; v < 4; v++) {
                            let s0 = isSolidInt(chunkData.getHXY(h - 1, x + sideDir0.x, y - sideDir0.y));
                            let s1 = isSolidInt(chunkData.getHXY(h - 1, x + sideDir1.x, y - sideDir1.y));
                            let c = isSolidInt(chunkData.getHXY(h - 1, x + cornerDir.x, y - cornerDir.y));
                            shadows |= ((s0 + s1 == 2) ? 3 : (s0 + s1 + c)) << (v * 2);
                            sideDir0.rotateCCW();
                            sideDir1.rotateCCW();
                            cornerDir.rotateCCW();
                        }

                        this.#addFace(Direction.DOWN, realH, realX, realY, (blockTextures[5] << 8) | (shadows));
                    }

                    if (!isSolid(chunkData.getHXY(h, x, y - 1))) {
                        sideDir0.set(-1, 0);
                        sideDir1.set(0, -1);
                        cornerDir.set(-1, -1);
                        let shadows = 0;
                        for (let v = 0; v < 4; v++) {
                            let s0 = isSolidInt(chunkData.getHXY(h + sideDir0.y, x + sideDir0.x, y - 1));
                            let s1 = isSolidInt(chunkData.getHXY(h + sideDir1.y, x + sideDir1.x, y - 1));
                            let c = isSolidInt(chunkData.getHXY(h + cornerDir.y, x + cornerDir.x, y - 1));
                            shadows |= ((s0 + s1 == 2) ? 3 : (s0 + s1 + c)) << (v * 2);
                            sideDir0.rotateCCW();
                            sideDir1.rotateCCW();
                            cornerDir.rotateCCW();
                        }
                        this.#addFace(Direction.FRONT, realH, realX, realY, (blockTextures[1] << 8) | (shadows));
                    }

                    if (!isSolid(chunkData.getHXY(h, x - 1, y))) {
                        sideDir0.set(-1, 0);
                        sideDir1.set(0, -1);
                        cornerDir.set(-1, -1);
                        let shadows = 0;
                        for (let v = 0; v < 4; v++) {
                            let s0 = isSolidInt(chunkData.getHXY(h + sideDir0.y, x - 1, y - sideDir0.x));
                            let s1 = isSolidInt(chunkData.getHXY(h + sideDir1.y, x - 1, y - sideDir1.x));
                            let c = isSolidInt(chunkData.getHXY(h + cornerDir.y, x - 1, y - cornerDir.x));
                            shadows |= ((s0 + s1 == 2) ? 3 : (s0 + s1 + c)) << (v * 2);
                            sideDir0.rotateCCW();
                            sideDir1.rotateCCW();
                            cornerDir.rotateCCW();
                        }
                        this.#addFace(Direction.LEFT, realH, realX, realY, (blockTextures[2] << 8) | (shadows));
                    }

                    if (!isSolid(chunkData.getHXY(h, x, y + 1))) {
                        sideDir0.set(-1, 0);
                        sideDir1.set(0, -1);
                        cornerDir.set(-1, -1);
                        let shadows = 0;
                        for (let v = 0; v < 4; v++) {
                            let s0 = isSolidInt(chunkData.getHXY(h + sideDir0.y, x - sideDir0.x, y + 1));
                            let s1 = isSolidInt(chunkData.getHXY(h + sideDir1.y, x - sideDir1.x, y + 1));
                            let c = isSolidInt(chunkData.getHXY(h + cornerDir.y, x - cornerDir.x, y + 1));
                            shadows |= ((s0 + s1 == 2) ? 3 : (s0 + s1 + c)) << (v * 2);
                            sideDir0.rotateCCW();
                            sideDir1.rotateCCW();
                            cornerDir.rotateCCW();
                        }
                        this.#addFace(Direction.BACK, realH, realX, realY, (blockTextures[3] << 8) | (shadows));
                    }

                    if (!isSolid(chunkData.getHXY(h, x + 1, y))) {
                        sideDir0.set(-1, 0);
                        sideDir1.set(0, -1);
                        cornerDir.set(-1, -1);
                        let shadows = 0;
                        for (let v = 0; v < 4; v++) {
                            let s0 = isSolidInt(chunkData.getHXY(h + sideDir0.y, x + 1, y + sideDir0.x));
                            let s1 = isSolidInt(chunkData.getHXY(h + sideDir1.y, x + 1, y + sideDir1.x));
                            let c = isSolidInt(chunkData.getHXY(h + cornerDir.y, x + 1, y + cornerDir.x));
                            shadows |= ((s0 + s1 == 2) ? 3 : (s0 + s1 + c)) << (v * 2);
                            sideDir0.rotateCCW();
                            sideDir1.rotateCCW();
                            cornerDir.rotateCCW();
                        }
                        this.#addFace(Direction.RIGHT, realH, realX, realY, (blockTextures[4] << 8) | (shadows));
                    }
                }


        for (let g of this.#grasslike) {
            //blockId << 16 | h << 8 | y << 4 | x
            const x = g & 0x1F;
            const y = (g >> 5) & 0x1F;
            const h = (g >> 10) & 0x1F;
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
        return new UIntMeshData(vec3(position.x * CHUNK_SIZE + 0.5, position.z * CHUNK_SIZE + 0.5, -position.y * CHUNK_SIZE - 0.5),
            resultData);

    }

}

export class UIntWasmMesher extends ChunkMesher {


    /**
     * @param {IVec3} position 
     * @param {ChunkDataExtended} chunkData
     * 
     * @returns {UIntMeshData}
     */
    createMeshes(position, chunkData) {
        const input = new Uint32Array(UIntWasmMesher.mem.buffer, UIntWasmMesher._heap_base, chunkData.data.length);
        input.set(chunkData.data);
        const len = UIntWasmMesher.wasmCreateMesh(
            UIntWasmMesher._heap_base,
            UIntWasmMesher._heap_base + chunkData.data.length * 4,
            UIntWasmMesher._heap_base + chunkData.data.length * 4 + UIntWasmMesher.#outputSize
        )
        const output = new Uint32Array(UIntWasmMesher.mem.buffer, UIntWasmMesher._heap_base + chunkData.data.length * 4, chunkData.data.length);
        const trimmedOutput = new Uint32Array(len)
        trimmedOutput.set(output.subarray(0, len));
        return new UIntMeshData(vec3(position.x * CHUNK_SIZE + 0.5, position.z * CHUNK_SIZE + 0.5, -position.y * CHUNK_SIZE - 0.5),
            trimmedOutput);

    }

    static #outputSize;

    static async init() {

        const PAGE = 64 * 1024;
        const bytesToPages = (b) => (b + PAGE - 1) >>> 16; // ceil(b/65536)

        const MAX_FACES = 32 * 32 * 32 * 3;

        const CHUNK_SIZE_EXTENDED = 32 + 2;
        const INPUT_SIZE = CHUNK_SIZE_EXTENDED ** 3 * 2 * 4;
        const OUTPUT_SIZE = MAX_FACES * 6 * 4 * 2;

        // Twoje bufory:
        const buffersBytes = INPUT_SIZE + OUTPUT_SIZE * 2;

        // sensowny zapas na stack (np. 1 MiB) + trochę luzu
        const STACK_BYTES = 1 * 1024 * 1024;
        const SLACK_BYTES = 256 * 1024;

        const totalBytes = buffersBytes + STACK_BYTES + SLACK_BYTES;
        const initialPages = bytesToPages(totalBytes);


        const mem = new WebAssembly.Memory({
            initial: initialPages,
            maximum: initialPages, // albo daj większe i pozwól grow()
        });

        UIntWasmMesher.#outputSize = OUTPUT_SIZE;

        const wasmResult = await WebAssembly.instantiateStreaming(
            fetch(Resources.relativeToRoot("./mesher.wasm")),
            {
                env: {
                    memory: mem
                }
            }
        );
        const instance = wasmResult.instance;
        UIntWasmMesher._heap_base = instance.exports.__heap_base;
        UIntWasmMesher.wasmCreateMesh = instance.exports.create_mesh;
        UIntWasmMesher.mem = mem;

    }
}

export { UIntWasmMesher as DefaultMesher };
