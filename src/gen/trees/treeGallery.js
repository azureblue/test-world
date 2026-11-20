import { BLOCK_IDS } from "../../blocks.js";
import { CHUNK_SIZE, ChunkBlockData, ChunkGenerator } from "../../chunk/chunk.js";
import { Vec3 } from "../../geom.js";
import { mix32 } from "../../noise/hash.js";
import { TreeBuilder } from "./treeBuilder.js";

const GROUND_LEVEL = 0;
const SPACING = 2 * TreeBuilder.MAX_RADIUS + 2;
/** trees of each species (rows along y), each from its own seed */
const ROWS = 6;

/**
 * Gallery of {@link TreeBuilder}'s trees (?world.generator=trees, or scenarios/index.html?name=trees): flat
 * grass at level 0 with a grid of trees from (0, 0), each column along x one species, each row along y another tree
 * (its seed from the row and the world's seed).
 */
export class TreeGalleryGenerator extends ChunkGenerator {
    #trees = new TreeBuilder();

    /**
     * @param {Vec3} chunkPos
     * @returns {ChunkBlockData}
     */
    generateChunk(chunkPos) {
        const chunk = new ChunkBlockData();
        const startX = chunkPos.x * CHUNK_SIZE, startY = chunkPos.y * CHUNK_SIZE, startH = chunkPos.z * CHUNK_SIZE;
        const groundH = GROUND_LEVEL - startH;
        if (groundH >= 0 && groundH < CHUNK_SIZE)
            for (let y = 0; y < CHUNK_SIZE; y++)
                for (let x = 0; x < CHUNK_SIZE; x++)
                    chunk.setHXY(groundH, x, y, BLOCK_IDS.DIRT_GRASS);

        const species = TreeBuilder.SPECIES, r = TreeBuilder.MAX_RADIUS;
        const gx0 = Math.max(0, Math.ceil((startX - r) / SPACING));
        const gx1 = Math.min(species.length - 1, Math.floor((startX + CHUNK_SIZE - 1 + r) / SPACING));
        const gy0 = Math.max(0, Math.ceil((startY - r) / SPACING));
        const gy1 = Math.min(ROWS - 1, Math.floor((startY + CHUNK_SIZE - 1 + r) / SPACING));
        for (let gy = gy0; gy <= gy1; gy++)
            for (let gx = gx0; gx <= gx1; gx++) {
                const baseH = groundH + 1, baseX = gx * SPACING - startX, baseY = gy * SPACING - startY;
                if (TreeBuilder.canReachChunk(baseH, baseX, baseY))
                    this.#trees.generate(chunk, baseH, baseX, baseY, mix32(Math.imul(gx, 73856093) ^ Math.imul(gy, 19349663) ^ this.seed), species[gx]);
            }
        return chunk;
    }

    static async create(seed, params = {}) {
        return new TreeGalleryGenerator(seed);
    }
}
