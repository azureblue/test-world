import { Logger } from "../logging.js";
import { WorkerConnectAck, WorkerConnectReject, WorkerConnectRequest, WorkerReady } from "./common.js";

let NEXT_CONNECTION_ID = 1;

export class WorkerClient {
    /**
     * @param {Worker} worker
     * @param {Logger} [logger]
     */
    constructor(worker, logger = {}) {
        this.worker = worker;
        this.logger = logger;

        this.ready = false;
        this.workerId = null;
        this.supportedEndpoints = [];

        this.readyPromise = new Promise((resolve, reject) => {
            this._resolveReady = resolve;
            this._rejectReady = reject;
        });

        /**
         * connectionId -> { resolve, reject, localPort }
         * @type {Map<number, {resolve:(port:MessagePort)=>void, reject:(err:any)=>void, localPort:MessagePort}>}
         */
        this.pendingConnections = new Map();

        worker.onmessage = (event) => {
            this.#handleMessage(event.data);
        };
    }

    async waitUntilReady() {
        return this.readyPromise;
    }

    /**
     * @param {string} endpointName
     * @returns {Promise<MessagePort>}
     */
    async connect(endpointName) {
        await this.waitUntilReady();

        if (!this.supportedEndpoints.includes(endpointName)) {
            throw new Error(`Worker does not support endpoint: ${endpointName}`);
        }

        const connectionId = NEXT_CONNECTION_ID++;
        const channel = new MessageChannel();

        return new Promise((resolve, reject) => {
            this.pendingConnections.set(connectionId, {
                resolve,
                reject,
                localPort: channel.port2
            });

            const workerConnectRequest = WorkerConnectRequest.toMessage(new WorkerConnectRequest(endpointName, connectionId, channel.port1));
            workerConnectRequest.post(this.worker);
        });
    }

    /**
     * @param {any} msg
     */
    #handleMessage(msg) {
        if (WorkerReady.isType(msg)) {
            const workerReady = WorkerReady.from(msg);
            this.ready = true;
            this.workerId = workerReady.workerId;
            this.supportedEndpoints = workerReady.supportedEndpoints || [];
            this._resolveReady(workerReady);
            return;
        }

        if (WorkerConnectAck.isType(msg)) {
            const workerConnectAck = WorkerConnectAck.from(msg);
            const pending = this.pendingConnections.get(workerConnectAck.connectionId);
            if (!pending) {
                this.logger.warn(`Unexpected connect ack: ${workerConnectAck.connectionId}`);
                return;
            }

            this.pendingConnections.delete(workerConnectAck.connectionId);
            pending.resolve(pending.localPort);
            return;
        }

        if (WorkerConnectReject.isType(msg)) {
            const workerConnectReject = WorkerConnectReject.from(msg);
            const pending = this.pendingConnections.get(workerConnectReject.connectionId);
            if (!pending) {
                this.logger.warn(`Unexpected connect reject: ${workerConnectReject.connectionId}`);
                return;
            }

            this.pendingConnections.delete(workerConnectReject.connectionId);
            pending.reject(new Error(workerConnectReject.reason || `Connection rejected: ${workerConnectReject.endpointName}`));
        }
    }
}

/**
 * @typedef {Object} WorkerEndpoint
 * @property {(connection: WorkerConnection) => void} [onConnect] - Called when a new connection is established.
 * @property {(event: MessageEvent, connection: WorkerConnection) => void} onMessage - Called when a message is received on the connection.
 * @property {(connection: WorkerConnection) => void} [onDisconnect] - Called when a connection is closed.
 */

export class WorkerServer {
    /**
     * @param {DedicatedWorkerGlobalScope} selfWorker
     * @param {string} workerId
     * @param {Record<string, WorkerEndpoint>} endpoints
     */
    constructor(selfWorker, workerId, endpoints) {
        this.selfWorker = selfWorker;
        this.workerId = workerId;
        this.endpoints = endpoints;        
        this.logger = new Logger(`WorkerServer(${workerId})`);

        /**
         * endpointName -> Set<WorkerConnection>
         * @type {Record<string, Set<WorkerConnection>>}
         */
        this.endpointConnections = Object.create(null);

        for (const endpointName of Object.keys(this.endpoints)) {
            this.endpointConnections[endpointName] = new Set();
        }
    }

