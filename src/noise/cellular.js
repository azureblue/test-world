import { unnormalize } from "../functions.js";
import { hash01 } from "./hash.js";
import { Generator, Reducer } from "./noise.js";

export const MAX_F1_SQ = 2.0;
export const MAX_F2_SQ = 2.5;
export const MAX_F1 = Math.sqrt(2.0);
export const MAX_F2 = Math.sqrt(2.5);


export class CellularNoise {
    static worleyReducer(seed, operator = WorleyOperators.defaultF1DistOperator) {
        return new class extends Reducer {
            apply(gen, x, y) {
                return worley(seed, x, y, operator);
            }            
        }();
    }

    static worleyGenerator(seed, operator = WorleyOperators.defaultF1DistOperator) {
        return new CellularGenerator(seed, operator);
    }
}

class CellularGenerator extends Generator {
    #seed;
    #operator;
    constructor(seed, operator = WorleyOperators.defaultF1DistOperator) {
        super();
        this.#seed = seed;
        this.#operator = operator;
    }

    gen(x, y) {
        return worley(this.#seed, x, y, this.#operator);
    }
}

export function worley(seed, x, y, operator = WorleyOperators.defaultF1DistOperator) {

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
    return operator(F1, F2);
}

export class WorleyOperators{

    static defaultF1DistOperator = (f1, f2) => unnormalize(Math.sqrt(f1) / MAX_F1);

    static default() {
        return this.defaultF1DistOperator;
    }
}