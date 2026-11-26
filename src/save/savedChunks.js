import { decodeChunk, encodeChunk } from "./chunkCodec.js";

/**
 * A saved world's chunks in memory, in their saved form (chunkCodec.js), for ChunkDataLoader (its ChunkStore): read
 * from the world's database when the world is opened, so the loader, which works synchronously, never waits for it.
 * A chunk is a few KB saved, much less than its blocks.
 */
export class SavedChunks {
    /** chunk key ("cx,cy,cz") -> saved chunk
     * @type {Map<string, import("./chunkCodec.js").SavedChunk>} */
    #chunks;
    /** block names in saved chunks that aren't blocks any more, reported once each
     * @type {Set<string>} */
    #unknown = new Set();
    #onUnknown;

    /**
     * @param {Map<string, import("./chunkCodec.js").SavedChunk>} chunks
     * @param {(name: string) => void} [onUnknown] told about each block name that isn't a block any more
     */
    constructor(chunks = new Map(), onUnknown = () => {}) {
        this.#chunks = chunks;
        this.#onUnknown = onUnknown;
    }

    get size() {
        return this.#chunks.size;
    }

    /** @returns {Uint32Array | null} */
    blocks(key) {
        const saved = this.#chunks.get(key);
        if (saved === undefined)
            return null;
        const unknown = new Set();
        const data = decodeChunk(saved, unknown);
        for (const name of unknown) {
            if (!this.#unknown.has(name)) {
                this.#unknown.add(name);
                this.#onUnknown(name);
            }
        }
        return data;
    }

    /** @returns {import("./chunkCodec.js").SavedChunk} */
    put(key, data) {
        const saved = encodeChunk(data);
        this.#chunks.set(key, saved);
        return saved;
    }

    /**
     * Every saved chunk's position and its highest solid block (world/skyTops.js starts the sky light's scan there).
     * @returns {Iterable<{cx: number, cy: number, cz: number, top: number | null}>}
     */
    *tops() {
        for (const [key, saved] of this.#chunks) {
            const [cx, cy, cz] = key.split(",").map(Number);
            yield { cx, cy, cz, top: saved.top };
        }
    }
}
