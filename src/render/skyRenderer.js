import { Camera } from "../camera.js";
import { FVec3 } from "../geom.js";
import { Program } from "../gl.js";
import { rgb, Settings } from "../settings.js";

/**
 * The sky (sky.vert / sky.frag): the colour gradient, the sun's glow and its blocky disc. One triangle covering the
 * screen on the far plane, drawn after the opaque blocks. The colours and the sun's size come from Settings.sky; the
 * sun can be moved ({@link SkyRenderer.setSun}).
 */
export class SkyRenderer {
    /** @type {WebGL2RenderingContext} */
    #gl;
    /** @type {Program} */
    #program;
    /** the view vectors' uniforms */
    #forward;
    #right;
    #up;
    /** the view direction at the screen's right and top edges minus forward, per unit of the camera's right and up:
     * tan(fov / 2) * aspect, tan(fov / 2) */
    #scaleX;
    #scaleY;
    /** the sun's uniforms: the direction towards it, the two axes across it */
    #sunDir;
    #sunU;
    #sunV;
    /** the size of the sun's pixels: tan(sunSize) / sunPixels */
    #sunCell;
    /** setSun's vectors: towards the sun, the two axes across it */
    #dir = new FVec3(0, 0, 0);
    #u = new FVec3(0, 0, 0);
    #v = new FVec3(0, 0, 0);

    /**
     * @param {WebGL2RenderingContext} gl
     * @param {Program} program sky.vert / sky.frag
     * @param {number} fieldOfView the vertical field of view, radians
     * @param {number} aspect width / height
     */
    constructor(gl, program, fieldOfView, aspect) {
        this.#gl = gl;
        this.#program = program;
        this.#forward = program.getUniformLocation("sky_forward");
        this.#right = program.getUniformLocation("sky_right");
        this.#up = program.getUniformLocation("sky_up");
        this.#scaleX = Math.tan(fieldOfView / 2) * aspect;
        this.#scaleY = Math.tan(fieldOfView / 2);
        this.#sunDir = program.getUniformLocation("sun_dir");
        this.#sunU = program.getUniformLocation("sun_u");
        this.#sunV = program.getUniformLocation("sun_v");

        const s = Settings.sky;
        program.use();
        gl.uniform3fv(program.getUniformLocation("sky_zenith"), rgb(s.zenithColor));
        gl.uniform3fv(program.getUniformLocation("sky_horizon"), rgb(s.horizonColor));
        gl.uniform1f(program.getUniformLocation("sky_height"), s.gradientHeight);
        gl.uniform3fv(program.getUniformLocation("sun_color"), rgb(s.sunColor));
        gl.uniform1f(program.getUniformLocation("sun_radius"), s.sunPixels);
        gl.uniform2f(program.getUniformLocation("sun_glow"), s.sunGlow, tenPercentExponent(s.sunGlowSize));
        this.#sunCell = Math.tan(s.sunSize * Math.PI / 180) / s.sunPixels;
        this.setSun(s.sunElevation, s.sunAzimuth);
    }

    /**
     * Moves the sun: its direction and the two axes across it (its pixel grid, on the plane facing it; sky.frag draws
     * the disc from them every frame); leaves the sky program in use.
     * @param {number} elevation degrees above the horizon
     * @param {number} azimuth degrees, like the camera's yaw (0 along +x, growing clockwise seen from above)
     */
    setSun(elevation, azimuth) {
        const gl = this.#gl, rad = Math.PI / 180;
        const e = elevation * rad, a = azimuth * rad;
        const dir = this.#dir, u = this.#u, v = this.#v;
        dir.set(Math.cos(e) * Math.cos(a), -Math.cos(e) * Math.sin(a), Math.sin(e));
        // two axes across it (one horizontal, unless the sun is straight up), scaled to the pixel size
        u.set(-dir.y, dir.x, 0);
        if (u.magnitude < 1e-6)
            u.set(1, 0, 0);
        u.normalizeIn();
        dir.crossOut(u, v);
        const scale = 1 / this.#sunCell;
        u.mulByScalarInPlace(scale);
        v.mulByScalarInPlace(scale);
        this.#program.use();
        gl.uniform3fv(this.#sunDir, dir.values);
        gl.uniform3fv(this.#sunU, u.values);
        gl.uniform3fv(this.#sunV, v.values);
    }

    /**
     * Draws the sky, after the opaque blocks: on the far plane with depth test LEQUAL, so only the pixels they left
     * empty run its fragment shader.
     * @param {Camera} camera
     */
    draw(camera) {
        const gl = this.#gl;
        const { direction, right, up } = camera;
        const scaleX = this.#scaleX, scaleY = this.#scaleY;
        this.#program.use();
        gl.uniform3f(this.#forward, direction.x, direction.y, direction.z);
        gl.uniform3f(this.#right, right.x * scaleX, right.y * scaleX, right.z * scaleX);
        gl.uniform3f(this.#up, up.x * scaleY, up.y * scaleY, up.z * scaleY);
        gl.depthFunc(gl.LEQUAL);
        gl.depthMask(false);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.depthMask(true);
        gl.depthFunc(gl.LESS);
    }
}

/**
 * The exponent k for which cos(angle)^k is 10% at the given angle: a highlight that size around a direction.
 * @param {number} degrees
 */
function tenPercentExponent(degrees) {
    return Math.log(0.1) / Math.log(Math.cos(degrees * Math.PI / 180));
}
