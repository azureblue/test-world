/**
 * @typedef Point
 * @type {object}
 * @property {number} x
 * @property {number} y
 */


/**
 * 
 * @param {number} x 
 * @param {number} y 
 * @returns {Point}
 */
export function point(x, y) {
    return { x, y };
}

export class Curve {
    /**
     * @param {number} x 
     */
    apply(x) {

    }
}

export class CurveRenderer {
    /**
     * @param {Curve} curve 
     * @param {HTMLCanvasElement} canvas 
     */
    render(curve, canvas) {
        const ctx = canvas.getContext("2d");
        const w = canvas.width;
        const h = canvas.height;

    //    ctx.clearRect(0, 0, w, h);
        ctx.strokeStyle = "black";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, h - curve.apply(0) * h);
        for (let i = 1; i < w; i++) {
            const x = i / (w - 1);
            const y = curve.apply(x);
            ctx.lineTo(i, h - y * h);
        }
        ctx.stroke();
    }


    renderLines(curve, canvas) {
        const ctx = canvas.getContext("2d");
        const w = canvas.width;
        const h = canvas.height;

    //    ctx.clearRect(0, 0, w, h);
        ctx.strokeStyle = "black 4px";
        ctx.beginPath();
        ctx.moveTo(0, h - curve.apply(0) * h);
        for (let i = 1; i < w; i++) {
            const x = i / (w - 1);
            const y = curve.apply(x);
            ctx.lineTo(i, h - y * h);
        }
        ctx.stroke();
    }


    renderPoints(points, canvas) {
        const ctx = canvas.getContext("2d");
        const w = canvas.width;
        const h = canvas.height;

        ctx.fillStyle = "red";
        for (const p of points) {
            const x = p.x * w;
            const y = h - p.y * h;
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

export class MultiCurve extends Curve {
    #curves
    /**
     * @param {Array<Curve>} curves 
     */
    constructor(curves) {
        super();
        this.#curves = curves;
    }

    apply(x) {
        let r = this.#curves[0].apply(x);
        for (let i = 1; i < this.#curves.length; i++) {
            r = this.#curves[i].apply(r);
        }
        return r;
    }
}

export class LinearCurve extends Curve {

    #n
    /**
     * @param {Array<Point>} points
     */
    constructor(points) {
        super();
        this.#n = points.length;
        if (this.#n < 1)
            throw "n < 1";
        this.points = points.sort((a, b) => a.x - b.x);
    }

    setControlPoint(pointId, pos) {
        throw "not implemented";
        // if (pointId == 0) {
        //     pos.x = Math.min(pos.x, this.points[1].x);
        // } else if (pointId == 1) {
        //     pos.x = Math.max(pos.x, this.points[0].x);
        // }
        // this.points[pointId].setTo(pos);
        // return pos;
    }

    /**
     * @param {number} x 
     */
    apply(x) {
        if (x <= this.points[0].x)
            return this.points[0].y
        else if (x >= this.points[this.#n - 1].x)
            return this.points[this.#n - 1].y;
        for (let i = 1; i < this.#n; i++) {
            if (x <= this.points[i].x)
                return this.#lerp(x, this.points[i - 1], this.points[i]);
        }
        return this.#lerp(x);
    }

    /**
     * @param {number} x 
     * @param {Point} p1 
     * @param {Point} p2 
     * @returns 
     */
    #lerp(x, p1, p2) {
        return (p1.y * (p2.x - x) + p2.y * (x - p1.x)) / (p2.x - p1.x);
    }
}

export class SmoothCurve extends Curve {
    /**
     * Monotone "smooth" curve using PCHIP (Fritsch–Carlson).
     * x must be strictly increasing.
     */
    constructor(xs, ys) {
        super()
        const n = xs.length;
        if (n !== ys.length) throw new Error("xs/ys length mismatch");
        if (n < 2) throw new Error("need >= 2 points");

        // store as Float64Array (fast + predictable)
        this.n = n;
        this.x = xs instanceof Float64Array ? xs : new Float64Array(xs);
        this.y = ys instanceof Float64Array ? ys : new Float64Array(ys);

        const x = this.x, y = this.y;

        const h = new Float64Array(n - 1);
        const invH = new Float64Array(n - 1);
        const d = new Float64Array(n - 1);

        for (let i = 0; i < n - 1; i++) {
            const dx = x[i + 1] - x[i];
            if (!(dx > 0)) throw new Error("x must be strictly increasing");
            h[i] = dx;
            invH[i] = 1.0 / dx;
            d[i] = (y[i + 1] - y[i]) * invH[i];
        }

        const m = new Float64Array(n);

        if (n === 2) {
            m[0] = d[0];
            m[1] = d[0];
        } else {
            // endpoints (then limited)
            m[0] = ((2 * h[0] + h[1]) * d[0] - h[0] * d[1]) / (h[0] + h[1]);
            m[n - 1] =
                ((2 * h[n - 2] + h[n - 3]) * d[n - 2] - h[n - 2] * d[n - 3]) /
                (h[n - 2] + h[n - 3]);

            const limitEnd = (mEnd, dEnd, dAdj) => {
                // if tangent has wrong sign -> flatten
                if (Math.sign(mEnd) !== Math.sign(dEnd)) return 0;
                // if next slope changes sign, limit magnitude
                if (Math.sign(dEnd) !== Math.sign(dAdj)) {
                    const lim = 3 * dEnd;
                    if (Math.abs(mEnd) > Math.abs(lim)) return lim;
                }
                return mEnd;
            };

            m[0] = limitEnd(m[0], d[0], d[1]);
            m[n - 1] = limitEnd(m[n - 1], d[n - 2], d[n - 3]);

            // interior tangents
            for (let i = 1; i <= n - 2; i++) {
                const d0 = d[i - 1], d1 = d[i];
                if (d0 === 0 || d1 === 0 || Math.sign(d0) !== Math.sign(d1)) {
                    m[i] = 0;
                } else {
                    const w1 = 2 * h[i] + h[i - 1];
                    const w2 = h[i] + 2 * h[i - 1];
                    // weighted harmonic mean
                    m[i] = (w1 + w2) / (w1 / d0 + w2 / d1);
                }
            }
        }

        this.h = h;
        this.invH = invH;
        this.m = m;

        // small cache for sequential queries (often helps in rendering)
        this._lastI = 0;
    }

    /**
     * Evaluate y at xq. Clamps outside domain.
     */
    apply(xq) {
        const n = this.n;
        const x = this.x, y = this.y;
        if (xq <= x[0]) return y[0];
        if (xq >= x[n - 1]) return y[n - 1];

        const i = this._findInterval(xq);
        const t = (xq - x[i]) * this.invH[i]; // [0,1]
        const t2 = t * t, t3 = t2 * t;

        // Hermite basis
        const h00 = 2 * t3 - 3 * t2 + 1;
        const h10 = t3 - 2 * t2 + t;
        const h01 = -2 * t3 + 3 * t2;
        const h11 = t3 - t2;

        const hi = this.h[i];
        return (
            h00 * y[i] +
            h10 * hi * this.m[i] +
            h01 * y[i + 1] +
            h11 * hi * this.m[i + 1]
        );
    }

    /**
     * Sample evenly in x across [x0..xN].
     */
    sample(count = 256) {
        const out = new Float64Array(count);
        const x0 = this.x[0], x1 = this.x[this.n - 1];
        const step = (x1 - x0) / (count - 1);
        for (let k = 0; k < count; k++) out[k] = this.eval(x0 + k * step);
        return out;
    }
  
    _findInterval(xq) {
        const x = this.x;
        const n = this.n;

        // fast path: reuse last interval if queries are "smooth" (common in rendering)
        let i = this._lastI;
        if (i < 0) i = 0;
        if (i > n - 2) i = n - 2;

        if (xq >= x[i] && xq <= x[i + 1]) return i;

        // if moved forward a bit, walk forward
        if (xq > x[i + 1]) {
            while (i < n - 2 && xq > x[i + 1]) i++;
            this._lastI = i;
            return i;
        }

        // moved backward, walk backward
        if (xq < x[i]) {
            while (i > 0 && xq < x[i]) i--;
            this._lastI = i;
            return i;
        }

        // fallback (should be rare): binary search
        let lo = 0, hi = n - 2;
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            if (xq < x[mid]) hi = mid - 1;
            else if (xq > x[mid + 1]) lo = mid + 1;
            else { lo = mid; break; }
        }
        this._lastI = lo;
        return lo;
    }
}

// export class LinearCurve4 extends Curve {

//     constructor(p0, p1, p2, p3) {
//         super();        
//         this.points = [p0, p1, p2, p3].sort((a, b) => a.x - b.x);        
//     }

//     setControlPoint(pointId, pos) {
//         if (pointId == 0) {
//             pos.x = Math.min(pos.x, this.points[1].x);
//         } else if (pointId == 1) {
//             pos.x = Math.max(pos.x, this.points[0].x);
//             pos.x = Math.min(pos.x, this.points[2].x);
//         } else if (pointId == 2) {
//             pos.x = Math.max(pos.x, this.points[1].x);
//             pos.x = Math.min(pos.x, this.points[3].x);
//         } else if (pointId == 3) {
//             pos.x = Math.max(pos.x, this.points[2].x);
//         }
//         this.points[pointId].setTo(pos);
//         return pos;
//     }

//     /**
//      * @param {number} x 
//      */
//     apply(x) {
//         if (x <= this.points[0].x)
//             return this.points[0].y
//         if (x <= this.points[1].x) {
//             return this.#lerp(x, 0, 1);
//         }
//         if (x <= this.points[2].x) {
//             return this.#lerp(x, 1, 2);
//         }
//         if (x <= this.points[3].x) {
//             return this.#lerp(x, 2, 3);
//         }
//         else if (x >= this.points[3].x)
//             return this.points[3].y;
//     }

//     #lerp(x, p1, p2) {
//         return (this.points[p1].y * (this.points[p2].x - x) + this.points[p2].y * (x - this.points[p1].x)) / (this.points[p2].x - this.points[p1].x);
//     }
// }

export class MonotoneCubicHermite {
    constructor(xs, ys) {
      if (!Array.isArray(xs) || !Array.isArray(ys) || xs.length !== ys.length) {
        throw new Error("xs and ys must be arrays of the same length");
      }
      if (xs.length < 2) throw new Error("Need at least 2 points");
      const n = xs.length;
  
      // Copy + validate strictly increasing x
      this.x = xs.slice();
      this.y = ys.slice();
  
      for (let i = 1; i < n; i++) {
        if (!(this.x[i] > this.x[i - 1])) {
          throw new Error("xs must be strictly increasing");
        }
      }
  
      // h[i] = x[i+1]-x[i], d[i] = secant slope on interval i
      const h = new Array(n - 1);
      const d = new Array(n - 1);
      for (let i = 0; i < n - 1; i++) {
        h[i] = this.x[i + 1] - this.x[i];
        d[i] = (this.y[i + 1] - this.y[i]) / h[i];
      }
  
      // m[i] = tangents at points (Hermite slopes)
      const m = new Array(n);
  
      // Endpoints: use one-sided, then clamp for monotonicity
      m[0] = d[0];
      m[n - 1] = d[n - 2];
  
      // Interior tangents: weighted harmonic mean if same sign, else 0
      for (let i = 1; i < n - 1; i++) {
        const d0 = d[i - 1];
        const d1 = d[i];
  
        if (d0 === 0 || d1 === 0 || Math.sign(d0) !== Math.sign(d1)) {
          m[i] = 0;
        } else {
          const w1 = 2 * h[i] + h[i - 1];
          const w2 = h[i] + 2 * h[i - 1];
          // Fritsch–Carlson: weighted harmonic mean
          m[i] = (w1 + w2) / (w1 / d0 + w2 / d1);
        }
      }
  
      // Extra monotonicity enforcement per-interval (Fritsch–Carlson limiter)
      for (let i = 0; i < n - 1; i++) {
        const di = d[i];
  
        if (di === 0) {
          m[i] = 0;
          m[i + 1] = 0;
          continue;
        }
  
        const a = m[i] / di;
        const b = m[i + 1] / di;
  
        // If either tangent points "backwards", clamp
        if (a < 0) m[i] = 0;
        if (b < 0) m[i + 1] = 0;
  
        // If too steep -> scale down to avoid overshoot
        const s = a * a + b * b;
        if (s > 9) {
          const t = 3 / Math.sqrt(s);
          m[i] = t * a * di;
          m[i + 1] = t * b * di;
        }
      }
  
      this.m = m;
      this._h = h;
  
      // Optional: precompute cubic coefficients per segment for faster eval
      // On segment i: t in [0,1], y(t) = a*t^3 + b*t^2 + c*t + d
      this._a = new Array(n - 1);
      this._b = new Array(n - 1);
      this._c = new Array(n - 1);
      this._d = new Array(n - 1);
  
      for (let i = 0; i < n - 1; i++) {
        const hi = h[i];
        const y0 = this.y[i];
        const y1 = this.y[i + 1];
        const m0 = m[i];
        const m1 = m[i + 1];
  
        // Convert Hermite form to power basis in normalized t
        // y(t) = (2t^3-3t^2+1)y0 + (t^3-2t^2+t)hi*m0 + (-2t^3+3t^2)y1 + (t^3-t^2)hi*m1
        const a = 2 * y0 - 2 * y1 + hi * (m0 + m1);
        const b = -3 * y0 + 3 * y1 - hi * (2 * m0 + m1);
        const c = hi * m0;
        const d0 = y0;
  
        this._a[i] = a;
        this._b[i] = b;
        this._c[i] = c;
        this._d[i] = d0;
      }
    }
  
    _findSegment(xq) {
        const x = this.x;
        const n = x.length;
    
        if (xq <= x[0]) return 0;
        if (xq >= x[n - 1]) return n - 2;
    
        let lo = 0, hi = n - 1;
        while (hi - lo > 1) {
          const mid = (lo + hi) >> 1;
          if (xq < x[mid]) hi = mid;
          else lo = mid;
        }
        return lo;
      }
    
      apply(xq) {
        const i = this._findSegment(xq);
        const x0 = this.x[i];
        const x1 = this.x[i + 1];
        const t = (xq - x0) / (x1 - x0); // normalized 0..1
    
        // Horner
        return ((this._a[i] * t + this._b[i]) * t + this._c[i]) * t + this._d[i];
      }
    
      // Optional: derivative dy/dx
      deriv(xq) {
        const i = this._findSegment(xq);
        const x0 = this.x[i];
        const x1 = this.x[i + 1];
        const hi = x1 - x0;
        const t = (xq - x0) / hi;
    
        // dy/dt = 3a t^2 + 2b t + c, so dy/dx = (dy/dt)/h
        const dy_dt = (3 * this._a[i] * t + 2 * this._b[i]) * t + this._c[i];
        return dy_dt / hi;
      }
    }
    