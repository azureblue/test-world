import { Chunk, CHUNK_SIZE, ChunkData, UIntMesh } from "./chunk.js";
import { vec2, Vec3 } from "./geom.js";
import { Int32Buffer, Logger } from "./utils.js";
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
    #chunkLoader
    #tmpBuffer = new Int32Buffer(1000);
    #pos = vec2();
    #chunkPos = new Int32Array(2);

    /** @type {Map<number, ChunkEntry>} */
    #chunks = new Map();

    /**@type {ChunkLoadPromise} */
    #currentChunkPromise = null;
    /*
        { 
            data: chunkSpec.chunkData.data,
            chunkPos: [req.cx, req.cy],
            meshData: chunkSpec.meshData.input,
            meshTranslation: chunkSpec.meshData.mTranslation._values
        }
    */

    /**
     * @param {Worker} chunkLoader 
     */
    constructor(chunkLoader) {
        this.#chunkLoader = chunkLoader;
        this.#chunkLoader.onmessage = (me) => {
            const data = me.data;
            const chunkPos = vec2(data.chunkPos[0], data.chunkPos[1]);
            const key = posToKey(chunkPos.x, chunkPos.y);
            logger.info(`got chunk (${chunkPos.x}, ${chunkPos.y})`);
            if (!this.#chunks.has(key)) {
                logger.info("missing entry for key: " + key);
                return;
            }
            const chunkData = new ChunkData();
            chunkData.data.set(data.data);
            const mTranslation = data.meshTranslation;
            const mesh = new UIntMesh(new Vec3(mTranslation[0], mTranslation[1], mTranslation[2]), data.meshData);

            const chunk = new Chunk(chunkData, vec2(chunkPos.x, chunkPos.y), mesh);
            const entry = this.#chunks.get(key);
            entry.chunk = chunk;
            entry.loaded = true;
            if (this.#currentChunkPromise !== null) {
                if (this.#currentChunkPromise.key === key) {
                    this.#currentChunkPromise.resolve(chunk);
                    this.#currentChunkPromise = null;
                }
            }
        }
    }

    moveTo(x, y) {
        this.#pos.x = x;
        this.#pos.y = y;
        this.#chunkPos[0] = Math.floor(x / CHUNK_SIZE);
        this.#chunkPos[1] = Math.floor(-y / CHUNK_SIZE);
    }


    /**@returns {Chunk} */
    async getCurrentChunk() {
        const key = posToKey(this.#chunkPos[0], this.#chunkPos[1]);
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

    updateChunks() {
        this.#tmpBuffer.reset();
        for (const key of this.#chunks.keys()) {
            const x = keyToX(key);
            const y = keyToY(key);
            const dx = x - this.#chunkPos[0];
            const dy = y - this.#chunkPos[1];
            if (dx * dx + dy * dy > CHUNK_RENDER_DIST_SQ) {
                this.#tmpBuffer.put(key);
            }
        }
        for (let i = 0; i < this.#tmpBuffer.length; i++) {
            const key = this.#tmpBuffer.array[i];
            const x = keyToX(key);
            const y = keyToY(key);
            logger.info("removing chunk: " + x + " " + y);
            this.#chunks.delete(key);
        }

        for (let cx = this.#chunkPos[0] - CHUNK_RENDER_DIST; cx < this.#chunkPos[0] + CHUNK_RENDER_DIST; cx++)
            for (let cy = this.#chunkPos[1] - CHUNK_RENDER_DIST; cy < this.#chunkPos[1] + CHUNK_RENDER_DIST; cy++) {
                const dx = cx - this.#chunkPos[0];
                const dy = cy - this.#chunkPos[1];
                const key = posToKey(cx, cy);
                if (dx * dx + dy * dy <= CHUNK_RENDER_DIST_SQ) {
                    if (!this.#chunks.has(key)) {
                        const entry = new ChunkEntry();
                        logger.info(`requesting chunk  (${cx}, ${cy})`);
                        this.#chunks.set(key, entry);
                        this.#chunkLoader.postMessage({ cx: cx, cy: cy });
                    }
                }
            }
    }

    render(renderChunk) {
        for (const entry of this.#chunks.entries()) {
            const value = entry[1];
            if (!value.loaded)
                continue;
            renderChunk(value.chunk);
        }
    }
}
