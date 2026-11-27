import { BLOCK_LIGHT, blockShape, isShaped, MAX_BLOCK_ID, MAX_SHAPES, SHAPE_OCTANTS } from "../blocks.js";
import { CHUNK_SIZE, CHUNK_SIZE_BIT_LEN, ChunkDataLoader, posToKey3 } from "../chunk/chunk.js";
import { Vec3 } from "../geom.js";
import { Resources } from "../utils.js";
import { NO_TOP, SkyTops } from "./skyTops.js";

/** sky light travels at most this far (15 under the open sky, then 1 less per block): a chunk's sky light depends on
 * the blocks this close to it */
export const LIGHT_MARGIN = 15;
/** block light travels at most this far (15 next to an emitter, then 1 less per block) */
export const BLOCK_LIGHT_MARGIN = 15;
const SIZE = CHUNK_SIZE + 2 * LIGHT_MARGIN;
const BLOCK_SIZE = CHUNK_SIZE + 2 * BLOCK_LIGHT_MARGIN;
/** the light's size: the mesher's input, the chunk with a 1 block border */
const OUT_SIZE = CHUNK_SIZE + 2;

/**
 * per neighbour offset along an axis: the neighbour's cells in a region with this margin, [from, to) and where they
 * start in it
 * @returns {Map<number, number[]>}
 */
const ranges = (margin) => new Map([
    [-1, [CHUNK_SIZE - margin, CHUNK_SIZE, 0]],
    [0, [0, CHUNK_SIZE, margin]],
    [1, [0, margin, margin + CHUNK_SIZE]]]);
const RANGES = ranges(LIGHT_MARGIN);
const BLOCK_RANGES = ranges(BLOCK_LIGHT_MARGIN);

/**
 * A chunk's light (docs/proposals/lighting.md), computed when it's meshed: the blocks of the chunk and of a margin of
 * LIGHT_MARGIN around it, and the sky tops of their columns, into the light pass (mesh/cpp/light.cpp); near emitters
 * also the blocks of a margin of BLOCK_LIGHT_MARGIN, into the block light pass. The result is the light of the mesher's
 * input, for UIntExtWasmMesher.mesh.
 */
export class Lighting {
    #loader;
    #skyTops;
    #exports;
    #cells;
    #blockCells;
    #skyFrom;
    #out;
    /** chunk key -> whether it has a block giving light (emitters are rare: the block light pass only runs near them)
     * @type {Map<string, boolean>} */
    #emitters = new Map();

    /**
     * @param {ChunkDataLoader} loader
     * @param {SkyTops} skyTops
     * @param {WebAssembly.Exports} exports
     */
    constructor(loader, skyTops, exports) {
        this.#loader = loader;
        this.#skyTops = skyTops;
        this.#exports = exports;
        if (exports.region_size() !== SIZE || exports.block_region_size() !== BLOCK_SIZE)
            throw new Error(`light pass: regions ${exports.region_size()}, ${exports.block_region_size()}, lighting.js has ${SIZE}, ${BLOCK_SIZE}`);
        const buffer = exports.memory.buffer;
        this.#cells = new Uint8Array(buffer, exports.cells(), SIZE ** 3);
        this.#blockCells = new Uint8Array(buffer, exports.block_cells(), BLOCK_SIZE ** 3);
        this.#skyFrom = new Uint8Array(buffer, exports.sky_from(), SIZE * SIZE);
        this.#out = new Uint8Array(buffer, exports.out(), OUT_SIZE ** 3);
        new Uint8Array(buffer, exports.shape_open(), (MAX_SHAPES + 1) * 6).set(shapeOpenTable());
    }

    /**
     * @param {ChunkDataLoader} loader
     * @param {SkyTops} skyTops
     * @returns {Promise<Lighting>}
     */
    static async create(loader, skyTops) {
        const result = await WebAssembly.instantiateStreaming(await fetch(Resources.relativeToRoot("./mesh/light.wasm")));
        return new Lighting(loader, skyTops, result.instance.exports);
    }

