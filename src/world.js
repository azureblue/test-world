import { BLOCK_IDS, isLiquid, isSolid } from "./blocks.js";
import { Chunk, CHUNK_SIZE, CHUNK_SIZE_BIT_LEN, CHUNK_SIZE_MASK } from "./chunk/chunk.js";
import { ChunkDataExt, ChunkDataExtTransfer } from "./chunk/extChunk.js";
import { FVec2, FVec3, fvec3, IVec3, ivec3, Vec3, vec3 } from "./geom.js";
import { Logger } from "./logging.js";
import { MeshHandler } from "./mesh/mesh.js";
import { UIntMeshDataTransfer } from "./mesh/uIntMesh.js";
import { UIntExtWasmMesher } from "./mesh/uIntWasmMesher.js";
import { Settings } from "./settings.js";
import { GenericBuffer, perfDiff, Resources } from "./utils.js";
import { BlockEdit, ChunkCancel, ChunkLoadCenter, ChunkRequest, ChunkResponse, MeshChunkRequest, MeshChunkResponse, MessageTransportData } from "./worker/common.js";
import { WorkerClient } from "./worker/worker.js";

const logger = new Logger("World");

// unoptimized but fast mesher for edits on the main thread; the optimized mesh comes from the mesher worker
const editMesher = await UIntExtWasmMesher.createFastMesher();


const CHUNK_RENDER_DIST = Settings.world.renderDistance;
const CHUNK_RENDER_DIST_SQ = CHUNK_RENDER_DIST * CHUNK_RENDER_DIST;
const CHUNK_RETAIN_DIST_SQ = CHUNK_RENDER_DIST_SQ * Settings.world.retainDistanceFactor ** 2;

class ChunkEntry {
    /**@type {Vec3} */
    position;
    /**@type {Chunk} */
    chunk;
    loaded = false;
    shouldRemove = false;
    dirty = false;
    /** id of the latest request for this chunk, responses to older requests are dropped */
    requestId = 0;
    /** id of the latest remesh request for this chunk, older remesh results are dropped */
    remeshId = 0;

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
    #chunkLoaderWorkerClient;
    /** @type {MessagePort} */
    #chunkLoadPort;
    #tmpBuffer = new GenericBuffer(1000);
    #pos = fvec3();
    #chunkPos = ivec3(0xFFFFFFFF, 0xFFFFFFFF, 0xFFFFFFFF);
    #chunkPosChanged = false;
    #meshHandler;

    #chunkDataTransfer = new ChunkDataExtTransfer();
    #meshDataTransfer = new UIntMeshDataTransfer();

    #editMesher = editMesher;
    #mesherWorkerClient;
    /** @type {MessagePort} */
    #meshPort = null;
    /** remesh requests posted before the mesher worker was connected
     * @type {Array<MessageTransportData>} */
    #initialMeshQueue = [];

    /**@type {Array<Vec3>} */
    #rangeDeltas;

    /** @type {Map<string, ChunkEntry>} */
    #chunks = new Map();

    /** @type {Map<string, object} */
    #chunkDataQueue = new Map();

    /** messages to the chunk loader posted before it was connected, sent in order once it is
     * @type {Array<MessageTransportData>} */
    #initialMessageQueue = [];
    #nextRequestId = 1;

    /**@type {ChunkLoadPromise} */
    #currentChunkPromise = null;

