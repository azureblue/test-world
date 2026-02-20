import { Float32Vector2 as FVec2, Float32Vector3 as FVec3, Float32Vector4 as FVec4 } from "./matrixgl/float32vector.js";
import { Matrix3x3 as Mat3, Matrix4x4 as Mat4 } from "./matrixgl/matrix.js";


class Normal {

    /**@type {FVec3} */
    position = new FVec3(0, 0, 0);
    /**@type {FVec3} */
    direction = new FVec3(0, 0, 0);

    /**@param {FVec3} position  */
    /**@param {FVec3} direction  */
    set(position, direction) {
        this.position.setTo(position);
        this.direction.setTo(direction);
    }

    /**@param {Normal} other  */
    setTo(other) {
        this.set(other.position, other.direction);
    }
}

export const PLANES_N = 6;
class FrustumPlanes {
    constructor() {
        this.top = new Normal();
        this.bottom = new Normal();
        this.left = new Normal();
        this.right = new Normal();
        this.near = new Normal();
        this.far = new Normal();
        this.planes = [this.near, this.left, this.right, this.far, this.top, this.bottom];
    }
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
    /**@type {number} */
    #aspectRatio
    /**@type {number} */
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
 * @returns {FVec3}
 */
function fvec3(x = 0, y = 0, z = 0) {
    return new FVec3(x, y, z);
}

/**
 * @param {number} [x] 
 * @param {number} [y] 
 * @returns {FVec2}
 */
function fvec2(x = 0, y = 0) {
    return new FVec2(x, y);
}

/**
 * @param {number} [x] 
 * @param {number} [y] 
 * @returns {IVec2}
 */
export function ivec2(x = 0, y = 0) {
    return new IVec2(x, y);
}

/**
 * @param {number} [x] 
 * @param {number} [y] 
 * @param {number} [z] 
 * @returns {IVec3}
 */
export function ivec3(x = 0, y = 0, z = 0) {
    return new IVec3(x, y, z);
}


export class IVec2 {
    data = new Int32Array(2);

    constructor(x, y) {
        this.data[0] = x;
        this.data[1] = y;
    }

    get x() {
        return this.data[0];
    }

    get y() {
        return this.data[1];
    }

    set x(value) {
        this.data[0] = value;
    }

    set y(value) {
        this.data[1] = value;
    }
}

export class IVec3 {
    data = new Int32Array(3);

    constructor(x, y, z) {
        this.data[0] = x;
        this.data[1] = y;
        this.data[2] = z;
    }

    get x() {
        return this.data[0];
    }

    get y() {
        return this.data[1];
    }

    get z() {
        return this.data[2];
    }

    set x(value) {
        this.data[0] = value;
    }

    set y(value) {
        this.data[1] = value;
    }

    set z(value) {
        this.data[2] = value;
    }
}

export class Direction {
    static UP = 0;
    static FRONT = 1;
    static LEFT = 2;
    static BACK = 3;
    static RIGHT = 4;
    static DOWN = 5;
    static DIAGONAL_0 = 6;
    static DIAGONAL_1 = 7;

    /** @type {Array<Direction>} */
    static directions = [
        new Direction(Direction.UP, ivec3(0, 1, 0), ivec3(0, 0, 1), 0b000),
        new Direction(Direction.FRONT, ivec3(0, 0, 1), ivec3(0, -1, 0), 0b001),
        new Direction(Direction.LEFT, ivec3(-1, 0, 0), ivec3(-1, 0, 0), 0b010),
        new Direction(Direction.BACK, ivec3(0, 0, -1), ivec3(0, 1, 0), 0b011),
        new Direction(Direction.RIGHT, ivec3(1, 0, 0), ivec3(1, 0, 0), 0b100),
        new Direction(Direction.DOWN, ivec3(0, -1, 0), ivec3(0, 0, -1), 0b101),
        new Direction(Direction.DIAGONAL_0, ivec3(1, 0, 1), ivec3(1, 1, 0), 0b110),
        new Direction(Direction.DIAGONAL_1, ivec3(1, 0, -1), ivec3(1, -1, 0), 0b111)
        // new Direction(Direction.DIAGONAL_0, ivec3(1, 0, 1).normalize(), 0b110),
        // new Direction(Direction.DIAGONAL_1, ivec3(1, 0, -1).normalize(), 0b111)
    ];

