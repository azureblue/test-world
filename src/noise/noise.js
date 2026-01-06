import { Resources } from "../utils.js";

const wasmResult = await WebAssembly.instantiateStreaming(fetch(Resources.relativeToRoot("./noise/openSimplex2Noise.wasm")));
const open_simplex_2_noise_scaled = wasmResult.instance.exports.open_simplex_2_noise_scaled;
const open_simplex_2_noise_octaves = wasmResult.instance.exports.open_simplex_2_noise_octaves;
const open_simplex_2_noise = wasmResult.instance.exports.open_simplex_2_noise;

export class NoiseGenerator {
    gen(x, y) {

    }
}

export class RandomNoise extends NoiseGenerator {

    #seed;

    constructor(seed) {
        this.#seed = seed;
    }

    get(x, y) {
        //wang_hash2d
        let h = x;
        h = (h ^ 61) ^ (h >>> 16);
        h = h + (h << 3);
        h = h ^ (h >>> 4);
        h = h * 0x27d4eb2d;
        h = h ^ (h >>> 15);
    
        h += y + this.#seed;
        h = (h ^ 61) ^ (h >>> 16);
        h = h + (h << 3);
        h = h ^ (h >>> 4);
        h = h * 0x27d4eb2d;
        h = h ^ (h >>> 15);
    
        return (h >>> 0) / 0x100000000; // [0, 1)
    }
    
}

export class OpenSimplex2Noise extends NoiseGenerator {

    static parameters() {
        return [
            { name: "seed", type: "number", increment: 1, default: 0 },
            { name: "octaves", type: "number", increment: 1, default: 1 },
            { name: "frequency", type: "number", increment: 0.001, default: 0.01 },
            { name: "lacunarity", type: "number", increment: 0.1, default: 2 },
            { name: "gain", type: "number", increment: 0.01, default: 0.5 }
        ];
    }

    /**
    * @param {number} seed
    * @param {Object} options
    * @param {number} [options.octaves=1]
    * @param {number} [options.frequency=1.0]
    * @param {number} [options.lacunarity=2.0]
    * @param {number} [options.gain=0.5]
    */
    setParameters({
        seed = this.seed,
        octaves = this.octaves,
        frequency = this.frequency,
        lacunarity = this.lacunarity,
        gain = this.gain
    } = {}) {
        this.seed = seed;
        this.octaves = octaves;
        this.frequency = frequency;
        this.lacunarity = lacunarity;
        this.gain = gain;
    }

    /**
     * @param {Object} options
     * @param {number} [options.seed=0]
     * @param {number} [options.octaves=1]
     * @param {number} [options.frequency=1.0]
     * @param {number} [options.lacunarity=2.0]
     * @param {number} [options.gain=0.5]
     */
    constructor({
        seed = 0,
        octaves = 1,
        frequency = 1.0,
        lacunarity = 2.0,
        gain = 0.5
    } = {}) {
        super();
        this.seed = seed;
        this.octaves = octaves;
        this.frequency = frequency;
        this.lacunarity = lacunarity;
        this.gain = gain;
    }


    gen(x, y) {
        return this.octaveNoise(x, y);
    }

    /**
     * Multi-octave fractal noise
     */
    octaveNoise(x, y) {
        return open_simplex_2_noise_octaves(this.seed, x, y, this.frequency, this.octaves, this.lacunarity, this.gain)
    }

    /**
    * Scaled noise with frequency applied
    */
    static scaledNoise(seed, x, y, freq) {
        return open_simplex_2_noise_scaled(seed, x, y, freq);
    }

    static rawNoise(seed, x, y) {
        return open_simplex_2_noise(seed, x, y);
    }
}
