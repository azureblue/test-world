import { Chunk, CHUNK_SIZE_BIT_POS, ChunkData, UIntMesh } from "./chunk.js";
import { ivec2, vec2, vec3 } from "./geom.js";
import { Int32Buffer, Logger, perfDiff, UInt32Buffer } from "./utils.js";
const logger = new Logger("World");
const CHUNK_RENDER_DIST = 14;
const CHUNK_RENDER_DIST_SQ = CHUNK_RENDER_DIST * CHUNK_RENDER_DIST;

class ChunkEntry {
    chunk;
    loaded = false;
    shouldRemove = false;
}

/**
 * @param {number} x [-32767, 32767]
 * @param {number} y [-32767, 32767]
 */
function posToKey(x, y) {
    return (x + 32767) << 16 | (y + 32767);
}

function keyToX(key) {
    return (key >>> 16) - 32767;
}

function keyToY(key) {
    return (key & 0xFFFF) - 32767;
}

class ChunkLoadPromise {

    constructor(key) {
        this.key = key;
        this.resolve = null;
        this.promise = new Promise((res, rej) => {
            this.resolve = (chunk) => {
                res(chunk);
            }
        });
    }
}

export class World {
    #frame = 0;
    #chunkLoader
    #tmpBuffer = new Int32Buffer(1000);
    #pos = vec2();
    #chunkPos = ivec2(0xFFFFFFFF, 0xFFFFFFFF);
    #rangeDeltas;

    /** @type {Map<number, ChunkEntry>} */
    #chunks = new Map();
    
    /** @type {Map<number, object} */
    #chunkDataQueue = new Map();

    /**@type {ChunkLoadPromise} */
    #currentChunkPromise = null;

    #chunkKeysSorted;
    
