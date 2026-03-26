import { Chunk, CHUNK_SIZE, CHUNK_SIZE_BIT_LEN, CHUNK_SIZE_MASK, ChunkDataFactory } from "./chunk/chunk.js";
import { ChunkDataExtTransfer, ChunkExtDataFactory } from "./chunk/extChunk.js";
import { FVec2, FVec3, fvec3, IVec3, ivec3, Vec3, vec3 } from "./geom.js";
import { createFastMesher } from "./global.js";
import { Logger } from "./logging.js";
import { MeshHandler } from "./mesh/mesh.js";
import { UIntMeshDataTransfer } from "./mesh/uIntMesh.js";
import { UIntWasmMesher } from "./mesh/uIntWasmMesher.js";
import { GenericBuffer, perfDiff, Resources } from "./utils.js";

/**
 * @typedef {import("./chunkLoader.js").ChunkResponseData} ChunkResponseData
 */

await UIntWasmMesher.init();
const logger = new Logger("World");


const CHUNK_RENDER_DIST = 6;
const CHUNK_RENDER_DIST_SQ = CHUNK_RENDER_DIST * CHUNK_RENDER_DIST;
const CHUNK_RETAIN_DIST_SQ = CHUNK_RENDER_DIST_SQ * 4;

class ChunkEntry {
    /**@type {Vec3} */
    position;
    /**@type {Chunk} */
    chunk;
    loaded = false;
    shouldRemove = false;
    dirty = false;

    /** @param {Vec3} position */
    constructor(position) {
        this.position = position;
    }
}


// const BIAS = 65536;          // 2^16
// const BASE = 131072;         // 2^17
// const BASE2 = BASE * BASE;   // 2^34
// /**
//  * @param {number} x [-65536, 65535]
//  * @param {number} y [-65536, 65535]
//  * @param {number} z [-65536, 65535]
//  */

function pos3ToKey(x, y, z = 0) {
    return x + ":" + y + ":" + z;
}

// function pos2ToKey(x, y) {
//     return x + "," + y;
// }


// function keyToZ(key) {
//     return ((key / BASE2) | 0) - BIAS;
// }

// function keyToY(key) {
//     return (((key % BASE2) / BASE) | 0) - BIAS;
// }

// function keyToX(key) {
//     return (key % BASE) - BIAS;
// }


class ChunkLoadPromise {

    constructor(key) {
        this.key = key;
        this.resolve = null;
        this.promise = new Promise((res, rej) => {
            this.resolve = (chunk) => {
                res(chunk);
            }
        });
    }
}

export class World {
    #frame = 0;
    #chunkLoaders;
    #loaderIndex = 0;
    #tmpBuffer = new GenericBuffer(1000);
    #pos = fvec3();
    #chunkPos = ivec3(0xFFFFFFFF, 0xFFFFFFFF, 0xFFFFFFFF);
    #chunkPosChanged = false;
    #meshHandler;
    

    #chunkDataTransfer = new ChunkDataExtTransfer();
    #meshDataTransfer = new UIntMeshDataTransfer();
    
    #quickMesher = createFastMesher();

    /**@type {Array<Vec3>} */
    #rangeDeltas;

    /** @type {Map<string, ChunkEntry>} */
    #chunks = new Map();

    /** @type {Map<string, object} */
    #chunkDataQueue = new Map();

    /**@type {GenericBuffer<IVec3>} */
    #initialChunkRequestQueue = new GenericBuffer(1000);

    /**@type {ChunkLoadPromise} */
    #currentChunkPromise = null;

    #chunkKeysSorted = new GenericBuffer(10000);
    #workerReady = false;

    /** 
     * @returns {number}
     */
    get chunksInView() {
        return this.#rangeDeltas.length;
    }

    get frame() {
        return this.#frame;
    }

