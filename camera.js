import { Mat4, Vec2, Vec3 } from "./geom.js";

class Camera {
    #position = new Vec3(0, 0, 0);
    #up = new Vec3(0, 0, 0);
    #lookingAt = new Vec3(0, 0, 0);
    #right = new Vec3(0, 0, 0);
    #direction = new Vec3(1, 0, 0);
    #directionXZ = new Vec2(1, 0,);
    #yaw = 0; #pitch = 0;
    
    static #DIRECTION_UP = new Vec3(0.0, 1.0, 0.0);


    /**
     * @param {Vec3} position 
     */
    constructor(position) {
        this.#position.set(...position);
        this.#updateDirection();
    }
    
    changeYaw(delta) {
        this.#yaw += delta;
        if (this.#yaw > 360)
            this.#yaw -= 360
        if (this.#yaw < 0)
            this.#yaw += 360;
        this.#updateDirection();
    }

    changePitch(delta) {
        this.#pitch += delta;
        if (this.#pitch > 89.0)
            this.#pitch = 89.0
        if (this.#pitch < -89.0)
            this.#pitch = -89.0;
        this.#updateDirection();
    }

    #updateDirection() {
        const pitchRads = this.#pitch / 180.0 * Math.PI;
        const yawRads = this.#yaw / 180.0 * Math.PI;
        this.#direction.y = Math.sin(pitchRads);
        const cosPitch = Math.cos(pitchRads);
        this.#direction.x = Math.cos(yawRads) * cosPitch;
        this.#direction.z = Math.sin(yawRads) * cosPitch;
        this.#directionXZ.x = Math.cos(yawRads);
        this.#directionXZ.y = Math.sin(yawRads);
        Vec3.cross(this.#direction, Camera.#DIRECTION_UP, this.#right);
        Vec3.cross(this.#right, this.#direction, this.#up);
    }


    /**
     * @param {number} step 
     */
    moveForward(step) {
        this.#position.x += this.direction.x * step;
        this.#position.y += this.direction.y * step;
        this.#position.z += this.direction.z * step;        
    }

    /**
     * @param {number} step 
     */
    moveRight(step) {
        this.#position.x += this.#right.x * step;
        this.#position.y += this.#right.y * step;
        this.#position.z += this.#right.z * step;        
    }

    /**
     * @param {Mat4} mat 
     */
    setLookAtMatrix(mat) {
        this.#lookingAt.set(this.#position.x + this.#direction.x, this.#position.y + this.#direction.y, this.#position.z + this.#direction.z);
        Mat4.lookAt(this.#position, this.#lookingAt, this.#up, mat);
    }

    /**@returns {Vec3} */
    get position() {
        return this.#position;
    }

    /**@returns {Vec3} */
    get direction() {
        return this.#direction;
    }

    /**@returns {Vec2} */
    get directionXZ() {
        return this.#directionXZ;
    }

    /**@returns {Vec3} */
    get right() {
        return this.#right;
    }

    /**@returns {Vec3} */
    get up() {
        return this.#up;
    }

    get pitch() {
        return this.#pitch;
    }

    get yaw() {
        return this.#yaw;
    }

}

export {Camera}