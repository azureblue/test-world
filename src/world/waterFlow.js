import { BLOCK_HEIGHT_FULL, blockHeight, canFlood, flooded, isLiquid } from "../blocks.js";
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

/** horizontal neighbours, in the order water spreads to them */
const SIDES = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/**
 * Flowing water. Water has a level (the block height, 1/8 of a block, see blocks.js): full below other water, 7/8 at
 * the surface. A water cell flows into the empty cell below it as full water; if it can't (ground, water below), it
 * spreads into the empty cells next to it at its own level. Plants don't stop it: it flows into their cells and they
 * stay in the water ({@link flooded}). Water with water above it and a lower
 * level fills up to full. Levels don't drop with distance yet, so water spreads over open ground without end.
 *
 * Generated water stays still until a block changes next to it: a change wakes the changed cell and the water around
 * it (above, below, beside), and woken water flows one step {@link flowTicks} ticks later. The new water cells are
 * block changes too, so the flow goes on from them.
 *
 * Built to run on a server later: it works on simulation ticks and the {@link BlockAccess} interface only, is
 * deterministic (cells are updated in the order they were woken, no randomness, no frame time), and what it does are
 * ordinary block edits, which a client would just apply.
 *
 * Water in a chunk that isn't loaded, or flowing into one, waits for that chunk ({@link resumeWaiting}).
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
     * A block changed: wakes the cell and the water around it.
     */
    onBlockChanged(ix, iy, iz) {
        this.#wake(ix, iy, iz);
        this.#wake(ix, iy, iz + 1);
        this.#wake(ix, iy, iz - 1);
        for (const [dx, dy] of SIDES)
            this.#wake(ix + dx, iy + dy, iz);
    }

    /**
     * Water waiting for chunks that are loaded now goes on. Call when chunks got loaded.
     */
    resumeWaiting() {
        for (const [key, chunk] of this.#waiting) {
            if (!this.#blocks.isLoaded(chunk.cx << CHUNK_SIZE_BIT_LEN, chunk.cy << CHUNK_SIZE_BIT_LEN, chunk.cz << CHUNK_SIZE_BIT_LEN))
                continue;
            this.#waiting.delete(key);
            for (const [cellKey, cell] of chunk.cells)
                this.#schedule(cellKey, cell, this.#tick + 1);
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
        const blocks = this.#blocks;
        if (!blocks.isLoaded(ix, iy, iz)) {
            this.#wait(ix, iy, iz, ix, iy, iz);
            return;
        }
        const water = blocks.blockAt(ix, iy, iz);
        if (!isLiquid(water))
            return; // changed since it was woken
        if (blockHeight(water) < BLOCK_HEIGHT_FULL && blocks.isLoaded(ix, iy, iz + 1) && isLiquid(blocks.blockAt(ix, iy, iz + 1))) {
            // covered by water: fills up (and flows on from the change)
            blocks.setBlock(ix, iy, iz, flooded(water, BLOCK_HEIGHT_FULL));
            return;
        }
        if (!blocks.isLoaded(ix, iy, iz - 1)) {
            this.#wait(ix, iy, iz, ix, iy, iz - 1);
            return;
        }
        const below = blocks.blockAt(ix, iy, iz - 1);
        if (canFlood(below)) {
            blocks.setBlock(ix, iy, iz - 1, flooded(below, BLOCK_HEIGHT_FULL));
            return;
        }
        const level = blockHeight(water);
        for (const [dx, dy] of SIDES) {
            const nx = ix + dx, ny = iy + dy;
            if (!blocks.isLoaded(nx, ny, iz)) {
                this.#wait(ix, iy, iz, nx, ny, iz);
                continue;
            }
            const side = blocks.blockAt(nx, ny, iz);
            if (canFlood(side))
                blocks.setBlock(nx, ny, iz, flooded(side, level));
        }
    }

    #wake(ix, iy, iz) {
        const blocks = this.#blocks;
        if (blocks.isLoaded(ix, iy, iz) && isLiquid(blocks.blockAt(ix, iy, iz)))
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