    /**
     * @param {MeshHandler} meshHandler
     */
    constructor(meshHandler) {
        this.#meshHandler = meshHandler;
        this.#chunkLoaders = [];
        for (let i = 0; i < 4; i++) {
            const id = i;
            const worker = new Worker(Resources.relativeToRoot(`./chunkLoader.js?workerId=${id}`), { type: "module" });
            worker.ready = false;
            worker.initialChunkRequestQueue = []
            worker.onmessage = (me) => {
                if (me.data.type === "ready") {
                    worker.ready = true;
                    console.log("chunk loader worker ready: " + me.data.data.workerId);
                    for (let cpos of worker.initialChunkRequestQueue) {
                        this.#sendChunkRequestToWorker(id, cpos);
                    }
                    worker.initialChunkRequestQueue = [];
                } else if (me.data.type === "chunkResponse") {
                    this.onChunk(me.data.data);
                }
            }
            this.#chunkLoaders.push(worker);
        }

        /** @type {GenericBuffer<Vec3>} */
        const tmpBuff = new GenericBuffer(512);
        for (let dx = -CHUNK_RENDER_DIST; dx <= CHUNK_RENDER_DIST; dx++)
            for (let dy = -CHUNK_RENDER_DIST; dy <= CHUNK_RENDER_DIST; dy++)
                for (let dz = -CHUNK_RENDER_DIST; dz <= CHUNK_RENDER_DIST; dz++) {
                    if ((dx * dx + dy * dy + dz * dz) <= CHUNK_RENDER_DIST_SQ) {
                        tmpBuff.put(vec3(dx, dy, dz));
                    }
                }

        this.#rangeDeltas = tmpBuff.trimmed();

        this.#rangeDeltas.sort((a, b) => (a.x * a.x + a.y * a.y + a.z * a.z) - (b.x * b.x + b.y * b.y + b.z * b.z));
    }

