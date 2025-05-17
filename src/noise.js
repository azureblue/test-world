import { Int64 } from "./utils.js";

export class OpenSimplex2S {
  static PRIME_X = Int64.fromBigInt(0x5205402B9270C86Fn);
  static PRIME_X_NEG = this.PRIME_X.neg_n();
  static PRIME_X_L_SHIFTED = this.PRIME_X.shiftLeft_n(1);
  static PRIME_Y = Int64.fromBigInt(0x598CD327003817B5n);
  static PRIME_Y_NEG = this.PRIME_Y.neg_n();
  static PRIME_Y_L_SHIFTED = this.PRIME_Y.shiftLeft_n(1);
  static HASH_MULTIPLIER = Int64.fromBigInt(0x53A3F72DEEC546F5n);

  static ROOT2OVER2 = 0.7071067811865476;
  static SKEW_2D = 0.366025403784439;
  static UNSKEW_2D = -0.21132486540518713;

  static N_GRADS_2D_EXPONENT = 7;
  static N_GRADS_2D = 1 << OpenSimplex2S.N_GRADS_2D_EXPONENT;
  static N_GRADS_2D_MASK = Int64.fromBigInt(BigInt((OpenSimplex2S.N_GRADS_2D - 1) << 1));

  static NORMALIZER_2D = 0.05481866495625118;
  static RSQUARED_2D = 2.0 / 3.0;

  static MASK_64 = Int64.fromBigInt((1n << 64n) - 1n);
  static SIGN_BIT = Int64.fromBigInt(1n << 63n);

  static GRADIENTS_2D = (() => {
    const base = [
      0.38268343236509, 0.923879532511287,
      0.923879532511287, 0.38268343236509,
      0.923879532511287, -0.38268343236509,
      0.38268343236509, -0.923879532511287,
      -0.38268343236509, -0.923879532511287,
      -0.923879532511287, -0.38268343236509,
      -0.923879532511287, 0.38268343236509,
      -0.38268343236509, 0.923879532511287,
      0.130526192220052, 0.99144486137381,
      0.608761429008721, 0.793353340291235,
      0.793353340291235, 0.608761429008721,
      0.99144486137381, 0.130526192220051,
      0.99144486137381, -0.130526192220051,
      0.793353340291235, -0.60876142900872,
      0.608761429008721, -0.793353340291235,
      0.130526192220052, -0.99144486137381,
      -0.130526192220052, -0.99144486137381,
      -0.608761429008721, -0.793353340291235,
      -0.793353340291235, -0.608761429008721,
      -0.99144486137381, -0.130526192220052,
      -0.99144486137381, 0.130526192220051,
      -0.793353340291235, 0.608761429008721,
      -0.608761429008721, 0.793353340291235,
      -0.130526192220052, 0.99144486137381,
    ].map(f => f / OpenSimplex2S.NORMALIZER_2D);

    const out = new Float32Array(OpenSimplex2S.N_GRADS_2D * 2);
    for (let i = 0; i < out.length; i++) {
      out[i] = base[i % base.length];
    }
    return out;
  })();

  static noise2(seed, x, y) {
    const s = OpenSimplex2S.SKEW_2D * (x + y);
    return OpenSimplex2S.noise2_UnskewedBase(seed, x + s, y + s);
  }