    start() {
        this.selfWorker.onmessage = async (event) => {
            const msg = event.data;

            if (!WorkerConnectRequest.isType(msg)) {
                this.logger.warn(() => `Unknown message type: ${msg?.kind}`);
                return;
            }

            const workerConnectRequest = WorkerConnectRequest.from(msg);

            const endpointName = workerConnectRequest.endpointName;
            const connectionId = workerConnectRequest.connectionId;
            const endpoint = this.endpoints[endpointName];            

            if (!endpoint) {
                const connectRejectMessage = WorkerConnectReject.toMessage(new WorkerConnectReject(endpointName, connectionId, `Unsupported endpoint: ${endpointName}`));
                connectRejectMessage.post(this.selfWorker);
                return;
            }

            const connection = new WorkerConnection({
                connectionId,
                endpointName,
                port: workerConnectRequest.port,
                server: this
            });

            this.endpointConnections[endpointName].add(connection);

            connection.port.onmessage = async (portEvent) => {
                try {
                    endpoint.onMessage(portEvent.data, connection);
                } catch (err) {                    
                    this.logger.error(() => `Endpoint ${endpointName} onMessage failed: ${err}`);
                }
            };

            try {
                endpoint.onConnect?.(connection);
            } catch (err) {
                this.logger.error(() => `Endpoint ${endpointName} onConnect failed: ${err}`);
                this.endpointConnections[endpointName].delete(connection);
                const connectRejectMessage = WorkerConnectReject.toMessage(new WorkerConnectReject(endpointName, connectionId, err instanceof Error ? err.message : String(err)));
                connectRejectMessage.post(this.selfWorker);
                return;
            }
            const connectAckMessage = WorkerConnectAck.toMessage(new WorkerConnectAck(endpointName, connectionId));
            connectAckMessage.post(this.selfWorker);
        };

        const workerReadyMessage = WorkerReady.toMessage(new WorkerReady(this.workerId, Object.keys(this.endpoints)));
        workerReadyMessage.post(this.selfWorker);
    }

    /**
     * @param {string} endpointName
     * @returns {Set<WorkerConnection>}
     */
    getConnections(endpointName) {
        return this.endpointConnections[endpointName] || EMPTY_SET;
    }

    /**
     * @param {WorkerConnection} connection
     */
    async removeConnection(connection) {
        const endpointSet = this.endpointConnections[connection.endpointName];
        if (endpointSet) {
            endpointSet.delete(connection);
        }

        const endpoint = this.endpoints[connection.endpointName];
        if (!endpoint) return;

        try {
            endpoint.onDisconnect?.(connection);
        } catch (err) {
            this.logger.error(() => `Endpoint ${connection.endpointName} onDisconnect failed: ${err}`);
        }
    }
}

const EMPTY_SET = new Set();

export class WorkerConnection {
    /**
     * @param {{
     *   connectionId: number,
     *   endpointName: string,
     *   port: MessagePort,
     *   server: WorkerServer
     * }} options
     */
    constructor(options) {
        this.connectionId = options.connectionId;
        this.endpointName = options.endpointName;
        this.port = options.port;
        this.server = options.server;

        /** @type {any} */
        this.state = undefined;
    }

    /**
     * @param {any} message
     * @param {Transferable[]} [transferList]
     */
    post(message, transferList = []) {
        this.port.postMessage(message, transferList);
    }

    async close() {
        try {
            this.port.close?.();
        } finally {
            await this.server.removeConnection(this);
        }
    }
}

// export class WorkerReadyMessage {
//     /**
//      * @param {string} workerId
//      * @param {string[]} supportedEndpoints
//      */
//     constructor(workerId, supportedEndpoints = []) {
//         this.workerId = workerId;
//         this.supportedEndpoints = supportedEndpoints;
//     }

//     toMessage() {
//         return {
//             kind: "worker_ready",
//             workerId: this.workerId,
//             supportedEndpoints: this.supportedEndpoints
//         };
//     }

