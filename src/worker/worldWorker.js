import { CHUNK_SIZE, CHUNK_SIZE_BIT_LEN, ChunkDataLoader } from "../chunk/chunk.js";
import { ChunkExtDataFactory } from "../chunk/extChunk.js";
import { ChunkGeneratorFactory } from "../gen/registry.js";
import { Vec3 } from "../geom.js";
import { Logger } from "../logging.js";
import { UIntExtWasmMesher } from "../mesh/uIntWasmMesher.js";
import { Settings } from "../settings.js";
import { Ticker } from "../ticker.js";
import { perfDiff } from "../utils.js";
import { BLOCK_LIGHT, MAX_BLOCK_ID } from "../blocks.js";
import { pos3ToKey } from "../world/chunkEntry.js";
import { LIGHT_MARGIN, Lighting } from "../world/lighting.js";
import { SkyTops } from "../world/skyTops.js";
import { WaterFlow } from "../world/waterFlow.js";
import { BlockEdit, ChunkCancel, ChunkLoadCenter, ChunkRequest, ChunkResponse } from "./common.js";
import { WorkerConnection, WorkerServer } from "./worker.js";

// The world worker owns the world: the block data (generated, with every edit applied), the simulation (flowing
// water) and the meshes. Clients (the main thread now, players over the network later) request chunks, send their
// edits and get chunk responses and updates; their own copy of the world only predicts their edits until an update
// confirms them. Settings come from the same URL parameters as the page's (World passes them on).

const workerId = new URL(self.location.href).searchParams.get("workerId");

const logger = new Logger("world worker " + workerId);
const generator = await ChunkGeneratorFactory.createForName(Settings.world.generator, Settings.world.seed);

const chunkDataLoader = new ChunkDataLoader(generator, new ChunkExtDataFactory());
const meshOptions = { cutout: Settings.render.cutoutLeaves };
const mesher = await (Settings.world.fastMesher ? UIntExtWasmMesher.createFastMesher(meshOptions) : UIntExtWasmMesher.createMesher(meshOptions));
const skyTops = new SkyTops(chunkDataLoader, generator);
const lighting = Settings.light.enabled ? await Lighting.create(chunkDataLoader, skyTops) : null;

/** what a block does to the light: solid (stops it), the block light it gives */
function lightKind(block) {
    return (block >>> 31) | BLOCK_LIGHT[block & (MAX_BLOCK_ID - 1)] << 1;
}

/**
 * A connected client: where its chunks go and the last of its edits applied.
 */
class Client {
    editAck = 0;

    /** @param {WorkerConnection} connection */
    constructor(connection) {
        this.connection = connection;
    }
}

/**
 * The authoritative world: blocks, the simulated range, the chunks changed since they were last sent. Implements the
 * water flow's {@link import("../world/waterFlow.js").BlockAccess}.
 */
class WorldState {
    /** @type {Map<WorkerConnection, Client>} */
    clients = new Map();
    /** @type {WaterFlow | null} */
    water = null;

    /** @type {Vec3 | null} null until the first client sets it */
    #center = null;
    #rangeSq = 0;
    #version = 0;
    /** chunks changed since they were last sent: key -> position
     * @type {Map<string, Vec3>} */
    #changed = new Map();
    /** key -> when it was last sent (performance.now)
     * @type {Map<string, number>} */
    #lastSent = new Map();

    /**
     * @param {WorkerConnection} connection
     * @returns {Client}
     */
    client(connection) {
        let client = this.clients.get(connection);
        if (client === undefined) {
            client = new Client(connection);
            this.clients.set(connection, client);
        }
        return client;
    }

    /**
     * The simulated range: the client's load range. One client for now; with more, the union of their ranges.
     * @param {Vec3} chunkPos
     * @param {number} rangeSq
     */
    setRange(chunkPos, rangeSq) {
        this.#center = chunkPos;
        this.#rangeSq = rangeSq;
        this.water?.resumeWaiting();
    }

    blockAt(ix, iy, iz) {
        return chunkDataLoader.getBlock(ix, iy, iz);
    }