    #sendChunkRequestToWorker(workerId, chunkPos) {
        this.#chunkLoaders[workerId].postMessage({
            type: "chunkRequest",
            data: { chunkPos: chunkPos }
        });
    }

    #requestChunk(cx, cy, cz) {
        const workerId = this.#loaderIndex;
        if (!this.#chunkLoaders[workerId].ready) {
            this.#chunkLoaders[workerId].initialChunkRequestQueue.push(vec3(cx, cy, cz));
        } else {
            this.#sendChunkRequestToWorker(workerId, vec3(cx, cy, cz));
        }
        this.#loaderIndex = (this.#loaderIndex + 1) % this.#chunkLoaders.length;
    }

    /**
     * @param {ChunkResponseData} data 
     */
    onChunk(data) {        
        const chunkPos = data.chunkPos;
        const key = pos3ToKey(chunkPos.x, chunkPos.y, chunkPos.z);
        if (this.#currentChunkPromise != null && this.#currentChunkPromise.key == key)
            this.processChunkData(data);
        else
            this.#chunkDataQueue.set(key, data);
    }

    /**
     * @param {FVec2} pos 
     */
    inRange(pos) {
        const dx = (pos.x - this.#chunkPos.x) | 0;
        const dy = (pos.y - this.#chunkPos.y) | 0;
        return (dx * dx + dy * dy) <= CHUNK_RENDER_DIST_SQ;
    }

    /**
     * @param {ChunkResponseData} data 
     */
    processChunkData(data) {        
        const chunkPos = data.chunkPos;
        // logger.info(`processing chunk data (${chunkPos.x}, ${chunkPos.y}, ${chunkPos.z})`);
        const key = pos3ToKey(chunkPos.x, chunkPos.y, chunkPos.z);
        if (!this.#chunks.has(key)) {
            // logger.debug("missing entry for key: " + key);
            return false;
        }
        const entry = this.#chunks.get(key);
        if (entry.loaded) {
            if (!entry.dirty) {
                logger.warn(() => "got chunk data, but not dirty" + key);
            }
            // logger.warn("got chunk data, but already loaded" + key);
        }

        const now = performance.now();
        const meshData = this.#meshDataTransfer.createFrom(data.tMeshData);
        const chunkData = this.#chunkDataTransfer.createFrom(data.tChunkData);
        
        let mesh = null
        if (!meshData.isEmpty()) {
            mesh = this.#meshHandler.upload(meshData);
        }

        const chunk = new Chunk(chunkPos, chunkData, mesh);
        entry.chunk = chunk;
        entry.loaded = true;
        logger.debug(() => `uploading mesh time: ${perfDiff(now)}`);
        if (this.#currentChunkPromise !== null) {
            if (this.#currentChunkPromise.key === key) {
                this.#currentChunkPromise.resolve(chunk);
                this.#currentChunkPromise = null;
            }
        }
        return true;
    }

    /**
     * World coordinates, not chunk coordinates
     */
    moveToWorldPos(x, y, z) {
        this.#pos.x = x;
        this.#pos.y = y;
        this.#pos.z = z;
        const cx = Math.floor(x) >> CHUNK_SIZE_BIT_LEN;
        const cy = Math.floor(-z - 1) >> CHUNK_SIZE_BIT_LEN;
        const cz = Math.floor(y) >> CHUNK_SIZE_BIT_LEN;
        this.#chunkPosChanged = (this.#chunkPos.x !== cx || this.#chunkPos.y !== cy || this.#chunkPos.z !== cz);

        this.#chunkPos.x = cx;
        this.#chunkPos.y = cy;
        this.#chunkPos.z = cz;

    }

    #updateChunksInRange() {
        // if (this.#frame == 1) {
        this.#tmpBuffer.reset();
        for (const key of this.#chunks.keys()) {
            this.#tmpBuffer.put(key);
        }
        // } else if (this.#frame == 2) {
        // const now = performance.now();
        for (let i = 0; i < this.#tmpBuffer.length; i++) {
            const key = this.#tmpBuffer.get(i);
            const chunkEntry = this.#chunks.get(key);
            const x = chunkEntry.position.x;
            const y = chunkEntry.position.y;
            const z = chunkEntry.position.z;
            const dx = x - this.#chunkPos.x;
            const dy = y - this.#chunkPos.y;
            const dz = z - this.#chunkPos.z;
            if (dx * dx + dy * dy + dz * dz > CHUNK_RETAIN_DIST_SQ) {
                // logger.info("removing chunk: " + x + " " + y + " " + z);
                const mesh = chunkEntry.chunk?.mesh;
                if (mesh) {
                    this.#meshHandler.dispose(mesh);
                }
                this.#chunks.delete(key);
            }
        }
        // logger.debug(`checking chunks time: ${perfDiff(now)}`);
        // } else if (this.#frame == 0) {
        this.#chunkKeysSorted.reset();
        // const now = performance.now();
        for (const delta of this.#rangeDeltas) {
            const cx = this.#chunkPos.x + delta.x;
            const cy = this.#chunkPos.y + delta.y;
            const cz = this.#chunkPos.z + delta.z;
            const key = pos3ToKey(cx, cy, cz);
            this.#chunkKeysSorted.put(key);
            if (!this.#chunks.has(key)) {
                const entry = new ChunkEntry(vec3(cx, cy, cz));
                // logger.info(`requesting chunk  (${cx}, ${cy}, ${cz})`);
                this.#chunks.set(key, entry);
                this.#requestChunk(cx, cy, cz);
            }
        }
        // logger.debug(`requesting new chunks time: ${perfDiff(now)}`);
        // } 
    }

    /**@returns {Chunk} */
    async getCurrentChunk() {
        const key = pos3ToKey(this.#chunkPos.x, this.#chunkPos.y, this.#chunkPos.z);
        const entry = this.#chunks.get(key);
        if (entry === undefined) {
            // logger.error("missing entry for current chunk");
            return null;
        }

        if (entry.loaded) {
            return entry.chunk;
        } else {
            this.#currentChunkPromise = new ChunkLoadPromise(key);
            return await this.#currentChunkPromise.promise;
        }
    }

    update() {
        if (this.#chunkPosChanged) {
            this.#updateChunksInRange();
            this.#chunkPosChanged = false;
            return;
        }

        if (this.#chunkDataQueue.size > 0) {
            const entriesIter = this.#chunkDataQueue.entries();
            for (let i = 0; i < 10; i++) {
                const next = entriesIter.next();
                if (next.done)
                    break;
                const entry = next.value;
                this.#chunkDataQueue.delete(entry[0]);
                this.processChunkData(entry[1])

                // console.log("next");
            }
        }
        this.#frame++;
        if (this.#frame == 10) {
            this.#frame = 0;
        }
    }

    /**
     * @param {(chunk: Chunk) => void} chunkProcessor
     */
    forEachChunkInRange(chunkProcessor) {
        const arr = this.#chunkKeysSorted.array
        const len = this.#chunkKeysSorted.length;
        for (let i = len - 1; i >= 0; i--) {
            const key = arr[i];
            const value = this.#chunks.get(key);
            if (value !== undefined && value.loaded) {
                chunkProcessor(value.chunk, this.#frame);
            }
        }
    }


    /**
     * Performs voxel-accurate DDA raycast without integer casting.
     * @param {FVec3} pos 
     * @param {FVec3} dir 
     * @param {number} maxDist - Maximum ray distance
     * @returns {{x, y, z, value, distance} | null}
     */
    raycasti(pos, dir, maxDist = 5) {
        let x = Math.floor(pos.x);
        let y = Math.floor(pos.y);
        let z = Math.floor(pos.z);

        // Direction of step in each axis (+1 or -1)
        const stepX = Math.sign(dir.x);
        const stepY = Math.sign(dir.y);
        const stepZ = Math.sign(dir.z);

        // How far along the ray we must move in order to cross a voxel boundary on each axis
        const tDeltaX = dir.x !== 0 ? Math.abs(1 / dir.x) : Infinity;
        const tDeltaY = dir.y !== 0 ? Math.abs(1 / dir.y) : Infinity;
        const tDeltaZ = dir.z !== 0 ? Math.abs(1 / dir.z) : Infinity;

        // Calculate initial tMax values: distance to the first voxel boundary
        const tMaxX = dir.x !== 0
            ? ((stepX > 0 ? (x + 1 - pos.x) : (pos.x - x)) * tDeltaX)
            : Infinity;
        const tMaxY = dir.y !== 0
            ? ((stepY > 0 ? (y + 1 - pos.y) : (pos.y - y)) * tDeltaY)
            : Infinity;
        const tMaxZ = dir.z !== 0
            ? ((stepZ > 0 ? (z + 1 - pos.z) : (pos.z - z)) * tDeltaZ)
            : Infinity;

        let tMax = { x: tMaxX, y: tMaxY, z: tMaxZ };
        let t = 0;

        while (t <= maxDist) {
            const block = this.blockWorldAt(x, y, z);
            if (block !== 0) {
                return { hit: true, x, y, z, block };
            }

            // Step to the next voxel
            if (tMax.x < tMax.y && tMax.x < tMax.z) {
                x += stepX;
                t = tMax.x;
                tMax.x += tDeltaX;
            } else if (tMax.y < tMax.z) {
                y += stepY;
                t = tMax.y;
                tMax.y += tDeltaY;
            } else {
                z += stepZ;
                t = tMax.z;
                tMax.z += tDeltaZ;
            }
        }

        return null;
    }

    /**
     * @param {IVec3} pos 
     * @returns {IVec3}
     */
    switchBlockPos(pos) {
        return new ivec3(pos.x, pos.y, -pos.z - 1);
    }

    /**
     * 
     * @param {IVec3} pos logical position
     * @returns 
     */
    removeBlock(pos) {
        return;
        performance.mark("removeBlockStart");
        const start = performance.now();

        const cx = pos.x >> CHUNK_SIZE_BIT_LEN;
        const cy = pos.z >> CHUNK_SIZE_BIT_LEN;
        const cz = pos.y >> CHUNK_SIZE_BIT_LEN;
        const bx = pos.x & 0x1F;
        const by = pos.z & 0x1F;
        const bh = pos.y & 0x1F;
        const entry = this.#chunks.get(pos3ToKey(cx, cy, cz));
        if (entry === undefined || !entry.loaded)
            return;

        entry.chunk.data.setHXY(bh, bx, by, 0);

        const chunkDataExtended = ChunkDataExtended.load(
            (cx, cy, cz) => {
                const key = pos3ToKey(cx, cy, cz);
                const entry = this.#chunks.get(key);
                if (entry === undefined || !entry.loaded) {
                    return null;
                }
                return entry.chunk.data;
            }, cx, cy, cz);
        const beforeMesh = performance.now();
        const mesh = this.#quickMesher.createMesh(entry.position, chunkDataExtended);
        entry.chunk.mesh?.dispose();
        const uintMesh = UIntMesh.load(mesh.data, mesh.mTranslation);
        entry.chunk.mesh = uintMesh;
        entry.dirty = true;
        const end = performance.now();
        console.log(`before mesh: ${(beforeMesh - start).toFixed(0)} ms, mesh time: ${(end - beforeMesh).toFixed(0)} ms`);
    }

    blockWorldAt(iwx, iwy, iwz) {        
        return this.blockAt(iwx, -iwz - 1, iwy);
    }
     
    blockAt(ix, iy, iz) {        
        const cx = ix >> CHUNK_SIZE_BIT_LEN;
        const cy = iy >> CHUNK_SIZE_BIT_LEN;
        const cz = iz >> CHUNK_SIZE_BIT_LEN;
        const bx = ix & 0x1F;
        const by = iy & 0x1F;
        const bh = iz & 0x1F;

        const entry = this.#chunks.get(pos3ToKey(cx, cy, cz));
        if (entry === undefined || !entry.loaded)
            return 0;

        return entry.chunk.data.getVoxelXYZ(bx, by, bh);
    }
}

export class Position {
    #x; #y; #z;

    constructor(x = 0, y = 0, z = 0, world = false) {
        if (world) {
            this.setWorld(x, y, z);
        } else {
            this.set(x, y, z);
        }
    }

    set(x, y, z) {
        this.#x = x;
        this.#y = y;
        this.#z = z;
    }

    setWorld(x, y, z) {
        this.set(x, -z - 1, y);
    }

    get cx() {
        return this.#x >> CHUNK_SIZE_BIT_LEN;
    }

    get cz() {
        return this.#z >> CHUNK_SIZE_BIT_LEN;
    }

    get cy() {
        return this.#y >> CHUNK_SIZE_BIT_LEN;
    }

    get bx() {
        return this.#x & CHUNK_SIZE_MASK;
    }

    get bz() {
        return this.#z & CHUNK_SIZE_MASK;
    }

    get by() {
        return this.#y & CHUNK_SIZE_MASK;
    }

    get x() {
        return this.#x;
    }

    get y() {
        return this.#y;
    }

    get z() {
        return this.#z;
    }

    get ix() {
        return Math.floor(this.#x);
    }

    get iy() {
        return Math.floor(this.#y);
    }

    get iz() {
        return Math.floor(this.#z);
    }

    get wx() {
        return this.#x;
    }

    get wy() {
        return this.#z;
    }

    get wz() {
        return -this.#y - 1;
    }

    get iwx() {
        return Math.floor(this.#x);
    }

    get iwy() {
        return Math.floor(this.#z);
    }

    get iwz() {
        return Math.floor(-this.#y - 1);
    }

    static from(x, y, z) {
        return new Position(x, y, z, false);
    }

    static fromWorld(x, y, z) {
        return new Position(x, y, z, true);
    }
}
