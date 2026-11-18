import { BLOCK_HEIGHT_FULL, BLOCK_IDS, blockHeight, canFlood, drained, flooded, isFlowing, isLiquid, isSolid, isSource, WATER_SURFACE_LEVEL } from "../blocks.js";
import { CHUNK_SIZE_BIT_LEN } from "../chunk/chunk.js";
import { pos3ToKey } from "./chunkEntry.js";

/**
 * What the water flow needs from the world, chunk space coordinates (iz is the height). The world worker's world
 * implements it (worker/worldWorker.js); a server's world could too.
 * @typedef {object} BlockAccess
 * @property {(ix: number, iy: number, iz: number) => number} blockAt
 * @property {(ix: number, iy: number, iz: number, value: number) => boolean} setBlock
 * @property {(ix: number, iy: number, iz: number) => boolean} isLoaded whether the chunk holding the block is
 *   simulated (blocks outside aren't read or changed)
 */

/** horizontal neighbours */
const SIDES = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** the level flowing water gets next to a source or a falling column; each further block one less */
const SPREAD_LEVEL = WATER_SURFACE_LEVEL - 1;

/** what a block in a chunk that isn't loaded reads as: no water, holds water up */
const UNLOADED = BLOCK_IDS.ROCK >>> 0;

/**
 * Flowing water with levels (the block height, 1/8 of a block, see blocks.js), like Minecraft's:
 *
 * - Source water (generated, placed) never drains. Its level is 7/8 under air (the surface) and full under water.
 * - Flowing water (the flowing bit) is what a cell gets from its neighbours, worked out again whenever they change:
 *   - under water (falling): full;
 *   - beside water that spreads sideways: the highest level they give, a source or a falling column 6/8, flowing
 *     water one less than its own; flowing water spreads sideways only resting on solid ground, so a falling column
 *     doesn't spread before it lands, nor over a lake it falls into (sources spread anywhere);
 *   - nothing feeding it: it drains (a plant in it stays).
 *   So water reaches 6 blocks from a source, falls, and drains step by step when its source is gone.
 * - A cell between two or more sources, on solid ground or on a source, becomes a source itself: a hole dug in a
 *   lake fills up for good. A hole dug next to a lake gets a curtain of falling water along the lake and flowing
 *   water on its floor, as in Minecraft.
 * Plants don't stop water: it flows into their cells and they stay in it ({@link flooded}).
 *
 * Generated water stays still until a block changes next to it: a change wakes the cells whose water can depend on
 * it, and each woken cell is updated {@link flowTicks} ticks later. Changes from updates wake cells too, so the flow
 * goes on from them.
 *
 * Built to run on a server later: it works on simulation ticks and the {@link BlockAccess} interface only, is
 * deterministic (cells are updated in the order they were woken, no randomness, no frame time), and what it does are
 * ordinary block edits, which a client would just apply.
 *
 * A block in a chunk that isn't loaded reads as solid, and the cell reading it waits for that chunk: when it's
 * loaded ({@link resumeWaiting}), the cell and its neighbours are updated again.
 */
export class WaterFlow {
    #blocks;
    #flowTicks;
    #maxUpdatesPerTick;
    #tick = 0;
    /** tick -> cells to update in it, in the order they were woken
     * @type {Map<number, Map<string, number[]>>} */
    #scheduled = new Map();
    /** chunk key ({@link pos3ToKey}) -> the chunk's position and the cells waiting for it to load
     * @type {Map<string, {cx: number, cy: number, cz: number, cells: Map<string, number[]>}>} */
    #waiting = new Map();

    /**
     * @param {BlockAccess} blocks
     * @param {number} flowTicks ticks per flow step
     * @param {number} maxUpdatesPerTick cells updated in one tick at most, the rest move to the next tick in order
     */
    constructor(blocks, flowTicks, maxUpdatesPerTick) {
        this.#blocks = blocks;
        this.#flowTicks = flowTicks;
        this.#maxUpdatesPerTick = maxUpdatesPerTick;
    }