    isLoaded(ix, iy, iz) {
        if (this.#center === null)
            return false;
        const dx = (ix >> CHUNK_SIZE_BIT_LEN) - this.#center.x;
        const dy = (iy >> CHUNK_SIZE_BIT_LEN) - this.#center.y;
        const dz = (iz >> CHUNK_SIZE_BIT_LEN) - this.#center.z;
        return dx * dx + dy * dy + dz * dz <= this.#rangeSq;
    }

    /**
     * Changes a block: the loader keeps the edit (later requests and regenerations get it), the chunks whose data
     * contains the block are sent again, the water around it is woken. Chunk space coordinates (iz is the height).
     * @returns {boolean} whether the block was changed
     */
    setBlock(ix, iy, iz, value) {
        value >>>= 0;
        const old = chunkDataLoader.getBlock(ix, iy, iz);
        if (old === value)
            return false;
        chunkDataLoader.setBlock(ix, iy, iz, value);
        // the chunks whose data has the block (32^3 plus a 1 block border from the neighbours); with a change to the
        // light, the ones whose light it can reach, and under a column whose sky top moved
        if (lightKind(old) === lightKind(value)) {
            this.#changedAround(ix, iy, iz, iz, 1);
        } else {
            this.#changedAround(ix, iy, iz, iz, LIGHT_MARGIN);
            const top = skyTops.onBlockChanged(ix, iy, iz, (value >>> 31) === 1);
            if (top !== null)
                this.#changedAround(ix, iy, Math.min(top.from, top.to), Math.max(top.from, top.to), LIGHT_MARGIN);
        }
        this.water?.onBlockChanged(ix, iy, iz);
        return true;
    }

    /**
     * Marks the chunks with a block within margin of the column ix, iy from height z0 to z1 as changed. For a taller
     * range (a sky top that moved, maybe by far, or from or to NO_TOP), only the chunks in the simulated range.
     */
    #changedAround(ix, iy, z0, z1, margin) {
        const column = z1 > z0;
        // not >>: NO_TOP - margin is out of the 32-bit range
        let cz0 = Math.floor((z0 - margin) / CHUNK_SIZE), cz1 = Math.floor((z1 + margin) / CHUNK_SIZE);
        if (column) {
            if (this.#center === null)
                return;
            const range = Math.ceil(Math.sqrt(this.#rangeSq));
            cz0 = Math.max(cz0, this.#center.z - range);
            cz1 = Math.min(cz1, this.#center.z + range);
        }
        for (let cz = cz0; cz <= cz1; cz++)
            for (let cy = (iy - margin) >> CHUNK_SIZE_BIT_LEN; cy <= (iy + margin) >> CHUNK_SIZE_BIT_LEN; cy++)
                for (let cx = (ix - margin) >> CHUNK_SIZE_BIT_LEN; cx <= (ix + margin) >> CHUNK_SIZE_BIT_LEN; cx++) {
                    if (column && !this.isLoaded(cx * CHUNK_SIZE, cy * CHUNK_SIZE, cz * CHUNK_SIZE))
                        continue;
                    const key = pos3ToKey(cx, cy, cz);
                    if (!this.#changed.has(key))
                        this.#changed.set(key, new Vec3(cx, cy, cz));
                }
    }

    /**
     * Sends the changed chunks that weren't sent within Settings.world.chunkUpdateInterval.
     * @param {number} now performance.now()
     */
    sendChanged(now) {
        if (this.#changed.size === 0)
            return;
        const interval = Settings.world.chunkUpdateInterval * 1000;
        for (const [key, chunkPos] of this.#changed) {
            if (now - (this.#lastSent.get(key) ?? -Infinity) < interval)
                continue;
            this.#changed.delete(key);
            this.sendChunk(chunkPos, 0, null);
        }
    }

    /**
     * Builds the chunk's data and mesh from the current state and sends them: to the requesting client, or to every
     * client for an update (clients that don't keep the chunk drop it).
     * @param {Vec3} chunkPos
     * @param {number} requestId 0 for an update
     * @param {Client | null} client null for every client
     */
    sendChunk(chunkPos, requestId, client) {
        const start = performance.now();
        const key = pos3ToKey(chunkPos.x, chunkPos.y, chunkPos.z);
        this.#lastSent.set(key, start);
        const targets = client === null ? this.clients.values() : [client];
        for (const target of targets) {
            const chunkData = chunkDataLoader.loadChunk(chunkPos);
            const light = lighting?.compute(chunkPos) ?? null;
            const meshData = mesher.createMesh(chunkPos, chunkData, light);
            // the light's own copy: the lighting's buffer is reused, the message's is transferred
            const response = new ChunkResponse(chunkPos, chunkData, meshData, requestId, ++this.#version, target.editAck, light?.slice() ?? null);
            ChunkResponse.toMessage(response).post(target.connection.port);
        }
        logger.debug(() => `sent chunk (${chunkPos.x}, ${chunkPos.y}, ${chunkPos.z}) ${requestId === 0 ? "update" : "response"} in ${perfDiff(start)} ms`);
    }
}

const world = new WorldState();
if (Settings.water.flow.enabled) {
    const flow = Settings.water.flow;
    world.water = new WaterFlow(world, Math.max(1, Math.round(flow.interval * Settings.simulation.tickRate)), flow.maxUpdatesPerTick);
}

/**
 * Requests are not processed when they arrive. They wait in `pending`, and one chunk is loaded per step, nearest to
 * the latest load center first; requests out of the load range are dropped in the same pass. Between steps the worker
 * yields, so new messages (a new center, cancels, edits) and the simulation run before the next chunk; otherwise they
 * would only be seen after all requests queued before them were processed.
 */
class ChunkLoadScheduler {
    /** @type {Map<number, {request: ChunkRequest, client: Client}>} requestId -> pending request */
    #pending = new Map();
    #center = new Vec3(0, 0, 0);
    #rangeSq = Infinity;
    #stepScheduled = false;
    // a message to ourselves yields without the minimum delay of nested setTimeout
    #yieldChannel = new MessageChannel();

    constructor() {
        this.#yieldChannel.port1.onmessage = () => this.#step();
    }

    /**
     * @param {ChunkRequest} request
     * @param {Client} client
     */
    add(request, client) {
        this.#pending.set(request.requestId, { request, client });
        this.#scheduleStep();
    }

    /** @param {Array<number>} requestIds */
    cancel(requestIds) {
        for (const requestId of requestIds)
            this.#pending.delete(requestId);
        logger.debug(() => `cancelled ${requestIds.length} requests, ${this.#pending.size} pending`);
    }

    /**
     * @param {Vec3} chunkPos
     * @param {number} rangeSq
     */
    setCenter(chunkPos, rangeSq) {
        this.#center = chunkPos;
        this.#rangeSq = rangeSq;
    }

    #scheduleStep() {
        if (this.#stepScheduled || this.#pending.size === 0)
            return;
        this.#stepScheduled = true;
        this.#yieldChannel.port2.postMessage(null);
    }

    #step() {
        this.#stepScheduled = false;
        const next = this.#takeNearest();
        if (next !== null) {
            try {
                world.sendChunk(next.request.chunkPos, next.request.requestId, next.client);
            } catch (err) {
                const p = next.request.chunkPos;
                logger.error(() => `loading chunk (${p.x}, ${p.y}, ${p.z}) failed: ${err}`);
            }
        }
        this.#scheduleStep();
    }

    #takeNearest() {
        let best = null;
        let bestDistSq = Infinity;
        const c = this.#center;
        const rangeSq = this.#rangeSq;
        for (const entry of this.#pending.values()) {
            const p = entry.request.chunkPos;
            const dx = p.x - c.x, dy = p.y - c.y, dz = p.z - c.z;
            const distSq = dx * dx + dy * dy + dz * dz;
            if (distSq > rangeSq) {
                // left the range; the requester dropped it by the same rule (deleting while iterating a Map is safe)
                this.#pending.delete(entry.request.requestId);
                continue;
            }
            if (distSq < bestDistSq) {
                bestDistSq = distSq;
                best = entry;
            }
        }
        if (best !== null)
            this.#pending.delete(best.request.requestId);
        return best;
    }
}

const scheduler = new ChunkLoadScheduler();

// the simulation clock, like the main thread's: ticks of a fixed length, the changed chunks sent after them
const ticker = new Ticker(Settings.simulation.tickRate, Settings.simulation.maxTicksPerFrame);
let lastStep = performance.now();
setInterval(() => {
    const now = performance.now();
    ticker.advance((now - lastStep) / 1000, () => world.water?.tick(ticker.tick));
    lastStep = now;
    world.sendChanged(now);
}, 1000 / Settings.simulation.tickRate);

const workerServer = new WorkerServer(self, workerId, {

    world: {
        /**
         * @param {any} data - Data related to the request.
         * @param {WorkerConnection} connection
         */
        onMessage: (data, connection) => {
            const client = world.client(connection);
            if (ChunkRequest.isType(data)) {
                scheduler.add(ChunkRequest.from(data), client);
            } else if (ChunkCancel.isType(data)) {
                scheduler.cancel(ChunkCancel.from(data).requestIds);
            } else if (BlockEdit.isType(data)) {
                // applied right away, so requests processed after this message already see the edit
                const edit = BlockEdit.from(data);
                world.setBlock(edit.blockPos.x, edit.blockPos.y, edit.blockPos.z, edit.value);
                client.editAck = edit.seq;
            } else if (ChunkLoadCenter.isType(data)) {
                const center = ChunkLoadCenter.from(data);
                scheduler.setCenter(center.chunkPos, center.rangeSq);
                world.setRange(center.chunkPos, center.rangeSq);
            } else {
                logger.warn(() => `unknown message type: ${data?.type}`);
            }
        }
    }
});

workerServer.start();
