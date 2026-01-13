import { wang_hash2d } from "./hash";

export class Hash01Noise extends NoiseGenerator {

    #seed;

    constructor(seed) {
        super();
        this.#seed = seed;
    }

    get(x, y) {
        return hash01(Math.floor(x), Math.floor(y), this.#seed);
    }
}

export class Hasn2DNoise extends NoiseGenerator {

    #seed;

    constructor(seed) {
        this.#seed = seed;
    }

    get(x, y) {
        wang_hash2d(this.#seed, x, y);

    }

}
