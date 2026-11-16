import { ChunkDataLoader } from "../chunk/chunk.js";
import { ChunkExtDataFactory } from "../chunk/extChunk.js";
import { ChunkGeneratorFactory } from "../gen/registry.js";
import { Vec3 } from "../geom.js";
import { Logger } from "../logging.js";
import { UIntExtWasmMesher } from "../mesh/uIntWasmMesher.js";
import { perfDiff } from "../utils.js";
import { ChunkCancel, ChunkLoadCenter, ChunkRequest, ChunkResponse } from "./common.js";
import { WorkerConnection, WorkerServer } from "./worker.js";


const params = new URL(self.location.href).searchParams;
const workerId = params.get("workerId");
const generatorName = params.get("gen") ?? "default";
const fastMesher = params.get("fastMesher") === "true";

const logger = new Logger("chunk load worker " + workerId);
const generator = await ChunkGeneratorFactory.createForName(generatorName);

const chunkDataFactory = new ChunkExtDataFactory();
const chunkDataLoader = new ChunkDataLoader(generator, chunkDataFactory);
const mesher = await (fastMesher ? UIntExtWasmMesher.createFastMesher() : UIntExtWasmMesher.createMesher());

/**
 * Requests are not processed when they arrive. They wait in `pending`, and one chunk is loaded per step, nearest to
 * the latest load center first; requests out of the load range are dropped in the same pass. Between steps the worker
 * yields, so new messages (a new center, cancels) are read before the next chunk; otherwise they would only be seen
 * after all requests queued before them were processed.
 */
class ChunkLoadScheduler {
    /** @type {Map<number, {request: ChunkRequest, connection: WorkerConnection}>} requestId -> pending request */
    #pending = new Map();
    #center = new Vec3(0, 0, 0);
    #rangeSq = Infinity;
    #stepScheduled = false;
    // a message to ourselves yields without the minimum delay of nested setTimeout
    #yieldChannel = new MessageChannel();

    constructor() {
        this.#yieldChannel.port1.onmessage = () => this.#step();
    }

    /**
     * @param {ChunkRequest} request
     * @param {WorkerConnection} connection
     */
    add(request, connection) {
        this.#pending.set(request.requestId, { request, connection });
        this.#scheduleStep();
    }

    /** @param {Array<number>} requestIds */
    cancel(requestIds) {
        for (const requestId of requestIds)
            this.#pending.delete(requestId);
        logger.debug(() => `cancelled ${requestIds.length} requests, ${this.#pending.size} pending`);
    }

    /**
     * @param {Vec3} chunkPos
     * @param {number} rangeSq
     */
    setCenter(chunkPos, rangeSq) {
        this.#center = chunkPos;
        this.#rangeSq = rangeSq;
    }

    #scheduleStep() {
        if (this.#stepScheduled || this.#pending.size === 0)
            return;
        this.#stepScheduled = true;
        this.#yieldChannel.port2.postMessage(null);
    }

    #step() {
        this.#stepScheduled = false;
        const next = this.#takeNearest();
        if (next !== null) {
            try {
                loadAndPost(next.request, next.connection);
            } catch (err) {
                const p = next.request.chunkPos;
                logger.error(() => `loading chunk (${p.x}, ${p.y}, ${p.z}) failed: ${err}`);
            }
        }
        this.#scheduleStep();
    }

    #takeNearest() {
        let best = null;
        let bestDistSq = Infinity;
        const c = this.#center;
        const rangeSq = this.#rangeSq;
        for (const entry of this.#pending.values()) {
            const p = entry.request.chunkPos;
            const dx = p.x - c.x, dy = p.y - c.y, dz = p.z - c.z;
            const distSq = dx * dx + dy * dy + dz * dz;
            if (distSq > rangeSq) {
                // left the range; the requester dropped it by the same rule (deleting while iterating a Map is safe)
                this.#pending.delete(entry.request.requestId);
                continue;
            }
            if (distSq < bestDistSq) {
                bestDistSq = distSq;
                best = entry;
            }
        }
        if (best !== null)
            this.#pending.delete(best.request.requestId);
        return best;
    }
}

/**
 * @param {ChunkRequest} chunkRequest
 * @param {WorkerConnection} connection
 */
function loadAndPost(chunkRequest, connection) {
    const chunkPos = chunkRequest.chunkPos;
    const chunkLoadStart = performance.now();
    const chunkData = chunkDataLoader.loadChunk(chunkPos);
    const meshData = mesher.createMesh(chunkPos, chunkData);

    const chunkLoadTime = perfDiff(chunkLoadStart);
    logger.debug(() => `complete loading chunk (${chunkPos.x}, ${chunkPos.y}, ${chunkPos.z}) in ${chunkLoadTime} ms`);

    ChunkResponse.toMessage(new ChunkResponse(chunkPos, chunkData, meshData, chunkRequest.requestId)).post(connection.port);
}

const scheduler = new ChunkLoadScheduler();

const workerServer = new WorkerServer(self, workerId, {

    chunkLoad: {
        /**
         * @param {any} data - Data related to the request.
         * @param {WorkerConnection} connection
         */
        onMessage: (data, connection) => {
            if (ChunkRequest.isType(data)) {
                scheduler.add(ChunkRequest.from(data), connection);
            } else if (ChunkCancel.isType(data)) {
                scheduler.cancel(ChunkCancel.from(data).requestIds);
            } else if (ChunkLoadCenter.isType(data)) {
                const center = ChunkLoadCenter.from(data);
                scheduler.setCenter(center.chunkPos, center.rangeSq);
            } else {
                logger.warn(() => `unknown message type: ${data?.type}`);
            }
        }
    }
});

workerServer.start();
