import { Vector2Base, Vector3Base, Vector4Base } from './vector_base.js';
/**
 * A 2-dimensional vector of single-precision float numbers.
 */
export class Float32Vector2 extends Vector2Base {
    constructor(x, y) {
        super();
        this._values = new Float32Array([x, y]);
    }
    /**
     * Add `other` to the vector.
     *
     * @param {Float32Vector2} other
     */
    add(other) {
        this.x += other.x;
        this.y += other.y;
    }
    /**
     * Subtract `other` from the vector.
     *
     * @param {Float32Vector2} other
     */
    sub(other) {
        this.x -= other.x;
        this.y -= other.y;
    }
    /**
     * Multiply the vector by `scalar`.
     *
     * @param {number} scalar
     */
    mulByScalar(scalar) {
        this.x *= scalar;
        this.y *= scalar;
    }
}
/**
 * A 3-dimensional vector of single-precision float numbers.
 */
export class Float32Vector3 extends Vector3Base {
    constructor(x, y, z) {
        super();
        this._values = new Float32Array([x, y, z]);
    }
    /**
     * Add `other` to the vector.
     *
     * @param {Float32Vector3} other
     */
    add(other) {
        this.x += other.x;
        this.y += other.y;
        this.z += other.z;
    }

    /**
     * Set values from `other`vector.
     *
     * @param {Float32Vector3} other
     */
    set(other){
        this._values.set(other._values);
    }
    /**
     * Subtract `other` from the vector.
     *
     * @param {Float32Vector3} other
     */
    sub(other) {
        this.x -= other.x;
        this.y -= other.y;
        this.z -= other.z;
    }
    /**
     * Multiply the vector by `scalar`.
     *
     * @param {number} scalar
     */
    mulByScalar(scalar) {
        this.x *= scalar;
        this.y *= scalar;
        this.z *= scalar;
    }
    /**
     * Calculate dot product.
     * @param {Float32Vector3} other
     * @returns {number}
     */
    dot(other) {
        return this.x * other.x + this.y * other.y + this.z * other.z;
    }
    /**
     * Calculate cross product.
     * @param {Float32Vector3} other
     * @returns {Float32Vector3}
     */
    cross(other) {
        const cx = this.y * other.z - this.z * other.y;
        const cy = this.z * other.x - this.x * other.z;
        const cz = this.x * other.y - this.y * other.x;
        return new Float32Vector3(cx, cy, cz);
    }
    
    /**
     * Normalize the vector and returns new `Float32Vector3`.
     *
     * This method does not mutate the vector.
     * @returns {Float32Vector3}
     */
    normalize() {
        const mag = this.magnitude;
        if (mag === 0) {
            return this;
        }
        return new Float32Vector3(this.x / mag, this.y / mag, this.z / mag);
    }

    /**
     * Normalize the vector in place.
     */
    normalize() {
        const mag = this.magnitude;
        if (mag === 0) {
            return this;
        }
        this.x /= mag;
        this.y /= mag;
        this.z /= mag;
    }
}
/**
 * A 4-dimensional vector of single-precision float numbers.
 */
export class Float32Vector4 extends Vector4Base {
    constructor(x, y, z, w) {
        super();
        this._values = new Float32Array([x, y, z, w]);
    }
    /**
     * Add `other` to the vector.
     *
     * @param {Float32Vector3} other
     */
    add(other) {
        this.x += other.x;
        this.y += other.y;
        this.z += other.z;
        this.w += other.w;
    }
    /**
     * Subtract `other` from the vector.
     *
     * @param {Float32Vector3} other
     */
    sub(other) {
        this.x -= other.x;
        this.y -= other.y;
        this.z -= other.z;
        this.w -= other.w;
    }
    /**
     * Multiply the vector by `scalar`.
     *
     * @param {number} scalar
     */
    mulByScalar(scalar) {
        this.x *= scalar;
        this.y *= scalar;
        this.z *= scalar;
        this.w *= scalar;
    }
}
/**
 * An alias for `Float32Vector2`.
 * @type {Float32Vector2}
 */
export const Vector2 = Float32Vector2;
/**
 * An alias for `Float32Vector3`.
 * @type {Float32Vector3}
 */
export const Vector3 = Float32Vector3;
/**
 * An alias for `Float32Vector4`.
 * @type {Float32Vector4}
 */
export const Vector4 = Float32Vector4;
