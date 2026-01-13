
/**
 * @typedef {(seed: number, x: number, y: number) => number} RawNoise
 */


export class NoiseSource {
    #rawNoise;

    /**
     * @param {RawNoise} rawNoise 
     */
    constructor(rawNoise) {
        this.#rawNoise = rawNoise;
    }

    rawNoise(seed, x, y) {
        return this.#rawNoise(seed, x, y);
    }

    seed(seed) {
        return new SeededGenerator(this.#rawNoise, seed);
    }
}

export class Generator {
    gen(x, y) {
        return 0;
    }

    static ZERO = new class extends Generator {
        gen(x, y) {
            return 0;
        }
    };
}


export class Postprocessor {

    postprocess(value) {
        return value;
    }


    /**
     * @param {(v: number) => number} func 
     */
    static of(func) {
        return new class extends Postprocessor {
            postprocess(value) {
                return func(value);
            }
        }
    }
}

export class Preprocessor extends Generator {

    #out = new Float64Array(2);
    constructor(preprocessor) {
        super();
    }

    /**
     * @param {number} x 
     * @param {number} y 
     * @param {number[]} out 
     */
    preprocess(x, y, out) {
        out[0] = x;
        out[1] = y;
    }

    /**
     * @param {(x: number, y: number, out: number[]) => void} func 
     */
    static of(func) {
        return new class extends Preprocessor {
            preprocess(x, y, out) {
                func(x, y, out);
            }
        }
    }
}

export class Reducer {

    /**
     * @param {Generator} gen 
     * @param {number} x 
     * @param {number} y 
     */
    apply(gen, x, y) {
        return gen.gen(x, y);
    }

    static default = new Reducer();
}


export class DomainWrap extends Preprocessor {

    #warpFreq;
    #warpAmp
    #noiseGenerator;

    /** 
     * @param {Object} options
     * @param {Generator} options.noiseGenerator
     * @param {number} [options.warpFreq=1.0]
     * @param {number} [options.warpAmp=1.0]
     */
    constructor({ noiseGenerator, warpFreq = 1.0, warpAmp = 1.0 } = {}) {
        super();
        this.#noiseGenerator = noiseGenerator;
        this.#warpFreq = warpFreq;
        this.#warpAmp = warpAmp;
    }

    preprocess(x, y, out) {
        const wx = 2.0 * this.#noiseGenerator.gen(x * this.#warpFreq, y * this.#warpFreq) - 1.0;
        const wy = 2.0 * this.#noiseGenerator.gen((x + 17.3) * this.#warpFreq, (y + 9.2) * this.#warpFreq) - 1.0;
        out[0] = x + wx * this.#warpAmp;
        out[1] = y + wy * this.#warpAmp;
    }
}


export class Noise extends Generator {
    #gen;
    #preprocessors;
    #reducer;
    #postprocessors;
    #tmp = new Float64Array(2);

    /**
     * @param {Generator} gen 
     * @param {Object} options
     * @param {Preprocessor[]} options.preprocessors
     * @param {Reducer} options.reducer
     * @param {Postprocessor[]} options.postprocessors 
     */
    constructor(gen, { preprocessors = [], reducer = Reducer.default, postprocessors = [] } = {}) {
        super();
        this.#gen = gen;
        this.#preprocessors = preprocessors;
        this.#reducer = reducer;
        this.#postprocessors = postprocessors;
    }

    gen(x, y) {        
        for (const pre of this.#preprocessors) {
            pre.preprocess(x, y, this.#tmp);
            x = this.#tmp[0];
            y = this.#tmp[1];
        }

        let value = this.#reducer.apply(this.#gen, x, y);

        for (const post of this.#postprocessors) {
            value = post.postprocess(value);
        }

        return value;
    }
}





// export class CustomKernelNoise extends NoiseGenerator {
//     #gen;
//     #kernel;

//     /**
//      * @param {NoiseGenerator} gen
//      * @param {(n: number) => number} kernel
//      */
//     constructor(gen, kernel) {
//         super();
//         this.#gen = gen;
//         this.#kernel = kernel;
//     }

//     gen(x, y) {
//         return this.#kernel(this.#gen.gen(x, y));
//     }
// }

export class SeededGenerator extends Generator {
    rawNoise;
    #seed;

    /**
     * @param {RawNoise} rawNoise 
     * @param {number} seed 
     */
    constructor(rawNoise, seed) {
        super();
        this.rawNoise = rawNoise;
        this.#seed = seed;
    }

    gen(x, y) {
        return this.rawNoise(this.#seed, x, y);
    }
}


/**
 * @param {NoiseSource} noiseSource
 * @param {number} seed
 * @param {number} x 
 * @param {number} y 
 * @param {number} octaves 
 * @param {number} frequency 
 * @param {number} lacunarity 
 * @param {number} gain 
 * @returns {number} noise value in range [0,1]
 */
export function ridge_noice_fbm01(noiseSource, seed, x, y, octaves = 5, frequency = 1.0, lacunarity = 2.0, gain = 0.5, power = 2.0) {
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


export class RidgeNoise2D extends Generator {
    #seed
    #power

    constructor(seed = 0, power = 2.0) {
        super();
        this.#seed = seed;
        this.#power = power;
    }

    gen(x, y) {
        const n = OPEN_SIMPLEX_NOISE_2D_SOURCE(this.#seed, x, y);
        let r = 1.0 - Math.abs(2.0 * n - 1.0);   // [0,1], ridge at 0.5
        r = Math.pow(r, power);                  // sharpen ridges
        return r;
    }
}


export function fbm(noiseSource, x, y, octaves = 5, frequency = 1.0, lacunarity = 2.0, gain = 0.5) {
    let sum = 0;
    let amp = 1.0;
    let freq = frequency;
    let ampSum = 0;

    for (let i = 0; i < octaves; i++) {
        const n = noiseSource(seed, x * freq, y * freq);
        sum += r * amp;
        ampSum += amp;

        freq *= lacunarity;
        amp *= gain;
    }
    return sum / ampSum; // [0,1]
}