    #chunkKeysSorted = new GenericBuffer(2000);
    #chunkKeysSortedReversed = new GenericBuffer(2000);
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
        this.#chunkLoaderWorkerClient = new WorkerClient(
            new Worker(Resources.relativeToRoot(`./worker/chunkLoader.js?workerId=world0&gen=${Settings.world.generator}&fastMesher=${Settings.world.fastMesher}`), { type: "module" }),
            logger
        );
        this.#chunkLoaderWorkerClient.connect("chunkLoad").then((messagePort) => {
            logger.info(() => "connected to world worker");
            this.#workerReady = true;
            this.#chunkLoadPort = messagePort;
            this.#chunkLoadPort.onmessage = (message) => {
                const chunkResponse = ChunkResponse.from(message.data);
                this.onChunk(chunkResponse);
            }
            for (const message of this.#initialMessageQueue) {
                message.post(this.#chunkLoadPort);
            }
            this.#initialMessageQueue = [];
        }).catch((err) => logger.error(() => `connecting to the chunk loader failed: ${err}`));
        this.#mesherWorkerClient = new WorkerClient(
            new Worker(Resources.relativeToRoot(`./worker/mesherWorker.js?workerId=mesh0`), { type: "module" }),
            logger
        );
        this.#mesherWorkerClient.connect("mesh").then((messagePort) => {
            logger.info(() => "connected to mesher worker");
            this.#meshPort = messagePort;
            this.#meshPort.onmessage = (message) => this.#onRemesh(MeshChunkResponse.from(message.data));
            for (const message of this.#initialMeshQueue) {
                message.post(this.#meshPort);
            }
            this.#initialMeshQueue = [];
        }).catch((err) => logger.error(() => `connecting to the mesher worker failed, edits keep their quick mesh: ${err}`));
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

    /** @param {MessageTransportData} message */
    #postToChunkLoader(message) {
        if (!this.#workerReady) {
            this.#initialMessageQueue.push(message);
        } else {
            message.post(this.#chunkLoadPort);
        }
    }

    /** @param {ChunkEntry} entry */
    #requestChunk(entry) {
        entry.requestId = this.#nextRequestId++;
        this.#postToChunkLoader(ChunkRequest.toMessage(new ChunkRequest(entry.position, entry.requestId)));
    }

    /**
     * @param {ChunkResponse} data 
     */
    onChunk(data) {
        const chunkPos = data.chunkPos;
        const key = pos3ToKey(chunkPos.x, chunkPos.y, chunkPos.z);
        if (this.#currentChunkPromise != null && this.#currentChunkPromise.key == key) {
            this.processChunkData(data);
            return;
        }
        // keep the response to the newest request, also when responses arrive out of order
        const queued = this.#chunkDataQueue.get(key);
        if (queued === undefined || data.requestId > queued.requestId)
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
     * @param {ChunkResponse} data 
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
        if (data.requestId !== entry.requestId) {
            // the chunk left the range and was requested again while the old request was still in the worker queue
            logger.debug(() => `dropping response to outdated request ${data.requestId} for ${key}, current ${entry.requestId}`);
            return false;
        }
        if (entry.loaded && !entry.dirty) {
            logger.warn(() => "got chunk data, but not dirty " + key);
        }

        const now = performance.now();
        const meshData = data.chunkMesh;
        const chunkData = data.chunkData;

        let mesh = null
        if (!meshData.isEmpty()) {
            mesh = this.#meshHandler.upload(meshData);
        }

        const oldMesh = entry.chunk?.mesh;
        if (oldMesh) {
            this.#meshHandler.dispose(oldMesh);
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
        // the loader picks pending requests nearest to this chunk first and drops the ones out of range,
        // by the same rule as below for entries that are not loaded yet
        const center = vec3(this.#chunkPos.x, this.#chunkPos.y, this.#chunkPos.z);
        this.#postToChunkLoader(ChunkLoadCenter.toMessage(new ChunkLoadCenter(center, CHUNK_RENDER_DIST_SQ)));
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
            const distSq = dx * dx + dy * dy + dz * dz;
            if (!chunkEntry.loaded && distSq > CHUNK_RENDER_DIST_SQ) {
                // not loaded yet and out of range: the loader drops the request too (see ChunkLoadCenter),
                // it's requested again when it gets back in range
                this.#chunks.delete(key);
            } else if (distSq > CHUNK_RETAIN_DIST_SQ) {
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
                this.#requestChunk(entry);
            }
        }
        this.#chunkKeysSorted.trimToSize();
        this.#chunkKeysSortedReversed.reset();
        this.#chunkKeysSortedReversed.add(this.#chunkKeysSorted.array);
        this.#chunkKeysSortedReversed.trimToSize();
        this.#chunkKeysSortedReversed.array.reverse();
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
    forEachChunkInRangeFarToNear(chunkProcessor) {
        const arr = this.#chunkKeysSortedReversed.array
        const len = this.#chunkKeysSortedReversed.length;
        for (let i = 0; i < len; i++) {
            const key = arr[i];
            const value = this.#chunks.get(key);
            if (value !== undefined && value.loaded) {
                chunkProcessor(value.chunk, this.#frame);
            }
        }
    }

    /**
     * @param {(chunk: Chunk) => void} chunkProcessor
     */
    forEachChunkInRangeNearToFar(chunkProcessor) {
        const arr = this.#chunkKeysSorted.array
        const len = this.#chunkKeysSorted.length;
        for (let i = 0; i < len; i++) {
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
     * Any non-empty block except water stops the ray (solid blocks, plants as full cubes); the starting cell stops it
     * only if it's solid (standing in a plant's cell doesn't keep targeting the plant).
     * @returns {{hit: boolean, x: number, y: number, z: number, block: number, nx: number, ny: number, nz: number} | null}
     *   the hit block in world coordinates and the normal of the face the ray entered through
     *   (pointing back towards the ray origin; all 0 when the origin itself is inside the block)
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
        // the face the ray entered the current voxel through is opposite to the last step
        let nx = 0, ny = 0, nz = 0;
        let first = true;

        while (t <= maxDist) {
            const block = this.blockWorldAt(x, y, z);
            const stops = first ? isSolid(block) : block !== BLOCK_IDS.EMPTY && !isLiquid(block);
            if (stops) {
                return { hit: true, x, y, z, block, nx, ny, nz };
            }
            first = false;

            // Step to the next voxel
            if (tMax.x < tMax.y && tMax.x < tMax.z) {
                x += stepX;
                t = tMax.x;
                tMax.x += tDeltaX;
                nx = -stepX; ny = 0; nz = 0;
            } else if (tMax.y < tMax.z) {
                y += stepY;
                t = tMax.y;
                tMax.y += tDeltaY;
                nx = 0; ny = -stepY; nz = 0;
            } else {
                z += stepZ;
                t = tMax.z;
                tMax.z += tDeltaZ;
                nx = 0; ny = 0; nz = -stepZ;
            }
        }

        return null;
    }

    /**
     * World coordinates, as returned by {@link World#raycasti}.
     * @returns {boolean} whether the block was changed
     */
    setBlockWorld(iwx, iwy, iwz, value) {
        return this.setBlock(iwx, -iwz - 1, iwy, value);
    }

    /**
     * Changes a block in a loaded chunk. Takes effect right away: the chunk and the neighbours that have the block in
     * their border data get a quick, unoptimized mesh now, and an optimized one from the mesher worker later.
     * The chunk loader gets the edit too, so it survives reloads and appears in neighbours loaded later.
     * Chunk space coordinates (iz is the height), like {@link World#blockAt}.
     * @returns {boolean} whether the block was changed
     */
    setBlock(ix, iy, iz, value) {
        const start = performance.now();
        value >>>= 0; // BLOCK_IDS with the solid bit are negative, chunk data (Uint32Array) returns them unsigned
        const cx = ix >> CHUNK_SIZE_BIT_LEN;
        const cy = iy >> CHUNK_SIZE_BIT_LEN;
        const cz = iz >> CHUNK_SIZE_BIT_LEN;
        const entry = this.#chunks.get(pos3ToKey(cx, cy, cz));
        if (entry === undefined || !entry.loaded)
            return false;
        const bx = ix & CHUNK_SIZE_MASK;
        const by = iy & CHUNK_SIZE_MASK;
        const bh = iz & CHUNK_SIZE_MASK;
        if (entry.chunk.data.getVoxelXYZ(bx, by, bh) === value)
            return false;

        // before any re-request below, so the loader already has the edit when it generates them
        this.#postToChunkLoader(BlockEdit.toMessage(new BlockEdit(vec3(ix, iy, iz), value)));

        // the chunk loads a neighbour's border only if it has blocks next to that side; a placed block may be the
        // first one there, so take the cells around it from the loaded neighbours (its faces and shading need them)
        this.#syncBorderAround(entry, bx, by, bh);
        if (value !== BLOCK_IDS.EMPTY)
            entry.chunk.includeBlock(bx, by, bh);

        const outdatedRequestIds = [];
        let remeshed = 0;
        for (let dz = -1; dz <= 1; dz++)
            for (let dy = -1; dy <= 1; dy++)
                for (let dx = -1; dx <= 1; dx++) {
                    // the block's cell in this chunk's extended data (32^3 plus a 1 block border from the neighbours)
                    const ex = bx + 1 - dx * CHUNK_SIZE;
                    const ey = by + 1 - dy * CHUNK_SIZE;
                    const eh = bh + 1 - dz * CHUNK_SIZE;
                    if (ex < 0 || ex > CHUNK_SIZE + 1 || ey < 0 || ey > CHUNK_SIZE + 1 || eh < 0 || eh > CHUNK_SIZE + 1)
                        continue;
                    const neighbour = this.#chunks.get(pos3ToKey(cx + dx, cy + dy, cz + dz));
                    if (neighbour === undefined)
                        continue;
                    if (!neighbour.loaded) {
                        // its response may already be on the way without the edit: request it again
                        outdatedRequestIds.push(neighbour.requestId);
                        this.#requestChunk(neighbour);
                        continue;
                    }
                    const data = /** @type {ChunkDataExt} */ (neighbour.chunk.data);
                    if (data.getExtVoxel(ex, ey, eh) === value)
                        continue; // border not loaded on this side (no blocks next to it), nothing to update
                    data.setExtVoxel(ex, ey, eh, value);
                    this.#remesh(neighbour);
                    remeshed++;
                }
        if (outdatedRequestIds.length > 0)
            this.#postToChunkLoader(ChunkCancel.toMessage(new ChunkCancel(outdatedRequestIds)));

        logger.debug(() => `block (${ix}, ${iy}, ${iz}) set, ${remeshed} chunks remeshed in ${perfDiff(start)} ms`);
        return true;
    }

    /**
     * Copies the border cells of the chunk's extended data around a block from the loaded neighbours.
     * @param {ChunkEntry} entry
     */
    #syncBorderAround(entry, bx, by, bh) {
        const data = /** @type {ChunkDataExt} */ (entry.chunk.data);
        const p = entry.position;
        for (let oz = -1; oz <= 1; oz++)
            for (let oy = -1; oy <= 1; oy++)
                for (let ox = -1; ox <= 1; ox++) {
                    const ex = bx + 1 + ox, ey = by + 1 + oy, eh = bh + 1 + oz;
                    // which neighbour the cell belongs to (0: inside this chunk)
                    const dx = ex === 0 ? -1 : (ex === CHUNK_SIZE + 1 ? 1 : 0);
                    const dy = ey === 0 ? -1 : (ey === CHUNK_SIZE + 1 ? 1 : 0);
                    const dz = eh === 0 ? -1 : (eh === CHUNK_SIZE + 1 ? 1 : 0);
                    if (dx === 0 && dy === 0 && dz === 0)
                        continue;
                    const neighbour = this.#chunks.get(pos3ToKey(p.x + dx, p.y + dy, p.z + dz));
                    if (neighbour === undefined || !neighbour.loaded)
                        continue;
                    const value = neighbour.chunk.data.getVoxelXYZ(ex - 1 - dx * CHUNK_SIZE, ey - 1 - dy * CHUNK_SIZE, eh - 1 - dz * CHUNK_SIZE);
                    data.setExtVoxel(ex, ey, eh, value);
                }
    }

    /**
     * Quick mesh now, optimized mesh from the mesher worker later.
     * @param {ChunkEntry} entry
     */
    #remesh(entry) {
        const data = /** @type {ChunkDataExt} */ (entry.chunk.data);
        this.#replaceMesh(entry, this.#editMesher.createMesh(entry.position, data));

        entry.remeshId = this.#nextRequestId++;
        // the main thread keeps its data (raycasts, further edits), the worker gets a copy
        const copy = new ChunkDataExt(new Uint32Array(data.array3d.data));
        const message = MeshChunkRequest.toMessage(new MeshChunkRequest(entry.position, copy, entry.remeshId));
        if (this.#meshPort === null)
            this.#initialMeshQueue.push(message);
        else
            message.post(this.#meshPort);
    }

    /** @param {MeshChunkResponse} response */
    #onRemesh(response) {
        const p = response.chunkPos;
        const entry = this.#chunks.get(pos3ToKey(p.x, p.y, p.z));
        // dropped, reloaded or edited again since this remesh was requested
        if (entry === undefined || !entry.loaded || entry.remeshId !== response.requestId)
            return;
        this.#replaceMesh(entry, response.meshData);
    }

    /**
     * @param {ChunkEntry} entry
     * @param {import("./mesh/uIntMesh.js").UIntMeshData} meshData
     */
    #replaceMesh(entry, meshData) {
        const oldMesh = entry.chunk.mesh;
        entry.chunk.mesh = meshData.isEmpty() ? null : this.#meshHandler.upload(meshData);
        if (oldMesh)
            this.#meshHandler.dispose(oldMesh);
    }

    blockWorldAt(iwx, iwy, iwz) {
        return this.blockAt(iwx, -iwz - 1, iwy);
    }

    /**
     * Whether a point is under the water surface. The top water cell is filled up to settings.water.surfaceLevel,
     * unless water or a solid block is above it (as the mesher draws it).
     * @param {number} wx world position
     * @param {number} wy
     * @param {number} wz
     */
    isInWater(wx, wy, wz) {
        const ix = Math.floor(wx), iy = Math.floor(wy), iz = Math.floor(wz);
        if (!isLiquid(this.blockWorldAt(ix, iy, iz)))
            return false;
        const above = this.blockWorldAt(ix, iy + 1, iz);
        return isLiquid(above) || isSolid(above) || wy - iy < Settings.water.surfaceLevel;
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
