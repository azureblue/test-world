import { ChunkBlockData, ChunkData } from "../chunk/chunk.js";
import { ChunkDataExtTransfer } from "../chunk/extChunk.js";
import { Vec3 } from "../geom.js";
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
        throw new Error(`Invalid message type for ${messageClass.name}: ${message?.type}`);
    }
}

/**
 * Base class of protocol messages. Subclasses define `static get type()`, `static toMessage(obj)`, which builds
 * a {@link MessageTransportData} with the transfer list, and `static from(message)`, which parses a received message.
 */
export class WorkerMessage {
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

    constructor(endpointName, connectionId, reason) {
        super();
        this.endpointName = endpointName;
        this.connectionId = connectionId;
        this.reason = reason;
    }

    static toMessage(workerConnectRejectMessage) {
        return MessageTransportData.create(WorkerConnectReject.type, {
            endpointName: workerConnectRejectMessage.endpointName,
            connectionId: workerConnectRejectMessage.connectionId,
            reason: workerConnectRejectMessage.reason
        });
    }

    /**
     * @param {MessageEvent} message
     * @returns {WorkerConnectReject}
     */
    static from(message) {
        checkType(this, message);
        const data = message.data;
        return new WorkerConnectReject(data.endpointName, data.connectionId, data.reason);
    }
}


export class ChunkRequest extends WorkerMessage {

    static get type() {
        return "chunk_request";
    }

    /**
     * @param {Vec3} chunkPos - The position of the chunk to be generated.
     * @param {number} requestId - Returned in the {@link ChunkResponse}, lets the requester drop responses to outdated requests.
     */
    constructor(chunkPos, requestId) {
        super();
        this.chunkPos = chunkPos;
        this.requestId = requestId;
    }

    static toMessage(chunkRequest) {
        return new MessageTransportData(ChunkRequest.type, { chunkPos: chunkRequest.chunkPos, requestId: chunkRequest.requestId });
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
        return new ChunkRequest(toVec3(data.chunkPos), data.requestId);
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
     * @param {number} requestId - The id of the {@link ChunkRequest} this responds to.
     */
    constructor(chunkPos, chunkData, chunkMesh, requestId) {
        super();
        this.chunkPos = chunkPos;
        this.chunkData = chunkData;
        this.chunkMesh = chunkMesh;
        this.requestId = requestId;
    }

    static toMessage(chunkResponse) {
        const tMeshData = MESH_DATA_TRANSFER.transfer(chunkResponse.chunkMesh);
        const tChunkData = CHUNK_DATA_TRANSFER.transfer(chunkResponse.chunkData);
        return new MessageTransportData(ChunkResponse.type, {
            chunkPos: chunkResponse.chunkPos, chunkData: tChunkData.data, chunkMesh: tMeshData.data, requestId: chunkResponse.requestId
        }, [...tChunkData.transferList, ...tMeshData.transferList]);
    }

    /**
     * Creates a ChunkResponse from a given message event.
     * @param {MessageEvent} message - The message event containing the chunk response data.
     * @returns {ChunkResponse} A new instance of ChunkResponse.
     * @throws Will throw an error if the message type is not "chunk_response".
     */
    static from(message) {
        checkType(this, message);
        const data = message.data;
        return new ChunkResponse(toVec3(data.chunkPos),
            CHUNK_DATA_TRANSFER.createFrom(data.chunkData),
            MESH_DATA_TRANSFER.createFrom(data.chunkMesh),
            data.requestId);
    }
}

/**
 * The chunk the camera is in and the load range. The chunk loader processes pending requests nearest to this chunk
 * first and drops pending requests out of the range, by the same rule the requester uses to drop chunks that are
 * not loaded yet, so no cancel message is needed for them.
 */
export class ChunkLoadCenter extends WorkerMessage {

    static get type() {
        return "chunk_load_center";
    }

    /**
     * @param {Vec3} chunkPos - The chunk the camera is in.
     * @param {number} rangeSq - Squared load range in chunks; requests with a larger squared distance are dropped.
     */
    constructor(chunkPos, rangeSq) {
        super();
        this.chunkPos = chunkPos;
        this.rangeSq = rangeSq;
    }

    static toMessage(chunkLoadCenter) {
        return MessageTransportData.create(ChunkLoadCenter.type, { chunkPos: chunkLoadCenter.chunkPos, rangeSq: chunkLoadCenter.rangeSq });
    }

    /**
     * @param {MessageEvent} message
     * @returns {ChunkLoadCenter}
     */
    static from(message) {
        checkType(this, message);
        return new ChunkLoadCenter(toVec3(message.data.chunkPos), message.data.rangeSq);
    }
}

/**
 * Cancels pending {@link ChunkRequest}s. Requests the loader already processed are answered anyway,
 * the requester drops those responses by request id.
 */
export class ChunkCancel extends WorkerMessage {

    static get type() {
        return "chunk_cancel";
    }

    /**
     * @param {Array<number>} requestIds - Ids of the requests to cancel.
     */
    constructor(requestIds) {
        super();
        this.requestIds = requestIds;
    }

