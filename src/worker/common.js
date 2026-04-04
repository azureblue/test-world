import { ChunkAdjDataTransfer } from "../chunk/adjChunk.js";
import { ChunkBlockData, ChunkData } from "../chunk/chunk.js";
import { ChunkDataExtTransfer } from "../chunk/extChunk.js";
import { vec3, Vec3 } from "../geom.js";
import { MeshData } from "../mesh/mesh.js";
import { UIntMeshDataTransfer } from "../mesh/uIntMesh.js";

export const CHUNK_DATA_TRANSFER = new ChunkDataExtTransfer();
export const MESH_DATA_TRANSFER = new UIntMeshDataTransfer();

export class CompletablePromise {
    #promise;
    #resolve;
    #reject;

    constructor() {
        this.#promise = new Promise((resolve, reject) => {
            this.#resolve = resolve;
            this.#reject = reject;
        });
    }

    resolve(value) {
        this.#resolve(value);
    }

    reject(reason) {
        this.#reject(reason);
    }

    then(a, b) {
        return this.#promise.then(a, b);
    }

    catch(a) {
        return this.#promise.catch(a);
    }

    finally(a) {
        return this.#promise.finally(a);
    }
}

export class MessageTransportData {

    /**
     * @param {string} type - The type of the message.
     * @param {any} data - The data associated with the message.
     * @param {Array} transferList - The list of transferable objects.
     */
    constructor(type, data, transferList = []) {
        this.message = {
            type: type,
            data: data
        };
        this.type = type;
        this.data = data;
        this.transferList = transferList;
    }

    /**
     * @param {Window | Worker | MessagePort} target - The target to post the message to.
     */
    post(target) {
        target.postMessage(this.message, {
            transfer: this.transferList
        });
    }

    static create(type, data, transferList = []) {
        return new MessageTransportData(type, data, transferList);
    }
}

/**
 * Utility function to check if a message is of the expected type.
 * @param {function} messageClass - The class of the expected message.
 * @param {MessageEvent} message - The message event to check.
 * @throws Will throw an error if the message type does not match the expected type.
 */
function checkType(messageClass, message) {
    if (message.type !== messageClass.type) {
        throw new Error(`Invalid message type for ${messageClass.name}: ${message.data.type}`);
    }
}

export class WorkerMessage {
    static type() {
        return this.type;
    }

    static isType(message) {
        return message.type === this.type;
    }
}



export class WorkerReady extends WorkerMessage {
    static get type() {
        return "worker_ready";
    }

    /**
     * @param {string} workerId - The identifier for the worker.
     * @param {Array} supportedEndpoints - The list of supported endpoints.
     */
    constructor(workerId, supportedEndpoints = []) {
        super();
        this.workerId = workerId;
        this.supportedEndpoints = supportedEndpoints;
    }

    static toMessage(workerReadyMessage) {
        return MessageTransportData.create(WorkerReady.type, { workerId: workerReadyMessage.workerId, supportedEndpoints: workerReadyMessage.supportedEndpoints });
    }

    /**
     * @param {MessageEvent} message
     * @returns {WorkerReady}
     */
    static from(message) {
        checkType(this, message);
        const data = message.data;
        return new WorkerReady(data.workerId, data.supportedEndpoints);
    }
}

export class WorkerConnectRequest extends WorkerMessage {
    static get type() {
        return "worker_connect_request";
    }

    constructor(endpointName, connectionId, port) {
        super();
        this.endpointName = endpointName;
        this.connectionId = connectionId;
        this.port = port;
    }

    static toMessage(workerConnectRequest) {
        return MessageTransportData.create(WorkerConnectRequest.type, {
            endpointName: workerConnectRequest.endpointName,
            connectionId: workerConnectRequest.connectionId,
            port: workerConnectRequest.port
        }, [workerConnectRequest.port]);
    }

    /**
     * @param {MessageEvent} message
     * @returns {WorkerConnectRequest}
     */
    static from(message) {
        checkType(this, message);
        const data = message.data;
        return new WorkerConnectRequest(data.endpointName, data.connectionId, data.port);
    }
}

export class WorkerConnectAck extends WorkerMessage {
    static get type() {
        return "worker_connect_ack";
    }

    constructor(endpointName, connectionId) {
        super();
        this.endpointName = endpointName;
        this.connectionId = connectionId;
    }

    static toMessage(workerConnectAckMessage) {
        return MessageTransportData.create(WorkerConnectAck.type, { endpointName: workerConnectAckMessage.endpointName, connectionId: workerConnectAckMessage.connectionId });
    }

