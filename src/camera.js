import { Chunk } from "./chunk.js";
import { Frustum, FrustumPlanes, FVec2, FVec3, fvec3, Mat4 } from "./geom.js";
import { Float32Vector3 } from "./matrixgl/float32vector.js";

const RAD_TO_DEG = 180.0 / Math.PI;
const DEG_TO_RAD = Math.PI / 180.0;

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
        let pitch = Math.asin(Math.max(-1, Math.min(1, ny))) * RAD_TO_DEG;

        // yaw = atan2(z, x)
        let yaw = Math.atan2(nz, nx) * RAD_TO_DEG;
        if (yaw < 0) yaw += 360.0;

        if (pitch > 89.0) pitch = 89.0;
        if (pitch < -89.0) pitch = -89.0;

        this.#pitch = pitch;
        this.#yaw = yaw;
    }

    update() {
        const pitchRads = this.#pitch * DEG_TO_RAD;
        const yawRads = this.#yaw * DEG_TO_RAD;
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
     * @param {Mat4} out 
     */
    calculateViewMatrix(out) {
        const x = this.#right;
        const y = this.#up;
        const f = this.#direction;

        const zx = -f.x, zy = -f.y, zz = -f.z;

        const px = this.#position.x, py = this.#position.y, pz = this.#position.z;

        out.setValues(
            x.x, y.x, zx, 0.0,
            x.y, y.y, zy, 0.0,
            x.z, y.z, zz, 0.0,
            -(px * x.x + py * x.y + pz * x.z),
            -(px * y.x + py * y.y + pz * y.z),
            -(px * zx + py * zy + pz * zz),
            1.0
        );
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

    #planes4 = new Float32Array(6 * 4);

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
        const planes = this.#planes.planes;
        const planes4 = this.#planes4;

        for (let i = 0; i < 6; i++) {
            const plane = planes[i];
            const planeNormalIn = plane.direction;
            this.#camera.position.addOut(plane.position, tmp);

            const planeIdx = i << 2;
            planes4[planeIdx] = planeNormalIn.x;
            planes4[planeIdx + 1] = planeNormalIn.y;
            planes4[planeIdx + 2] = planeNormalIn.z;
            planes4[planeIdx + 3] = -planeNormalIn.dot(tmp);
        }
    }

    /**
     * @param {Chunk} chunk
     */
    shouldDraw(chunk) {
        if (chunk.mesh === null) return false;

        const arr = chunk.worldAABBMinMax;
        const minX = arr[0], minY = arr[1], minZ = arr[2];
        const maxX = arr[3], maxY = arr[4], maxZ = arr[5];

        const planes4 = this.#planes4;
        const minusDelta = -FrustumCuller.#DELTA;

        for (let i = 0; i < 6; i++) {
            const planeIdx = i << 2;
            const nx = planes4[planeIdx];
            const ny = planes4[planeIdx + 1];
            const nz = planes4[planeIdx + 2];
            const nd = planes4[planeIdx + 3];

            const vx = nx >= 0 ? maxX : minX;
            const vy = ny >= 0 ? maxY : minY;
            const vz = nz >= 0 ? maxZ : minZ;

            const dotDiff = nx * vx + ny * vy + nz * vz + nd;

            if (dotDiff < minusDelta) return false;
        }
        return true;
    }
}

export { Camera, FrustumCuller };
