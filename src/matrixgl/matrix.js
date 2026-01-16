import { Quaternion } from './quaternion.js';
/**
 * 2x2 Matrix of single-precision float numbers.
 *
 * Values are stored in column major order.
 */
export class Matrix2x2 {
    constructor(m11, m21, m12, m22) {
        this._values = new Float32Array([
            m11, m21,
            m12, m22
        ]);
    }
    /**
     * Returns an identity matrix.
     * @returns {Matrix2x2}
     */
    static identity() {
        return new Matrix2x2(1.0, 0.0, 0.0, 1.0);
    }
    get values() {
        return this._values;
    }
    toString() {
        return this._values.toString();
    }
}
/**
 * 3x3 Matrix of single-precision float numbers.
 *
 * Values are stored in column major order.
 */
export class Matrix3x3 {
    constructor(m11, m21, m31, m12, m22, m32, m13, m23, m33) {
        this._values = new Float32Array([
            m11, m21, m31,
            m12, m22, m32,
            m13, m23, m33
        ]);
    }
    /**
     * Returns an identity matrix.
     * @returns {Matrix3x3}
     */
    static identity() {
        return new Matrix3x3(1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0);
    }
    get values() {
        return this._values;
    }
    toString() {
        return this._values.toString();
    }
}
/**
 * 4x4 Matrix of single-precision float numbers.
 *
 * Values are stored in column major order.
 */
export class Matrix4x4 {
    constructor(m11, m21, m31, m41, m12, m22, m32, m42, m13, m23, m33, m43, m14, m24, m34, m44) {
        this._values = new Float32Array([
            m11, m21, m31, m41,
            m12, m22, m32, m42,
            m13, m23, m33, m43,
            m14, m24, m34, m44
        ]);
    }

    setValues(m11, m21, m31, m41, m12, m22, m32, m42, m13, m23, m33, m43, m14, m24, m34, m44) {
        this._values[0] = m11;
        this._values[1] = m21;
        this._values[2] = m31;
        this._values[3] = m41;
        this._values[4] = m12;
        this._values[5] = m22;
        this._values[6] = m32;
        this._values[7] = m42;
        this._values[8] = m13;
        this._values[9] = m23;
        this._values[10] = m33;
        this._values[11] = m43;
        this._values[12] = m14;
        this._values[13] = m24;
        this._values[14] = m34;
        this._values[15] = m44;
    }

    /**
     * Returns an identity matrix.
     * @returns {Matrix4x4}
     */
    static identity() {
        return new Matrix4x4(1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0);
    }
    /**
     * Returns translation matrix.
     * @param {number} tx
     * @param {number} ty
     * @param {number} tz
     * @returns {Matrix4x4}
     */
    static translation(tx, ty, tz) {
        return new Matrix4x4(1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, tx, ty, tz, 1.0);
    }
    /**
     * Returns scaling matrix.
     * @param {number} sx
     * @param {number} sy
     * @param {number} sz
     * @returns {Matrix4x4}
     */
    static scaling(sx, sy, sz) {
        return new Matrix4x4(sx, 0.0, 0.0, 0.0, 0.0, sy, 0.0, 0.0, 0.0, 0.0, sz, 0.0, 0.0, 0.0, 0.0, 1.0);
    }
    /**
     * Returns rotation matrix around x-axis.
     * @param {number} radian
     * @returns {Matrix4x4}
     */
    static rotationX(radian) {
        const sin = Math.sin(radian);
        const cos = Math.cos(radian);
        return new Matrix4x4(1.0, 0.0, 0.0, 0.0, 0.0, cos, sin, 0.0, 0.0, -sin, cos, 0.0, 0.0, 0.0, 0.0, 1.0);
    }
    /**
     * Returns rotation matrix around y-axis.
     * @param {number} radian
     * @returns {Matrix4x4}
     */
    static rotationY(radian) {
        const sin = Math.sin(radian);
        const cos = Math.cos(radian);
        return new Matrix4x4(cos, 0.0, -sin, 0.0, 0.0, 1.0, 0.0, 0.0, sin, 0.0, cos, 0.0, 0.0, 0.0, 0.0, 1.0);
    }
    /**
     * Returns rotation matrix around z-axis.
     * @param {number} radian
     * @returns {Matrix4x4}
     */
    static rotationZ(radian) {
        const sin = Math.sin(radian);
        const cos = Math.cos(radian);
        return new Matrix4x4(cos, sin, 0.0, 0.0, -sin, cos, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0);
    }
    /**
     * Returns rotation matrix around `normalizedAxis`. `normalizedAxis` must be normalized.
     * @param {Float32Vector3} normalizedAxis
     * @param {number} radian
     * @returns {Matrix4x4}
     */
    static rotationAround(normalizedAxis, radian) {
        const q = Quaternion.rotationAround(normalizedAxis, radian);
        return q.toRotationMatrix4();
    }
    