//     /**
//      * @param {any} msg
//      * @returns {boolean}
//      */
//     static is(msg) {
//         return msg?.kind === "worker_ready";
//     }

//     /**
//      * @param {any} msg
//      * @returns {WorkerReadyMessage}
//      */
//     static fromWire(msg) {
//         if (!WorkerReadyMessage.is(msg)) {
//             throw new Error(`Invalid WorkerReadyMessage: ${msg?.kind}`);
//         }

//         return new WorkerReadyMessage(
//             msg.workerId,
//             Array.isArray(msg.supportedEndpoints) ? msg.supportedEndpoints : []
//         );
//     }
// }

// export class WorkerConnectRequestMessage {
//     /**
//      * @param {string} endpointName
//      * @param {number} connectionId
//      * @param {MessagePort} port
//      */
//     constructor(endpointName, connectionId, port) {
//         this.endpointName = endpointName;
//         this.connectionId = connectionId;
//         this.port = port;
//     }

//     toWire() {
//         return {
//             message: {
//                 kind: "worker_connect_request",
//                 endpointName: this.endpointName,
//                 connectionId: this.connectionId,
//                 port: this.port
//             },
//             transferList: [this.port]
//         };
//     }

//     /**
//      * @param {any} msg
//      * @returns {boolean}
//      */
//     static is(msg) {
//         return msg?.kind === "worker_connect_request";
//     }

//     /**
//      * @param {any} msg
//      * @returns {WorkerConnectRequestMessage}
//      */
//     static fromWire(msg) {
//         if (!WorkerConnectRequestMessage.is(msg)) {
//             throw new Error(`Invalid WorkerConnectRequestMessage: ${msg?.kind}`);
//         }

//         return new WorkerConnectRequestMessage(
//             msg.endpointName,
//             msg.connectionId,
//             msg.port
//         );
//     }
// }

// export class WorkerConnectAckMessage {
//     /**
//      * @param {string} endpointName
//      * @param {number} connectionId
//      */
//     constructor(endpointName, connectionId) {
//         this.endpointName = endpointName;
//         this.connectionId = connectionId;
//     }

//     toWire() {
//         return {
//             kind: "worker_connect_ack",
//             endpointName: this.endpointName,
//             connectionId: this.connectionId
//         };
//     }

//     /**
//      * @param {any} msg
//      * @returns {boolean}
//      */
//     static is(msg) {
//         return msg?.kind === "worker_connect_ack";
//     }

//     /**
//      * @param {any} msg
//      * @returns {WorkerConnectAckMessage}
//      */
//     static fromWire(msg) {
//         if (!WorkerConnectAckMessage.is(msg)) {
//             throw new Error(`Invalid WorkerConnectAckMessage: ${msg?.kind}`);
//         }

//         return new WorkerConnectAckMessage(
//             msg.endpointName,
//             msg.connectionId
//         );
//     }
// }

// export class WorkerConnectRejectMessage {
//     /**
//      * @param {string} endpointName
//      * @param {number} connectionId
//      * @param {string} error
//      */
//     constructor(endpointName, connectionId, error) {
//         this.endpointName = endpointName;
//         this.connectionId = connectionId;
//         this.error = error;
//     }

//     toWire() {
//         return {
//             kind: "worker_connect_reject",
//             endpointName: this.endpointName,
//             connectionId: this.connectionId,
//             error: this.error
//         };
//     }

//     /**
//      * @param {any} msg
//      * @returns {boolean}
//      */
//     static is(msg) {
//         return msg?.kind === "worker_connect_reject";
//     }

//     /**
//      * @param {any} msg
//      * @returns {WorkerConnectRejectMessage}
//      */
//     static fromWire(msg) {
//         if (!WorkerConnectRejectMessage.is(msg)) {
//             throw new Error(`Invalid WorkerConnectRejectMessage: ${msg?.kind}`);
//         }

//         return new WorkerConnectRejectMessage(
//             msg.endpointName,
//             msg.connectionId,
//             msg.error
//         );
//     }
// }