import { ChunkDataLoader } from "./chunk/chunk.js";
import { ChunkExtDataFactory as ChunkDataExtFactory } from "./chunk/extChunk.js";
import { createGenerator } from "./gen/generator.js";
import { Vec3, vec3 } from "./geom.js";
import { Logger } from "./logging.js";
import { UIntWasmMesher } from "./mesh/uIntWasmMesher.js";
import { ChunkRequest, ChunkResponse } from "./worker/common.js";
import { WorkerConnection, WorkerServer } from "./worker/worker.js";


const params = new URL(self.location.href).searchParams;
const WORKER_ID = params.get("workerId");


const logger = new Logger("chunk load worker " + WORKER_ID);


/**
 * @typedef {Object} ChunkResponseData
 * @property {Vec3} chunkPos - The position of the chunk as [cx, cy, cz].
 * @property {ArrayBuffer} tChunkData - The transferred chunk data.
 * @property {ArrayBuffer} tMeshData - The transferred mesh data.
 */


/**
 * @typedef {Object} GenerateRequest
 * @property {Vec3} chunkPos - The position of the chunk to generate as [cx, cy, cz].
 */

/**
 * @typedef {Object} MeshRequest
 * @property {Vec3} chunkPos - The position of the chunk to mesh as [cx, cy, cz].
 * @property {ArrayBuffer} rawChunkData - The raw chunk data to mesh.
 */

/**
 * @typedef {Object} WorkerMessage
 * @property {string} type - The type of message ("init", "generate", "mesh", etc.).
 * @property {any} id
 * @property {GenerateRequest | MeshRequest} data - The data associated with the message.
 */

// const initialQueue = [];
// onmessage = (e) => {
//     initialQueue.push(
//         { cx: e.data.cx, cy: e.data.cy, cz: e.data.cz }
//     );
// }

// const heightmap = await Resources.loadImage("./images/heightmap2.png");
// const heightmap = await Resources.loadImage("./images/test.png");
// const heightmapPixels = ImagePixels.from(heightmap);

await UIntWasmMesher.init();

const generator = createGenerator(); // new Generator02();
const chunkDataFactory = new ChunkDataExtFactory();
const chunkDataLoader = new ChunkDataLoader(generator, chunkDataFactory);
const mesher = new UIntWasmMesher({ quick: false });

const workerServer = new WorkerServer(self, WORKER_ID, {

    /**
     * @param {MessageEvent} event - The message event containing the chunk request data.
     * @param {WorkerConnection} connection
     */
    chunkLoad: {
        onMessage: (event, connection) => {
            const chunkRequest = ChunkRequest.from(event);
            const chunkPos = chunkRequest.chunkPos;
            logger.debug(() => "chunk request: " + chunkPos.x + " " + chunkPos.y + " " + chunkPos.z);

            const chunkLoadStart = performance.now();
            const cx = chunkPos.x;
            const cy = chunkPos.y;
            const cz = chunkPos.z;
            logger.debug(() => `handling chunk request (${cx}, ${cy}, ${cz})`);
            const chunkData = chunkDataLoader.loadChunk(chunkPos);
            const meshData = mesher.createMesh(chunkPos, chunkData);

            const chunkLoadTime = performance.now() - chunkLoadStart;
            logger.debug(() => `complete loading chunk (${chunkPos.x}, ${chunkPos.y}, ${chunkPos.z}) in ${chunkLoadTime} - posting`);

            const chunkResponseMessage = ChunkResponse.toMessage(new ChunkResponse(chunkPos, chunkData, meshData));
            chunkResponseMessage.post(connection.port);
        }
    }
});

workerServer.start();
