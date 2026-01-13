import { hash01 } from "./hash.js";
import { Noise, Generator as Generator, Reducer } from "./noise.js";

export class CellularNoise {
    static worleyReducer(seed, operator = (f1, f2) => f1) {
        return new class extends Reducer {
            apply(gen, x, y) {
                return worley(seed, x, y, operator);
            }            
        }();
    }

    static worleyGenerator(seed, operator = (f1, f2) => f1) {
        return new CellularGenerator(seed, operator);
    }
}

class CellularGenerator extends Generator {
    #seed;
    #operator;
    constructor(seed, operator = (f1, f2) => f1) {
        super();
        this.#seed = seed;
        this.#operator = operator;
    }

    gen(x, y) {
        return worley(this.#seed, x, y, this.#operator);
    }
}

export function worley(seed, x, y, operator = (f1, f2) => f1) {

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
    return operator(F1, F2)
}
