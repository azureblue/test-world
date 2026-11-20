import { ChunkGeneratorFactory } from "../gen/registry.js";
import { Logger } from "../logging.js";
import { perfDiff } from "../utils.js";
import { GenerateChunkRequest, GenerateChunkResponse } from "./common.js";
import { WorkerConnection, WorkerServer } from "./worker.js";

// Generates block data only: chunk position in, block data out. Keeps no state between requests,
// so any number of these can run in parallel behind a coordinator (see docs/proposals/worker-pipeline.md).

const params = new URL(self.location.href).searchParams;
const workerId = params.get("workerId");
const generatorName = params.get("gen") ?? "default";
const seed = Number(params.get("seed"));

const logger = new Logger("chunk generator worker " + workerId);
const generator = await ChunkGeneratorFactory.createForName(generatorName, seed);

const workerServer = new WorkerServer(self, workerId, {

    generate: {
        /**
         * @param {any} data
         * @param {WorkerConnection} connection
         */
        onMessage: (data, connection) => {
            const chunkPos = GenerateChunkRequest.from(data).chunkPos;
            const start = performance.now();
            const chunkBlockData = generator.generateChunk(chunkPos);
            logger.debug(() => `generated chunk (${chunkPos.x}, ${chunkPos.y}, ${chunkPos.z}) in ${perfDiff(start)} ms`);

            GenerateChunkResponse.toMessage(new GenerateChunkResponse(chunkPos, chunkBlockData)).post(connection.port);
        }
    }
});

workerServer.start();
