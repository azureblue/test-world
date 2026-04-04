import { ChunkAdjDataFactory } from "./chunk/adjChunk.js";
import { ChunkDataLoader } from "./chunk/chunk.js";
import { ChunkExtDataFactory as ChunkDataExtFactory, ChunkExtDataFactory } from "./chunk/extChunk.js";
import { createGenerator } from "./gen/generator.js";
import { Logger } from "./logging.js";
import { UIntAdjWasmMesher, UIntExtWasmMesher } from "./mesh/uIntWasmMesher.js";
import { perfDiff } from "./utils.js";
import { ChunkRequest, ChunkResponse } from "./worker/common.js";
import { WorkerConnection, WorkerServer } from "./worker/worker.js";


const params = new URL(self.location.href).searchParams;
const WORKER_ID = params.get("workerId");


const logger = new Logger("chunk load worker " + WORKER_ID);

const generator = createGenerator();
const chunkDataFactory = new ChunkExtDataFactory();
const chunkDataLoader = new ChunkDataLoader(generator, chunkDataFactory);
const mesher = await UIntExtWasmMesher.createFastkMesher();

const workerServer = new WorkerServer(self, WORKER_ID, {

    /**
     * @param {any} data - Data related to the request.
     * @param {WorkerConnection} connection
     */
    chunkLoad: {
        onMessage: async (data, connection) => {
            const chunkRequest = ChunkRequest.from(data);
            const chunkPos = chunkRequest.chunkPos;
            logger.debug(() => `chunk request: (${chunkPos.x}, ${chunkPos.y}, ${chunkPos.z})`);

            const chunkLoadStart = performance.now();
            const chunkData = chunkDataLoader.loadChunk(chunkPos);
            const meshData = mesher.createMesh(chunkPos, chunkData);

            const chunkLoadTime = perfDiff(chunkLoadStart);
            logger.debug(() => `complete loading chunk (${chunkPos.x}, ${chunkPos.y}, ${chunkPos.z}) in ${chunkLoadTime} ms`);

            const chunkResponseMessageData = ChunkResponse.from(chunkPos, chunkData, meshData);
            chunkResponseMessageData.post(connection.port);
        }
    }
});

workerServer.start();