    static toMessage(chunkCancel) {
        return MessageTransportData.create(ChunkCancel.type, { requestIds: chunkCancel.requestIds });
    }

    /**
     * @param {MessageEvent} message
     * @returns {ChunkCancel}
     */
    static from(message) {
        checkType(this, message);
        return new ChunkCancel(message.data.requestIds);
    }
}

export class GenerateChunkRequest extends WorkerMessage {

    static get type() {
        return "generate_chunk_request";
    }

    /**
     * @param {Vec3} chunkPos - The position of the chunk to generate.
     */
    constructor(chunkPos) {
        super();
        this.chunkPos = chunkPos;
    }

    static toMessage(generateChunkRequest) {
        return MessageTransportData.create(GenerateChunkRequest.type, { chunkPos: generateChunkRequest.chunkPos });
    }

    /**
     * @param {MessageEvent} message
     * @returns {GenerateChunkRequest}
     */
    static from(message) {
        checkType(this, message);
        return new GenerateChunkRequest(toVec3(message.data.chunkPos));
    }
}

export class GenerateChunkResponse extends WorkerMessage {

    static get type() {
        return "generate_chunk_response";
    }

    /**
     * @param {Vec3} chunkPos - The position of the generated chunk.
     * @param {ChunkBlockData} chunkBlockData - Generated blocks, transferred.
     */
    constructor(chunkPos, chunkBlockData) {
        super();
        this.chunkPos = chunkPos;
        this.chunkBlockData = chunkBlockData;
    }

    static toMessage(generateChunkResponse) {
        const buffer = generateChunkResponse.chunkBlockData.data.buffer;
        return MessageTransportData.create(GenerateChunkResponse.type,
            { chunkPos: generateChunkResponse.chunkPos, chunkBlockData: buffer },
            [buffer]);
    }

    /**
     * @param {MessageEvent} message
     * @returns {GenerateChunkResponse}
     */
    static from(message) {
        checkType(this, message);
        const data = message.data;
        return new GenerateChunkResponse(toVec3(data.chunkPos), new ChunkBlockData(new Uint32Array(data.chunkBlockData)));
    }
}

export class MeshChunkRequest extends WorkerMessage {

    static get type() {
        return "mesh_chunk_request";
    }

    /**
     * @param {Vec3} chunkPos - The position of the chunk to mesh.
     * @param {ChunkData} chunkData - Chunk data with borders, transferred.
     */
    constructor(chunkPos, chunkData) {
        super();
        this.chunkPos = chunkPos;
        this.chunkData = chunkData;
    }

    static toMessage(meshChunkRequest) {
        const tChunkData = CHUNK_DATA_TRANSFER.transfer(meshChunkRequest.chunkData);
        return MessageTransportData.create(MeshChunkRequest.type,
            { chunkPos: meshChunkRequest.chunkPos, chunkData: tChunkData.data },
            tChunkData.transferList);
    }

    /**
     * @param {MessageEvent} message
     * @returns {MeshChunkRequest}
     */
    static from(message) {
        checkType(this, message);
        const data = message.data;
        return new MeshChunkRequest(toVec3(data.chunkPos), CHUNK_DATA_TRANSFER.createFrom(data.chunkData));
    }
}

/**
 * The mesher sends the chunk data back together with the mesh, so the requester can forward it
 * (for example to the main thread) without keeping a copy while the chunk is being meshed.
 */
export class MeshChunkResponse extends WorkerMessage {

    static get type() {
        return "mesh_chunk_response";
    }

    /**
     * @param {Vec3} chunkPos - The position of the meshed chunk.
     * @param {MeshData} meshData - Mesh data, transferred.
     * @param {ChunkData} chunkData - The chunk data the mesh was created from, transferred back.
     */
    constructor(chunkPos, meshData, chunkData) {
        super();
        this.chunkPos = chunkPos;
        this.meshData = meshData;
        this.chunkData = chunkData;
    }

    static toMessage(meshChunkResponse) {
        const tMeshData = MESH_DATA_TRANSFER.transfer(meshChunkResponse.meshData);
        const tChunkData = CHUNK_DATA_TRANSFER.transfer(meshChunkResponse.chunkData);
        return MessageTransportData.create(MeshChunkResponse.type, {
            chunkPos: meshChunkResponse.chunkPos, meshData: tMeshData.data, chunkData: tChunkData.data
        }, [...tMeshData.transferList, ...tChunkData.transferList]);
    }

    /**
     * @param {MessageEvent} message
     * @returns {MeshChunkResponse}
     */
    static from(message) {
        checkType(this, message);
        const data = message.data;
        return new MeshChunkResponse(toVec3(data.chunkPos),
            MESH_DATA_TRANSFER.createFrom(data.meshData),
            CHUNK_DATA_TRANSFER.createFrom(data.chunkData));
    }
}

/**
 * Structured clone drops the prototype, so positions arrive as plain objects.
 * @param {{x: number, y: number, z: number}} pos
 * @returns {Vec3}
 */
function toVec3(pos) {
    return new Vec3(pos.x, pos.y, pos.z);
}
