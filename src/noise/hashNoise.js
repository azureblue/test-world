import { unnormalize } from "../functions.js";
import { hash01 } from "./hash.js";
import { Generator } from "./noise.js";

export class Hash01Noise extends Generator {

    #seed;

    constructor(seed) {
        super();
        this.#seed = seed;
    }

    gen(x, y) {
        return unnormalize(hash01(this.#seed, Math.floor(x), Math.floor(y)));
    }
}

// export class Hasn2DNoise extends Generator {

//     #seed;

//     constructor(seed) {
//         super();
//         this.#seed = seed;
//     }

//     gen(x, y) {
//         return unnormalize(wang_hash2d(this.#seed, Math.floor(x), Math.floor(y)));
//     }

// }
