import { Chunk } from "../chunk/chunk.js";
import { ivec3, Vec3, vec3 } from "../geom.js";
import { Logger } from "../logging.js";
import { MeshHandler } from "../mesh/mesh.js";
import { Settings } from "../settings.js";
import { GenericBuffer, perfDiff } from "../utils.js";
import { ChunkResponse } from "../worker/common.js";
import { ChunkEntry, pos3ToKey } from "./chunkEntry.js";
import { ChunkLoaderClient } from "./chunkLoaderClient.js";

const logger = new Logger("ChunkManager");

const CHUNK_RENDER_DIST = Settings.world.renderDistance;
const CHUNK_RENDER_DIST_SQ = CHUNK_RENDER_DIST * CHUNK_RENDER_DIST;
const CHUNK_RETAIN_DIST_SQ = CHUNK_RENDER_DIST_SQ * Settings.world.retainDistanceFactor ** 2;
/** chunk responses applied per frame at most (each uploads a mesh) */
const RESPONSES_PER_FRAME = 10;

/**
 * The chunks around the center: requests the ones that come into the render range from the chunk loader, applies the
 * responses, drops the ones beyond the retain range. Chunk coordinates.
 */
export class ChunkManager {
    #loader;
    #meshHandler;

    /** @type {Map<string, ChunkEntry>} */
    #chunks = new Map();
    /** the newest response per chunk, applied in {@link update}
     * @type {Map<string, ChunkResponse>} */
    #responseQueue = new Map();

    #center = ivec3(0xFFFFFFFF, 0xFFFFFFFF, 0xFFFFFFFF);
    #centerChanged = false;
    /** offsets of the chunks in the render range, nearest first
     * @type {Array<Vec3>} */
    #rangeDeltas;
    #chunkKeysSorted = new GenericBuffer(2000);
    #chunkKeysSortedReversed = new GenericBuffer(2000);
    #tmpBuffer = new GenericBuffer(1000);

    /**
     * @param {MeshHandler} meshHandler
     */
    constructor(meshHandler) {
        this.#meshHandler = meshHandler;
        this.#loader = new ChunkLoaderClient((response) => this.#onChunk(response));
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

    get loader() {
        return this.#loader;
    }

    /** the number of chunks in the render range */
    get chunksInRange() {
        return this.#rangeDeltas.length;
    }

    /**
     * @returns {ChunkEntry | undefined}
     */
    get(cx, cy, cz) {
        return this.#chunks.get(pos3ToKey(cx, cy, cz));
    }

    /**
     * @returns {ChunkEntry | undefined} the entry if it's loaded
     */
    getLoaded(cx, cy, cz) {
        const entry = this.#chunks.get(pos3ToKey(cx, cy, cz));
        return entry !== undefined && entry.loaded ? entry : undefined;
    }

    /**
     * Whether the entry is still the one kept for its position (not dropped, not replaced by a new entry).
     * @param {ChunkEntry} entry
     */
    contains(entry) {
        const p = entry.position;
        return this.#chunks.get(pos3ToKey(p.x, p.y, p.z)) === entry;
    }

    setCenter(cx, cy, cz) {
        if (this.#center.x === cx && this.#center.y === cy && this.#center.z === cz)
            return;
        this.#center.x = cx;
        this.#center.y = cy;
        this.#center.z = cz;
        this.#centerChanged = true;
    }

    /** Call once per frame. */
    update() {
        if (this.#centerChanged) {
            this.#updateChunksInRange();
            this.#centerChanged = false;
            return;
        }
        if (this.#responseQueue.size > 0) {
            const entriesIter = this.#responseQueue.entries();
            for (let i = 0; i < RESPONSES_PER_FRAME; i++) {
                const next = entriesIter.next();
                if (next.done)
                    break;
                const [key, response] = next.value;
                this.#responseQueue.delete(key);
                this.#applyResponse(response);
            }
        }
    }

    /**
     * @param {(chunk: Chunk) => void} chunkProcessor
     */
    forEachChunkInRangeFarToNear(chunkProcessor) {
        this.#forEachLoaded(this.#chunkKeysSortedReversed, chunkProcessor);
    }

    /**
     * @param {(chunk: Chunk) => void} chunkProcessor
     */
    forEachChunkInRangeNearToFar(chunkProcessor) {
        this.#forEachLoaded(this.#chunkKeysSorted, chunkProcessor);
    }

    /**
     * @param {GenericBuffer<string>} keys
     * @param {(chunk: Chunk) => void} chunkProcessor
     */
    #forEachLoaded(keys, chunkProcessor) {
        const arr = keys.array;
        const len = keys.length;
        for (let i = 0; i < len; i++) {
            const entry = this.#chunks.get(arr[i]);
            if (entry !== undefined && entry.loaded)
                chunkProcessor(entry.chunk);
        }
    }

    /** @param {ChunkResponse} response */
    #onChunk(response) {
        const chunkPos = response.chunkPos;
        const key = pos3ToKey(chunkPos.x, chunkPos.y, chunkPos.z);
        // keep the response to the newest request, also when responses arrive out of order
        const queued = this.#responseQueue.get(key);
        if (queued === undefined || response.requestId > queued.requestId)
            this.#responseQueue.set(key, response);
    }

