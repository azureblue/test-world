import { Resources } from "../utils.js";
import { Generator, NoiseSource } from "./noise.js";

const wasmResult = await WebAssembly.instantiateStreaming(fetch(Resources.relativeToRoot("./noise/openSimplex2Noise.wasm")));
const open_simplex_2_noise_scaled = wasmResult.instance.exports.open_simplex_2_noise_scaled;
const open_simplex_2_noise_octaves = wasmResult.instance.exports.open_simplex_2_noise_octaves;
const open_simplex_2_noise = wasmResult.instance.exports.open_simplex_2_noise;


export const OPEN_SIMPLEX_NOISE_2D_SOURCE = open_simplex_2_noise;

export class SimplexNoiseGenerator extends Generator {

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

    octaveNoise(x, y) {
        return open_simplex_2_noise_octaves(this.seed, x, y, this.frequency, this.octaves, this.lacunarity, this.gain)
    }

    static scaledNoise(seed, x, y, freq) {
        return open_simplex_2_noise_scaled(seed, x, y, freq);
    }

    static rawNoise(seed, x, y) {
        return open_simplex_2_noise(seed, x, y);
    }
}

export class SimplexNoise {
    static seed(seed) {
        return new NoiseSource(OPEN_SIMPLEX_NOISE_2D_SOURCE).seed(seed);
    }    
}