    /** the number of cells scheduled for an update, for stats */
    get activeCells() {
        let count = 0;
        for (const cells of this.#scheduled.values())
            count += cells.size;
        return count;
    }

    /** the number of cells waiting for chunks to load, for stats */
    get waitingCells() {
        let count = 0;
        for (const chunk of this.#waiting.values())
            count += chunk.cells.size;
        return count;
    }

    /**
     * A block changed: wakes the cells whose water can depend on it: the cell, above, below, beside, and beside the
     * cell above (whether water above it spreads sideways depends on it).
     */
    onBlockChanged(ix, iy, iz) {
        this.#wake(ix, iy, iz);
        this.#wake(ix, iy, iz + 1);
        this.#wake(ix, iy, iz - 1);
        for (const [dx, dy] of SIDES) {
            this.#wake(ix + dx, iy + dy, iz);
            this.#wake(ix + dx, iy + dy, iz + 1);
        }
    }

    /**
     * Water waiting for chunks that are loaded now goes on. Call when chunks got loaded.
     */
    resumeWaiting() {
        for (const [key, chunk] of this.#waiting) {
            if (!this.#blocks.isLoaded(chunk.cx << CHUNK_SIZE_BIT_LEN, chunk.cy << CHUNK_SIZE_BIT_LEN, chunk.cz << CHUNK_SIZE_BIT_LEN))
                continue;
            this.#waiting.delete(key);
            for (const cell of chunk.cells.values())
                this.onBlockChanged(cell[0], cell[1], cell[2]);
        }
    }

    /**
     * Runs one simulation tick.
     * @param {number} tick the tick number, one more than in the last call
     */
    tick(tick) {
        this.#tick = tick;
        const cells = this.#scheduled.get(tick);
        if (cells === undefined)
            return;
        this.#scheduled.delete(tick);
        // new cells are scheduled flowTicks (>= 1) later, never into this tick
        let updated = 0;
        /** @type {Map<string, number[]>} */
        let rest = null;
        for (const [key, cell] of cells) {
            if (updated === this.#maxUpdatesPerTick) {
                rest ??= new Map();
                rest.set(key, cell);
                continue;
            }
            this.#update(cell[0], cell[1], cell[2]);
            updated++;
        }
        if (rest !== null) {
            // the rest goes first in the next tick
            const next = this.#scheduled.get(tick + 1);
            if (next !== undefined)
                for (const [key, cell] of next)
                    if (!rest.has(key))
                        rest.set(key, cell);
            this.#scheduled.set(tick + 1, rest);
        }
    }

    #update(ix, iy, iz) {
        if (!this.#blocks.isLoaded(ix, iy, iz)) {
            this.#wait(ix, iy, iz, ix, iy, iz);
            return;
        }
        const cell = this.#blocks.blockAt(ix, iy, iz);
        if (!(isLiquid(cell) || canFlood(cell)))
            return;
        const above = this.#read(ix, iy, iz + 1, ix, iy, iz);
        const below = this.#read(ix, iy, iz - 1, ix, iy, iz);
        let next;
        if (isSource(cell)) {
            // the level follows what's above: full under water, the surface under air or a plant, kept under a block
            const level = isLiquid(above) ? BLOCK_HEIGHT_FULL : canFlood(above) ? WATER_SURFACE_LEVEL : blockHeight(cell);
            next = flooded(cell, level);
        } else {
            next = this.#flowingState(ix, iy, iz, cell, above, below);
        }
        if (next !== cell)
            this.#blocks.setBlock(ix, iy, iz, next);
    }

    /**
     * What a cell that isn't a source gets from its neighbours (see the class description).
     * @returns {number} the new block
     */
    #flowingState(ix, iy, iz, cell, above, below) {
        let sources = 0;
        let level = 0;
        for (const [dx, dy] of SIDES) {
            const side = this.#read(ix + dx, iy + dy, iz, ix, iy, iz);
            if (!isLiquid(side))
                continue;
            if (isSource(side)) {
                sources++;
                level = Math.max(level, SPREAD_LEVEL);
                continue;
            }
            // flowing water spreads sideways only resting on solid ground (not over a lake it fell into)
            if (!isSolid(this.#read(ix + dx, iy + dy, iz - 1, ix, iy, iz)))
                continue;
            level = Math.max(level, isFalling(side) ? SPREAD_LEVEL : blockHeight(side) - 1);
        }
        if (sources >= 2 && (isSolid(below) || isSource(below)))
            return flooded(cell, isLiquid(above) ? BLOCK_HEIGHT_FULL : WATER_SURFACE_LEVEL);
        if (isLiquid(above))
            return flooded(cell, BLOCK_HEIGHT_FULL, true);
        if (level >= 1)
            return flooded(cell, level, true);
        return isLiquid(cell) ? drained(cell) : cell;
    }

    /**
     * Reads a block; one in a chunk that isn't loaded reads as UNLOADED, and the cell (ix, iy, iz) waits for it.
     * @returns {number}
     */
    #read(x, y, z, ix, iy, iz) {
        if (!this.#blocks.isLoaded(x, y, z)) {
            this.#wait(ix, iy, iz, x, y, z);
            return UNLOADED;
        }
        return this.#blocks.blockAt(x, y, z);
    }

    #wake(ix, iy, iz) {
        const blocks = this.#blocks;
        if (!blocks.isLoaded(ix, iy, iz))
            return;
        const block = blocks.blockAt(ix, iy, iz);
        if (isLiquid(block) || canFlood(block))
            this.#schedule(cellKey(ix, iy, iz), [ix, iy, iz], this.#tick + this.#flowTicks);
    }

    /**
     * @param {string} key
     * @param {number[]} cell
     * @param {number} tick
     */
    #schedule(key, cell, tick) {
        let cells = this.#scheduled.get(tick);
        if (cells === undefined) {
            cells = new Map();
            this.#scheduled.set(tick, cells);
        }
        cells.set(key, cell);
    }

    /** the cell (ix, iy, iz) waits for the chunk holding (wx, wy, wz) */
    #wait(ix, iy, iz, wx, wy, wz) {
        const cx = wx >> CHUNK_SIZE_BIT_LEN, cy = wy >> CHUNK_SIZE_BIT_LEN, cz = wz >> CHUNK_SIZE_BIT_LEN;
        const chunkKey = pos3ToKey(cx, cy, cz);
        let chunk = this.#waiting.get(chunkKey);
        if (chunk === undefined) {
            chunk = { cx, cy, cz, cells: new Map() };
            this.#waiting.set(chunkKey, chunk);
        }
        chunk.cells.set(cellKey(ix, iy, iz), [ix, iy, iz]);
    }
}

function cellKey(ix, iy, iz) {
    return ix + "," + iy + "," + iz;
}

/** flowing water under water: full, doesn't spread sideways until it lands */
function isFalling(block) {
    return isFlowing(block) && blockHeight(block) === BLOCK_HEIGHT_FULL;
}