    /**
     * @param {Vec3} chunkPos
     * @returns {Uint8Array | null} the light of the mesher's input cells ((h * 34 + y) * 34 + x): bits 0..3 the sky
     *   darkness (15 - sky light), 4..7 the block light; null: full sky light everywhere, no block light. Valid until
     *   the next call.
     */
    compute(chunkPos) {
        const emitters = this.#emittersAround(chunkPos);
        // every column sees the sky from the region's bottom: no solid block in it, all air under the open sky
        const open = this.#gatherSkyFrom(chunkPos);
        if (open && !emitters)
            return null;
        let sky = false;
        if (!open) {
            const shaped = this.#gatherCells(chunkPos, this.#cells, SIZE, RANGES);
            // the chunk (with its border) solid: nothing to light
            if (this.#allSolid())
                return null;
            sky = this.#exports.compute(shaped ? 1 : 0) !== 0;
        }
        if (emitters) {
            const shaped = this.#gatherCells(chunkPos, this.#blockCells, BLOCK_SIZE, BLOCK_RANGES);
            return this.#exports.compute_block(open ? 0 : 1, shaped ? 1 : 0) ? this.#out : null;
        }
        return sky ? this.#out : null;
    }

    /**
     * Keeps track of the emitters for a changed block (the loader has it already).
     * @param {number} value the new block
     */
    onBlockChanged(ix, iy, iz, value) {
        const key = posToKey3(ix >> CHUNK_SIZE_BIT_LEN, iy >> CHUNK_SIZE_BIT_LEN, iz >> CHUNK_SIZE_BIT_LEN);
        if (BLOCK_LIGHT[value & (MAX_BLOCK_ID - 1)] > 0)
            this.#emitters.set(key, true);
        else if (this.#emitters.get(key))
            this.#emitters.delete(key); // maybe the last one removed: looked for again when needed
    }

    /**
     * How far an edit there can change the light: as far as block light travels if an emitter is that close.
     * Chunk space coordinates.
     */
    marginAt(ix, iy, iz) {
        const chunkPos = new Vec3(ix >> CHUNK_SIZE_BIT_LEN, iy >> CHUNK_SIZE_BIT_LEN, iz >> CHUNK_SIZE_BIT_LEN);
        // an emitter whose light can reach a cell the edit's change reaches is within 2 margins (30 < 32): in a
        // neighbour chunk
        return this.#emittersAround(chunkPos) ? BLOCK_LIGHT_MARGIN : LIGHT_MARGIN;
    }

    /** whether the chunk or one of its 26 neighbours has an emitter (its light may reach the chunk) */
    #emittersAround(chunkPos) {
        for (let dz = -1; dz <= 1; dz++)
            for (let dy = -1; dy <= 1; dy++)
                for (let dx = -1; dx <= 1; dx++)
                    if (this.#hasEmitters(chunkPos.x + dx, chunkPos.y + dy, chunkPos.z + dz))
                        return true;
        return false;
    }

    #hasEmitters(cx, cy, cz) {
        const key = posToKey3(cx, cy, cz);
        let has = this.#emitters.get(key);
        if (has === undefined) {
            const data = this.#loader.blockData(new Vec3(cx, cy, cz)).data;
            const idMask = MAX_BLOCK_ID - 1;
            has = false;
            for (let i = 0; i < data.length && !has; i++)
                has = BLOCK_LIGHT[data[i] & idMask] > 0;
            this.#emitters.set(key, has);
        }
        return has;
    }

    /**
     * a region's cells (its size, the ranges of its margin): bit 0 solid, then a solid one's bits 1..4 the block light
     * it gives, a shaped one's bits 1..7 its shape + 1 (mesh/cpp/light.cpp)
     * @returns {boolean} whether there's a shaped block among them
     */
    #gatherCells(chunkPos, cells, size, ranges) {
        const idMask = MAX_BLOCK_ID - 1;
        let shaped = false;
        for (const [dz, [h0, h1, rh]] of ranges) {
            for (const [dy, [y0, y1, ry]] of ranges) {
                for (const [dx, [x0, x1, rx]] of ranges) {
                    const data = this.#loader.blockData(new Vec3(chunkPos.x + dx, chunkPos.y + dy, chunkPos.z + dz)).data;
                    for (let h = h0; h < h1; h++) {
                        for (let y = y0; y < y1; y++) {
                            let i = (h * CHUNK_SIZE + y) * CHUNK_SIZE + x0;
                            let r = ((rh + h - h0) * size + ry + y - y0) * size + rx;
                            for (let x = x0; x < x1; x++, i++, r++) {
                                const block = data[i];
                                cells[r] = (block >>> 31) | BLOCK_LIGHT[block & idMask] << 1;
                                if (isShaped(block)) {
                                    cells[r] |= (blockShape(block) + 1) << 1;
                                    shaped = true;
                                }
                            }
                        }
                    }
                }
            }
        }
        return shaped;
    }

