import { blend, BLEND_MODE } from "../blend.js";
import { BLOCK_IDS } from "../blocks.js";
import { ChunkData } from "../chunk.js";
import { CHUNK_SIZE } from "../consts.js";
import { Vec2, Vec3 } from "../geom.js";
import { hash01, hash32 } from "../noise/hash.js";
import { Generator } from "../noise/noise.js";
import { SimplexNoiseGenerator } from "../noise/opensimplex2.js";
import { ImagePixels } from "../utils.js";
import { LinearCurve, point } from "./curve.js";
import { testgen } from "./generators.js";
import { CurveNode, GenericNode, GenNode } from "./node.js";


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
                    chunk.setHXY(r, x, ry, BLOCK_IDS.ROCK);
                }
                for (let e = height - dirtLayer; e < height - 1; e++) {
                    chunk.setHXY(e, x, ry, BLOCK_IDS.DIRT);
                }
                if (dirtLayer > 0) {
                    chunk.setHXY(height - 1, x, ry, BLOCK_IDS.DIRT_GRASS);
                    if (Math.random() < 0.02 && height < CHUNK_HEIGHT - 1) {
                        chunk.setHXY(height, x, ry, BLOCK_IDS.GRASS_SHORT);
                    }
                }
                // if (Math.random() < 0.1)
                //     chunk.set(height, x, ry, BLOCK_IDS.ROCK);

                for (let w = height; w < 30; w++) {
                    if (chunk.get(w, x, ry) == BLOCK_IDS.EMPTY)
                        chunk.setHXY(w, x, ry, BLOCK_IDS.WATER);
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
                        chunk.setHXY(h, x, y, this.#blocks[Math.round(this.#rng.uniform() * 3)]);
                    }
                }
        return chunk;
    }
}
const MAX_HEIGHT = 100;



function seedOffset(seed) {
    const hx = hash32(seed ^ 0x9e3779b9);
    const hy = hash32(seed ^ 0x85ebca6b);

    // map [0..2^32) -> [-1e6..1e6]
    const ox = (hx >>> 0) / 0xffffffff * 2e6 - 1e6;
    const oy = (hy >>> 0) / 0xffffffff * 2e6 - 1e6;

    return { ox, oy };
}

// --- helpers ---
function lerp(a, b, t) { return a + (b - a) * t; }
function clamp01(x) { return x < 0 ? 0 : (x > 1 ? 1 : x); }

/**
 * Rotate (x,y) by angle and apply anisotropic stretch to Y.
 * Returns [xr, yr].
 */
function rotateAndStretch(x, y, angle, stretchY) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const xr = x * c - y * s;
    const yr = (x * s + y * c) * stretchY;
    return [xr, yr];
}

/**
 * fBm where noise(x,y) is assumed to be in [0,1].
 * Output is normalized to [0,1] (weighted average).
 */
function fbm01(x, y, noise01, {
    octaves = 5,
    frequency = 1.0,
    lacunarity = 2.0,
    gain = 0.5
} = {}) {
    let sum = 0;
    let amp = 1.0;
    let freq = frequency;
    let ampSum = 0;

    for (let i = 0; i < octaves; i++) {
        sum += amp * noise01(x * freq, y * freq); // [0,1]
        ampSum += amp;
        freq *= lacunarity;
        amp *= gain;
    }
    return sum / ampSum; // [0,1]
}

