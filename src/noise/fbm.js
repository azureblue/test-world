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

/**
 * Ridged multifractal (Musgrave): per octave the ridges of the noise (1 - |n|, squared: narrower), each octave weighted
 * by the ones before it, so the detail is on the ridges and high parts and the valleys between them stay smooth, not
 * the same lumps everywhere like ridged fBm. 0..1.
 */
export class RidgedFBM extends Extractor {
    #octaves;
    #frequency;
    #lacunarity;
    #gain;
    #weight;

    /**
     * @param {Object} [options]
     * @param {number} [options.weight=2] how much an octave follows the ones before it: higher, the less detail in
     *   the low parts
     */
    constructor({ octaves = 6, frequency = 1.0, lacunarity = 2.0, gain = 0.5, weight = 2.0 } = {}) {
        super();
        this.#octaves = octaves;
        this.#frequency = frequency;
        this.#lacunarity = lacunarity;
        this.#gain = gain;
        this.#weight = weight;
    }

    /**
     * @param {Generator} gen
     * @param {number} x
     * @param {number} y
     */
    apply(gen, x, y) {
        let sum = 0, amp = 1, ampSum = 0, freq = this.#frequency, weight = 1;
        for (let i = 0; i < this.#octaves; i++) {
            let s = 1 - Math.abs(gen.gen(x * freq, y * freq));
            s *= s * weight;
            weight = Math.min(1, s * this.#weight);
            sum += s * amp;
            ampSum += amp;
            freq *= this.#lacunarity;
            amp *= this.#gain;
        }
        return sum / ampSum;
    }
}

/**
 * fBm whose octaves fade where the octaves before them are steep (Inigo Quilez's "erosion" fBm): slopes stay clean
 * and the detail gathers on the tops and valley floors, which then look carved rather than lumpy. The steepness is the
 * sum of the octaves' gradients (finite differences, each in its octave's scale). Spans less than FBM: more of the
 * values near 0 (the strength 0.2: about a third less spread).
 */
export class ErodedFBM extends Extractor {
    static #EPS = 0.01;
    #octaves;
    #frequency;
    #lacunarity;
    #gain;
    #strength;

    /**
     * @param {Object} [options]
     * @param {number} [options.strength=0.2] how much the steepness fades the octaves (0: plain fBm)
     */
    constructor({ octaves = 5, frequency = 1.0, lacunarity = 2.0, gain = 0.5, strength = 0.2 } = {}) {
        super();
        this.#octaves = octaves;
        this.#frequency = frequency;
        this.#lacunarity = lacunarity;
        this.#gain = gain;
        this.#strength = strength;
    }

    /**
     * @param {Generator} gen
     * @param {number} x
     * @param {number} y
     */
    apply(gen, x, y) {
        const eps = ErodedFBM.#EPS;
        let sum = 0, amp = 1, ampSum = 0, freq = this.#frequency, dx = 0, dy = 0;
        for (let i = 0; i < this.#octaves; i++) {
            const px = x * freq, py = y * freq;
            const n = gen.gen(px, py);
            dx += (gen.gen(px + eps, py) - n) / eps;
            dy += (gen.gen(px, py + eps) - n) / eps;
            sum += amp * n / (1 + this.#strength * (dx * dx + dy * dy));
            ampSum += amp;
            freq *= this.#lacunarity;
            amp *= this.#gain;
        }
        return sum / ampSum;
    }
}
