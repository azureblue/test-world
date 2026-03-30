import { ChunkDataExtTransfer as ChunkExtDataTransfer } from "../chunk/extChunk.js";
import { Logger } from "../logging.js";
import { UIntMeshDataTransfer } from "../mesh/uIntMesh.js";
import { UIntWasmMesher } from "../mesh/uIntWasmMesher.js";
import { ConnectionPortRequest, ConnectionPortResponse, MeshChunkRequest, MeshChunkResponse, WorkerReadyResponse } from "./common.js";

const params = new URL(self.location.href).searchParams;
const WORKER_ID = params.get("workerId");
const logger = new Logger("chunk mesher worker " + WORKER_ID);
await UIntWasmMesher.init();

logger.info(() => "booted " + self.location?.href);

const chunkDataTransfer = new ChunkExtDataTransfer();
const chunkMeshTransfer = new UIntMeshDataTransfer();

const mesher = new UIntWasmMesher({ quick: false });


/** * Loads chunk data for the specified chunk position and posts it back to the main thread.
 * @param {MessagePort} port - The message port to post the chunk data to.
 * @param {Vec3} chunkPos - The position of the chunk to load as [cx, cy, cz].
 * @param {ChunkData} chunkData - The chunk data to be processed.
 */
function loadAndPost(port, chunkPos, chunkData) {
    new UIntWasmMesher().createMesh(chunkPos, chunkData);
    const chunkLoadStart = performance.now();
    const cx = chunkPos.x;
    const cy = chunkPos.y;
    const cz = chunkPos.z;
    logger.debug(() => `handling mesh chunk request (${cx}, ${cy}, ${cz})`);
    const mesh = mesher.createMesh(chunkPos, chunkData);

    const chunkLoadTime = performance.now() - chunkLoadStart;
    logger.debug(() => `complete mesh chunk (${cx}, ${cy}, ${cz}) in ${chunkLoadTime} - posting`);

    const meshChunkResponseMessage = new MeshChunkResponse(chunkPos, mesh).toMessage();
    meshChunkResponseMessage.post(port);
}


onmessage = (message) => {
    const connectionPortMessage = ConnectionPortRequest.from(message);
    const port = connectionPortMessage.port;
    logger.info(() => "received connection port, setting up message handler");
    port.onmessage = (meshRequestMessage) => {
        const meshChunkRequest = MeshChunkRequest.from(meshRequestMessage, chunkDataTransfer);
        const chunkPos = meshChunkRequest.chunkPos;
        logger.debug(() => "chunk request: " + chunkPos.x + " " + chunkPos.y + " " + chunkPos.z);
        loadAndPost(port, chunkPos, meshChunkRequest.chunkData);
    }
    new ConnectionPortResponse(connectionPortMessage.connectionId).toMessage().post(self);
};

logger.info(() => "initialized");
const readyMessage = new WorkerReadyResponse(WORKER_ID);
postMessage(readyMessage.toMessage());

