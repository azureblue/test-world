/**
 * An abstract class for vectors.
 */
export class VectorBase {

    *[Symbol.iterator]() {
        yield* this._values;
    };
    
    get values() {
        return this._values;
    }
    get magnitude() {
        let sumSq = 0;
        for (const val of this._values) {
            sumSq += val ** 2;
        }
        return Math.sqrt(sumSq);
    }
    toString() {
        const dimension = this._values.length;
        return `Vector${dimension}(${this._values.join(', ')})`;
    }
}
/**
 * A base abstract class for 2-dimensional vectors.
 */
export class Vector2Base extends VectorBase {
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
}
/**
 * A base abstract class for 3-dimensional vectors.
 */
export class Vector3Base extends VectorBase {
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
}
/**
 * A base abstract class for 4-dimensional vectors.
 */
export class Vector4Base extends VectorBase {
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
}
