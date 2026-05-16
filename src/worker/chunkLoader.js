import { ChunkDataLoader } from "../chunk/chunk.js";
import { ChunkExtDataFactory } from "../chunk/extChunk.js";
import { ChunkGeneratorFactory } from "../gen/registry.js";
import { Logger } from "../logging.js";
import { UIntExtWasmMesher } from "../mesh/uIntWasmMesher.js";
import { perfDiff } from "../utils.js";
import { ChunkRequest, ChunkResponse } from "./common.js";
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

const workerServer = new WorkerServer(self, workerId, {

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