export class RidgeNoiseNode extends GenNode {
    /**
     * @param {Generator} noiseSource
     * @param {Object} options
     * @param {number} [options.seed=0]
     * @param {number} [options.octaves=5]
     * @param {number} [options.frequency=1.0]
     * @param {number} [options.lacunarity=2.0]
     * @param {number} [options.gain=0.5]
     * @param {number} [options.power=3.0]
     */
    constructor(rawNoiseSource, {
        seed = 0,
        octaves = 1,
        frequency = 1.0,
        lacunarity = 2.0,
        gain = 0.5,
        power = 3.0
    } = {}) {
        super({
            gen: (x, y) => {

                function worley(x, y) {

                    let F1 = Infinity;
                    let F2 = Infinity;

                    const cx = Math.floor(x);
                    const cy = Math.floor(y);

                    for (let dy = -1; dy <= 1; dy++) {
                        for (let dx = -1; dx <= 1; dx++) {
                            const ix = cx + dx;
                            const iy = cy + dy;

                            // generate feature point in this cell
                            const fx = ix + hash01(seed, ix, iy);
                            const fy = iy + hash01(seed, ix + 17, iy + 23);

                            const dxp = fx - x;
                            const dyp = fy - y;
                            const d2 = dxp * dxp + dyp * dyp; // squared distance                            
                            if (d2 < F1) {
                                F2 = F1;
                                F1 = d2;
                            } else if (d2 < F2) {
                                F2 = d2;
                            }
                        }
                    }
                    return [F1, F2];
                    // return Math.sqrt(m);
                }


                let sum = 0;
                let amp = 1.0;
                let freq = frequency;
                let ampSum = 0;

                const bubblePow = 3.0;     // twardość bąbli (2..5)
                const edgeA = 0.03;        // start “krawędzi”
                const edgeB = 0.10;        // koniec “krawędzi”
                const edgePow = 2.0;       // kontrast szczelin (1.5..3)
                const edgeStrength = 0.9;  // jak mocno przyciemniać krawędzie (0..1)

                for (let i = 0; i < octaves; i++) {
                    const n = rawNoiseSource(seed, x * freq, y * freq);   // [0,1]
                    // let r = Math.sqrt(F2) - Math.sqrt(F1)   // [0,1], ridge at 0.5
                    let [f1, f2] = worley(x * freq, y * freq);

                    let b = (1 - f1) * (1 - f2);      // [~0..1]
                    // b = hash01(x * freq, y * freq, seed + 9); // add some noise
                    // b = n;

                    // --- edges (cell borders)
                    // const d = Math.sqrt(f2) - Math.sqrt(f1);     // małe przy granicy
                    // let e = 1 - smoothstep(edgeA, edgeB, d);     // 1 na granicy, 0 w środku
                    // e = Math.pow(clamp01(e), edgePow);

                    // --- combine
                    const v = b;// * (1 - edgeStrength * e);

                    // let v = 1 - Math.sqrt(f1) * 1;      // blob field
                    // v  = v * v;
                    // v = spreadTanh(v, 2);

                    // let v = 1 - Math.sqrt(f1);        // ~[0..1]
                    // v = v  * v
                    // v = spreadTanh(v, 2);
                    // b = clamp01(b);

                    // // jasne wnętrza (popcorn look)
                    // const bubbles = Math.pow(b, bubblePow);

                    // // czarne krawędzie: tam gdzie b małe (blisko granicy komórki)
                    // const edges = Math.pow(1 - b, edgePow);

                    // // miks: jasne bąble, czarne szczeliny
                    // let v = bubbles * (1 - 0.9 * edges);

                    // v = v * v;
                    // v = Math.max(0, Math.min(1, v));
                    // v = Math.pow(v, 2.0);
                    let r = v;
                    // r = smoothstep(0.01, 0.90, r);
                    // r = Math.pow(r, power);                  // sharpen ridges
                    sum += r * amp;
                    ampSum += amp;

                    freq *= lacunarity;
                    amp *= gain;
                }
                return sum / ampSum; // [0,1]              
            }
        })
    }
}


export class NoRidgeNoiseNode extends GenNode {
    /**
     * @param {Generator} noiseSource
     * @param {Object} options
     * @param {number} [options.seed=0]
     * @param {number} [options.octaves=5]
     * @param {number} [options.frequency=1.0]
     * @param {number} [options.lacunarity=2.0]
     * @param {number} [options.gain=0.5]
     * @param {number} [options.power=3.0]
     */
    constructor(rawNoiseSource, {
        seed = 0,
        octaves = 5,
        frequency = 1.0,
        lacunarity = 2.0,
        gain = 0.5,
        power = 3.0
    } = {}) {
        super({
            gen: (x, y) => {
                let sum = 0;
                let amp = 1.0;
                let freq = frequency;
                let ampSum = 0;

                for (let i = 0; i < octaves; i++) {
                    const n = rawNoiseSource(seed, x * freq, y * freq);   // [0,1]
                    let r = 1.0 - Math.abs(2.0 * n - 1.0);   // [0,1], ridge at 0.5
                    r = Math.pow(r, power);                  // sharpen ridges
                    sum += r * amp;
                    ampSum += amp;

                    freq *= lacunarity;
                    amp *= gain;
                }
                return sum / ampSum; // [0,1]              
            }
        })
    }
}


export class DomainWarpNode extends GenNode {
    constructor(srcNode, noiseGen, {
        warpFreq = 1.0,
        warpAmp = 1.0
    } = {}) {
        super({
            gen: (x, y) => {
                const wx = noiseGen.gen(x * warpFreq, y * warpFreq); // [-1,1]
                const wy = noiseGen.gen((x + 17.3) * warpFreq, (y + 9.2) * warpFreq);
                return srcNode.gen(x + wx * warpAmp, y + wy * warpAmp * 0, x * 2024 + y);
            }
        });
    }
}

