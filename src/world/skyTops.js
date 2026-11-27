import { closedFaces, FACE_DOWN, FACE_UP, isSolid } from "../blocks.js";
import { CHUNK_SIZE, CHUNK_SIZE_BIT_LEN, CHUNK_SIZE_MASK, ChunkDataLoader, ChunkGenerator, NO_TOP } from "../chunk/chunk.js";
import { Vec3 } from "../geom.js";

export { NO_TOP };

/**
 * The highest cell a block shades from the sky straight above it (stopsSkyLight, docs/proposals/lighting.md): a solid
 * block's own cell, a shaped one's with its top closed (a top slab), the cell under one with only its bottom closed (a
 * bottom slab sees the sky, but doesn't let it through).
 * @param {number} block
 * @param {number} z its height
 * @returns {number | null} null: the sky light falls through it
 */
function shadeTop(block, z) {
    if (isSolid(block))
        return z;
    const faces = closedFaces(block);
    return faces & FACE_UP ? z : faces & FACE_DOWN ? z - 1 : null;
}

/**
 * The sky top of every block column: the highest cell its sky light doesn't reach straight down (shadeTop). The world
 * has no top and chunks are cubes, so it's found by scanning the column down: from the generator's top for it
 * (ChunkGenerator.solidTops), or the chunk column's highest edit that stops the sky light if that's higher. Kept per chunk
 * column, scanned as far down as it was asked for; edits update it.
 */
export class SkyTops {
    #loader;
    #generator;
    /** chunk column key -> the tops of its 32 x 32 columns (index y * 32 + x), the height it's scanned down to, how
     * many columns have no top down there
     * @type {Map<string, {tops: Int32Array, from: Int32Array, scannedTo: number, missing: number}>} */
    #columns = new Map();
    /** chunk column key -> its highest edit that stops the sky light, for the columns not scanned yet (the scan starts there)
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
     * The sky tops of a chunk column's block columns (index y * 32 + x), NO_TOP where nothing stops the sky light down to
     * downTo (the caller needs no more). Don't change them.
     * @returns {Int32Array}
     */
    tops(cx, cy, downTo) {
        return this.#column(cx, cy, downTo).tops;
    }

    /**
     * A block that stops the sky light is at this height (a saved chunk's highest, save/chunkCodec.js): for a column not
     * scanned yet, its scan starts there at least (a scanned one has read it).
     */
    addTop(ix, iy, iz) {
        const key = `${ix >> CHUNK_SIZE_BIT_LEN},${iy >> CHUNK_SIZE_BIT_LEN}`;
        if (!this.#columns.has(key) && iz > (this.#editTops.get(key) ?? NO_TOP))
            this.#editTops.set(key, iz);
    }

    /**
     * Updates the column for a changed block (the loader has it already).
     * @param {number} block the new block
     * @returns {{from: number, to: number} | null} the column's top before and after, when it changed
     */
    onBlockChanged(ix, iy, iz, block) {
        const key = `${ix >> CHUNK_SIZE_BIT_LEN},${iy >> CHUNK_SIZE_BIT_LEN}`;
        const column = this.#columns.get(key);
        const shade = shadeTop(block, iz);
        if (column === undefined) {
            if (shade !== null)
                this.addTop(ix, iy, iz);
            return null;
        }
        if (iz < column.scannedTo)
            return null;
        const index = (iy & CHUNK_SIZE_MASK) * CHUNK_SIZE + (ix & CHUNK_SIZE_MASK);
        const from = column.tops[index];
        let to = from;
        if (shade !== null && shade > from) {
            to = shade;
        } else if (from === iz || from === iz - 1) {
            // the top may have been the block's (a solid one's own cell, a shaped one's under it): the column scanned
            // again from it down, as far as it was scanned
            to = NO_TOP;
            for (let z = iz; z >= column.scannedTo; z--) {
                const s = shadeTop(this.#loader.getBlock(ix, iy, z), z);
                if (s !== null) {
                    to = s;
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
            // where each column's scan starts: nothing above it stops the sky light
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
        // that may have a block stopping the sky light in the chunk (the chunk isn't generated if none)
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
                    const shade = shadeTop(data[h * CHUNK_SIZE * CHUNK_SIZE + i], base + h);
                    if (shade !== null) {
                        tops[i] = shade;
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
