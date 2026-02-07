import { Chunk, CHUNK_SIZE, CHUNK_SIZE_BIT_LEN, CHUNK_SIZE_MASK, ChunkData } from "./chunk.js";
import { FVec2, FVec3, fvec3, IVec3, ivec3, Vec3, vec3 } from "./geom.js";
import { UIntMesh } from "./mesher.js";
import { GenericBuffer, Logger, Resources } from "./utils.js";
const logger = new Logger("World");
const CHUNK_RENDER_DIST = 6;
const CHUNK_RENDER_DIST_SQ = CHUNK_RENDER_DIST * CHUNK_RENDER_DIST;
const CHUNK_RETAIN_DIST_SQ = CHUNK_RENDER_DIST_SQ * 4;


export class BlockLocation {
    constructor() {
        this.chunkPos = vec3();
        this.blockInChunkPos = vec3();
    }

    realX() {
        return this.chunkPos.x * CHUNK_SIZE + this.blockInChunkPos.x;
    }

    realY() {
        return this.chunkPos.y * CHUNK_SIZE + this.blockInChunkPos.z;
    }

    realZ() {
        return this.chunkPos.z * CHUNK_SIZE + this.blockInChunkPos.y;
    }
}

class ChunkEntry {
    /**@type {Vec3} */
    position;
    /**@type {Chunk} */
    chunk;
    loaded = false;
    shouldRemove = false;

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

const tmpBlockLocation = new BlockLocation();

export class World {
    #frame = 0;
    #chunkLoaders;
    #loaderIndex = 0;
    #tmpBuffer = new GenericBuffer(1000);
    #pos = fvec3();
    #chunkPos = ivec3(0xFFFFFFFF, 0xFFFFFFFF, 0xFFFFFFFF);
    #chunkPosChanged = false;

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
     * @param {Worker} chunkLoader 
     */
    constructor() {
        this.#chunkLoaders = [];
        for (let i = 0; i < 1; i++) {
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
                } else {
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

    onChunk(data) {
        const chunkPos = data.chunkPos;
        const key = pos3ToKey(chunkPos.x, chunkPos.y, chunkPos.z);
        if (this.#currentChunkPromise != null && this.#currentChunkPromise.key == key)
            this.processChunkData(data);
        else
            this.#chunkDataQueue.set(key, data);
    }

    /**
     * 
     * @param {FVec2} pos 
     */
    inRange(pos) {
        const dx = (pos.x - this.#chunkPos.x) | 0;
        const dy = (pos.y - this.#chunkPos.y) | 0;
        return (dx * dx + dy * dy) <= CHUNK_RENDER_DIST_SQ;
    }

    /**
     * @import {ChunkMessage} from "./chunkLoader.js"
     * @param {ChunkMessage} data 
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
            // logger.warn("got chunk data, but already loaded" + key);
        }
        const now = performance.now();
        const chunkData = new ChunkData();
        chunkData.data.set(data.rawChunkData);
        let mesh = null
        if (data.rawMeshData.length > 0) {
            mesh = UIntMesh.load(data.rawMeshData, data.meshTranslation);
        }

        const chunk = new Chunk(chunkPos, chunkData, mesh);
        entry.chunk = chunk;
        entry.loaded = true;
        // logger.debug(`uploading mesh time: ${perfDiff(now)}`);
        if (this.#currentChunkPromise !== null) {
            if (this.#currentChunkPromise.key === key) {
                this.#currentChunkPromise.resolve(chunk);
                this.#currentChunkPromise = null;
            }
        }
        return true;
    }

    moveTo(x, y, z) {
        this.#pos.x = x;
        this.#pos.y = y;
        this.#pos.z = z;
        const cx = Math.floor(x) >> CHUNK_SIZE_BIT_LEN;
        const cy = (-Math.ceil(y)) >> CHUNK_SIZE_BIT_LEN;
        const cz = Math.floor(z) >> CHUNK_SIZE_BIT_LEN;
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
                chunkEntry.chunk?.mesh?.dispose();
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
            const block = this.blockAtWorldIPos(ivec3(x, y, z));
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
     */
    switchBlockPos(pos) {
        return new ivec3(pos.x, pos.y, -pos.z - 1);
    }

    /**
     * @param {IVec3} worldIPos 
     */
    blockAtWorldIPos(worldIPos) {
        const pos = this.switchBlockPos(worldIPos);
        const cx = pos.x >> CHUNK_SIZE_BIT_LEN;
        const cy = pos.z >> CHUNK_SIZE_BIT_LEN;
        const cz = pos.y >> CHUNK_SIZE_BIT_LEN;
        const bx = pos.x & 0x1F;
        const by = pos.z & 0x1F;
        const bh = pos.y & 0x1F;

        const entry = this.#chunks.get(pos3ToKey(cx, cy, cz));
        if (entry === undefined || !entry.loaded)
            return 0;

        return entry.chunk.data.getHXY(bh, bx, by);
    }

    /**
     * @param {BlockLocation} blockLocation 
     * @param {FVec3} pos 
     */
    blockLocation(blockLocation, pos) {
        const cx = Math.floor(pos.x) >> CHUNK_SIZE_BIT_LEN;
        const cy = (-Math.ceil(pos.z)) >> CHUNK_SIZE_BIT_LEN;
        const cz = Math.floor(pos.y) >> CHUNK_SIZE_BIT_LEN;
        const bx = Math.floor(pos.x) & CHUNK_SIZE_MASK;
        const by = (pos.z <= 0 ? (Math.floor(-pos.z) % CHUNK_SIZE) : CHUNK_SIZE - 1 - (Math.floor(pos.z) % CHUNK_SIZE)) | 0
        const bh = Math.floor(pos.y) & CHUNK_SIZE_MASK;
        blockLocation.chunkPos.x = cx;
        blockLocation.chunkPos.y = cy;
        blockLocation.chunkPos.z = cz;
        blockLocation.blockInChunkPos.x = bx;
        blockLocation.blockInChunkPos.y = by;
        blockLocation.blockInChunkPos.z = bh;
    }

    /**
 * @param {FVec3} pos 
 */
    blockAtPos(pos) {
        if (pos.y < 0)
            return 0;
        return this.blockAtWorldIPos(new IVec3(Math.floor(pos.x), Math.floor(pos.y), Math.floor(pos.z)));
        // this.blockLocation(tmpBlockLocation, pos);
        // const chunkPos = tmpBlockLocation.chunkPos;
        // const blockPos = tmpBlockLocation.blockInChunkPos;
        // const chunk = this.#chunks.get(posToKey(chunkPos.x, chunkPos.y)).chunk;
        // return chunk.data.get(blockPos.y, blockPos.x, blockPos.z);
    }
}

