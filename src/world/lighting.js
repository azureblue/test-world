import { BLOCK_LIGHT, MAX_BLOCK_ID } from "../blocks.js";
import { CHUNK_SIZE, ChunkDataLoader } from "../chunk/chunk.js";
import { Vec3 } from "../geom.js";
import { Resources } from "../utils.js";
import { NO_TOP, SkyTops } from "./skyTops.js";

/** light travels at most this far (a lamp's: 7 next to it, then 1 less per block): a chunk's light depends on the
 * blocks this close to it */
export const LIGHT_MARGIN = 8;
const SIZE = CHUNK_SIZE + 2 * LIGHT_MARGIN;
/** the light's size: the mesher's input, the chunk with a 1 block border */
const OUT_SIZE = CHUNK_SIZE + 2;

/** per neighbour offset along an axis: the neighbour's cells in the region, [from, to) and where they start in it */
const RANGES = new Map([
    [-1, [CHUNK_SIZE - LIGHT_MARGIN, CHUNK_SIZE, 0]],
    [0, [0, CHUNK_SIZE, LIGHT_MARGIN]],
    [1, [0, LIGHT_MARGIN, LIGHT_MARGIN + CHUNK_SIZE]]]);

/**
 * A chunk's light (docs/proposals/lighting.md), computed when it's meshed: the blocks of the chunk and of a margin of
 * LIGHT_MARGIN around it, and the sky tops of their columns, into the light pass (mesh/cpp/light.cpp). The result is
 * the light of the mesher's input, for UIntExtWasmMesher.mesh.
 */
export class Lighting {
    #loader;
    #skyTops;
    #exports;
    #cells;
    #skyFrom;
    #out;

    /**
     * @param {ChunkDataLoader} loader
     * @param {SkyTops} skyTops
     * @param {WebAssembly.Exports} exports
     */
    constructor(loader, skyTops, exports) {
        this.#loader = loader;
        this.#skyTops = skyTops;
        this.#exports = exports;
        if (exports.region_size() !== SIZE)
            throw new Error(`light pass: region ${exports.region_size()}, lighting.js has ${SIZE}`);
        const buffer = exports.memory.buffer;
        this.#cells = new Uint8Array(buffer, exports.cells(), SIZE ** 3);
        this.#skyFrom = new Uint8Array(buffer, exports.sky_from(), SIZE * SIZE);
        this.#out = new Uint8Array(buffer, exports.out(), OUT_SIZE ** 3);
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
     * @returns {Uint8Array | null} the light of the mesher's input cells ((h * 34 + y) * 34 + x): bits 0..2 the sky
     *   darkness (7 - sky light), 3..5 the block light; null: full sky light everywhere, no block light. Valid until
     *   the next call.
     */
    compute(chunkPos) {
        // every column sees the sky from the region's bottom: no solid block in it, so no emitter either (they're
        // cubes, see blocks.js): all air under the open sky
        if (this.#gatherSkyFrom(chunkPos))
            return null;
        const { emitters } = this.#gatherCells(chunkPos);
        // the chunk (with its border) solid: nothing to light
        if (emitters === 0 && this.#allSolid())
            return null;
        return this.#exports.compute() ? this.#out : null;
    }

    /**
     * the region's cells: bit 0 solid, bits 1..3 the block light it gives
     * @returns {{emitters: number}} the light the cells give, summed
     */
    #gatherCells(chunkPos) {
        const cells = this.#cells;
        const idMask = MAX_BLOCK_ID - 1;
        let emitters = 0;
        for (const [dz, [h0, h1, rh]] of RANGES) {
            for (const [dy, [y0, y1, ry]] of RANGES) {
                for (const [dx, [x0, x1, rx]] of RANGES) {
                    const data = this.#loader.blockData(new Vec3(chunkPos.x + dx, chunkPos.y + dy, chunkPos.z + dz)).data;
                    for (let h = h0; h < h1; h++) {
                        for (let y = y0; y < y1; y++) {
                            let i = (h * CHUNK_SIZE + y) * CHUNK_SIZE + x0;
                            let r = ((rh + h - h0) * SIZE + ry + y - y0) * SIZE + rx;
                            for (let x = x0; x < x1; x++, i++, r++) {
                                const block = data[i];
                                const light = BLOCK_LIGHT[block & idMask];
                                cells[r] = (block >>> 31) | light << 1;
                                emitters += light;
                            }
                        }
                    }
                }
            }
        }
        return { emitters };
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