  static noise2_UnskewedBase(seed, xs, ys) {
    const xsb = Math.floor(xs);
    const ysb = Math.floor(ys);
    const xi = xs - xsb;
    const yi = ys - ysb;

    const xsbp = Int64.fromNumber(xsb).mul_n(this.PRIME_X);
    const ysbp = Int64.fromNumber(ysb).mul_n(this.PRIME_Y);

    const t = (xi + yi) * OpenSimplex2S.UNSKEW_2D;
    const dx0 = xi + t;
    const dy0 = yi + t;

    const a0 = OpenSimplex2S.RSQUARED_2D - dx0 * dx0 - dy0 * dy0;
    let value = 0;
    if (a0 > 0) {
      value += (a0 * a0) * (a0 * a0) * this.grad(seed, xsbp, ysbp, dx0, dy0);
    }

    const dx1 = dx0 - (1 + 2 * OpenSimplex2S.UNSKEW_2D);
    const dy1 = dy0 - (1 + 2 * OpenSimplex2S.UNSKEW_2D);
    const a1 = 2 * (1 + 2 * OpenSimplex2S.UNSKEW_2D) * (1 / OpenSimplex2S.UNSKEW_2D + 2) * t
      + (-2 * (1 + 2 * OpenSimplex2S.UNSKEW_2D) ** 2 + a0);
    if (a1 > 0) {
      value += (a1 * a1) * (a1 * a1) * this.grad(seed, xsbp.add_n(this.PRIME_X), ysbp.add_n(this.PRIME_Y), dx1, dy1);
    }

    const xmyi = xi - yi;

    if (t < OpenSimplex2S.UNSKEW_2D) {
      if (xi + xmyi > 1) {
        const dx2 = dx0 - (3 * OpenSimplex2S.UNSKEW_2D + 2);
        const dy2 = dy0 - (3 * OpenSimplex2S.UNSKEW_2D + 1);
        const a2 = OpenSimplex2S.RSQUARED_2D - dx2 * dx2 - dy2 * dy2;
        if (a2 > 0) {
          value += (a2 * a2) * (a2 * a2) * this.grad(seed, xsbp.add_n(this.PRIME_X_L_SHIFTED), ysbp.add_n(this.PRIME_Y), dx2, dy2);
        }
      } else {
        const dx2 = dx0 - OpenSimplex2S.UNSKEW_2D;
        const dy2 = dy0 - (OpenSimplex2S.UNSKEW_2D + 1);
        const a2 = OpenSimplex2S.RSQUARED_2D - dx2 * dx2 - dy2 * dy2;
        if (a2 > 0) {
          value += (a2 * a2) * (a2 * a2) * this.grad(seed, xsbp, ysbp.add_n(this.PRIME_Y), dx2, dy2);
        }
      }

      if (yi - xmyi > 1) {
        const dx2 = dx0 - (3 * OpenSimplex2S.UNSKEW_2D + 1);
        const dy2 = dy0 - (3 * OpenSimplex2S.UNSKEW_2D + 2);
        const a2 = OpenSimplex2S.RSQUARED_2D - dx2 * dx2 - dy2 * dy2;
        if (a2 > 0) {
          value += (a2 * a2) * (a2 * a2) * this.grad(seed, xsbp.add_n(this.PRIME_X), ysbp.add_n(this.PRIME_Y_L_SHIFTED), dx2, dy2);
        }
      } else {
        const dx2 = dx0 - (OpenSimplex2S.UNSKEW_2D + 1);
        const dy2 = dy0 - OpenSimplex2S.UNSKEW_2D;
        const a2 = OpenSimplex2S.RSQUARED_2D - dx2 * dx2 - dy2 * dy2;
        if (a2 > 0) {
          value += (a2 * a2) * (a2 * a2) * this.grad(seed, xsbp.add_n(this.PRIME_X), ysbp, dx2, dy2);
        }
      }

    } else {
      if (xi + xmyi < 0) {
        const dx2 = dx0 + (1 + OpenSimplex2S.UNSKEW_2D);
        const dy2 = dy0 + OpenSimplex2S.UNSKEW_2D;
        const a2 = OpenSimplex2S.RSQUARED_2D - dx2 * dx2 - dy2 * dy2;
        if (a2 > 0) {
          value += (a2 * a2) * (a2 * a2) * this.grad(seed, xsbp.add_n(this.PRIME_X_NEG), ysbp, dx2, dy2);
        }
      } else {
        const dx2 = dx0 - (OpenSimplex2S.UNSKEW_2D + 1);
        const dy2 = dy0 - OpenSimplex2S.UNSKEW_2D;
        const a2 = OpenSimplex2S.RSQUARED_2D - dx2 * dx2 - dy2 * dy2;
        if (a2 > 0) {
          value += (a2 * a2) * (a2 * a2) * this.grad(seed, xsbp.add_n(this.PRIME_X), ysbp, dx2, dy2);
        }
      }

      if (yi < xmyi) {
        const dx2 = dx0 + OpenSimplex2S.UNSKEW_2D;
        const dy2 = dy0 + (OpenSimplex2S.UNSKEW_2D + 1);
        const a2 = OpenSimplex2S.RSQUARED_2D - dx2 * dx2 - dy2 * dy2;
        if (a2 > 0) {
          value += (a2 * a2) * (a2 * a2) * this.grad(seed, xsbp, ysbp.add_n(this.PRIME_Y_NEG), dx2, dy2);
        }
      } else {
        const dx2 = dx0 - OpenSimplex2S.UNSKEW_2D;
        const dy2 = dy0 - (OpenSimplex2S.UNSKEW_2D + 1);
        const a2 = OpenSimplex2S.RSQUARED_2D - dx2 * dx2 - dy2 * dy2;
        if (a2 > 0) {
          value += (a2 * a2) * (a2 * a2) * this.grad(seed, xsbp, ysbp.add_n(this.PRIME_Y), dx2, dy2);
        }
      }
    }

    return value;
  }

  /**
   * @param {Int64} seed
   * @param {Int64} xsvp 
   * @param {Int64} ysvp 
   */
  static grad(seed, xsvp, ysvp, dx, dy) {
    let hash = seed.xor_n(xsvp).xor_n(ysvp);
    hash = hash.mul_n(OpenSimplex2S.HASH_MULTIPLIER);
    hash = hash.xor_n(hash.shiftRight_n(64 - OpenSimplex2S.N_GRADS_2D_EXPONENT + 1));
    const gi = hash.and_n(OpenSimplex2S.N_GRADS_2D_MASK).toNumber();
    const g = OpenSimplex2S.GRADIENTS_2D;
    return g[gi] * dx + g[gi + 1] * dy;
  }
}