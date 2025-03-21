import { Matrix4x4 } from './matrix.js';
/**
 * Quaternion which is 4-dimensional complex number.
 * See [Wikipedia](https://en.wikipedia.org/wiki/Quaternion).
 */
export class Quaternion {
    constructor(x, y, z, w) {
        this._values = new Float32Array([x, y, z, w]);
    }
    /**
     * Create a rotation quaternion around `normalizedAxis`.
     * `normalizedAxis` must be normalized.
     * @param {Float32Vector3} normalizedAxis
     * @param {number} radian
     * @returns {Quaternion}
     */
    static rotationAround(normalizedAxis, radian) {
        const sin = Math.sin(radian / 2.0);
        const cos = Math.cos(radian / 2.0);
        return new Quaternion(normalizedAxis.x * sin, normalizedAxis.y * sin, normalizedAxis.z * sin, cos);
    }
    /**
     * Returns a normalized quaternion.
     * @returns {Quaternion}
     */
    normalize() {
        const mag = this.magnitude;
        if (mag === 0) {
            return this;
        }
        const r = 1 / mag;
        return new Quaternion(this.x * r, this.y * r, this.z * r, this.w * r);
    }
    /**
     * Adds the `other` to the quaternion and returns the sum.
     *
     * This method does not mutate the quaternion.
     * @param {Quaternion} other
     * @returns {Quaternion}
     */
    add(other) {
        return new Quaternion(this.x + other.x, this.y + other.y, this.z + other.z, this.w + other.w);
    }
    /**
     * Multiplies the quaternion by `scalar` and returns the product.
     *
     * This method does not mutate the quaternion.
     * @param {number} scalar
     * @returns {Quaternion}
     */
    mulByScalar(scalar) {
        return new Quaternion(this.x * scalar, this.y * scalar, this.z * scalar, this.w * scalar);
    }
    /**
     * Calculates dot product.
     * @param {Quaternion} other
     * @returns {number}
     */
    dot(other) {
        return this.x * other.x + this.y * other.y + this.z * other.z + this.w * other.w;
    }
    /**
     * Calculates spherical linear interpolation(also known as Slerp) and returns new `Quaternion` between the quaternion and the other.
     * @param {Quaternion} other
     * @param {number} t 0.0 <= t <= 1.0
     * @param {{chooseShorterAngle: boolean}} options Does not work currently. slerp chooses shorter angle regardless of this value.
     * @returns {Quaternion}
     */
    slerp(other, t, options = { chooseShorterAngle: true }) {
        let dotProd = this.dot(other);
        let otherQuaternion = other;
        // When the dot product is negative, slerp chooses the longer way.
        // So we should negate the `other` quaternion.
        if (dotProd < 0) {
            dotProd = -dotProd;
            otherQuaternion = other.mulByScalar(-1);
        }
        const omega = Math.acos(dotProd);
        const sinOmega = Math.sin(omega);
        const q1 = this.mulByScalar(Math.sin((1 - t) * omega) / sinOmega);
        const q2 = otherQuaternion.mulByScalar(Math.sin(t * omega) / sinOmega);
        return q1.add(q2);
    }
    /**
     * Calc magnitude of the quaternion.
     * @returns {number}
     */
    get magnitude() {
        return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z + this.w * this.w);
    }
    /**
     * Calc norm of the quaternion.
     * An alias for `magnitude`.
     * @returns {number}
     */
    get norm() {
        return this.magnitude;
    }
    /**
     * Returns x value of the vector.
     * @returns {number}
     */
    get x() {
        return this._values[0];
    }
    /**
     * Returns y value of the vector.
     * @returns {number}
     */
    get y() {
        return this._values[1];
    }
    /**
     * Returns z value of the vector.
     * @returns {number}
     */
    get z() {
        return this._values[2];
    }
    /**
     * Returns w value of the vector.
     * @returns {number}
     */
    get w() {
        return this._values[3];
    }
    /**
     * Set the `value` as new x.
     * @param {number} value
     */
    set x(value) {
        this._values[0] = value;
    }
    /**
     * Set the `value` as new y.
     * @param {number} value
     */
    set y(value) {
        this._values[1] = value;
    }
    /**
     * Set the `value` as new z.
     * @param {number} value
     */
    set z(value) {
        this._values[2] = value;
    }
    /**
     * Set the `value` as new w.
     * @param {number} value
     */
    set w(value) {
        this._values[3] = value;
    }
    /**
     * Returns values of the quaternion.
     * @returns {Float32Array}
     */
    get values() {
        return this._values;
    }
    /**
     * Convert the quaternion to a rotation matrix.
     * @returns {Matrix4x4}
     */
    toRotationMatrix4() {
        const x = this.x;
        const y = this.y;
        const z = this.z;
        const w = this.w;
        const m11 = 1 - 2 * y * y - 2 * z * z;
        const m12 = 2 * x * y - 2 * w * z;
        const m13 = 2 * x * z + 2 * w * y;
        const m14 = 0;
        const m21 = 2 * x * y + 2 * w * z;
        const m22 = 1 - 2 * x * x - 2 * z * z;
        const m23 = 2 * y * z - 2 * w * x;
        const m24 = 0;
        const m31 = 2 * x * z - 2 * w * y;
        const m32 = 2 * y * z + 2 * w * x;
        const m33 = 1 - 2 * x * x - 2 * y * y;
        const m34 = 0;
        const m41 = 0;
        const m42 = 0;
        const m43 = 0;
        const m44 = 1;
        return new Matrix4x4(m11, m21, m31, m41, m12, m22, m32, m42, m13, m23, m33, m43, m14, m24, m34, m44);
    }
    /**
     * Returns values as `String`.
     * @returns {string}
     */
    toString() {
        return `Quaternion(${this.x}, ${this.y}, ${this.z}, ${this.w})`;
    }
}
