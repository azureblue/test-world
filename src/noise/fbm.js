import { Extractor, Generator, Processor, SeededGenerator, SeedStream } from "./noise.js";


export class FBM extends Extractor {
    #octaves;
    #frequency;
    #lacunarity;
    #gain;
    #differentSeedPerOctave;
    #processor;

    /**
     * @param {Object} [fbmOptions]
     * @param {number} [fbmOptions.octaves=5]
     * @param {number} [fbmOptions.frequency=1.0]
     * @param {number} [fbmOptions.lacunarity=2.0]
     * @param {number} [fbmOptions.gain=0.5]
     * @param {Processor} [processor]
     */
    constructor({
        octaves = 5,
        frequency = 1.0,
        lacunarity = 2.0,
        gain = 0.5,
        differentSeedPerOctave = false,
        processor = Processor.default } = {}) {
        super();
        this.#octaves = octaves;
        this.#frequency = frequency;
        this.#lacunarity = lacunarity;
        this.#gain = gain;
        this.#differentSeedPerOctave = differentSeedPerOctave;
        this.#processor = processor;
    }

    /**
     * @param {SeededGenerator} gen
     * @param {number} x
     * @param {number} y
     * @returns 
     */
    apply(gen, x, y) {
        let sum = 0;
        let amp = 1.0;
        let freq = this.#frequency;
        let ampSum = 0;
        const seed = gen.seed;
        let octaveSeed = seed;
        try {
            for (let i = 0; i < this.#octaves; i++) {
                if (this.#differentSeedPerOctave) {
                    octaveSeed = SeedStream.nextSeed(octaveSeed);
                    gen.seed = octaveSeed;
                }
                const v = this.#processor.apply(gen.gen(x * freq, y * freq));
                sum += v * amp;
                ampSum += amp;
                freq *= this.#lacunarity;
                amp *= this.#gain;
            }
        } finally {
            if (this.#differentSeedPerOctave) {
                gen.seed = seed;
            }
        }
        return sum / ampSum;
    }

    static reducer({ octaves = 4, frequency = 1.0, lacunarity = 2.0, gain = 0.5, differentSeedPerOctave = false, processor = Processor.default } = {}) {
        return new FBM({ octaves, frequency, lacunarity, gain, differentSeedPerOctave, processor });
    }

    /**
     * @param {SeededGenerator} gen 
     * @returns 
     */
    static generator(gen, { octaves = 5, frequency = 1.0, lacunarity = 2.0, gain = 0.5, differentSeedPerOctave = false, processor = Processor.default } = {}) {
        const fbm = new FBM({ octaves, frequency, lacunarity, gain, differentSeedPerOctave, processor });
        return new class extends Generator {
            constructor() {
                super();
            }

            gen(x, y) {
                return fbm.apply(gen, x, y);
            }
        }();
    }
}
