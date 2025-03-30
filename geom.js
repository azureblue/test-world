import { Float32Vector2 as Vec2, Float32Vector3 as Vec3, Float32Vector4 as Vec4 } from "./matrixgl/float32vector.js";
import { Matrix3x3 as Mat3, Matrix4x4 as Mat4 } from "./matrixgl/matrix.js";


class Normal {

    /**@type {Vec3} */
    position = new Vec3(0, 0, 0);
    /**@type {Vec3} */
    direction = new Vec3(0, 0, 0);

    /**@param {Vec3} position  */
    /**@param {Vec3} direction  */
    set(position, direction) {
        this.position.setTo(position);
        this.direction.setTo(direction);
    }

    /**@param {Normal} other  */
    setTo(other) {
        this.set(other.position, other.direction);
    }
}

class FrustumPlanes {
    /**@type {Normal} */ top = new Normal();
    /**@type {Normal} */ bottom = new Normal();
    /**@type {Normal} */ left = new Normal();
    /**@type {Normal} */ right = new Normal();
    /**@type {Normal} */ near = new Normal();
    /**@type {Normal} */ far = new Normal();
}

class Frustum {
    /**@type {number} */ #top;
    /**@type {number} */ #bottom;
    /**@type {number} */ #left;
    /**@type {number} */ #right;
    /**@type {number} */ #near;
    /**@type {number} */ #far;

    constructor(top, bottom, left, right, near, far) {
        this.set(top, bottom, left, right, near, far);
    }

    set(top, bottom, left, right, near, far) {
        this.#top = top;
        this.#bottom = bottom;
        this.#left = left;
        this.#right = right;
        this.#near = near;
        this.#far = far;
    }


    get top() {
        return this.#top;
    }

    get bottom() {
        return this.#bottom;
    }

    get left() {
        return this.#left;
    }

    get right() {
        return this.#right;
    }

    get near() {
        return this.#near;
    }

    get far() {
        return this.#far;
    }
}

class Projection {

    /**@type {Frustum} */
    #frustum = new Frustum(0, 0, 0, 0, 0, 0);
    /**@type {numer} */
    #aspectRatio
    /**@type {numer} */
    #fieldOfViewV


    constructor(fovYRadian, aspectRatio, near, far) {
        this.set(fovYRadian, aspectRatio, near, far);
    }

    /**     
     * @param {Mat4} mat 
     */
    apply(mat) {
        mat.setValues(
            2 * this.#frustum.near / (this.#frustum.right - this.#frustum.left), 0.0, 0.0, 0.0,
            0.0, 2 * this.#frustum.near / (this.#frustum.top - this.#frustum.bottom), 0.0, 0.0,
            (this.#frustum.right + this.#frustum.left) / (this.#frustum.right - this.#frustum.left), (this.#frustum.top + this.#frustum.bottom) / (this.#frustum.top - this.#frustum.bottom), -(this.#frustum.far + this.#frustum.near) / (this.#frustum.far - this.#frustum.near), -1.0,
            0.0, 0.0, -2 * this.#frustum.far * this.#frustum.near / (this.#frustum.far - this.#frustum.near), 0.0
        );
    }

    set(fovYRadian, aspectRatio, near, far) {
        const top = near * Math.tan(fovYRadian * 0.5);
        const height = top * 2;
        const width = aspectRatio * height;
        const left = -0.5 * width;
        const right = left + width;
        const bottom = top - height;
        this.#fieldOfViewV = fovYRadian;
        this.#aspectRatio = aspectRatio;
        this.#frustum.set(top, bottom, left, right, near, far);
    }

    get frustum() {
        return this.#frustum;
    }

    get fieldOfViewV() {
        return this.#fieldOfViewV;
    }

    get aspectRatio() {
        return this.#aspectRatio;
    }

}

/**
 * Create new zero matrix.
 * @returns {Mat4}
 */
function mat4() {
    return new Mat4(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
}

/**
 * Create new zero matrix.
 * @returns {Mat3}
 */
function mat3() {
    return new Mat3(0, 0, 0, 0, 0, 0, 0, 0, 0)
}

/**@returns {Vec3} */
function vec3() {
    return new Vec3(0, 0, 0);
}

/**@returns {Vec2} */
function vec2() {
    return new Vec2(0, 0);
}


export { Frustum, FrustumPlanes, Mat3, Mat4, Projection, Vec2, Vec3, Vec4, mat3, mat4, vec2, vec3 };