    /**
     * Multiply by `other` matrix and stores the product in `out`.
     *
     * This method does not mutate the matrix.
     * @param {Matrix4x4} other
     * @param {Matrix4x4} out
     */
    mulOut(other, out) {
        const m11 = this._values[0];
        const m12 = this._values[4];
        const m13 = this._values[8];
        const m14 = this._values[12];
        const m21 = this._values[1];
        const m22 = this._values[5];
        const m23 = this._values[9];
        const m24 = this._values[13];
        const m31 = this._values[2];
        const m32 = this._values[6];
        const m33 = this._values[10];
        const m34 = this._values[14];
        const m41 = this._values[3];
        const m42 = this._values[7];
        const m43 = this._values[11];
        const m44 = this._values[15];
        const o11 = other.values[0];
        const o12 = other.values[4];
        const o13 = other.values[8];
        const o14 = other.values[12];
        const o21 = other.values[1];
        const o22 = other.values[5];
        const o23 = other.values[9];
        const o24 = other.values[13];
        const o31 = other.values[2];
        const o32 = other.values[6];
        const o33 = other.values[10];
        const o34 = other.values[14];
        const o41 = other.values[3];
        const o42 = other.values[7];
        const o43 = other.values[11];
        const o44 = other.values[15];
        const p11 = (m11 * o11) + (m12 * o21) + (m13 * o31) + (m14 * o41);
        const p12 = (m11 * o12) + (m12 * o22) + (m13 * o32) + (m14 * o42);
        const p13 = (m11 * o13) + (m12 * o23) + (m13 * o33) + (m14 * o43);
        const p14 = (m11 * o14) + (m12 * o24) + (m13 * o34) + (m14 * o44);
        const p21 = (m21 * o11) + (m22 * o21) + (m23 * o31) + (m24 * o41);
        const p22 = (m21 * o12) + (m22 * o22) + (m23 * o32) + (m24 * o42);
        const p23 = (m21 * o13) + (m22 * o23) + (m23 * o33) + (m24 * o43);
        const p24 = (m21 * o14) + (m22 * o24) + (m23 * o34) + (m24 * o44);
        const p31 = (m31 * o11) + (m32 * o21) + (m33 * o31) + (m34 * o41);
        const p32 = (m31 * o12) + (m32 * o22) + (m33 * o32) + (m34 * o42);
        const p33 = (m31 * o13) + (m32 * o23) + (m33 * o33) + (m34 * o43);
        const p34 = (m31 * o14) + (m32 * o24) + (m33 * o34) + (m34 * o44);
        const p41 = (m41 * o11) + (m42 * o21) + (m43 * o31) + (m44 * o41);
        const p42 = (m41 * o12) + (m42 * o22) + (m43 * o32) + (m44 * o42);
        const p43 = (m41 * o13) + (m42 * o23) + (m43 * o33) + (m44 * o43);
        const p44 = (m41 * o14) + (m42 * o24) + (m43 * o34) + (m44 * o44);
        out.setValues(p11, p21, p31, p41, p12, p22, p32, p42, p13, p23, p33, p43, p14, p24, p34, p44)
    }

    mulInPlace(other) {
        this.mulOut(other, this);
    }   
  
