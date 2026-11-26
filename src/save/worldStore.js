import { WorldInfo } from "./worldInfo.js";

const DB_NAME = "test-world";
const DB_VERSION = 1;

/**
 * The saved worlds, in the browser's IndexedDB (works in the page and in workers). Two stores: "worlds", the records
 * (WorldInfo) by id; "chunks", the saved chunks (save/chunkCodec.js) by [world id, cx, cy, cz]. The page writes the
 * records, the world worker the chunks.
 */
export class WorldStore {
    /** @type {IDBDatabase} */
    #db;

    /** @param {IDBDatabase} db */
    constructor(db) {
        this.#db = db;
    }

    /** @returns {Promise<WorldStore>} */
    static async open() {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains("worlds"))
                db.createObjectStore("worlds", { keyPath: "id" });
            if (!db.objectStoreNames.contains("chunks"))
                db.createObjectStore("chunks");
        };
        return new WorldStore(await done(request));
    }

    /**
     * Every world, the last played first. One stored by a newer version of the game is left out (and logged).
     * @returns {Promise<WorldInfo[]>}
     */
    async listWorlds() {
        const records = await done(this.#db.transaction("worlds").objectStore("worlds").getAll());
        const worlds = [];
        for (const record of records) {
            try {
                worlds.push(WorldInfo.fromRecord(record));
            } catch (err) {
                console.warn(`world "${record.name}": ${err.message}`);
            }
        }
        return worlds.sort((a, b) => b.lastPlayed - a.lastPlayed);
    }

    /**
     * @param {string} id
     * @returns {Promise<WorldInfo | null>}
     * @throws if it was stored by a newer version of the game
     */
    async getWorld(id) {
        const record = await done(this.#db.transaction("worlds").objectStore("worlds").get(id));
        return record === undefined ? null : WorldInfo.fromRecord(record);
    }

    /** @param {WorldInfo} info */
    async putWorld(info) {
        const transaction = this.#db.transaction("worlds", "readwrite");
        transaction.objectStore("worlds").put(info.toRecord());
        await committed(transaction);
    }

    /** a world and all its chunks */
    async deleteWorld(id) {
        const transaction = this.#db.transaction(["worlds", "chunks"], "readwrite");
        transaction.objectStore("worlds").delete(id);
        transaction.objectStore("chunks").delete(chunkRange(id));
        await committed(transaction);
    }

    /**
     * A world's saved chunks.
     * @param {string} worldId
     * @returns {Promise<Map<string, import("./chunkCodec.js").SavedChunk>>} chunk key ("cx,cy,cz") -> saved chunk
     */
    async loadChunks(worldId) {
        const store = this.#db.transaction("chunks").objectStore("chunks");
        const [keys, values] = await Promise.all([done(store.getAllKeys(chunkRange(worldId))), done(store.getAll(chunkRange(worldId)))]);
        const chunks = new Map();
        keys.forEach((key, i) => chunks.set(`${key[1]},${key[2]},${key[3]}`, values[i]));
        return chunks;
    }

    /**
     * Writes chunks of a world, all or none.
     * @param {string} worldId
     * @param {Array<{position: {x: number, y: number, z: number}, saved: import("./chunkCodec.js").SavedChunk}>} chunks
     */
    async putChunks(worldId, chunks) {
        const transaction = this.#db.transaction("chunks", "readwrite");
        const store = transaction.objectStore("chunks");
        for (const { position, saved } of chunks)
            store.put(saved, [worldId, position.x, position.y, position.z]);
        await committed(transaction);
    }
}

/** the keys of a world's chunks: [id, numbers...] sort after [id] and before [id, []] (arrays after numbers) */
function chunkRange(worldId) {
    return IDBKeyRange.bound([worldId], [worldId, []]);
}

/** @returns {Promise<any>} the request's result */
function done(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/** @returns {Promise<void>} when the transaction is committed */
function committed(transaction) {
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = transaction.onabort = () => reject(transaction.error ?? new Error("transaction aborted"));
    });
}
