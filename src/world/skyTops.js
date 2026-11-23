import { CHUNK_SIZE, CHUNK_SIZE_BIT_LEN, CHUNK_SIZE_MASK, ChunkDataLoader, ChunkGenerator, NO_TOP } from "../chunk/chunk.js";
import { Vec3 } from "../geom.js";

export { NO_TOP };

/**
 * The sky top of every block column: its highest solid block, which stops the sky light (docs/proposals/lighting.md).
 * The world has no top and chunks are cubes, so it's found by scanning the column down: from the generator's top for
 * it (ChunkGenerator.solidTops), or the chunk column's highest solid edit if that's higher. Kept per chunk column,
 * scanned as far down as it was asked for; edits update it.
 */
export class SkyTops {
    #loader;
    #generator;
    /** chunk column key -> the tops of its 32 x 32 columns (index y * 32 + x), the height it's scanned down to, how
     * many columns have no top down there
     * @type {Map<string, {tops: Int32Array, from: Int32Array, scannedTo: number, missing: number}>} */
    #columns = new Map();
    /** chunk column key -> its highest solid edit, for the columns not scanned yet
     * @type {Map<string, number>} */
    #editTops = new Map();

    /**
     * @param {ChunkDataLoader} loader
     * @param {ChunkGenerator} generator the loader's
     */
    constructor(loader, generator) {
        this.#loader = loader;
        this.#generator = generator;
    }

    /**
     * The sky tops of a chunk column's block columns (index y * 32 + x), NO_TOP where there's no solid block down to
     * downTo (the caller needs no more). Don't change them.
     * @returns {Int32Array}
     */
    tops(cx, cy, downTo) {
        return this.#column(cx, cy, downTo).tops;
    }

    /**
     * Updates the column for a changed block (the loader has it already).
     * @returns {{from: number, to: number} | null} the column's top before and after, when it changed
     */
    onBlockChanged(ix, iy, iz, solid) {
        const key = `${ix >> CHUNK_SIZE_BIT_LEN},${iy >> CHUNK_SIZE_BIT_LEN}`;
        const column = this.#columns.get(key);
        if (column === undefined) {
            if (solid && iz > (this.#editTops.get(key) ?? NO_TOP))
                this.#editTops.set(key, iz);
            return null;
        }
        if (iz < column.scannedTo)
            return null;
        const index = (iy & CHUNK_SIZE_MASK) * CHUNK_SIZE + (ix & CHUNK_SIZE_MASK);
        const from = column.tops[index];
        let to = from;
        if (solid && iz > from) {
            to = iz;
        } else if (!solid && iz === from) {
            // the next solid block down, as far as the column was scanned
            to = NO_TOP;
            for (let z = iz - 1; z >= column.scannedTo; z--) {
                if (this.#loader.getBlock(ix, iy, z) >>> 31) {
                    to = z;
                    break;
                }
            }
        }
        if (to === from)
            return null;
        column.tops[index] = to;
        column.missing += (to === NO_TOP ? 1 : 0) - (from === NO_TOP ? 1 : 0);
        return { from, to };
    }

    #column(cx, cy, downTo) {
        const key = `${cx},${cy}`;
        let column = this.#columns.get(key);
        if (column === undefined) {
            // where each column's scan starts: nothing solid above it
            const from = this.#generator.solidTops(cx, cy);
            const editTop = this.#editTops.get(key) ?? NO_TOP;
            this.#editTops.delete(key);
            let highest = NO_TOP;
            for (let i = 0; i < from.length; i++) {
                from[i] = Math.max(from[i], editTop);
                highest = Math.max(highest, from[i]);
            }
            column = { tops: new Int32Array(CHUNK_SIZE * CHUNK_SIZE).fill(NO_TOP), from, scannedTo: highest + 1, missing: CHUNK_SIZE * CHUNK_SIZE };
            this.#columns.set(key, column);
        }
        // every column has its top (nothing lower matters), or it's scanned deep enough
        if (column.missing === 0 || column.scannedTo <= downTo)
            return column;
        // the chunks from the one under what's scanned down to the one holding downTo, only the columns without a top
        // that may have a solid block in the chunk (the chunk isn't generated if none)
        const { tops, from } = column;
        for (let cz = (column.scannedTo - 1) >> CHUNK_SIZE_BIT_LEN; column.missing > 0 && cz >= downTo >> CHUNK_SIZE_BIT_LEN; cz--) {
            const base = cz * CHUNK_SIZE;
            let data = null;
            for (let i = 0; i < CHUNK_SIZE * CHUNK_SIZE; i++) {
                if (tops[i] !== NO_TOP)
                    continue;
                // from the top of what's not scanned yet in this chunk, or the column's start
                const fromH = Math.min(CHUNK_SIZE - 1, column.scannedTo - 1 - base, from[i] - base);
                if (fromH < 0)
                    continue;
                data ??= this.#loader.blockData(new Vec3(cx, cy, cz)).data;
                for (let h = fromH; h >= 0; h--) {
                    if (data[h * CHUNK_SIZE * CHUNK_SIZE + i] >>> 31) {
                        tops[i] = base + h;
                        column.missing--;
                        break;
                    }
                }
            }
            column.scannedTo = base;
        }
        return column;
    }
}
