import { BLOCK_IDS } from "./blocks.js";
import { CHUNK_HEIGHT, CHUNK_SIZE, ChunkData } from "./chunk.js";
import { Vec2 } from "./geom.js";
import { Noise } from "./noise/noise.js";
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
        if (Math.abs(chunkPos.x) >= 20 || Math.abs(chunkPos.y) >=20)
            return chunk;

        for (let y = 0; y < CHUNK_SIZE; y++)
            for (let x = 0; x < CHUNK_SIZE; x++) {
                const px = startX + x * this.#ppv;
                const py = startY + y * this.#ppv;
                const ry = CHUNK_SIZE - y - 1;
                // if ((x + y) % 2 == 1) {
                //     for (let a = 0; a < 10; a++) {
                //         chunk.set(a, x, ry, BLOCK_IDS.GRASS);
                //     // chunk.set(10, x, ry, BLOCK_IDS.GRASS);
                        
                //     }
                    

                // }
                //     // chunk.set(1, x, ry, BLOCK_IDS.GRASS);
                // continue;
                if (px < 0 || py < 0 || px >= w || py >= h)
                    continue;
                let height = this.#pixels.getR(px, py);
                height = Math.floor((height / 255) * 127);
                if (height == 0)
                    height = 1;
                const dirtLayer = Math.max(0, 10 - Math.floor((10 / 58) * height));
                
                for (let r = 0; r < height - dirtLayer; r++) {
                    chunk.set(r, x, ry, BLOCK_IDS.ROCK);
                }
                for (let e = height - dirtLayer; e < height - 1; e++) {
                    chunk.set(e, x, ry, BLOCK_IDS.DIRT);
                }
                if (dirtLayer > 0) {
                    chunk.set(height - 1, x, ry, BLOCK_IDS.DIRT_GRASS);
                    if (Math.random() < 0.02 && height < CHUNK_HEIGHT - 1) {
                        chunk.set(height, x, ry, BLOCK_IDS.GRASS_SHORT);
                    }
                }
                // if (Math.random() < 0.1)
                //     chunk.set(height, x, ry, BLOCK_IDS.ROCK);

                for (let w = height; w < 30; w++) {
                    if (chunk.get(w, x, ry) == BLOCK_IDS.EMPTY)
                        chunk.set(w, x, ry, BLOCK_IDS.WATER);
                }


                // if (Math.random() < 0.1)
                //     chunk.set(height + 1, x, ry, BLOCKS.BLOCK_ROCK);
            }
        return chunk;
    }
}

export class RandomDataChunkGenerator {

    #blocks = [BLOCK_IDS.DIRT, BLOCK_IDS.ROCK, BLOCK_IDS.GRASS];
    #rng = new RNG("1234");
    constructor() {
    }

    /**
     * @param {Vec2} chunkPos
     */
    generateChunk(chunkPos) {
        const chunk = new ChunkData();

        for (let h = 0; h < CHUNK_HEIGHT; h++)
            for (let y = 0; y < CHUNK_SIZE; y++)
                for (let x = 0; x < CHUNK_SIZE; x++) {
                    if (this.#rng.uniform() < 0.15) {
                        chunk.set(h, x, y, this.#blocks[Math.round(this.#rng.uniform() * 3)]);
                    }
                }
        return chunk;
    }
}

export class NoiseChunkGenerator {

    #noise = new Noise(112345, {
        frequency: 0.005,
        octaves: 5

    });
    constructor() {
    }

    /**
     * @param {Vec2} chunkPos
     */
    generateChunk(chunkPos) {
        const chunk = new ChunkData();
        const startX = (chunkPos.x * CHUNK_SIZE);
        const startY = ((-chunkPos.y - 1) * CHUNK_SIZE);

            for (let y = 0; y < CHUNK_SIZE; y++)
                for (let x = 0; x < CHUNK_SIZE; x++) {
                    const rx = x; //CHUNK_SIZE - x - 1;
                    const ry = CHUNK_SIZE - y - 1;
                    let height = Math.floor(this.#noise.octaveNoise(x + startX, y + startY) * 127);
                    if (height == 0)
                        height = 1;
                    const dirtLayer = Math.max(0, 10 - Math.floor((10 / 58) * height));
                    
                    for (let r = 0; r < height - dirtLayer; r++) {
                        chunk.set(r, rx, ry, BLOCK_IDS.ROCK);
                    }
                    for (let e = height - dirtLayer; e < height - 1; e++) {
                        chunk.set(e, rx, ry, BLOCK_IDS.DIRT);
                    }
                    if (dirtLayer > 0) {
                        chunk.set(height - 1, rx, ry, BLOCK_IDS.DIRT_GRASS);
                        if (Math.random() < 0.02 && height < CHUNK_HEIGHT - 1) {
                            chunk.set(height, rx, ry, BLOCK_IDS.GRASS_SHORT);
                        }
                    }
                    // if (Math.random() < 0.1)
                    //     chunk.set(height, x, ry, BLOCK_IDS.ROCK);
    
                    for (let w = height; w < 30; w++) {
                        if (chunk.get(w, rx, ry) == BLOCK_IDS.EMPTY)
                            chunk.set(w, rx, ry, BLOCK_IDS.WATER);
                    }
                }
        return chunk;
    }
}