    /** @param {ChunkResponse} response */
    #applyResponse(response) {
        const chunkPos = response.chunkPos;
        const key = pos3ToKey(chunkPos.x, chunkPos.y, chunkPos.z);
        const entry = this.#chunks.get(key);
        if (entry === undefined)
            return;
        if (response.requestId !== entry.requestId) {
            // the chunk was requested again (back in range, edited) while the old request was in the worker queue
            logger.debug(() => `dropping response to outdated request ${response.requestId} for ${key}, current ${entry.requestId}`);
            return;
        }
        if (entry.loaded && !entry.dirty)
            logger.warn(() => "got chunk data, but not dirty " + key);

        const now = performance.now();
        const meshData = response.chunkMesh;
        const mesh = meshData.isEmpty() ? null : this.#meshHandler.upload(meshData);
        const oldMesh = entry.chunk?.mesh;
        if (oldMesh)
            this.#meshHandler.dispose(oldMesh);
        entry.chunk = new Chunk(chunkPos, response.chunkData, mesh);
        entry.loaded = true;
        entry.dirty = false;
        logger.debug(() => `uploading mesh time: ${perfDiff(now)}`);
    }

    #updateChunksInRange() {
        const center = this.#center;
        // the loader picks pending requests nearest to this chunk first and drops the ones out of range,
        // by the same rule as below for entries that are not loaded yet
        this.#loader.setCenter(vec3(center.x, center.y, center.z), CHUNK_RENDER_DIST_SQ);
        this.#tmpBuffer.reset();
        for (const key of this.#chunks.keys())
            this.#tmpBuffer.put(key);
        for (let i = 0; i < this.#tmpBuffer.length; i++) {
            const key = this.#tmpBuffer.get(i);
            const entry = this.#chunks.get(key);
            const dx = entry.position.x - center.x;
            const dy = entry.position.y - center.y;
            const dz = entry.position.z - center.z;
            const distSq = dx * dx + dy * dy + dz * dz;
            if (!entry.loaded && distSq > CHUNK_RENDER_DIST_SQ) {
                // not loaded yet and out of range: the loader drops the request too (see ChunkLoadCenter),
                // it's requested again when it gets back in range
                this.#chunks.delete(key);
            } else if (distSq > CHUNK_RETAIN_DIST_SQ) {
                const mesh = entry.chunk?.mesh;
                if (mesh)
                    this.#meshHandler.dispose(mesh);
                this.#chunks.delete(key);
            }
        }
        this.#chunkKeysSorted.reset();
        for (const delta of this.#rangeDeltas) {
            const cx = center.x + delta.x;
            const cy = center.y + delta.y;
            const cz = center.z + delta.z;
            const key = pos3ToKey(cx, cy, cz);
            this.#chunkKeysSorted.put(key);
            if (!this.#chunks.has(key)) {
                const entry = new ChunkEntry(vec3(cx, cy, cz));
                this.#chunks.set(key, entry);
                this.#loader.request(entry);
            }
        }
        this.#chunkKeysSorted.trimToSize();
        this.#chunkKeysSortedReversed.reset();
        this.#chunkKeysSortedReversed.add(this.#chunkKeysSorted.array);
        this.#chunkKeysSortedReversed.trimToSize();
        this.#chunkKeysSortedReversed.array.reverse();
    }
}