    /**
     * @param {MessageEvent} message
     * @returns {WorkerConnectAck}
     */
    static from(message) {
        checkType(this, message);
        const data = message.data;
        return new WorkerConnectAck(data.endpointName, data.connectionId);
    }
}

export class WorkerConnectReject extends WorkerMessage {
    static get type() {
        return "worker_connect_reject";
    }

    constructor(connectionId, reason) {
        super();
        this.connectionId = connectionId;
        this.reason = reason;
    }

    static toMessage(workerConnectRejectMessage) {
        return MessageTransportData.create(WorkerConnectReject.type, { connectionId: workerConnectRejectMessage.connectionId, reason: workerConnectRejectMessage.reason });
    }

    /**
     * @param {MessageEvent} message
     * @returns {WorkerConnectReject}
     */
    static from(message) {
        checkType(this, message);
        const data = message.data;
        return new WorkerConnectReject(data.connectionId, data.reason);
    }
}


export class GenerateChunkRequest {
    /**
     * @param {Vec3} chunkPos - The position of the chunk to be generated.
     */
    constructor(chunkPos) {
        this.chunkPos = chunkPos;
    }

    toMessage() {
        return new MessageTransportData("generateChunkRequest", { chunkPos: this.chunkPos });
    }

    /**
     * Creates a GenerateChunkRequest from a given message event.
     * @param {MessageEvent} message - The message event containing the chunk request data.
     * @returns {GenerateChunkRequest} A new instance of GenerateChunkRequest.
     * @throws Will throw an error if the message type is not "chunkRequest".
     */
    static from(message) {
        const data = message.data;
        if (data.type !== "generateChunkRequest") {
            throw new Error("Invalid message type for GenerateChunkRequest: " + data.type);
        }
        return new GenerateChunkRequest(vec3(data.chunkPos.x, data.chunkPos.y, data.chunkPos.z));
    }
}

export class GenerateChunkResponse {

    /**
     * @param {Vec3} chunkPos - The position of the generated chunk.
     * @param {ChunkBlockData} chunkBlockData - The transferred chunk block data.
     */

    constructor(chunkPos, chunkBlockData) {
        this.chunkPos = chunkPos;
        this.chunkBlockData = chunkBlockData;
    }

    toMessage() {
        return new MessageTransportData("generateChunkResponse",
            { chunkPos: this.chunkPos, chunkBlockData: this.chunkBlockData.data.buffer },
            [this.chunkBlockData.data.buffer]);
    }

    /**
     * Creates a GenerateChunkResponse from a given message event.
     * @param {MessageEvent} message - The message event containing the chunk response data.
     * @returns {GenerateChunkResponse} A new instance of GenerateChunkResponse.
     * @throws Will throw an error if the message type is not "generateChunkResponse".
     */
    static from(message) {
        const data = message.data;
        if (data.type !== "generateChunkResponse") {
            throw new Error("Invalid message type for GenerateChunkResponse: " + data.type);
        }
        return new GenerateChunkResponse(data.data.chunkPos, new ChunkBlockData(new Uint32Array(data.data.chunkBlockData)));
    }
}

export class MeshChunkRequest {
    /**
     * @param {Vec3} chunkPos - The position of the chunk to be meshed.
     * @param {ChunkData} chunkData - The transferred chunk data of the chunk to be meshed.
     */
    constructor(chunkPos, chunkData) {
        this.chunkPos = chunkPos;
        this.chunkData = chunkData;
    }

    toMessage() {
        const tChunkData = CHUNK_DATA_TRANSFER.transfer(this.chunkData);
        return new MessageTransportData("meshChunkRequest",
            { chunkPos: this.chunkPos, chunkData: tChunkData.data },
            tChunkData.transferList);
    }

    static from(message) {
        const data = message.data;
        if (data.type !== "meshChunkRequest") {
            throw new Error("Invalid message type for MeshChunkRequest: " + data.type);
        }
        return new MeshChunkRequest(data.data.chunkPos, CHUNK_DATA_TRANSFER.createFrom(data.data.chunkData));
    }
}

export class MeshChunkResponse {
    /**
     * @param {Vec3} chunkPos - The position of the chunk to be meshed.
     * @param {MeshData} meshData - The transferrable mesh data of the meshed chunk.
     */
    constructor(chunkPos, meshData) {
        this.chunkPos = chunkPos;
        this.meshData = meshData;
    }

    toMessage() {
        const tMeshData = MESH_DATA_TRANSFER.transfer(this.meshData);
        return new MessageTransportData("meshChunkResponse", { chunkPos: this.chunkPos, meshData: tMeshData.data }, tMeshData.transferList);
    }

