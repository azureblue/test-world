import { Chunk } from "./chunk.js";
import { Frustum, FrustumPlanes, FVec2, FVec3, fvec3, mat4, Mat4, PLANES_N, Vec3 } from "./geom.js";
import { Float32Vector3 } from "./matrixgl/float32vector.js";

class Camera {
    #position = new FVec3(0, 0, 0);
    #up = new FVec3(0, 0, 0);
    #lookingAt = new FVec3(0, 0, 0);
    #right = new FVec3(0, 0, 0);
    #direction = new FVec3(1, 0, 0);
    #directionXZ = new FVec2(1, 0,);
    #yaw = 0; #pitch = 0;

    static #DIRECTION_UP = new FVec3(0.0, 1.0, 0.0);

    /**
     * @param {FVec3} position 
     */
    constructor(position) {
        this.#position.set(...position);
        this.update();
    }

    changeYaw(delta) {
        this.#yaw += delta;
        if (this.#yaw > 360)
            this.#yaw -= 360
        if (this.#yaw < 0)
            this.#yaw += 360;
    }

    changePitch(delta) {
        this.#pitch += delta;
        if (this.#pitch > 89.0)
            this.#pitch = 89.0
        if (this.#pitch < -89.0)
            this.#pitch = -89.0;
    }

    setPosition(vec) {
        this.#position.setTo(vec);
    }

    /**
     * @param {FVec3} vec 
     */
    setDirection(vec) {
        // normalize (avoid NaNs)
        const x = vec.x, y = vec.y, z = vec.z;
        const len = Math.hypot(x, y, z);
        if (len < 1e-8) return; // ignore zero vector
        const nx = x / len, ny = y / len, nz = z / len;

        // pitch = asin(y)
        let pitch = Math.asin(Math.max(-1, Math.min(1, ny))) * 180.0 / Math.PI;

        // yaw = atan2(z, x)
        let yaw = Math.atan2(nz, nx) * 180.0 / Math.PI;
        if (yaw < 0) yaw += 360.0;

        // clamp pitch like your changePitch does
        if (pitch > 89.0) pitch = 89.0;
        if (pitch < -89.0) pitch = -89.0;

        this.#pitch = pitch;
        this.#yaw = yaw;
    }

    update() {
        const pitchRads = this.#pitch / 180.0 * Math.PI;
        const yawRads = this.#yaw / 180.0 * Math.PI;
        this.#direction.y = Math.sin(pitchRads);
        const cosPitch = Math.cos(pitchRads);
        const cosYaw = Math.cos(yawRads);
        const sinYaw = Math.sin(yawRads);
        this.#direction.x = cosYaw * cosPitch;
        this.#direction.z = sinYaw * cosPitch;
        this.#directionXZ.x = cosYaw;
        this.#directionXZ.y = sinYaw;
        FVec3.cross(this.#direction, Camera.#DIRECTION_UP, this.#right);
        this.#right.normalizeIn();
        FVec3.cross(this.#right, this.#direction, this.#up);
        this.#up.normalizeIn();
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
    calculateLookAtMatrix(mat) {
        this.#lookingAt.set(this.#position.x + this.#direction.x, this.#position.y + this.#direction.y, this.#position.z + this.#direction.z);
        Camera.calculateLookAtMatrix(this.#position, this.#lookingAt, this.#up, mat);
    }

    /**@returns {FVec3} */
    get position() {
        return this.#position;
    }

    /**@returns {FVec3} */
    get direction() {
        return this.#direction;
    }

    /**@returns {FVec2} */
    get directionXZ() {
        return this.#directionXZ;
    }

    /**@returns {FVec3} */
    get right() {
        return this.#right;
    }

    /**@returns {FVec3} */
    get up() {
        return this.#up;
    }

    get pitch() {
        return this.#pitch;
    }

    get yaw() {
        return this.#yaw;
    }

    static #calculateLookAtMatrix_xAxis = fvec3();
    static #calculateLookAtMatrix_yAxis = fvec3();
    static #calculateLookAtMatrix_zAxis = fvec3();
    /**
     * Returns "look at" matrix.
     * @param {FVec3} cameraPosition
     * @param {Float32Vector3} lookAtPosition
     * @param {Float32Vector3} cameraUp
     * @param {Matrix4x4} result
     */
    static calculateLookAtMatrix(cameraPosition, lookAtPosition, cameraUp, result) {        
        cameraPosition.subOut(lookAtPosition, Camera.#calculateLookAtMatrix_zAxis).normalizeIn();
        cameraUp.crossOut(Camera.#calculateLookAtMatrix_zAxis, Camera.#calculateLookAtMatrix_xAxis).normalizeIn();
        Camera.#calculateLookAtMatrix_zAxis.crossOut(Camera.#calculateLookAtMatrix_xAxis, Camera.#calculateLookAtMatrix_yAxis).normalizeIn();

        result.setValues(
            Camera.#calculateLookAtMatrix_xAxis.x,
            Camera.#calculateLookAtMatrix_yAxis.x,
            Camera.#calculateLookAtMatrix_zAxis.x,
            0.0,
            Camera.#calculateLookAtMatrix_xAxis.y,
            Camera.#calculateLookAtMatrix_yAxis.y,
            Camera.#calculateLookAtMatrix_zAxis.y,
            0.0,
            Camera.#calculateLookAtMatrix_xAxis.z,
            Camera.#calculateLookAtMatrix_yAxis.z,
            Camera.#calculateLookAtMatrix_zAxis.z,
            0.0,
            -cameraPosition.dot(Camera.#calculateLookAtMatrix_xAxis),
            -cameraPosition.dot(Camera.#calculateLookAtMatrix_yAxis),
            -cameraPosition.dot(Camera.#calculateLookAtMatrix_zAxis),
            1.0
        );
    }

}

class FrustumCuller {
    static #DELTA = 0.1;

    #planes = new FrustumPlanes();
    #frustum;
    #camera;
    #posToFar = fvec3();
    #tmp = fvec3();

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

        tmp.setTo(farMid).addMulInPlace(camRight, -farHalfH);
        FVec3.cross(tmp, camUp, this.#planes.left.direction);
        this.#planes.left.direction.normalizeIn();

        tmp.setTo(farMid).addMulInPlace(camRight, farHalfH);
        FVec3.cross(camUp, tmp, this.#planes.right.direction);
        this.#planes.right.direction.normalizeIn();

        tmp.setTo(farMid).addMulInPlace(camUp, farHalfV);
        FVec3.cross(tmp, camRight, this.#planes.top.direction);
        this.#planes.top.direction.normalizeIn();

        tmp.setTo(farMid).addMulInPlace(camUp, -farHalfV);
        FVec3.cross(camRight, tmp, this.#planes.bottom.direction);
        this.#planes.bottom.direction.normalizeIn();
    }

    /**
     * @param {Chunk} chunk
     */
    shouldDraw(chunk) {
        if (chunk.mesh === null) {
            return false;
        }
        const camPos = this.#camera.position._values;
        const corners = chunk.worldCornersData;
        const planes = this.#planes.planes;
        plane_loop:
        for (let planeIdx = 0; planeIdx < PLANES_N; planeIdx++) {
            const plane = planes[planeIdx];
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
                if (dot >= -FrustumCuller.#DELTA) {
                    continue plane_loop;
                }
            }
            return false;
        }
        return true;
    }
}

export { Camera, FrustumCuller };
