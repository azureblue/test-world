export const BLEND_MODE = {
    NORMAL: (a, b) => b,
    ADD: (a, b) => a + b,
    SUB: (a, b) => a - b,
    MULTIPLY: (a, b) => a * b,
    MAX: (a, b) => Math.max(a, b),
    MIN: (a, b) => Math.min(a, b)
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
    normal: (a, b, opacity) => blend(a, b, BLEND_MODE.NORMAL, opacity),
    add: (a, b, opacity) => blend(a, b, BLEND_MODE.ADD, opacity),
    sub: (a, b, opacity) => blend(a, b, BLEND_MODE.SUB, opacity),
    multiply: (a, b, opacity) => blend(a, b, BLEND_MODE.MULTIPLY, opacity),
    max: (a, b, opacity) => blend(a, b, BLEND_MODE.MAX, opacity),
    min: (a, b, opacity) => blend(a, b, BLEND_MODE.MIN, opacity)
}