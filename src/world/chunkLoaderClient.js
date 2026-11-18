import { Vec3 } from "../geom.js";
import { Logger } from "../logging.js";
import { Settings } from "../settings.js";
import { Resources } from "../utils.js";
import { BlockEdit, ChunkCancel, ChunkLoadCenter, ChunkRequest, ChunkResponse, MessageTransportData } from "../worker/common.js";
import { WorkerClient } from "../worker/worker.js";
import { ChunkEntry } from "./chunkEntry.js";

const logger = new Logger("ChunkLoaderClient");

/**
 * The main thread's side of the chunk loader worker (worker/chunkLoader.js): chunk requests and their ids, cancels,
 * edits and the load center go out, chunk responses come in. Messages posted before the worker is connected are sent
 * in order once it is.
 */
export class ChunkLoaderClient {
    #workerClient;
    /** @type {MessagePort} */
    #port = null;
    /** @type {Array<MessageTransportData>} */
    #initialMessageQueue = [];
    #nextRequestId = 1;

    /**
     * @param {(response: ChunkResponse) => void} onChunk
     */
    constructor(onChunk) {
        this.#workerClient = new WorkerClient(
            new Worker(Resources.relativeToRoot(`./worker/chunkLoader.js?workerId=world0&gen=${Settings.world.generator}&fastMesher=${Settings.world.fastMesher}`), { type: "module" }),
            logger
        );
        this.#workerClient.connect("chunkLoad").then((messagePort) => {
            logger.info(() => "connected to chunk loader");
            this.#port = messagePort;
            this.#port.onmessage = (message) => onChunk(ChunkResponse.from(message.data));
            for (const message of this.#initialMessageQueue)
                message.post(this.#port);
            this.#initialMessageQueue = [];
        }).catch((err) => logger.error(() => `connecting to the chunk loader failed: ${err}`));
    }

    /** a new request id, responses to the entry's earlier requests are dropped once it has it */
    nextRequestId() {
        return this.#nextRequestId++;
    }

    /**
     * Requests the chunk under a new request id.
     * @param {ChunkEntry} entry
     */
    request(entry) {
        entry.requestId = this.nextRequestId();
        this.requestAgain(entry);
    }

    /**
     * Requests the chunk under its current request id (given earlier with {@link nextRequestId}).
     * @param {ChunkEntry} entry
     */
    requestAgain(entry) {
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
     * The loader keeps the edit and applies it to every later load (before requests posted after it).
     * @param {Vec3} blockPos chunk space block position
     * @param {number} value
     */
    edit(blockPos, value) {
        this.#post(BlockEdit.toMessage(new BlockEdit(blockPos, value)));
    }

    /**
     * Pending requests nearest to the center are loaded first, the ones farther than the range dropped.
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
