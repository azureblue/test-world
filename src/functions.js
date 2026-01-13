export function smoothstep(a, b, x) {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
}

export function lerp(a, b, t) {
    return a + t * (b - a);
}

export function preciseLerp(a, b, t) {
    return (1 - t) * a + t * b;
}