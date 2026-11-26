import { FORMAT_VERSION, upgrade } from "./format.js";

/**
 * Where the player was: the feet position, where the camera looked, how it moved.
 * @typedef {object} PlayerState
 * @property {number} x
 * @property {number} y
 * @property {number} z the feet's height
 * @property {number} yaw degrees (Camera)
 * @property {number} pitch degrees
 * @property {"walk" | "fly"} mode
 * @property {boolean} noclip
 * @property {number} slot the item bar's selected slot
 */

/**
 * A saved world: what it is and where the player left it. Its chunks are saved apart (save/worldStore.js), only the
 * ones that differ from what the generator makes (docs/proposals/world-saving.md). Plain data, stored as it is.
 */
export class WorldInfo {
    /** @type {string} unique, the key of its record and chunks */
    id;
    /** @type {string} */
    name;
    /** @type {number} an integer, every generator takes it */
    seed;
    /** @type {string} the generator's name (gen/registry.js) */
    generator;
    /** @type {number} the version of the saved form it was last saved with (save/format.js) */
    formatVersion = FORMAT_VERSION;
    /** @type {number} when it was made, ms since 1970 (Date.now) */
    created;
    /** @type {number} when it was last played, ms since 1970 */
    lastPlayed;
    /** @type {PlayerState | null} null until the first save: the game starts at Settings.camera.startPosition */
    player = null;

    /**
     * A new world.
     * @param {string} name
     * @param {number} seed
     * @param {string} generator
     * @returns {WorldInfo}
     */
    static create(name, seed, generator) {
        const info = new WorldInfo();
        info.id = crypto.randomUUID();
        info.name = name;
        info.seed = seed;
        info.generator = generator;
        info.created = info.lastPlayed = Date.now();
        return info;
    }

    /**
     * A world as it was stored, an older version converted.
     * @param {object} record
     * @returns {WorldInfo}
     * @throws if it was saved by a newer version of the game
     */
    static fromRecord(record) {
        const data = structuredClone(record);
        upgrade(data.formatVersion, "world", data);
        const info = Object.assign(new WorldInfo(), data);
        info.formatVersion = FORMAT_VERSION;
        return info;
    }

    /** @returns {object} plain data to store */
    toRecord() {
        return { ...this };
    }
}
