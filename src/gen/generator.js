import { blend, BLEND_MODE, createBlend } from "../blend.js";
import { BLOCK_IDS } from "../blocks.js";
import { CHUNK_HEIGHT, CHUNK_SIZE, ChunkData, posToKey } from "../chunk.js";
import { Vec2 } from "../geom.js";
import { OpenSimplex2Noise } from "../noise/noise.js";
import { ImagePixels } from "../utils.js";
import { CurveNode, GenericNode, GenNode, LinearCurve, point } from "./node.js";


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
        if (Math.abs(chunkPos.x) >= 20 || Math.abs(chunkPos.y) >= 20)
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

    #noise = new OpenSimplex2Noise({
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


export class FunctionChunkGenerator {

    #func

    constructor() {
        this.#func = (x, y) => 0;
    }

    setFunc(func) {
        this.#func = func;
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
                let height = Math.floor(this.#func(x + startX, y + startY) * 127);
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

                for (let w = height; w < 20; w++) {
                    if (chunk.get(w, rx, ry) == BLOCK_IDS.EMPTY)
                        chunk.set(w, rx, ry, BLOCK_IDS.WATER);
                }
            }
        return chunk;
    }
}

// export class Generator01 extends FunctionChunkGenerator {

//     #scaleMul = 1;
//     #noise0 = new Noise({
//         seed: 0,
//         frequency: 0.002 * this.#scaleMul,
//         octaves: 1
//     });
//     #curve0 = new LinearCurve(vec2(0, 0.1), vec2(1, 0.5));
//     #blend0 = createBlend(BLEND_MODES.NORMAL, 1);
//     #noise1 = new Noise({
//         seed: 5,
//         frequency: 0.004 * this.#scaleMul,
//         octaves: 1
//     });
//     #curve1 = new LinearCurve(vec2(0, 0.1), vec2(1, 0.5));
//     #blend1 = createBlend(BLEND_MODES.NORMAL, 1);
//     #noise2 = new Noise({
//         seed: 123,
//         frequency: 0.005 * this.#scaleMul,
//         octaves: 5
//     });
//     #curve2 = new LinearCurve(vec2(0, 0), vec2(1, 1));
//     #blend2 = createBlend(BLEND_MODES.MULTIPLY, 0.5);
//     #noise3 = new Noise({
//         seed: 1123,
//         frequency: 0.008 * this.#scaleMul,
//         octaves: 5
//     });
//     #curve3 = new LinearCurve(vec2(0.3, 0), vec2(1, 0.8));
//     #blend3 = createBlend(BLEND_MODES.NORMAL, 0.26);
//     #noise4 = new Noise({
//         seed: 11223,
//         frequency: 0.002 * this.#scaleMul,
//         octaves: 4
//     });
//     #curve4 = new LinearCurve(vec2(0.45, 0), vec2(1, 0.9));
//     #blend4 = createBlend(BLEND_MODES.SUB, 0.2);

//     constructor() {
//         super();
//         this.setFunc((x, y) => 
//             this.#blend4(this.#blend3(this.#blend2(this.#blend1(this.#blend0(0,
//                 this.#curve0.apply(this.#noise0.octaveNoise(x, y))),
//                 this.#curve1.apply(this.#noise1.octaveNoise(x, y))),
//                 this.#curve2.apply(this.#noise2.octaveNoise(x, y))),
//                 this.#curve3.apply(this.#noise3.octaveNoise(x, y))),
//                 this.#curve4.apply(this.#noise4.octaveNoise(x, y)))
//         );
        
//         let a = {
            
//         }

//     }
// }


export class Generator02 extends FunctionChunkGenerator {

    constructor() {
        super();
        const scale = 1;
            const node0 = new GenericNode([], {
                gen: new OpenSimplex2Noise({
                    frequency: 0.01 * scale,
                    octaves: 4
                })
            }, (values, data, x, y) => data.gen.gen(x, y));
        
            const node1 = new GenericNode([node0], {
                gen: new OpenSimplex2Noise({
                    seed: 123,
                    frequency: 0.003 * scale,
                    octaves: 4
                })
            }, (values, data, x, y) => blend(values[0], data.gen.gen(x, y), BLEND_MODE.NORMAL, 0.5));
        
           
               const riverNode = new GenNode(
                   new OpenSimplex2Noise({
                       seed: 1223357,
                       frequency: 0.001 * scale,
                       octaves: 2
                   }));
           
               const riverWidthNode = new CurveNode(
                   new GenNode(new OpenSimplex2Noise({
                       seed: 123,
                       frequency: 0.003 * scale,
                       octaves: 2
                   })),
                   new LinearCurve([point(0, 0.0), point(1, 1)])
               );
           
               const riverCurveNode = new GenericNode([riverNode, riverWidthNode],
                   {
                       wideCurve: new LinearCurve([point(0.4, 1), point(0.495, 0.01), point(0.5005, 0.01), point(0.6, 1)]),
                       curve: new LinearCurve([point(0, 0), point(0.4, 1)])
                   }, (srcValues, data, x, y) => {
                       const spread = 0.01 * srcValues[1];
                       const spread2 = 0.3 * srcValues[1];
                       data.wideCurve.points[1].x = 0.5 - spread / 2;
                       data.wideCurve.points[2].x = 0.5 + spread / 2;
                       data.wideCurve.points[0].x = 0.45 - spread2 / 2;
                       data.wideCurve.points[3].x = 0.55 + spread2 / 2;
                       return data.curve.apply(data.wideCurve.apply(srcValues[0]));
                   }
               )
        
            const mergeNode = new GenericNode([node1, riverCurveNode], {}, (values) => {
                return values[0] * values[1];
            });

        this.setFunc((x, y) => mergeNode.gen(x, y, posToKey(x, y))
        );

    }
}
