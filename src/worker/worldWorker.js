import { CHUNK_SIZE, ChunkBlockData, ChunkData, posToKey3 } from "../chunk/chunk.js";
import { ChunkDataExt, ChunkExtDataFactory, ChunkDataExtTransfer as ChunkExtDataTransfer } from "../chunk/extChunk.js";
import { Dir27, vec3 } from "../geom.js";
import { Logger } from "../logging.js";
import { ChunkMesh } from "../mesh/mesh.js";
import { FixedSizeMap, Resources } from "../utils.js";
import { ChunkRequest, ChunkResponse, ConnectionPortRequest, ConnectionPortResponse, GenerateChunkRequest, GenerateChunkResponse, MeshChunkRequest, MeshChunkResponse, WorkerReadyResponse } from "./common.js";

const params = new URL(self.location.href).searchParams;
const WORKER_ID = params.get("workerId");
const logger = new Logger("world worker " + WORKER_ID);

logger.info(() => "booted " + self.location?.href);

/** @type {Map<string, ChunkBlockData>} */
const blockDataCache = new FixedSizeMap(27 * 30);

class CompletableChunkBlockDataPromise {
    /**
     * Creates a new CompletableChunkBlockDataPromise.
     */
    constructor() {
        /** @type {Promise<ChunkBlockData>} */
        this.promise = new Promise((resolve, reject) => {
            this.resolve = resolve;
            this.reject = reject;

        });
    }
}

class CompletableChunkMeshPromise {
    /**
     * Creates a new CompletableChunkMeshPromise.
     */
    constructor() {
        /** @type {Promise<ChunkMesh>} */
        this.promise = new Promise((resolve, reject) => {
            this.resolve = resolve;
            this.reject = reject;
        });
    }
}


/** @type {Map<string, CompletableChunkBlockDataPromise>} */
const blockDataPromiseCache = new Map();

/** @type {Map<string, CompletableChunkMeshPromise>} */
const meshPromiseCache = new Map();

const chunkDataFactory = new ChunkExtDataFactory();
const chunkDataTransfer = new ChunkExtDataTransfer();

const genChannel = new MessageChannel();
const mesherChannel = new MessageChannel();

const generatorWorker = new Worker(Resources.relativeToRoot(`./worker/generatorWorker.js?workerId=gen0`), { type: "module" });

/**
 * Handles the response from the generator worker when a chunk has been generated.
 * @param {GenerateChunkResponse} generateChunkResponse - The response containing the generated chunk data and mesh.
 */
function handleGenerateChunkResponse(generateChunkResponse) {
    logger.debug(() => `received generated chunk for (${generateChunkResponse.chunkPos.x}, ${generateChunkResponse.chunkPos.y}, ${generateChunkResponse.chunkPos.z})`);
    const chunkPos = generateChunkResponse.chunkPos;
    const key = posToKey3(chunkPos.x, chunkPos.y, chunkPos.z);    
    blockDataCache.set(key, generateChunkResponse.chunkBlockData);
    if (blockDataPromiseCache.has(key)) {
        const completablePromise = blockDataPromiseCache.get(key);
        completablePromise.resolve(generateChunkResponse.chunkBlockData);
        blockDataPromiseCache.delete(key);
    }
}

/**
 * Handles the response from the mesher worker when a chunk mesh has been generated.
 * @param {MeshChunkResponse} chunkMeshResponse - The response containing the generated chunk mesh.
 */
function handleChunkMeshResponse(chunkMeshResponse) {
    logger.debug(() => `received generated chunk mesh for (${chunkMeshResponse.chunkPos.x}, ${chunkMeshResponse.chunkPos.y}, ${chunkMeshResponse.chunkPos.z})`);
    const chunkPos = chunkMeshResponse.chunkPos;
    const key = posToKey3(chunkPos.x, chunkPos.y, chunkPos.z);
    const meshData = chunkMeshResponse.meshData;
    if (meshPromiseCache.has(key)) {
        meshPromiseCache.get(key).resolve(meshData);
        meshPromiseCache.delete(key);
    }
}

genChannel.port2.onmessage = (message) => {
    handleGenerateChunkResponse(GenerateChunkResponse.from(message));
}

mesherChannel.port2.onmessage = (message) => {
    handleChunkMeshResponse(MeshChunkResponse.from(message));
}

generatorWorker.onmessage = (message) => {
    switch (message.data.type) {
        case "ready":
            const workerReady = WorkerReadyResponse.from(message);
            logger.info(() => `generator worker ${workerReady.workerId} ready, sending connection port`);
            new ConnectionPortRequest(genChannel.port1).toMessage().post(generatorWorker);
            break;
        case "connectionPortResponse":
            const connectionResponse = ConnectionPortResponse.from(message);
            logger.info(() => `worker gen0 connected to ${WORKER_ID} with connection id ${connectionResponse.connectionId}`);
            break;
        default:
            logger.warn(() => "unknown message type: " + message.data.type);
    }
}
const mesherWorker = new Worker(Resources.relativeToRoot(`./worker/mesherWorker.js?workerId=mesh0`), { type: "module" });

mesherWorker.onmessage = (message) => {
    switch (message.data.type) {
        case "ready":
            const workerReady = WorkerReadyResponse.from(message);
            logger.info(() => `mesher worker ${workerReady.workerId} ready, sending connection port`);
            new ConnectionPortRequest(mesherChannel.port1).toMessage().post(mesherWorker);
            break;
        case "connectionPortResponse":
            const connectionResponse = ConnectionPortResponse.from(message);
            logger.info(() => `worker mesh0 connected to ${WORKER_ID} with connection id ${connectionResponse.connectionId}`);
            break;
        default:
            logger.warn(() => "unknown message type: " + message.data.type);
    }
}

