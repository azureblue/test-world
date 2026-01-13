import { Generator, Reducer } from "./noise.js";


export class FBM extends Reducer {
    #octaves;
    #frequency;
    #lacunarity;
    #gain;
    #extractor;

    /**
     * @param {Object} [fbmOptions]
     * @param {number} [fbmOptions.octaves=5]
     * @param {number} [fbmOptions.frequency=1.0]
     * @param {number} [fbmOptions.lacunarity=2.0]
     * @param {number} [fbmOptions.gain=0.5]
     * @param {Reducer} [extractor]
     */
    constructor({ octaves = 5, frequency = 1.0, lacunarity = 2.0, gain = 0.5 } = {}, extractor = Reducer.default) {
        super();
        this.#octaves = octaves;
        this.#frequency = frequency;
        this.#lacunarity = lacunarity;
        this.#gain = gain;
        this.#extractor = extractor;
    }

  
    apply(gen, x, y) {
        let sum = 0;
        let amp = 1.0;
        let freq = this.#frequency;
        let ampSum = 0;

        for (let i = 0; i < this.#octaves; i++) {
            const n = this.#extractor.apply(gen, x * freq, y * freq);
            sum += n * amp;
            ampSum += amp;
            freq *= this.#lacunarity;
            amp *= this.#gain;
        }
        return sum / ampSum; // [0,1]        
    }

    static reducer({octaves = 5, frequency = 1.0, lacunarity = 2.0, gain = 0.5 } = {}, extractor = Reducer.default) {
        return new FBM({ octaves, frequency, lacunarity, gain }, extractor);
    }

    static generator(gen, {octaves = 5, frequency = 1.0, lacunarity = 2.0, gain = 0.5 } = {}, extractor = Reducer.default) {
        const fbm = new FBM({ octaves, frequency, lacunarity, gain }, extractor);
        return new class extends Generator {
            gen(x, y) {
                return fbm.apply(gen, x, y);
            }
        }();
    }

}
