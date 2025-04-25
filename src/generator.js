import { BLOCKS, CHUNK_SIZE, ChunkData } from "./chunk.js";
import { Vec2 } from "./geom.js";
import { ImagePixels } from "./utils.js";


export class PixelDataChunkGenerator {
    #pixels
    #originPosition
    #ppv = 1

    /**
     * @param {ImagePixels} pixels 
     * @param {Vec2} originPosition
     */
    constructor(pixels, originPosition) {
        this.#pixels = pixels;
        this.#originPosition = originPosition;
    }

    /**
     * @param {Vec2} chunkPos
     */
    generateChunk(chunkPos) {
        const startX = this.#originPosition.x + (chunkPos.x * CHUNK_SIZE) * this.#ppv;
        const startY = this.#originPosition.y + ((-chunkPos.y - 1) * CHUNK_SIZE) * this.#ppv;
        const w = this.#pixels.width;
        const h = this.#pixels.height;
        const chunk = new ChunkData();

        for (let y = 0; y < CHUNK_SIZE; y++)
            for (let x = 0; x < CHUNK_SIZE; x++) {
                const cx = startX + x * this.#ppv;
                const cy = startY + y * this.#ppv;
                if (cx < 0 || cy < 0 || cx >= w || cy >= h)
                    continue;
                let height = this.#pixels.getR(cx, cy);
                if (height == 0)
                    height = 1;
                const dirtLayer = Math.max(10, 10 - Math.floor((10 / 70) * height));
                
                for (let r = 0; r < height - dirtLayer; r++) {
                    chunk.set(r, x, CHUNK_SIZE - y - 1, BLOCKS.BLOCK_ROCK);
                }
                for (let e = height - dirtLayer; e < height - 1; e++) {
                    chunk.set(e, x, CHUNK_SIZE - y - 1, BLOCKS.BLOCK_DIRT);
                }
                if (dirtLayer > 0)                    
                    chunk.set(height - 1, x, CHUNK_SIZE - y - 1, BLOCKS.BLOCK_DIRT_GRASS);
                // if (Math.random() < 0.1)
                //     chunk.set(height, x, CHUNK_SIZE - y - 1, BLOCKS.BLOCK_ROCK);
                // if (Math.random() < 0.1)
                //     chunk.set(height + 1, x, CHUNK_SIZE - y - 1, BLOCKS.BLOCK_ROCK);
            }
        return chunk;
    }
}