    static offsets = new Int32Array(Direction.directions.length * 3);
    static {
        for (let i = 0; i < Direction.directions.length; i++) {
            const dir = Direction.directions[i];
            Direction.offsets[i * 3 + 0] = dir.logicDir.x;
            Direction.offsets[i * 3 + 1] = dir.logicDir.y;
            Direction.offsets[i * 3 + 2] = dir.logicDir.z;
        }
    }

    /**
     * @param {FVec3} worldDir 
     * @param {number} bits 
     */
    constructor(id, worldDir, logicDir, bits) {
        this.id = id;
        this.worldDir = worldDir;
        this.logicDir = logicDir;
        this.bits = bits;
    }
}

// export class DIR8 {
//     static #dirs = new Int32Array([
//         -1, 0,
//         -1, -1,
//         0, -1,
//         1, -1,
//         1, 0,
//         1, 1,
//         0, 1,
//         -1, 1        
//     ]);

//     #dir = 0;

//     constructor(rotationIdxCW = 0) {
//         this.#dir = (-rotationIdxCW + 8) & 7;
//     }

//     x(dirDeltaCCW = 0) {
//         return DIR8.#dirs[((this.#dir + dirDeltaCCW + 8) & 7) >> 1];
//     }

//     y(dirDeltaCCW = 0) {
//         return DIR8.#dirs[(((this.#dir + dirDeltaCCW + 8) & 7) >> 1) + 1];
//     }

//     rotateCW() {
//         this.#dir = (this.#dir + 7) & 7;
//     }

//     rotateCCW() {
//         this.#dir = (this.#dir + 1) & 7;
//     }

//     set(rotationIdxCW) {
//         this.#dir = (-rotationIdxCW + 8) & 7;
//     }
// }

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

    constructor(x = 0, y = 0) {
        this.x = x;
        this.y = y;
    }
}

export class Vec3 {
    constructor(x, y, z) {
        this.x = x;
        this.y = y;
        this.z = z;
    }

    equals(x, y, z) {
        return this.x === x && this.y === y && this.z === z;
    }
}

export function vec3(x, y, z) {
    return new Vec3(x, y, z);
}

export class Vec2 {
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }
}

export function vec2(x, y) {
    return new Vec2(x, y);
}

export const Dir27 = [
/* 0*/ vec3(-1, -1, -1),
/* 1*/ vec3(0, -1, -1),
/* 2*/ vec3(1, -1, -1),
/* 3*/ vec3(-1, 0, -1),
/* 4*/ vec3(0, 0, -1),
/* 5*/ vec3(1, 0, -1),
/* 6*/ vec3(-1, 1, -1),
/* 7*/ vec3(0, 1, -1),
/* 8*/ vec3(1, 1, -1),
/* 9*/ vec3(-1, -1, 0),
/*10*/ vec3(0, -1, 0),
/*11*/ vec3(1, -1, 0),
/*12*/ vec3(-1, 0, 0),
/*13*/ vec3(0, 0, 0),
/*14*/ vec3(1, 0, 0),
/*15*/ vec3(-1, 1, 0),
/*16*/ vec3(0, 1, 0),
/*17*/ vec3(1, 1, 0),
/*18*/ vec3(-1, -1, 1),
/*19*/ vec3(0, -1, 1),
/*20*/ vec3(1, -1, 1),
/*21*/ vec3(-1, 0, 1),
/*22*/ vec3(0, 0, 1),
/*23*/ vec3(1, 0, 1),
/*24*/ vec3(-1, 1, 1),
/*25*/ vec3(0, 1, 1),
/*26*/ vec3(1, 1, 1),
];

export { Frustum, FrustumPlanes, FVec2, fvec2, FVec3, fvec3, FVec4, Mat3, mat3, Mat4, mat4, Projection };

