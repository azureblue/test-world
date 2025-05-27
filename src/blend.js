export const BLEND_MODES = {
    NORMAL: (a, b) => b,
    ADD: (a, b) => a + b,
    SUB: (a, b) => a - b,
    MULTIPLY: (a, b) => a * b
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
