import { BLOCK_DIRT, BLOCK_DIRT_GRASS, BLOCK_GRASS, CHUNK_SIZE, Chunk } from "./chunk.js";
import { Vec2 } from "./geom.js";
import { ImagePixels } from "./utils.js";


class PixelDataChunkGenerator {
    #pixels
    #originPosition

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
        const startX = this.#originPosition.x + (chunkPos.x * CHUNK_SIZE);
        const startY = this.#originPosition.y + ((-chunkPos.y - 1) * CHUNK_SIZE);
        const w = this.#pixels.width;
        const h = this.#pixels.height;
        const chunk = new Chunk(chunkPos);

        for (let y = 0; y < CHUNK_SIZE; y++)
            for (let x = 0; x < CHUNK_SIZE; x++) {
                const cx = startX + x;
                const cy = startY + y;
                if (cx < 0 || cy < 0 || cx >= w || cy >= h)
                    continue;
                const height = this.#pixels.getR(cx, cy) - 50;
                for (let e = 0; e < height - 1; e++)
                    chunk.set(e, x, CHUNK_SIZE - y - 1, BLOCK_DIRT);
                if (height > 0)
                    chunk.set(height - 1, x, CHUNK_SIZE - y - 1, BLOCK_DIRT_GRASS);
            }
        return chunk;
    }
}

export {PixelDataChunkGenerator}