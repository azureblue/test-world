import { BLOCK_IDS } from "../blocks.js";
import { CHUNK_SIZE, ChunkBlockData, ChunkGenerator } from "../chunk/chunk.js";
import { Vec3 } from "../geom.js";
import { ChunkGeneratorFactory } from "./registry.js";

/**
 * A generator for test scenes: blocks set box by box, over an empty world or over another generator. Positions are
 * the game's: x, y on the ground, z up. Deterministic like any generator, so every generation of a chunk is the same.
 *
 * A scene is made in a scenario module's `world()` (see scenarios/), which the world worker loads when
 * Settings.world.generator is the module's path, with the world's seed (Settings.world.seed):
 *
 *     export async function world(seed) {
 *         return new SceneGenerator()                 // empty; or (await SceneGenerator.over("flat", seed))
 *             .fill(-4, -4, -1, 4, 4, -1, "ROCK")
 *             .fill(-4, -4, 0, 4, 4, 0, "WATER");
 *     }
 */
export class SceneGenerator extends ChunkGenerator {
    /** @type {ChunkGenerator | null} null: an empty world */
    #base;
    /** boxes in chunk space, in the order they were added (a later one wins)
     * @type {Array<{x0: number, y0: number, h0: number, x1: number, y1: number, h1: number, value: number}>} */
    #boxes = [];

    /** @param {ChunkGenerator | null} base the world under the scene; none: empty (air everywhere) */
    constructor(base = null) {
        super(base?.seed ?? 0);
        this.#base = base;
    }

    /**
     * @param {string} baseName a generator of the registry ("flat", "default", ...)
     * @param {number} seed the world's seed (the one world(seed) gets)
     * @returns {Promise<SceneGenerator>}
     */
    static async over(baseName, seed) {
        return new SceneGenerator(await ChunkGeneratorFactory.createForName(baseName, seed));
    }

    /**
     * Sets every block in a box, both corners included.
     * @param {number | string} block a block value or a key of BLOCK_IDS
     * @returns {this}
     */
    fill(x0, y0, z0, x1, y1, z1, block) {
        const value = (typeof block === "string" ? BLOCK_IDS[block] : block) >>> 0;
        if (typeof block === "string" && !(block in BLOCK_IDS))
            throw new Error(`no block "${block}"`);
        this.#boxes.push({
            x0: Math.min(x0, x1), x1: Math.max(x0, x1),
            y0: Math.min(y0, y1), y1: Math.max(y0, y1),
            h0: Math.min(z0, z1), h1: Math.max(z0, z1),
            value
        });
        return this;
    }

    /**
     * @param {number | string} block a block value or a key of BLOCK_IDS
     * @returns {this}
     */
    set(x, y, z, block) {
        return this.fill(x, y, z, x, y, z, block);
    }

    /**
     * @param {Vec3} chunkPos
     * @returns {ChunkBlockData}
     */
    generateChunk(chunkPos) {
        const data = this.#base === null ? new ChunkBlockData() : this.#base.generateChunk(chunkPos);
        const sx = chunkPos.x * CHUNK_SIZE, sy = chunkPos.y * CHUNK_SIZE, sh = chunkPos.z * CHUNK_SIZE;
        for (const b of this.#boxes) {
            const x0 = Math.max(b.x0, sx), x1 = Math.min(b.x1, sx + CHUNK_SIZE - 1);
            const y0 = Math.max(b.y0, sy), y1 = Math.min(b.y1, sy + CHUNK_SIZE - 1);
            const h0 = Math.max(b.h0, sh), h1 = Math.min(b.h1, sh + CHUNK_SIZE - 1);
            for (let h = h0; h <= h1; h++)
                for (let y = y0; y <= y1; y++)
                    for (let x = x0; x <= x1; x++)
                        data.setHXY(h - sh, x - sx, y - sy, b.value);
        }
        return data;
    }
}
