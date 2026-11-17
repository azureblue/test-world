import { BLOCK_IDS } from "../blocks.js";
import { CHUNK_SIZE, ChunkBlockData, ChunkGenerator } from "../chunk/chunk.js";
import { Vec3 } from "../geom.js";
import { mix32 } from "../noise/hash.js";
import { TreeGenerator } from "./treeGen.js";

const GROUND_LEVEL = 0;
const TREE_SPACING = 14;

/**
 * Tree gallery (?world.generator=trees): flat grass at level 0 with a grid of trees.
 * Each grid column along x is one tree type, each row along y a different seed.
 */
export class TreeTestGenerator extends ChunkGenerator {
    #treeGen = new TreeGenerator();

    /**
     * @param {Vec3} chunkPos
     * @returns {ChunkBlockData}
     */
    generateChunk(chunkPos) {
        const chunk = new ChunkBlockData();
        const startX = chunkPos.x * CHUNK_SIZE;
        const startY = chunkPos.y * CHUNK_SIZE;
        const startH = chunkPos.z * CHUNK_SIZE;

        const groundH = GROUND_LEVEL - startH;
        if (groundH >= 0 && groundH < CHUNK_SIZE) {
            for (let y = 0; y < CHUNK_SIZE; y++)
                for (let x = 0; x < CHUNK_SIZE; x++)
                    chunk.setHXY(groundH, x, y, BLOCK_IDS.DIRT_GRASS);
        }

        const baseH = groundH + 1;
        const r = TreeGenerator.MAX_RADIUS;
        const gx0 = Math.ceil((startX - r) / TREE_SPACING);
        const gx1 = Math.floor((startX + CHUNK_SIZE - 1 + r) / TREE_SPACING);
        const gy0 = Math.ceil((startY - r) / TREE_SPACING);
        const gy1 = Math.floor((startY + CHUNK_SIZE - 1 + r) / TREE_SPACING);
        const types = TreeGenerator.TYPES;

        for (let gy = gy0; gy <= gy1; gy++)
            for (let gx = gx0; gx <= gx1; gx++) {
                const baseX = gx * TREE_SPACING - startX;
                const baseY = gy * TREE_SPACING - startY;
                if (!TreeGenerator.canReachChunk(baseH, baseX, baseY))
                    continue;
                const type = types[((gx % types.length) + types.length) % types.length];
                const seed = mix32(Math.imul(gx, 73856093) ^ Math.imul(gy, 19349663));
                this.#treeGen.generate(chunk, baseH, baseX, baseY, seed, type);
            }

        return chunk;
    }

    static async create(params = {}) {
        return new TreeTestGenerator();
    }
}
