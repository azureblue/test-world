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
    planes = [this.near, this.left, this.right, this.far, this.top, this.bottom];
}

class Frustum {
    /**@type {number} */ #top;
    /**@type {number} */ #bottom;
    /**@type {number} */ #left;
    /**@type {number} */ #right;
    /**@type {number} */ #near;
    /**@type {number} */ #far;
    /**@type {number} */ #farHalfV;
    /**@type {number} */ #farHalfH;

    constructor(top, bottom, left, right, near, far, farHalfV, farHalfH) {
        this.set(top, bottom, left, right, near, far, farHalfV, farHalfH);
    }

    set(top, bottom, left, right, near, far, farHalfV, farHalfH) {
        this.#top = top;
        this.#bottom = bottom;
        this.#left = left;
        this.#right = right;
        this.#near = near;
        this.#far = far;
        this.#farHalfV = farHalfV;
        this.#farHalfH = farHalfH;
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

    get farHalfV() {
        return this.#farHalfV;
    }

    get farHalfH() {
        return this.#farHalfH;
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
        const farHalfV = far * Math.tan(fovYRadian / 2.0);
        const farHalfH = farHalfV * aspectRatio;
        this.#frustum.set(top, bottom, left, right, near, far, farHalfV, farHalfH);
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
 * @returns {Mat4}
 */
function mat4() {
    return new Mat4(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
}

/**
 * @returns {Mat3}
 */
function mat3() {
    return new Mat3(0, 0, 0, 0, 0, 0, 0, 0, 0)
}

/**
 * @param {number} [x] 
 * @param {number} [y] 
 * @param {number} [z] 
 * @returns {Vec3}
 */
function vec3(x = 0, y = 0, z = 0) {
    return new Vec3(x, y, z);
}

/**
 * @param {number} [x] 
 * @param {number} [y] 
 * @returns {Vec2}
 */
function vec2(x = 0, y = 0) {
    return new Vec2(x = 0, y = 0);
}

export class Direction {
    static FRONT = 0;
    static LEFT = 1;
    static BACK = 2;
    static RIGHT = 3;
    static UP = 4;
    static DOWN = 5;
    
    /** @type {Array<Direction>} */
    static directions = [
        new Direction(Direction.FRONT, new Vec3(0, 0, 1), 0b000), //front
        new Direction(Direction.LEFT, new Vec3(-1, 0, 0), 0b001), //left
        new Direction(Direction.BACK, new Vec3(0, 0, -1), 0b010), //back
        new Direction(Direction.RIGHT, new Vec3(1, 0, 0), 0b011), //right
        new Direction(Direction.UP, new Vec3(0, 1, 0), 0b100), //up
        new Direction(Direction.DOWN, new Vec3(0, -1, 0), 0b101) //down
    ];

    /**
     * @param {Vec3} direction 
     * @param {number} bits 
     */
    constructor(id, direction, bits) {
        this.id = id;
        this.v = direction;
        this.bits = bits;
    }
}


export class DirXY {
    x = 0;
    y = 0;

    set(x, y) {
        this.x = x;
        this.y = y;
    }

    rotateCCW() {                
        this.set(-this.y, this.x);
    }
}

export { Frustum, FrustumPlanes, Mat3, mat3, Mat4, mat4, Projection, Vec2, vec2, Vec3, vec3, Vec4 };

