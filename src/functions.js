export function clamp(x, lowerlimit = 0.0, upperlimit = 1.0) {
  if (x < lowerlimit) return lowerlimit;
  if (x > upperlimit) return upperlimit;
  return x;
}

export function smoothstep(a, b, x) {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
}

export function smootherstep(edge0, edge1, x) {  
  x = clamp((x - edge0) / (edge1 - edge0));
  return x * x * x * (x * (6.0 * x - 15.0) + 10.0);
}

export function lerp(a, b, t) {
    return a + t * (b - a);
}

export function logistic(x, k = 2) {
    return (2 / (1 + Math.exp(-x * k)) - 1.0);
}

export function preciseLerp(a, b, t) {
    return (1 - t) * a + t * b;
}

export function normalize(x) {
    return (x + 1) / 2;
}

export function unnormalize(x) {
    return (x * 2) - 1;
}

export function spreadTanh01(v, k = 2.5) {
    const x = v * 2 - 1;
    return (Math.tanh(x * k) + 1) * 0.5;
}


export function spreadTanh11(v, k = 2.5) {    
    return Math.tanh(v * k);
}

export function spreadSin11(x, periods = 0.5) {
    return Math.sin(x * Math.PI * periods);
}

export function cosWarp11(x, periods = 1) {
    return Math.cos(x * Math.PI * periods);
}

export function symSqrt(x) {
    return Math.sign(x) * Math.sqrt(Math.abs(x));
}
