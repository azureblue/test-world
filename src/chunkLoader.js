import { ChunkDataLoader, ChunkManager, UIntChunkMesher } from "./chunk.js";
import { Generator02, NoiseChunkGenerator } from "./gen/generator.js";
import { Vec2 } from "./geom.js";
import { ImagePixels, Logger, Resources } from "./utils.js";
const initialQueue = [];
onmessage = (e) => {
    initialQueue.push(
        { cx: e.data.cx, cy: e.data.cy }
    );
}
const logger = new Logger("Chunk load worker");

const heightmap = await Resources.loadImage("./images/heightmap2.png");
// const heightmap = await Resources.loadImage("./images/test.png");
const heightmapPixels = ImagePixels.from(heightmap);

const generator = new NoiseChunkGenerator(); // new Generator02();
const chunkLoader = new ChunkDataLoader((cx, cy) => generator.generateChunk(new Vec2(cx, cy)));
const chunkManager = new ChunkManager(chunkLoader, new UIntChunkMesher());

function loadAndPost(cx, cy) {
    const chunkLoadStart = performance.now();
    logger.debug(`handling chunk request (${cx}, ${cy})`);
    const res = chunkManager.load(cx, cy);
    res.then(chunkSpec => {
        const chunkLoadTime = performance.now() - chunkLoadStart;
        const chunkDataRaw = new Uint32Array(chunkSpec.chunkData.data);
        logger.debug(`complete loading chunk (${cx}, ${cy}) in ${chunkLoadTime} - posting`);
        const meshDataRaw = chunkSpec.meshData.input;

        postMessage({
            chunkPos: [cx, cy],
            rawChunkData: chunkDataRaw,
            rawMeshData: meshDataRaw,
            meshTranslation: chunkSpec.meshData.mTranslation._values
        }, { "transfer": [chunkDataRaw.buffer, meshDataRaw.buffer] });
    }).catch(r => console.log(r));
}

onmessage = (e) => {
    const req = e.data;
    logger.debug("chunk request: " + req.cx + " " + req.cy);
    loadAndPost(req.cx, req.cy);
};

for (const e of initialQueue) {
    setTimeout(() => {
        loadAndPost(e.cx, e.cy);
    }, 0);
}

initialQueue.length = 0;
setTimeout(() => postMessage("ready"), 100);
