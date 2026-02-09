import { ChunkDataLoader, ChunkManager } from "./chunk.js";
import { NoiseChunkGenerator } from "./gen/generator.js";
import { Vec3, vec3 } from "./geom.js";
import { DefaultMesher, UIntWasmMesher } from "./mesher.js";
import { Logger } from "./utils.js";

console.log("WORKER BOOTED", self.location?.href);

/**
 * @typedef {Object} ChunkMessage
 * @property {Vec3} chunkPos - The position of the chunk as [cx, cy, cz].
 * @property {Uint32Array} rawChunkData - The raw chunk data.
 * @property {Uint32Array} rawMeshData - The raw mesh data.
 * @property {Vec3} meshTranslation - The translation vector of the mesh.
 */

/**
 * @typedef {Object} WorkerMessage
 * @property {string} type - The type of message ("init", "chunkRequest", etc.).
 * @property {Object} data - The data associated with the message.
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

const generator = new NoiseChunkGenerator(); // new Generator02();
const chunkLoader = new ChunkDataLoader((cx, cy, cz) => generator.generateChunk(vec3(cx, cy, cz)));
const chunkManager = new ChunkManager(chunkLoader, new DefaultMesher());

const params = new URL(self.location.href).searchParams;
const WORKER_ID = Number(params.get("workerId"));
const logger = new Logger("Chunk load worker " + WORKER_ID);

function loadAndPost(chunkPos) {
    const chunkLoadStart = performance.now();
    const cx = chunkPos.x;
    const cy = chunkPos.y;
    const cz = chunkPos.z;
    logger.debug(`handling chunk request (${cx}, ${cy}, ${cz})`);
    const res = chunkManager.load(cx, cy, cz);
    res.then(chunkSpec => {
        const chunkLoadTime = performance.now() - chunkLoadStart;
        const chunkDataRaw = new Uint32Array(chunkSpec.chunkData.data);
        logger.debug(`complete loading chunk (${cx}, ${cy}, ${cz}) in ${chunkLoadTime} - posting`);
        const meshDataRaw = chunkSpec.meshData.input;

        postMessage({
            type: "chunkResponse",
            data: {
                chunkPos: vec3(cx, cy, cz),
                rawChunkData: chunkDataRaw,
                rawMeshData: meshDataRaw,
                meshTranslation: chunkSpec.meshData.mTranslation
            }
        }, { "transfer": [chunkDataRaw.buffer, meshDataRaw.buffer] });
    }).catch(r => console.log(r));
}

onmessage = (message) => {
    /** 
     * @type {WorkerMessage} data
     */
    const data = message.data;

    if (data.type == "chunkRequest") {
        const chunkPos = data.data.chunkPos;
        logger.debug("chunk request: " + chunkPos.x + " " + chunkPos.y + " " + chunkPos.z);
        loadAndPost(chunkPos);
    } else {
        logger.warn("unknown message type: " + data.type);
    }
};

UIntWasmMesher.init().then(() => {

    logger.info("chunk loader worker initialized, workerId: " + WORKER_ID);
    postMessage({
        type: "ready",
        data: {
            workerId: WORKER_ID
        }
    });
});

// for (const e of initialQueue) {
//     setTimeout(() => {
//         loadAndPost(e.cx, e.cy, e.cz);
//     }, 0);
// }

// initialQueue.length = 0;
// setTimeout(() => postMessage("ready"), 100);
