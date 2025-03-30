import { Chunk } from "./chunk.js";
import { Frustum, FrustumPlanes, Mat4, Vec2, Vec3, vec3 } from "./geom.js";

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
        this.#right.normalizeInPlace();
        Vec3.cross(this.#right, this.#direction, this.#up);
        this.#up.normalizeInPlace();
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

class FrustumCuller {
    #planes = new FrustumPlanes();
    #frustum;
    #camera;
    #posToFar = vec3();
    #tmp = vec3();
    // #tmpPlanePos = new Float32Array(4);
    // #chunkCoords = new Float32Array(8 * 4);
    // #chunkXs = new Float32Array(8);
    // #chunkYs = new Float32Array(8);
    // #chunkZs = new Float32Array(8);



    /**
     * @param {Frustum} frustum 
     * @param {Camera} camera 
     */
    constructor(frustum, camera) {
        this.#frustum = frustum;
        this.#camera = camera;
    }

    updatePlanes() {
        const posToFar = this.#posToFar;
        const camDir = this.#camera.direction;
        const camRight = this.#camera.right;
        const camUp = this.#camera.up;
        const tmp = this.#tmp;
        const farHalfV = this.#frustum.farHalfV
        const farHalfH = this.#frustum.farHalfH;

        posToFar.setToMultiplied(camDir, this.#frustum.far);

        this.#planes.near.direction.setTo(camDir);
        this.#planes.near.position.setToMultiplied(camDir, this.#frustum.near);

        this.#planes.far.position.setTo(posToFar);
        const farMid = posToFar;
        this.#planes.far.direction.setTo(camDir).mulByScalarInPlace(-1.0);

        // this.#planes.left.position.setTo(pos);
        tmp.setTo(farMid).addMulInPlace(camRight, -farHalfH);
        Vec3.cross(tmp, camUp, this.#planes.left.direction);
        this.#planes.left.direction.normalizeInPlace();

        // this.#planes.right.position.setTo(pos);
        tmp.setTo(farMid).addMulInPlace(camRight, farHalfH);
        Vec3.cross(camUp, tmp, this.#planes.right.direction);
        this.#planes.right.direction.normalizeInPlace();

        // this.#planes.top.position.setTo(pos);
        tmp.setTo(farMid).addMulInPlace(camUp, farHalfV);
        Vec3.cross(tmp, camRight, this.#planes.top.direction);
        this.#planes.top.direction.normalizeInPlace();

        // this.#planes.bottom.position.setTo(pos);
        tmp.setTo(farMid).addMulInPlace(camUp, -farHalfV);
        Vec3.cross(camRight, tmp, this.#planes.bottom.direction);
        this.#planes.bottom.direction.normalizeInPlace();
    }

    /**
     * @param {Chunk} chunk
     */
    shouldDraw(chunk) {
        const camPos = this.#camera.position._values;
        const corners = chunk.worldCorners;
        plane_loop:
        for (let plane of this.#planes.planes) {
            const planeRelativePos = plane.position._values;
            const planeDir = plane.direction._values;
            const planex = camPos[0] + planeRelativePos[0];
            const planey = camPos[1] + planeRelativePos[1];
            const planez = camPos[2] + planeRelativePos[2];
            const planedx = planeDir[0];
            const planedy = planeDir[1];
            const planedz = planeDir[2];

            for (let i = 0; i < 8; i++) {
                const offset = i << 2;
                const ctcx = corners[offset] - planex;
                const ctcy = corners[offset + 1] - planey;
                const ctcz = corners[offset + 2] - planez;
                const dot = ctcx * planedx + ctcy * planedy + ctcz * planedz;
                if (dot >= -FrustumCuller.DELTA) {
                    continue plane_loop;
                }
            }
            return false;
        }
        return true;
    }


    static DELTA = 0.1;

}

export { Camera, FrustumCuller };
