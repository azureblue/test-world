import { Vec3 } from '../geom.js';
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
     * Add `other` to the vector and returns new `Float32Vector2`.
     *
     * This method does not mutate the vector.
     * @param {Float32Vector2} other
     * @returns {Float32Vector2}
     */
    add(other) {
        return new Float32Vector2(this.x + other.x, this.y + other.y);
    }

    /**
     * 
     * @param {Float32Vector2} other
     * @param {number} scalar 
     */
    addMultipliedInPlace(other, scalar) {
        this._values[0] += other._values[0] * scalar;
        this._values[1] += other._values[1] * scalar;
    }
    /**
     * Subtract `other` from the vector and returns new `Float32Vector2`.
     *
     * This method does not mutate the vector.
     * @param {Float32Vector2} other
     * @returns {Float32Vector2}
     */
    sub(other) {
        return new Float32Vector2(this.x - other.x, this.y - other.y);
    }
    /**
     * Multiply the vector by `scalar` and returns new `Float32Vector2`.
     *
     * This method does not mutate the vector.
     * @param {number} scalar
     * @returns {Float32Vector2}
     */
    mulByScalar(scalar) {
        return new Float32Vector2(this.x * scalar, this.y * scalar);
    }

    /**
    * Multiply the vector by `scalar` in place.
    *
    * This method does not mutate the vector.
    * @param {number} scalar
    */
    mulByScalarInPlace(scalar) {
        this.x *= scalar;
        this.y *= scalar;
        return this;
    }


    /**
     * @param {number} x
     * @param {number} y
     */
    set(x, y) {
        this._values[0] = x;
        this._values[1] = y;
    }

    /**
     * @param {Float32Vector2} other
     */
    setTo(other) {
        this._values.set(other._values);
        return this;
    }

    /**
     * Normalize the vector and returns new `Float32Vector2`.
     *
     * This method does not mutate the vector.
     * @returns {Float32Vector2}
     */
    normalize() {
        const mag = this.magnitude;
        if (mag === 0) {
            return this;
        }
        return new Float32Vector2(this.x / mag, this.y / mag);
    }

    /**
 * Normalize the vector in place.
 */
    normalizeInPlace() {
        const mag = this.magnitude;
        if (mag === 0) {
            return this;
        }
        this.x /= mag;
        this.y /= mag;
    }
    /**

/**
 * Calculate dot product.
 * @param {Float32Vector2} other
 * @returns {number}
 */
    dot(other) {
        return this.x * other.x + this.y * other.y;
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
     * @param {number} x 
     * @param {number} y 
     * @param {number} z 
     */
    set(x, y, z) {
        this._values[0] = x;
        this._values[1] = y;
        this._values[2] = z;
    }

    /**
     * @param {Vec3} other
     */
    setToMultiplied(other, scalar) {
        this._values[0] = other._values[0] * scalar;
        this._values[1] = other._values[1] * scalar;
        this._values[2] = other._values[2] * scalar;
        return this;
    }

    /**
     * @param {Vec3} other
     */
    setTo(other) {
        this._values[0] = other._values[0];
        this._values[1] = other._values[1];
        this._values[2] = other._values[2];
        return this;
    }

    /**
     * Add `other` to the vector and returns new `Float32Vector3`.
     *
     * This method does not mutate the vector.
     * @param {Float32Vector3} other
     * @returns {Float32Vector3}
     */
    add(other) {
        return new Float32Vector3(this.x + other.x, this.y + other.y, this.z + other.z);
    }

    /**
     * Add `other` to the vector.
     *
     * @param {Float32Vector3} other
     */
    addInPlace(other) {
        this.x += other.x; this.y += other.y; this.z += other.z;
    }
    
    /**
     * Add `other` to the vector.
     *
     * @param {Float32Vector3} other
     */
    subInPlace(other) {
        this._values[0] -= other._values[0];
        this._values[1] -= other._values[1];
        this._values[2] -= other._values[2];
    }



    /**
     *
     * @param {Float32Vector3} other
     * @param {number} scalar
     */
    addMulInPlace(other, scalar) {
        this.x += other.x * scalar;
        this.y += other.y * scalar;
        this.z += other.z * scalar;
    }

    /**
     * Subtract `other` from the vector and returns new `Float32Vector3`.
     *
     * This method does not mutate the vector.
     * @param {Float32Vector3} other
     * @returns {Float32Vector3}
     */
    sub(other) {
        return new Float32Vector3(this.x - other.x, this.y - other.y, this.z - other.z);
    }
    /**
     * Multiply the vector by `scalar` and returns new `Float32Vector3`.
     *
     * This method does not mutate the vector.
     * @param {number} scalar
     * @returns {Float32Vector3}
     */
    mulByScalar(scalar) {
        return new Float32Vector3(this.x * scalar, this.y * scalar, this.z * scalar);
    }
    /**
     * @param {number} scalar
     */
    mulByScalarInPlace(scalar) {
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
     * 
     * @param {Vec3} a 
     * @param {Vec3} b 
     * @param {Vec3} result 
     */
    static cross(a, b, result) {
        const cx = a.y * b.z - a.z * b.y;
        const cy = a.z * b.x - a.x * b.z;
        const cz = a.x * b.y - a.y * b.x;
        result.set(cx, cy, cz);
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
    normalizeInPlace() {
        const mag = this.magnitude;
        if (mag === 0) {
            return this;
        }
        this.x /= mag;
        this.y /= mag;
        this.z /= mag;
    }
    /**
     * Returns xy values of the vector as `Float32Vector2`.
     * @returns {Float32Vector2}
     */
    get xy() {
        return new Float32Vector2(this.x, this.y);
    }

    /**
     * Returns xz values of the vector as `Float32Vector2`.
     * @returns {Float32Vector2}
     */
    get xz() {
        return new Float32Vector2(this.x, this.z);
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
     * Add `other` to the vector and returns new `Float32Vector4`.
     *
     * This method does not mutate the vector.
     * @param {Float32Vector4} other
     * @returns {Float32Vector4}
     */
    add(other) {
        return new Float32Vector4(this.x + other.x, this.y + other.y, this.z + other.z, this.w + other.w);
    }
    /**
     * Subtract `other` from the vector and returns new `Float32Vector4`.
     *
     * This method does not mutate the vector.
     * @param {Float32Vector4} other
     * @returns {Float32Vector4}
     */
    sub(other) {
        return new Float32Vector4(this.x - other.x, this.y - other.y, this.z - other.z, this.w - other.w);
    }
    /**
     * Multiply the vector by `scalar` and returns new `Float32Vector4`.
     *
     * This method does not mutate the vector.
     * @param {number} scalar
     * @returns {Float32Vector4}
     */
    mulByScalar(scalar) {
        return new Float32Vector4(this.x * scalar, this.y * scalar, this.z * scalar, this.w * scalar);
    }
    /**
     * Returns xyz values of the vector as `Float32Vector3`.
     * @returns {Float32Vector3}
     */
    get xyz() {
        return new Float32Vector3(this.x, this.y, this.z);
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
