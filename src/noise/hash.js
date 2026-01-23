
export function hash32(a) {
    a |= 0;
    a ^= a >>> 16;
    a = Math.imul(a, 0x7feb352d);
    a ^= a >>> 15;
    a = Math.imul(a, 0x846ca68b);
    a ^= a >>> 16;
    return a | 0;
}

const U32_INV = 1 / 4294967296; // 2^32

/** @param {number} x */
function u32(x) { return x >>> 0; }

/**
 * Strong-ish 32-bit integer mixer (fast, good distribution).
 * @param {number} x unsigned 32-bit
 * @returns {number} unsigned 32-bit
 */
export function mix32(x) {
    x = u32(x ^ (x >>> 16));
    x = u32(Math.imul(x, 0x7feb352d));
    x = u32(x ^ (x >>> 15));
    x = u32(Math.imul(x, 0x846ca68b));
    x = u32(x ^ (x >>> 16));
    return x;
}

/**
 * Hash integer cell coords + seed into float [0,1).
 * @param {number} seed unsigned-ish
 * @param {number} ix integer
 * @param {number} iy integer
 * @returns {number} in [0,1)
 */
export function hash01(seed = 0, ix, iy) {
    // Convert to unsigned 32-bit
    let h = u32(seed);
    h ^= u32(ix);
    h = u32(Math.imul(h, 0x9e3779b9));
    h ^= u32(iy);
    h = u32(Math.imul(h, 0x85ebca6b));

    const r = mix32(h);
    return r * U32_INV; // [0,1)
}
