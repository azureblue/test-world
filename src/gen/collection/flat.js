import { BLOCK_IDS } from "../../blocks.js";
import { CHUNK_SIZE, ChunkBlockData, ChunkGenerator } from "../../chunk/chunk.js";
import { Vec3 } from "../../geom.js";

export class FlatGenerator extends ChunkGenerator {

    /**
     * Grass at height 0, dirt down to -5, rock below (the same for every seed).
     * @param {Vec3} chunkPos
     */
    generateChunk(chunkPos) {
        const chunkData = new ChunkBlockData();
        const baseHeight = chunkPos.z * CHUNK_SIZE; // world height of h = 0 in this chunk
        if (baseHeight > 0)
            return chunkData; // all air

        for (let h = 0; h < CHUNK_SIZE; h++) {
            const height = baseHeight + h;
            let block;
            if (height === 0) block = BLOCK_IDS.DIRT_GRASS;
            else if (height < -5) block = BLOCK_IDS.ROCK;
            else if (height < 0) block = BLOCK_IDS.DIRT;
            else continue; // air above 0
            for (let y = 0; y < CHUNK_SIZE; y++)
                for (let x = 0; x < CHUNK_SIZE; x++)
                    chunkData.setHXY(h, x, y, block);
        }
        return chunkData;
    }

    /** the grass at 0 */
    solidTops(cx, cy) {
        return new Int32Array(CHUNK_SIZE * CHUNK_SIZE);
    }

    static async create(seed, params = {}) {
        return new FlatGenerator(seed);
    }
}
