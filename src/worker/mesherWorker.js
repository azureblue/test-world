import { Logger } from "../logging.js";
import { UIntExtWasmMesher } from "../mesh/uIntWasmMesher.js";
import { perfDiff } from "../utils.js";
import { MeshChunkRequest, MeshChunkResponse } from "./common.js";
import { WorkerConnection, WorkerServer } from "./worker.js";

// Meshes chunks: chunk data with borders in, mesh out. The chunk data is sent back with the mesh,
// so the requester doesn't have to keep a copy (see docs/proposals/worker-pipeline.md).

const params = new URL(self.location.href).searchParams;
const workerId = params.get("workerId");
const fastMesher = params.get("fastMesher") === "true";

const logger = new Logger("chunk mesher worker " + workerId);
const mesher = await (fastMesher ? UIntExtWasmMesher.createFastMesher() : UIntExtWasmMesher.createMesher());

const workerServer = new WorkerServer(self, workerId, {

    mesh: {
        /**
         * @param {any} data
         * @param {WorkerConnection} connection
         */
        onMessage: (data, connection) => {
            const meshChunkRequest = MeshChunkRequest.from(data);
            const chunkPos = meshChunkRequest.chunkPos;
            const start = performance.now();
            const meshData = mesher.createMesh(chunkPos, meshChunkRequest.chunkData);
            logger.debug(() => `meshed chunk (${chunkPos.x}, ${chunkPos.y}, ${chunkPos.z}) in ${perfDiff(start)} ms`);

            MeshChunkResponse.toMessage(new MeshChunkResponse(chunkPos, meshData, meshChunkRequest.chunkData)).post(connection.port);
        }
    }
});

workerServer.start();
