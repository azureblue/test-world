import { BLOCK_IDS, blockState, getBlockById, isLiquid } from "../blocks.js";
import { CHUNK_SIZE } from "../chunk/chunk.js";
import { FORMAT_VERSION, upgrade } from "./format.js";

const CELLS = CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE;

/**
 * A chunk as it's saved (docs/proposals/world-saving.md): the distinct blocks in it by name and state, not by id, so
 * blocks added, removed or renumbered in blocks.json don't change it; the cells as runs of palette indices.
 * @typedef {object} SavedChunk
 * @property {number} version the format version it was saved with (save/format.js)
 * @property {Array<[string, number]>} palette block name (a key of BLOCK_IDS) and state (blockState)
 * @property {Uint16Array} runs pairs of a run length and a palette index, in the chunk's cell order (ChunkBlockData)
 * @property {number | null} top the highest solid block's height in the chunk (0..31), null if none: the sky light's
 *   scan starts above it (world/skyTops.js) without reading the chunk
 */

/**
 * @param {Uint32Array} data a chunk's blocks (ChunkBlockData.data)
 * @returns {SavedChunk}
 */
export function encodeChunk(data) {
    /** block value -> palette index */
    const indices = new Map();
    /** @type {Array<[string, number]>} */
    const palette = [];
    const runs = [];
    let top = null;
    let runValue = -1, runLength = 0;
    for (let i = 0; i < CELLS; i++) {
        const block = data[i] >>> 0;
        if (block >>> 31)
            top = Math.max(top ?? 0, Math.floor(i / (CHUNK_SIZE * CHUNK_SIZE)));
        let index = indices.get(block);
        if (index === undefined) {
            index = palette.length;
            indices.set(block, index);
            const kind = getBlockById(block);
            if (kind === undefined)
                throw new Error(`chunk to save has an unknown block id ${block & 0xFFFF} (value ${block.toString(16)})`);
            palette.push([kind.name, blockState(block)]);
        }
        if (index === runValue && runLength < 0xFFFF) {
            runLength++;
            continue;
        }
        if (runLength > 0)
            runs.push(runLength, runValue);
        runValue = index;
        runLength = 1;
    }
    runs.push(runLength, runValue);
    return { version: FORMAT_VERSION, palette, runs: Uint16Array.from(runs), top };
}

/**
 * The blocks of a saved chunk, with the current ids and kinds (blocks.json); an older version is converted first.
 * @param {SavedChunk} saved
 * @param {Set<string>} [unknown] gets the names that aren't blocks any more: water with its state if it had water
 *   (a plant in water), rock otherwise
 * @returns {Uint32Array}
 * @throws if it was saved by a newer version of the game
 */
export function decodeChunk(saved, unknown = new Set()) {
    const palette = saved.palette.map(([name, state]) => [name, state]);
    upgrade(saved.version, "palette", palette);
    const values = palette.map(([name, state]) => {
        if (Object.hasOwn(BLOCK_IDS, name))
            return (BLOCK_IDS[name] | state) >>> 0;
        unknown.add(name);
        return isLiquid(state) ? (BLOCK_IDS.WATER | state) >>> 0 : BLOCK_IDS.ROCK >>> 0;
    });
    const data = new Uint32Array(CELLS);
    const runs = saved.runs;
    let at = 0;
    for (let r = 0; r < runs.length; r += 2) {
        data.fill(values[runs[r + 1]], at, at + runs[r]);
        at += runs[r];
    }
    if (at !== CELLS)
        throw new Error(`saved chunk with ${at} cells, not ${CELLS}`);
    return data;
}
