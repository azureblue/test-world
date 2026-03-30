import { ChunkExtDataFactory, ChunkDataExtTransfer as ChunkExtDataTransfer } from "../chunk/extChunk.js";
import { createGenerator } from "../gen/generator.js";
import { Logger } from "../logging.js";
import { ConnectionPortRequest, ConnectionPortResponse, GenerateChunkRequest, GenerateChunkResponse, WorkerReadyResponse } from "./common.js";

const params = new URL(self.location.href).searchParams;
const WORKER_ID = params.get("workerId");
const logger = new Logger("chunk generator worker " + WORKER_ID);

logger.info(() => "booted " + self.location?.href);

const generator = createGenerator(); // new Generator02();
const chunkDataFactory = new ChunkExtDataFactory();
const chunkDataTransfer = new ChunkExtDataTransfer();

/** * Loads chunk data for the specified chunk position and posts it back to the main thread.
 * @param {MessagePort} port - The message port to post the chunk data to.
 * @param {Vec3} chunkPos - The position of the chunk to load as [cx, cy, cz].
 */
function loadAndPost(port, chunkPos) {
    const chunkLoadStart = performance.now();
    const cx = chunkPos.x;
    const cy = chunkPos.y;
    const cz = chunkPos.z;
    logger.debug(() => `handling chunk request (${cx}, ${cy}, ${cz})`);
    const chunkBlockData = generator.generateChunk(chunkPos);

    const chunkLoadTime = performance.now() - chunkLoadStart;
    logger.debug(() => chunkBlockData.data.reduce((acc, val) => acc + val, 0) + " blocks generated");
    logger.debug(() => `complete loading chunk (${cx}, ${cy}, ${cz}) in ${chunkLoadTime} - posting`);

    // const chunkDataTransferObject = chunkDataTransfer.transfer(chunkData);

    const generateChunkResponseMessage = new GenerateChunkResponse(
        chunkPos, chunkBlockData).toMessage();

    generateChunkResponseMessage.post(port);
}


onmessage = (message) => {
    const connectionPortMessage = ConnectionPortRequest.from(message);
    const port = connectionPortMessage.port;
    logger.info(() => "received connection port, setting up message handler");
    port.onmessage = (chunkRequestMessage) => {
        const generateChunkRequest = GenerateChunkRequest.from(chunkRequestMessage);
        const chunkPos = generateChunkRequest.chunkPos;
        logger.debug(() => "generate chunk request: " + chunkPos.x + " " + chunkPos.y + " " + chunkPos.z);
        loadAndPost(port, chunkPos);
    }
    new ConnectionPortResponse(connectionPortMessage.connectionId).toMessage().post(self);
};

logger.info(() => "initialized");
const readyMessage = new WorkerReadyResponse(WORKER_ID);
postMessage(readyMessage.toMessage());
