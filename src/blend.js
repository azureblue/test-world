import { clamp, normalize, unnormalize } from "./functions.js";

export class Blend {
    constructor(blend, clamp, normalization = false) {
        this.blend = blend;
        this.clamp = clamp;
        this.normalization = normalization;
    }

    apply(a, b, opacity = 1.0) {
        if (this.normalization) {
            a = normalize(a);
            b = normalize(b);
        }
        const blendResult = this.blend(a, b);
        let result = a * (1.0 - opacity) + blendResult * opacity;
        result = this.clamp(result);
        return this.normalization ? unnormalize(result) : result;
    }

}
export const BLEND_FUNCTION = {
    NORMAL: (a, b) => b,
    ADD: (a, b) => a + b,
    SUB: (a, b) => a - b,
    MULTIPLY: (a, b) => a * b,
    MAX: (a, b) => Math.max(a, b),
    MIN: (a, b) => Math.min(a, b)
}

export const BLEND_NORMALIZATION = {
    
}

export const CLAMP_FUNCTION = {
    clamp01: x => clamp(x, 0, 1),
    clamp11: x => clamp(x, -1, 1),
    none: x => x
}


export function blend(a, b, blendMode,  opacity) {
    const blendResult = blendMode(a, b);
    let result = a * (1.0 - opacity) + blendResult * opacity;
    if (result < 0.0)
        a = 0.0;
    else if (result > 1)
        result = 1;
    return result;
}

export function createBlend(blendMode, bOpacity) {
    return (a, b) => blend(a, b, blendMode, bOpacity);
}

export const BLEND = {
    normal: (a, b, opacity) => blend(a, b, BLEND_FUNCTION.NORMAL, opacity),
    add: (a, b, opacity) => blend(a, b, BLEND_FUNCTION.ADD, opacity),
    sub: (a, b, opacity) => blend(a, b, BLEND_FUNCTION.SUB, opacity),
    multiply: (a, b, opacity) => blend(a, b, BLEND_FUNCTION.MULTIPLY, opacity),
    max: (a, b, opacity) => blend(a, b, BLEND_FUNCTION.MAX, opacity),
    min: (a, b, opacity) => blend(a, b, BLEND_FUNCTION.MIN, opacity)
}