    /** whether the mesher's input cells (the chunk with a 1 block border) are all solid */
    #allSolid() {
        const cells = this.#cells, start = LIGHT_MARGIN - 1;
        for (let h = start; h < start + OUT_SIZE; h++)
            for (let y = start; y < start + OUT_SIZE; y++)
                for (let x = start, r = (h * SIZE + y) * SIZE + start; x < start + OUT_SIZE; x++, r++)
                    if ((cells[r] & 1) === 0)
                        return false;
        return true;
    }

    /**
     * per region column, the lowest region height that sees the sky straight up (SIZE: none)
     * @returns {boolean} whether every column sees the sky from the region's bottom up
     */
    #gatherSkyFrom(chunkPos) {
        const bottom = chunkPos.z * CHUNK_SIZE - LIGHT_MARGIN;
        let open = true;
        for (const [dy, [cy0, cy1, ry]] of RANGES) {
            for (const [dx, [cx0, cx1, rx]] of RANGES) {
                const tops = this.#skyTops.tops(chunkPos.x + dx, chunkPos.y + dy, bottom);
                for (let y = cy0; y < cy1; y++) {
                    for (let x = cx0; x < cx1; x++) {
                        const top = tops[y * CHUNK_SIZE + x];
                        const from = Math.max(0, Math.min(SIZE, top === NO_TOP ? 0 : top + 1 - bottom));
                        this.#skyFrom[(ry + y - cy0) * SIZE + rx + x - cx0] = from;
                        open &&= from === 0;
                    }
                }
            }
        }
        return open;
    }
}

/**
 * The light pass's table (shape_open in mesh/cpp/light.cpp): by shape + 1 (0: no shape, all open) and face (-x, +x,
 * -y, +y, -z, +z), the quarters of the face the shape's octants leave open, bit qa | qb << 1 over the face's two other
 * axes in axis order. Light crosses between two cells where their faces have an open quarter in common.
 * @returns {Uint8Array} (MAX_SHAPES + 1) * 6
 */
function shapeOpenTable() {
    const table = new Uint8Array((MAX_SHAPES + 1) * 6);
    for (let s = 0; s <= MAX_SHAPES; s++) {
        const octants = s === 0 ? 0 : SHAPE_OCTANTS[s - 1];
        for (let face = 0; face < 6; face++) {
            const axis = face >> 1, a = axis === 0 ? 1 : 0, b = axis === 2 ? 1 : 2;
            let open = 0;
            for (let q = 0; q < 4; q++) {
                const octant = (face & 1) << axis | (q & 1) << a | (q >> 1) << b;
                if (!(octants >> octant & 1))
                    open |= 1 << q;
            }
            table[s * 6 + face] = open;
        }
    }
    return table;
}