/**
 * Sends a request to load chunk block data for the specified chunk position.
 * @param {number} cx - The x-coordinate of the chunk.
 * @param {number} cy - The y-coordinate of the chunk.
 * @param {number} cz - The z-coordinate of the chunk.
 */
function sendChunkBlockDataRequest(cx, cy, cz) {
    const chunkRequestMessage = new GenerateChunkRequest(vec3(cx, cy, cz)).toMessage();
    chunkRequestMessage.post(genChannel.port2);
}

/**
 * Sends a request to mesh chunk.
 * @param {number} cx - The x-coordinate of the chunk.
 * @param {number} cy - The y-coordinate of the chunk.
 * @param {number} cz - The z-coordinate of the chunk.
 * @param {ChunkData} chunkData - The chunk data to mesh.
 */
function sendChunkMeshRequest(cx, cy, cz, chunkData) {
    new MeshChunkRequest(vec3(cx, cy, cz), chunkData).toMessage().post(mesherChannel.port2);
}

/**
 * @returns {ChunkBlockData}
 */
async function loadChunkBlockData(cx, cy, cz) {
    const key = posToKey3(cx, cy, cz);
    if (blockDataCache.has(key)) {
        logger.debug(() => `cache hit for chunk (${cx}, ${cy}, ${cz})`);
        return blockDataCache.get(key);
    }
    logger.debug(() => `cache miss for chunk (${cx}, ${cy}, ${cz}), loading from generator worker`);
    if (blockDataPromiseCache.has(key)) {
        logger.debug(() => `already loading chunk (${cx}, ${cy}, ${cz}), waiting for existing promise`);
        return await blockDataPromiseCache.get(key).promise;
    }
    const chunkDataPromise = new CompletableChunkBlockDataPromise();
    blockDataPromiseCache.set(key, chunkDataPromise);
    sendChunkBlockDataRequest(cx, cy, cz);
    return await chunkDataPromise.promise;
}


/**
 * @returns {ChunkMesh}
 */
async function loadChunkMesh(cx, cy, cz, chunkData) {
    const key = posToKey3(cx, cy, cz);
    if (meshPromiseCache.has(key)) {
        logger.debug(() => `already meshing chunk (${cx}, ${cy}, ${cz}), waiting for existing promise`);
        return await meshPromiseCache.get(key).promise;
    }
    const chunkMeshPromise = new CompletableChunkMeshPromise();
    meshPromiseCache.set(key, chunkMeshPromise);
    const dataCopy = new ChunkDataExt();
    dataCopy.array3d.data.set(chunkData.array3d.data);
    sendChunkMeshRequest(cx, cy, cz, dataCopy);
    return await chunkMeshPromise.promise;
}

async function handleChunkRequest(port, chunkPos) {
    const cx = chunkPos.x;
    const cy = chunkPos.y;
    const cz = chunkPos.z;
    logger.debug(() => "handling chunk request: " + chunkPos.x + " " + chunkPos.y + " " + chunkPos.z);
    const blockChunkData = await loadChunkBlockData(chunkPos.x, chunkPos.y, chunkPos.z);
    const chunkData = chunkDataFactory.createChunkDataFrom(blockChunkData, chunkPos);

    const bounds = chunkData.calculateBounds();

    let adj27Needed = (1 << 27) - 1
    if (bounds) {
        if (bounds.minH > 0) {
            adj27Needed &= 0b111111111111101111000000000;
        }
        if (bounds.maxH < CHUNK_SIZE) {
            adj27Needed &= 0b000000000111101111111111111;
        }
        if (bounds.minX > 0) {
            adj27Needed &= 0b110110110110100110110110110;
        }
        if (bounds.maxX < CHUNK_SIZE) {
            adj27Needed &= 0b011011011011001011011011011;
        }
        if (bounds.minY > 0) {
            adj27Needed &= 0b111111000111101000111111000;
        }
        if (bounds.maxY < CHUNK_SIZE) {
            adj27Needed &= 0b000111111000101111000111111;
        }

        for (let dir27 = 0; dir27 < 27; dir27++, adj27Needed >>>= 1) {          
            if ((adj27Needed & 1) === 0) continue;
            const dirOffset = Dir27[dir27];
            const adjChunkBlockData = await loadChunkBlockData(cx + dirOffset.x, cy + dirOffset.y, cz + dirOffset.z);
            if (!adjChunkBlockData) 
                continue;
            chunkData.updateAdjBlockData(dir27, adjChunkBlockData);
        }
    }
    const mesh = await loadChunkMesh(cx, cy, cz, chunkData);

    const chunkResponseMessage = new ChunkResponse(chunkPos, chunkData, mesh).toMessage();
    chunkResponseMessage.post(port);
}

onmessage = (message) => {
    const connectionPortMessage = ConnectionPortRequest.from(message);
    const port = connectionPortMessage.port;
    logger.info(() => "received connection port, setting up message handler");

    port.onmessage = (message) => {
        const chunkRequest = ChunkRequest.from(message);
        const chunkPos = chunkRequest.chunkPos;
        logger.debug(() => "chunk request: " + chunkPos.x + " " + chunkPos.y + " " + chunkPos.z);
        handleChunkRequest(port, chunkPos);
    }
    new ConnectionPortResponse(connectionPortMessage.connectionId).toMessage().post(self);
};

logger.info(() => "initialized");
const readyMessage = new WorkerReadyResponse(WORKER_ID);
postMessage(readyMessage.toMessage());