// class RotateAndStretchNode extends Node {
//     constructor(angle, stretchY) {
//         super()
//         this.angle = angle;
//         this.stretchY = stretchY;
//     }
// }

/**
 * Ridge fBm built from noise01 in [0,1].
 * Ridge transform: r = 1 - |2n - 1|  (peaks around n=0.5)
 * Output is normalized to [0,1].
 */
function ridgeFbm01(x, y, noise01, {
    octaves = 5,
    frequency = 1.0,
    lacunarity = 2.0,
    gain = 0.5,
    power = 3.0
} = {}) {
    let sum = 0;
    let amp = 1.0;
    let freq = frequency;
    let ampSum = 0;

    for (let i = 0; i < octaves; i++) {
        const n = noise01(x * freq, y * freq);   // [0,1]
        let r = 1.0 - Math.abs(2.0 * n - 1.0);   // [0,1], ridge at 0.5
        r = Math.pow(r, power);                  // sharpen ridges
        sum += r * amp;
        ampSum += amp;

        freq *= lacunarity;
        amp *= gain;
    }
    return sum / ampSum; // [0,1]
}

function spreadTanh(v, k = 2.5) {
    const x = v * 2 - 1;
    return (Math.tanh(x * k) + 1) * 0.5;
}

/**
 * Directional domain warp using noise01 in [0,1].
 * We convert noise to signed offset in [-1,1] via (2n-1).
 */
function domainWarp01(x, y, noise01, {
    warpFreq = 1.0,
    warpAmp = 1.0
} = {}) {
    const wx = 2.0 * noise01(x * warpFreq, y * warpFreq) - 1.0; // [-1,1]
    const wy = 2.0 * noise01((x + 17.3) * warpFreq, (y + 9.2) * warpFreq) - 1.0;
    return [x + wx * warpAmp, y + wy * warpAmp];
}


/**
 * Final height in [0,1].
 * noise01 must be a function (x,y)->[0,1] (your OpenSimplex wrapper).
 */
function height01(x, y, noise01, {
    // base terrain
    baseOctaves = 5,
    baseFrequency = 0.002,
    baseLacunarity = 2.0,
    baseGain = 0.5,

    // mountains layer (linear features)
    angle = 0.7,
    stretchY = 0.25,

    warpFreq = 0.001,
    warpAmp = 120.0,

    mountOctaves = 4,
    mountFrequency = 0.004,
    mountLacunarity = 2.0,
    mountGain = 0.4,
    mountPower = 3.0,

    // blend
    mountainsMix = 0.6
} = {}) {
    // --- base ---
    const base = fbm01(x, y, noise01, {
        octaves: baseOctaves,
        frequency: baseFrequency,
        lacunarity: baseLacunarity,
        gain: baseGain
    }); // [0,1]

    // --- mountains coords: rotate + anisotropic stretch ---
    let [mx, my] = rotateAndStretch(x, y, angle, stretchY);

    // --- directional warp (creates long corridors/passes) ---
    [mx, my] = domainWarp01(mx, my, noise01, { warpFreq, warpAmp });

    // --- ridge mountains ---
    const mount = ridgeFbm01(mx, my, noise01, {
        octaves: mountOctaves,
        frequency: mountFrequency,
        lacunarity: mountLacunarity,
        gain: mountGain,
        power: mountPower
    }); // [0,1]

    // --- blend, guaranteed [0,1] ---
    const h = lerp(base, mount, mountainsMix);
    return clamp01(h);
}