    /**
     * Multiply by `other` matrix and returns a product.
     *
     * This method does not mutate the matrix.
     * @param {Matrix4x4} other
     * @returns {Matrix4x4}
     */
    mulByMatrix4x4(other) {
        const m11 = this._values[0];
        const m12 = this._values[4];
        const m13 = this._values[8];
        const m14 = this._values[12];
        const m21 = this._values[1];
        const m22 = this._values[5];
        const m23 = this._values[9];
        const m24 = this._values[13];
        const m31 = this._values[2];
        const m32 = this._values[6];
        const m33 = this._values[10];
        const m34 = this._values[14];
        const m41 = this._values[3];
        const m42 = this._values[7];
        const m43 = this._values[11];
        const m44 = this._values[15];
        const o11 = other.values[0];
        const o12 = other.values[4];
        const o13 = other.values[8];
        const o14 = other.values[12];
        const o21 = other.values[1];
        const o22 = other.values[5];
        const o23 = other.values[9];
        const o24 = other.values[13];
        const o31 = other.values[2];
        const o32 = other.values[6];
        const o33 = other.values[10];
        const o34 = other.values[14];
        const o41 = other.values[3];
        const o42 = other.values[7];
        const o43 = other.values[11];
        const o44 = other.values[15];
        const p11 = (m11 * o11) + (m12 * o21) + (m13 * o31) + (m14 * o41);
        const p12 = (m11 * o12) + (m12 * o22) + (m13 * o32) + (m14 * o42);
        const p13 = (m11 * o13) + (m12 * o23) + (m13 * o33) + (m14 * o43);
        const p14 = (m11 * o14) + (m12 * o24) + (m13 * o34) + (m14 * o44);
        const p21 = (m21 * o11) + (m22 * o21) + (m23 * o31) + (m24 * o41);
        const p22 = (m21 * o12) + (m22 * o22) + (m23 * o32) + (m24 * o42);
        const p23 = (m21 * o13) + (m22 * o23) + (m23 * o33) + (m24 * o43);
        const p24 = (m21 * o14) + (m22 * o24) + (m23 * o34) + (m24 * o44);
        const p31 = (m31 * o11) + (m32 * o21) + (m33 * o31) + (m34 * o41);
        const p32 = (m31 * o12) + (m32 * o22) + (m33 * o32) + (m34 * o42);
        const p33 = (m31 * o13) + (m32 * o23) + (m33 * o33) + (m34 * o43);
        const p34 = (m31 * o14) + (m32 * o24) + (m33 * o34) + (m34 * o44);
        const p41 = (m41 * o11) + (m42 * o21) + (m43 * o31) + (m44 * o41);
        const p42 = (m41 * o12) + (m42 * o22) + (m43 * o32) + (m44 * o42);
        const p43 = (m41 * o13) + (m42 * o23) + (m43 * o33) + (m44 * o43);
        const p44 = (m41 * o14) + (m42 * o24) + (m43 * o34) + (m44 * o44);
        return new Matrix4x4(p11, p21, p31, p41, p12, p22, p32, p42, p13, p23, p33, p43, p14, p24, p34, p44);
    }
    /**
     * An alias for `mulByMatrix4x4`.
     * @param {Matrix4x4} other
     * @returns {Matrix4x4}
     */
    mulByMatrix4(other) {
        return this.mulByMatrix4x4(other);
    }
    /**
     * Translate the matrix and returns new `Matrix4x4`.
     *
     * This method does not mutate the matrix.
     * @param {number} tx
     * @param {number} ty
     * @param {number} tz
     * @returns {Matrix4x4}
     */
    translate(tx, ty, tz) {
        const t = Matrix4x4.translation(tx, ty, tz);
        return this.mulByMatrix4x4(t);
    }
    /**
     * Scale the matrix and returns new `Matrix4x4`.
     * @param {number} sx
     * @param {number} sy
     * @param {number} sz
     * @returns {Matrix4x4}
     */
    scale(sx, sy, sz) {
        const s = Matrix4x4.scaling(sx, sy, sz);
        return this.mulByMatrix4x4(s);
    }
    /**
     * Rotate the matrix around x-axis and returns new `Matrix4x4`.
     *
     * This method does not mutate the matrix.
     * @param {number} radian
     * @returns {Matrix4x4}
     */
    rotateX(radian) {
        const rx = Matrix4x4.rotationX(radian);
        return this.mulByMatrix4x4(rx);
    }
    /**
     * Rotate the matrix around y-axis and returns new `Matrix4x4`.
     *
     * This method does not mutate the matrix.
     * @param {number} radian
     * @returns {Matrix4x4}
     */
    rotateY(radian) {
        const ry = Matrix4x4.rotationY(radian);
        return this.mulByMatrix4x4(ry);
    }
    /**
     * Rotate the matrix around z-axis and returns new `Matrix4x4`.
     *
     * This method does not mutate the matrix.
     * @param {number} radian
     * @returns {Matrix4x4}
     */
    rotateZ(radian) {
        const rz = Matrix4x4.rotationZ(radian);
        return this.mulByMatrix4x4(rz);
    }
    /**
     * Rotate the matrix around the `normalizedAxis` and return new Matrix4x4.
     *
     * This method does not mutate the matrix.
     * @param {Float32Vector3} normalizedAxis
     * @param {number} radian
     * @returns {Matrix4x4}
     */
    rotateAround(normalizedAxis, radian) {
        const r = Matrix4x4.rotationAround(normalizedAxis, radian);
        return this.mulByMatrix4x4(r);
    }
    get values() {
        return this._values;
    }
    toString() {
        return this._values.toString();
    }
}

