import { Curve, CurveRenderer, LinearCurve, MonotoneCubicHermite, point, SmoothCurve } from "../curve.js";

/**
 * @param {string} id 
 * @returns {HTMLCanvasElement}
 */
function getCanvas(id) {
    return document.getElementById(id);
}

/**
 * Zips two arrays into a generator of pairs or applies a mapping function to each pair.
 * @param {Array} a 
 * @param {Array} b 
 * @param {Function} [mapFn] Optional mapping function to apply to each pair.
 * @returns {Generator} Generator yielding pairs or mapped values.
 */
function* zip(a, b, mapFn = (a, b) => [a, b]) {
    const length = Math.min(a.length, b.length);
    for (let i = 0; i < length; i++) {
        yield mapFn(a[i], b[i]);
    }
}

const w = 400;
const h = 400;

class MonotoneCubicHermite2 {
    constructor(xs, ys) {
        if (xs.length !== ys.length) {
            throw new Error("xs and ys must have the same length");
        }
        this.xs = xs;
        this.ys = ys;
        this.slopes = this.computeSlopes(xs, ys);
    }

    computeSlopes(xs, ys) {
        const n = xs.length;
        const slopes = new Array(n).fill(0);
        const dx = new Array(n - 1);
        const dy = new Array(n - 1);

        for (let i = 0; i < n - 1; i++) {
            dx[i] = xs[i + 1] - xs[i];
            dy[i] = ys[i + 1] - ys[i];
        }

        for (let i = 1; i < n - 1; i++) {
            const m1 = dy[i - 1] / dx[i - 1];
            const m2 = dy[i] / dx[i];
            if (m1 * m2 > 0) {
                slopes[i] = (2 * dx[i - 1] + dx[i]) / (dx[i - 1] + dx[i]) * (m1 * dx[i] + m2 * dx[i - 1]) / (dx[i - 1] + dx[i]);
            }
        }

        slopes[0] = dy[0] / dx[0];
        slopes[n - 1] = dy[n - 2] / dx[n - 2];
        return slopes;
    }

    apply(x) {
        const n = this.xs.length;
        if (x <= this.xs[0]) return this.ys[0];
        if (x >= this.xs[n - 1]) return this.ys[n - 1];

        let i = 0;
        while (x > this.xs[i + 1]) i++;

        const h = this.xs[i + 1] - this.xs[i];
        const t = (x - this.xs[i]) / h;
        const t2 = t * t;
        const t3 = t2 * t;

        const h00 = 2 * t3 - 3 * t2 + 1;
        const h10 = t3 - 2 * t2 + t;
        const h01 = -2 * t3 + 3 * t2;
        const h11 = t3 - t2;

        return h00 * this.ys[i] + h10 * h * this.slopes[i] + h01 * this.ys[i + 1] + h11 * h * this.slopes[i + 1];
    }
}



export function main() {
    const curveRenderer = new CurveRenderer();
    
    const c0 = new LinearCurve([{x: 0, y: 0}, {x: 0.5, y: 1}, {x: 1, y: 0.7}]);
    const xs = [0, Math.random(), Math.random(), Math.random(), Math.random(), 1].sort();
    const ys = [Math.random(), Math.random(), Math.random(), Math.random(), Math.random(), Math.random()];
    const c1 = new SmoothCurve(xs, ys);
    const c2 = new MonotoneCubicHermite(xs, ys);
    const c3 = new MonotoneCubicHermite2(xs, ys);
    curveRenderer.renderPoints(zip(xs, ys, (a, b) => point(a, b)), getCanvas("canvas0"));
    curveRenderer.renderPoints(zip(xs, ys, (a, b) => point(a, b)), getCanvas("canvas1"));
    curveRenderer.renderPoints(zip(xs, ys, (a, b) => point(a, b)), getCanvas("canvas2"));
    curveRenderer.render(c1, getCanvas("canvas0"));
    curveRenderer.render(c2, getCanvas("canvas1"));
    curveRenderer.render(c3, getCanvas("canvas2"));
}