export class NoiseChunkGenerator {
    #offests
    #noise = new SimplexNoiseGenerator({
        seed: 23456,
        frequency: 0.01,
        gain: 0.5,
        octaves: 5
    });

    #iter = 0;

    // goodNoise0 = new Noise(
    //     SimplexNoise.seed(1192),
    //     {
    //         preprocessors: [
    //             DomainWrap.basic({
    //                 noiseGenerator: new Noise(
    //                     SimplexNoise.seed(1234), { reducer: FBM.reducer({ octaves: 10, frequency: 0.005 }) }
    //                 ),
    //                 warpFreq: 1,
    //                 warpAmp: 200
    //             })
    //         ],
    //         reducer: FBM.reducer({
    //             octaves: 1,
    //             frequency: 0.002,
    //             lacunarity: 2,
    //             gain: 0.8
    //         }
    //             , CellularNoise.worleyReducer(123111, (f1, f2) => {
    //                 const a = unnormalize(1 - Math.sqrt(f1)) / 2;
    //                 return spreadSin11(a );
    //             })
    //         )
    //     });
    goodNoise0 = testgen()

    // goodNoise0 = new Noise(
    //         SimplexNoise.seed(1),
    //         {
    //             preprocessors: [
    //                 DomainWrap.basic({
    //                     noiseGenerator: new Noise(
    //                         SimplexNoise.seed(1234), { reducer: FBM.reducer({ octaves: 10, frequency: 0.005 })}
    //                     ),
    //                     warpFreq: 1,
    //                     warpAmp: 200
    //                 })
    //             ],
    //             reducer: FBM.reducer({
    //                 octaves: 1,
    //                 frequency: 0.002,
    //                 lacunarity: 2,
    //                 gain: 0.4
    //             }, CellularNoise.worleyReducer(11, (f1, f2) => {
    //                 const a = unnormalize(1 - Math.sqrt(f1));
    //                 return spreadSin11(a / 2 - 0.5) + 0.5;

    //             })
    //                 // , (v) => Math.abs(2.0 * v - 1)
    //             )
    //         });


    #rigedNoise = new RidgeNoiseNode(SimplexNoiseGenerator.rawNoise, {
        seed: 23456,
        frequency: 0.01,
        octaves: 2
    });

    constructor() {
        this.#offests = seedOffset(this.#noise.seed);
        this.#offests.ox = 0;
        this.#offests.oy = 0;
    }

    /**
     * @param {Vec3} chunkPos
     */
    generateChunk(chunkPos) {
        const chunk = new ChunkData();
        // if (chunkPos.z !== 0) {
        //     return chunk;
        // }
        const startX = (chunkPos.x * CHUNK_SIZE);
        const startY = (chunkPos.y * CHUNK_SIZE);
        // if (startX != 0 || startY != 0) {
        //      return chunk;
        // }

        for (let y = 0; y < CHUNK_SIZE; y++)
            for (let x = 0; x < CHUNK_SIZE; x++) {
                const rx = x; //CHUNK_SIZE - x - 1;
                const ry = y;//CHUNK_SIZE - y - 1;
                const noiseOutput = this.goodNoise0.gen(x + startX + this.#offests.ox, y + startY + this.#offests.oy);
                //ridgeFbm01(x + startX + this.#offests.ox, y + startY + this.#offests.oy, (x, y) => this.#noise.gen(x, y));
                //this.#noise.octaveNoise(x + startX + this.#offests.ox, y + startY + this.#offests.oy);
                const noiseImproved = noiseOutput; //spreadTanh(noiseOutput, 2);
                let height = Math.floor(noiseImproved * MAX_HEIGHT);

                const chunkStartH = chunkPos.z * CHUNK_SIZE;
                const chunkEndH = chunkStartH + CHUNK_SIZE;
                let r = chunkStartH;
                for (; r < Math.min(height - 1, chunkEndH); r++) {
                    chunk.setHXY(r - chunkStartH, rx, ry, BLOCK_IDS.DIRT);
                }

                if (r < chunkEndH && r < height) {
                    chunk.setHXY(r - chunkStartH, rx, ry, BLOCK_IDS.DIRT_GRASS);
                }

                for (let w = r; w < Math.min(-55, chunkEndH); w++) {
                    if (chunk.getHXY(w - chunkStartH, rx, ry) == BLOCK_IDS.EMPTY)
                        chunk.setHXY(w - chunkStartH, rx, ry, BLOCK_IDS.WATER);
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
                    chunk.setHXY(r, rx, ry, BLOCK_IDS.ROCK);
                }
                for (let e = height - dirtLayer; e < height - 1; e++) {
                    chunk.setHXY(e, rx, ry, BLOCK_IDS.DIRT);
                }
                if (dirtLayer > 0) {
                    chunk.setHXY(height - 1, rx, ry, BLOCK_IDS.DIRT_GRASS);
                    if (Math.random() < 0.02 && height < CHUNK_HEIGHT - 1) {
                        chunk.setHXY(height, rx, ry, BLOCK_IDS.GRASS_SHORT);
                    }
                }
                // if (Math.random() < 0.1)
                //     chunk.set(height, x, ry, BLOCK_IDS.ROCK);

                for (let w = height; w < 20; w++) {
                    if (chunk.get(w, rx, ry) == BLOCK_IDS.EMPTY)
                        chunk.setHXY(w, rx, ry, BLOCK_IDS.WATER);
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
            gen: new SimplexNoiseGenerator({
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
            new SimplexNoiseGenerator({
                seed: 1223357,
                frequency: 0.001 * scale,
                octaves: 2
            }));

        const riverWidthNode = new CurveNode(
            new GenNode(new SimplexNoiseGenerator({
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

        this.setFunc((x, y) => mergeNode.gen(x, y, 0)
        );

    }
}
