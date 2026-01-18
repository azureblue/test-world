import { hash01, wang_hash2d } from "./hash.js";
import { Generator } from "./noise.js";

export class Hash01Noise extends Generator {

    #seed;

    constructor(seed) {
        super();
        this.#seed = seed;
    }

    gen(x, y) {
        return hash01(Math.floor(x), Math.floor(y), this.#seed);
    }
}

export class Hasn2DNoise extends Generator {

    #seed;

    constructor(seed) {
        this.#seed = seed;
    }

    get(x, y) {
        wang_hash2d(this.#seed, x, y);

    }

}