    /**
     * @param {Worker} chunkLoader 
     */
    constructor(chunkLoader) {
        this.#chunkLoader = chunkLoader;
        this.#chunkLoader.onmessage = (me) => this.onChunk(me.data);
        const tmpBuff = new UInt32Buffer(512);
        tmpBuff.put(posToKey(0, 0));
        for (let r = 1; r < CHUNK_RENDER_DIST; r++) {
            const rangeFrom = -r;
            const rangeTo = r;
            const rSq = r * r;
            for (let horizontal = rangeFrom; horizontal <= r; horizontal++) {
                if ((horizontal * horizontal + rSq) > CHUNK_RENDER_DIST_SQ)
                    continue;
                tmpBuff.put(posToKey(horizontal, -r));
                tmpBuff.put(posToKey(horizontal, r));
            }

            for (let vert = rangeFrom + 1; vert <= rangeTo - 1; vert++) {
                if ((vert * vert + rSq) > CHUNK_RENDER_DIST_SQ)
                    continue;
                tmpBuff.put(posToKey(-r, vert));
                tmpBuff.put(posToKey(r, vert));
            }
        }
        this.#rangeDeltas = tmpBuff.trimmed();
        this.#rangeDeltas.sort((a, b) => {
            const ax = keyToX(a);
            const bx = keyToX(b);
            const ay = keyToY(a);
            const by = keyToY(b);
            return (ax * ax + ay * ay) - (bx * bx + by * by);
        })
        this.#chunkKeysSorted = new Int32Buffer(this.#rangeDeltas.length);
    }

    onChunk(data) {
        const chunkPos = vec2(data.chunkPos[0], data.chunkPos[1]);
        const key = posToKey(chunkPos.x, chunkPos.y);
        if (this.#currentChunkPromise != null && this.#currentChunkPromise.key == key)
            this.processChunkData(data);
        else
            this.#chunkDataQueue.set(key, data);
    }

    processChunkData(data) {
        const chunkPos = vec2(data.chunkPos[0], data.chunkPos[1]);
        const key = posToKey(chunkPos.x, chunkPos.y);
        logger.info(`got chunk (${chunkPos.x}, ${chunkPos.y})`);
        if (!this.#chunks.has(key)) {
            logger.debug("missing entry for key: " + key);
            return;
        }
        const entry = this.#chunks.get(key);
        const now = performance.now();
        const chunkData = new ChunkData();
        chunkData.data.set(data.rawChunkData);
        const translation = data.meshTranslation;
        const mesh = UIntMesh.load(data.rawMeshData, vec3(...translation));
        const chunk = new Chunk(chunkPos, chunkData, mesh);
        entry.chunk = chunk;
        entry.loaded = true;
        // logger.debug(`uploading mesh time: ${perfDiff(now)}`);
        if (this.#currentChunkPromise !== null) {
            if (this.#currentChunkPromise.key === key) {
                this.#currentChunkPromise.resolve(chunk);
                this.#currentChunkPromise = null;
            }
        }
    }

    moveTo(x, y) {
        this.#pos.x = x;
        this.#pos.y = y;
        const cx = Math.floor(x) >> CHUNK_SIZE_BIT_POS;     
        const cy = (-Math.ceil(y)) >> CHUNK_SIZE_BIT_POS;
        const changed = (this.#chunkPos.x != cx || this.#chunkPos.y != cy);
        
        this.#chunkPos.x = cx;
        this.#chunkPos.y = cy;
        if (changed) {
            this.updateChunksInRange();
        }
    }

    updateChunksInRange() {
        // if (this.#frame == 1) {
            this.#tmpBuffer.reset();
            for (const key of this.#chunks.keys()) {
                this.#tmpBuffer.put(key);
            }
        // } else if (this.#frame == 2) {
            // const now = performance.now();
            for (let i = 0; i < this.#tmpBuffer.length; i++) {
                const key = this.#tmpBuffer.array[i];
                const x = keyToX(key);
                const y = keyToY(key);
                const dx = x - this.#chunkPos.x;
                const dy = y - this.#chunkPos.y;
                if (dx * dx + dy * dy > CHUNK_RENDER_DIST_SQ) {
                    logger.info("removing chunk: " + x + " " + y);
                    this.#chunks.delete(key);
                }
            }
            // logger.debug(`checking chunks time: ${perfDiff(now)}`);
        // } else if (this.#frame == 0) {
            this.#chunkKeysSorted.reset();
            // const now = performance.now();
            for (const delta of this.#rangeDeltas) {
                const dx = keyToX(delta);
                const dy = keyToY(delta);
                const cx = this.#chunkPos.x + dx;
                const cy = this.#chunkPos.y + dy;
                const key = posToKey(cx, cy);
                this.#chunkKeysSorted.put(key);
                if (!this.#chunks.has(key)) {
                    const entry = new ChunkEntry();
                    logger.info(`requesting chunk  (${cx}, ${cy})`);
                    this.#chunks.set(key, entry);
                    this.#chunkLoader.postMessage({ cx: cx, cy: cy })
                }
            }
            // logger.debug(`requesting new chunks time: ${perfDiff(now)}`);
        // } 
    }

    /**@returns {Chunk} */
    async getCurrentChunk() {
        const key = posToKey(this.#chunkPos.x, this.#chunkPos.y);
        const entry = this.#chunks.get(key);
        if (entry === undefined) {
            logger.error("missing entry for current chunk");
            return null;
        }

        if (entry.loaded) {
            return entry.chunk;
        } else {
            this.#currentChunkPromise = new ChunkLoadPromise(key);
            return await this.#currentChunkPromise.promise;
        }
    }

    update() {
      if (this.#frame > 2) {
            if (this.#chunkDataQueue.size > 0) {
                const entry = this.#chunkDataQueue.entries().next().value;
                this.#chunkDataQueue.delete(entry[0]);
                this.processChunkData(entry[1]);
            }
        }
        this.#frame++;
        if (this.#frame == 10) {
            this.#frame = 0;
        }
    }

    render(renderChunk) {
        for (let i = this.#chunkKeysSorted.length; i >= 0; i--) {
            const key = this.#chunkKeysSorted.array[i];
            const value = this.#chunks.get(key);
            if (value !== undefined && value.loaded) {
                renderChunk(value.chunk);
            }
        }
        // for (const entry of this.#chunks.entries()) {
        //     const value = entry[1];
        //     if (!value.loaded)
        //         continue;
        //     renderChunk(value.chunk);
        // }
    }
}
