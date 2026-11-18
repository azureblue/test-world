import { Vec3 } from "../geom.js";
import { Logger } from "../logging.js";
import { settingsParams } from "../settings.js";
import { Resources } from "../utils.js";
import { BlockEdit, ChunkCancel, ChunkLoadCenter, ChunkRequest, ChunkResponse, MessageTransportData } from "../worker/common.js";
import { WorkerClient } from "../worker/worker.js";
import { ChunkEntry } from "./chunkEntry.js";

const logger = new Logger("WorldClient");

/**
 * The main thread's side of the world worker (worker/worldWorker.js), which owns the world: chunk requests and their
 * ids, cancels, edits and the load center go out, chunk responses and updates come in. Messages posted before the
 * worker is connected are sent in order once it is.
 */
export class WorldClient {
    #workerClient;
    /** @type {MessagePort} */
    #port = null;
    /** @type {Array<MessageTransportData>} */
    #initialMessageQueue = [];
    #nextRequestId = 1;
    #nextEditSeq = 1;

    /**
     * @param {(response: ChunkResponse) => void} onChunk
     */
    constructor(onChunk) {
        // the settings changed from their defaults (URL parameters, overrideSettings), so the worker has the same
        const params = settingsParams();
        params.set("workerId", "world0");
        this.#workerClient = new WorkerClient(
            new Worker(Resources.relativeToRoot(`./worker/worldWorker.js?${params}`), { type: "module" }),
            logger
        );
        this.#workerClient.connect("world").then((messagePort) => {
            logger.info(() => "connected to world worker");
            this.#port = messagePort;
            this.#port.onmessage = (message) => onChunk(ChunkResponse.from(message.data));
            for (const message of this.#initialMessageQueue)
                message.post(this.#port);
            this.#initialMessageQueue = [];
        }).catch((err) => logger.error(() => `connecting to the world worker failed: ${err}`));
    }

    /**
     * Requests the chunk under a new request id.
     * @param {ChunkEntry} entry
     */
    request(entry) {
        entry.requestId = this.#nextRequestId++;
        this.#post(ChunkRequest.toMessage(new ChunkRequest(entry.position, entry.requestId)));
    }

    /**
     * Drops pending requests (ids of requests already processed or unknown are ignored).
     * @param {Array<number>} requestIds
     */
    cancel(requestIds) {
        this.#post(ChunkCancel.toMessage(new ChunkCancel(requestIds)));
    }

    /**
     * Sends an edit. The worker applies it before the requests posted after it.
     * @param {Vec3} blockPos chunk space block position
     * @param {number} value
     * @returns {number} the edit's seq, see {@link ChunkResponse#editAck}
     */
    edit(blockPos, value) {
        const seq = this.#nextEditSeq++;
        this.#post(BlockEdit.toMessage(new BlockEdit(blockPos, value, seq)));
        return seq;
    }

    /**
     * Pending requests nearest to the center are loaded first, the ones farther than the range dropped; the range is
     * also where the worker simulates.
     * @param {Vec3} chunkPos
     * @param {number} rangeSq
     */
    setCenter(chunkPos, rangeSq) {
        this.#post(ChunkLoadCenter.toMessage(new ChunkLoadCenter(chunkPos, rangeSq)));
    }

    /** @param {MessageTransportData} message */
    #post(message) {
        if (this.#port === null)
            this.#initialMessageQueue.push(message);
        else
            message.post(this.#port);
    }
}