    /**
     * Creates a MeshChunkResponse from a given message event.
     * @param {MessageEvent} message - The message event containing the mesh chunk response data.
     * @returns {MeshChunkResponse} A new instance of MeshChunkResponse.
     * @throws Will throw an error if the message type is not "meshChunkResponse".
     */
    static from(message) {
        const data = message.data;
        if (data.type !== "meshChunkResponse") {
            throw new Error("Invalid message type for MeshChunkResponse: " + data.type);
        }
        return new MeshChunkResponse(data.data.chunkPos, MESH_DATA_TRANSFER.createFrom(data.data.meshData));
    }
}


export class ChunkRequest extends WorkerMessage {

    static get type() {
        return "chunk_request";
    }

    /**
     * @param {Vec3} chunkPos - The position of the chunk to be generated.
     */
    constructor(chunkPos) {
        super();
        this.chunkPos = chunkPos;
    }

    static toMessage(chunkRequest) {
        return new MessageTransportData(ChunkRequest.type, { chunkPos: chunkRequest.chunkPos });
    }

    /**
     * Creates a ChunkRequest from a given message event.
     * @param {MessageEvent} message - The message event containing the chunk request data.
     * @returns {ChunkRequest} A new instance of ChunkRequest.
     * @throws Will throw an error if the message type is not "chunkRequest".
     */
    static from(message) {
        checkType(this, message);
        const data = message.data;
        return new ChunkRequest(new Vec3(data.chunkPos.x, data.chunkPos.y, data.chunkPos.z));
    }
}


export class ChunkResponse extends WorkerMessage {

    static get type() {
        return "chunk_response";
    }

    /**
     * @param {Vec3} chunkPos - The position of the generated chunk.
     * @param {ChunkData} chunkData - Chunk data to transfer.
     * @param {ChunkMesh} chunkMesh - Mesh data to transfer.
     */

    constructor(chunkPos, chunkData, chunkMesh) {
        super();
        this.chunkPos = chunkPos;
        this.chunkData = chunkData;
        this.chunkMesh = chunkMesh;
    }

    static toMessage(chunkResponse) {
        const tMeshData = MESH_DATA_TRANSFER.transfer(chunkResponse.chunkMesh);
        const tChunkData = CHUNK_DATA_TRANSFER.transfer(chunkResponse.chunkData);
        return new MessageTransportData(ChunkResponse.type, {
            chunkPos: chunkResponse.chunkPos, chunkData: tChunkData.data, chunkMesh: tMeshData.data
        }, [...tChunkData.transferList, ...tMeshData.transferList]);
    }

    /**
     * @param {Vec3} chunkPos - The position of the generated chunk.
     * @param {ChunkData} chunkData - Chunk data to transfer.
     * @param {ChunkMesh} chunkMesh - Mesh data to transfer.
     */
    static from(chunkPos, chunkData, chunkMesh) {
        const tMeshData = MESH_DATA_TRANSFER.transfer(chunkMesh);
        const tChunkData = CHUNK_DATA_TRANSFER.transfer(chunkData);
        return new MessageTransportData(ChunkResponse.type, {
            chunkPos: chunkPos, chunkData: tChunkData.data, chunkMesh: tMeshData.data
        }, [...tChunkData.transferList, ...tMeshData.transferList]);
    }

    /**
     * Creates a ChunkResponse from a given message event.
     * @param {MessageEvent} message - The message event containing the chunk response data.
     * @returns {ChunkResponse} A new instance of ChunkResponse.
     * @throws Will throw an error if the message type is not "chunkResponse".
     */
    static fromMessage(message) {
        checkType(this, message);
        const data = message.data;
        return new ChunkResponse(data.chunkPos,
            CHUNK_DATA_TRANSFER.createFrom(data.chunkData),
            MESH_DATA_TRANSFER.createFrom(data.chunkMesh));
    }
}


// export function connectWorker(worker) {
//     worker.onmessage = (message) => {
//         switch (message.data.type) {
//             case "ready":
//                 const workerReady = WorkerReadyResponse.from(message);
//                 logger.info(() => `generator worker ${workerReady.workerId} ready, sending connection port`);
//                 new ConnectionPortRequest(genChannel.port1).toMessage().post(generatorWorker);
//                 break;
//             case "connectionResponse":
//                 const connectionResponse = ConnectionPortResponse.from(message);
//                 logger.info(() => `generator worker ${connectionResponse.connectionId} connected`);
//                 break;
//             default:
//                 logger.warn(() => "unknown message type: " + message.data.type);
//         }
//     }
// }