import { BLOCKS, CHUNK_SIZE, ChunkData } from "./chunk.js";
import { Vec2 } from "./geom.js";
import { ImagePixels } from "./utils.js";


export class PixelDataChunkGenerator {
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
        const chunk = new ChunkData();

        for (let y = 0; y < CHUNK_SIZE; y++)
            for (let x = 0; x < CHUNK_SIZE; x++) {
                const cx = startX + x;
                const cy = startY + y;
                if (cx < 0 || cy < 0 || cx >= w || cy >= h)
                    continue;
                let height = (Math.abs(x) == Math.abs(CHUNK_SIZE - y - 1) || Math.abs(x) == Math.abs(y)) ? 2: 1; //this.#pixels.getR(cx, cy);
                if (x == 8 && y == 14) height = 2;
                if (x == 1 && y == 15) height = 2;
                for (let e = 0; e < height - 1; e++)
                    chunk.set(e, x, CHUNK_SIZE - y - 1, BLOCKS.BLOCK_DIRT);
                if (height > 0)
                    chunk.set(height - 1, x, CHUNK_SIZE - y - 1, BLOCKS.BLOCK_DIRT_GRASS);
            }
        return chunk;
    }
}
