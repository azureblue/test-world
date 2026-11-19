import { Camera, FrustumCuller } from "../camera.js";
import { CHUNK_SIZE } from "../chunk/chunk.js";
import { Fog } from "../fog.js";
import { mat4, Projection } from "../geom.js";
import { Program, withDefines } from "../gl.js";
import { UIntMeshDrawer, UIntMeshHandler } from "../mesh/uIntMesh.js";
import { rgb, Settings } from "../settings.js";
import { TextureArray } from "../textures.js";
import { GenericBuffer, Resources, writeVoxelWireframe } from "../utils.js";
import { World } from "../world/world.js";

/**
 * Reads back the overdraw view and counts fragment shader invocations per covered pixel
 * (red channel, see shaders/overdraw.frag).
 */
class OverdrawStats {
    avg = 0;
    max = 0;
    #pixels = null;

    /** @param {WebGL2RenderingContext} gl */
    sample(gl) {
        const width = gl.drawingBufferWidth;
        const height = gl.drawingBufferHeight;
        if (this.#pixels === null || this.#pixels.length !== width * height * 4) {
            this.#pixels = new Uint8Array(width * height * 4);
        }
        const pixels = this.#pixels;
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        let sum = 0;
        let covered = 0;
        let max = 0;
        for (let i = 0; i < pixels.length; i += 4) {
            const shades = pixels[i];
            if (shades !== 0) {
                sum += shades;
                covered++;
                if (shades > max)
                    max = shades;
            }
        }
        this.avg = covered === 0 ? 0 : sum / covered;
        this.max = max;
    }
}

/** @returns {number[]} towards the sun (Settings.sky), unit length, world coordinates */
function sunDirection() {
    const rad = Math.PI / 180;
    const elevation = Settings.sky.sunElevation * rad, azimuth = Settings.sky.sunAzimuth * rad;
    return [Math.cos(elevation) * Math.cos(azimuth), Math.sin(elevation), Math.cos(elevation) * Math.sin(azimuth)];
}

/**
 * The exponent k for which cos(angle)^k is 10% at the given angle: a highlight that size around a direction.
 * @param {number} degrees
 */
function tenPercentExponent(degrees) {
    return Math.log(0.1) / Math.log(Math.cos(degrees * Math.PI / 180));
}

/**
 * The water program's variant: its opacity and the optional effect (Settings.water) as #defines, compiled in only when
 * on, constants folded.
 */
function waterDefines() {
    return {
        WATER_OPACITY: Settings.water.opacity,
        FRESNEL: Settings.water.fresnel
    };
}

/**
 * What a frame drew.
 * @typedef {object} FrameStats
 * @property {number} chunksInRange loaded chunks in the render range
 * @property {number} chunksDrawn the ones in the view frustum
 * @property {boolean} inWater whether the camera counted as under water (fog, water faces from inside)
 */

/**
 * Draws the world from the camera: the opaque blocks, the selected block's outline, plants, then water (blended,
 * with an optional depth pre-pass). Owns the shader programs, the block textures and the Camera uniform block
 * (shaders/README.md) shared by them.
 */
export class WorldRenderer {
    /** @type {WebGL2RenderingContext} */
    #gl;
    #camera;
    #programs;
    #locations;
    #texArray;
    #cameraBuffer;
    #cameraOffsets;
    #highlightBuffer;
    #highlightVertices = new Float32Array(72);
    // the automatic fog distance: as far as the loaded chunks reach from the camera in every direction. Chunks are
    // kept by their chunk distance from the camera's chunk (at most renderDistance), so in some directions the last
    // one is missing and the world ends half a chunk sooner; and the camera can be half a chunk off its chunk's centre
    #fog = new Fog(Settings.sky, Settings.water, Math.max(1, Settings.world.renderDistance - 1.5) * CHUNK_SIZE);
    #frustumCuller;
    #nearPlaneReach;
    #mProjection = mat4();
    #mView = mat4();
    #mProjectionView = mat4();
    #meshHandler;
    #meshDrawer;
    #visibleChunks = new GenericBuffer(2000);
    #overdraw = Settings.debug.overdraw;
    #overdrawStats;
    #sky;

    /**
     * @param {WebGL2RenderingContext} gl
     * @param {ImageBitmap} textures the block texture atlas
     * @param {Camera} camera
     * @returns {Promise<WorldRenderer>}
     */
    static async create(gl, textures, camera) {
        const program = async (vert, frag, defines = {}) => new Program(gl,
            withDefines(await Resources.loadText(`shaders/${vert}`), defines),
            withDefines(await Resources.loadText(`shaders/${frag}`), defines));
        const programs = {
            cubeSolid: await program("cube_solid.vert", Settings.debug.overdraw ? "overdraw.frag" : "cube_solid.frag"),
            xQuads: await program("x_quads.vert", "x_quads.frag"),
            water: await program("water.vert", "water.frag", waterDefines()),
            waterDepth: await program("water_depth.vert", "water_depth.frag"),
            blockHighlight: await program("blockhighlight.vert", "blockhighlight.frag"),
            sky: await program("sky.vert", "sky.frag")
        };
        return new WorldRenderer(gl, programs, textures, camera);
    }

    /** use {@link WorldRenderer.create} */
    constructor(gl, programs, textures, camera) {
        this.#gl = gl;
        this.#camera = camera;
        this.#programs = programs;
        const { cubeSolid, xQuads, water, waterDepth, blockHighlight } = programs;

        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
        gl.lineWidth(5);
        if (this.#overdraw)
            gl.clearColor(0, 0, 0, 1);
        gl.enable(gl.DEPTH_TEST);
        gl.frontFace(gl.CCW);
        gl.enable(gl.CULL_FACE);
        gl.cullFace(gl.BACK);
        // blending is enabled only for the water pass, opaque passes skip the framebuffer read
        gl.disable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

        const aIn = cubeSolid.getAttribLocation("a_in");
        const aInXQuads = xQuads.getAttribLocation("a_in");
        const aInWater = water.getAttribLocation("a_in");
        const aInHighlight = blockHighlight.getAttribLocation("a_in");
        this.#highlightBuffer = gl.createBuffer();
        gl.useProgram(blockHighlight.program);
        gl.enableVertexAttribArray(aInHighlight);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.#highlightBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, this.#highlightVertices, gl.DYNAMIC_DRAW);
        gl.vertexAttribPointer(aInHighlight, 3, gl.FLOAT, false, 0, 0);
        this.#locations = { aInHighlight };

        gl.useProgram(cubeSolid.program);
        this.#texArray = TextureArray.create(gl, textures, 16);

        // the Camera block (shaders/README.md), one buffer bound to binding 0 for all programs
        const cameraBlockIndex = gl.getUniformBlockIndex(cubeSolid.program, "Camera");
        const cameraBlockSize = gl.getActiveUniformBlockParameter(cubeSolid.program, cameraBlockIndex, gl.UNIFORM_BLOCK_DATA_SIZE);
        this.#cameraBuffer = gl.createBuffer();
        gl.bindBuffer(gl.UNIFORM_BUFFER, this.#cameraBuffer);
        gl.bufferData(gl.UNIFORM_BUFFER, cameraBlockSize, gl.DYNAMIC_DRAW);
        gl.bindBuffer(gl.UNIFORM_BUFFER, null);
        gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, this.#cameraBuffer);
        const cameraBlockIndices = gl.getUniformIndices(cubeSolid.program, ["cam_projection_view", "cam_pos", "fog_inv_dist_sq"]);
        const [projectionView, cameraPos, fog] = gl.getActiveUniforms(cubeSolid.program, cameraBlockIndices, gl.UNIFORM_OFFSET);
        this.#cameraOffsets = { projectionView, cameraPos, fog };
        gl.uniformBlockBinding(cubeSolid.program, gl.getUniformBlockIndex(cubeSolid.program, "Camera"), 0);
        gl.uniformBlockBinding(blockHighlight.program, gl.getUniformBlockIndex(blockHighlight.program, "Camera"), 0);

        const cameraSettings = Settings.camera;
        const aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
        const fieldOfView = cameraSettings.fieldOfView * Math.PI / 180;
        const projection = new Projection(fieldOfView, aspect, cameraSettings.near, cameraSettings.far);
        projection.apply(this.#mProjection);
        this.#frustumCuller = new FrustumCuller(projection.frustum, camera);
        // the farthest the near plane reaches from the eye (its corners); while any of it can be below the water surface
        // the camera counts as in water, otherwise the clipped surface leaves the lower part of the view without water
        this.#nearPlaneReach = cameraSettings.near * Math.hypot(1, Math.tan(fieldOfView / 2), Math.tan(fieldOfView / 2) * aspect);

        // the sky: the colours don't change, the view vectors are set per frame (scaled to the screen's edges)
        const sky = programs.sky;
        sky.use();
        gl.uniform3fv(sky.getUniformLocation("sky_zenith"), rgb(Settings.sky.zenithColor));
        gl.uniform3fv(sky.getUniformLocation("sky_horizon"), rgb(Settings.sky.horizonColor));
        gl.uniform1f(sky.getUniformLocation("sky_height"), Settings.sky.gradientHeight);
        const s = Settings.sky, rad = Math.PI / 180;
        const sunDir = sunDirection();
        gl.uniform3fv(sky.getUniformLocation("sun_dir"), sunDir);
        gl.uniform3fv(sky.getUniformLocation("sun_color"), rgb(s.sunColor));
        // the sun's pixels: two axes across it (one horizontal, unless the sun is straight up), scaled to the pixel size
        const cell = Math.tan(s.sunSize * rad) / s.sunPixels;
        let u = [-sunDir[2], 0, sunDir[0]];
        let length = Math.hypot(...u);
        if (length < 1e-6) {
            u = [1, 0, 0];
            length = 1;
        }
        u = u.map(c => c / length);
        const v = [sunDir[1] * u[2] - sunDir[2] * u[1], sunDir[2] * u[0] - sunDir[0] * u[2], sunDir[0] * u[1] - sunDir[1] * u[0]];
        gl.uniform3fv(sky.getUniformLocation("sun_u"), u.map(c => c / cell));
        gl.uniform3fv(sky.getUniformLocation("sun_v"), v.map(c => c / cell));
        gl.uniform1f(sky.getUniformLocation("sun_radius"), s.sunPixels);
        gl.uniform2f(sky.getUniformLocation("sun_glow"), s.sunGlow, tenPercentExponent(s.sunGlowSize));
        this.#sky = {
            forward: sky.getUniformLocation("sky_forward"),
            right: sky.getUniformLocation("sky_right"),
            up: sky.getUniformLocation("sky_up"),
            scaleX: Math.tan(fieldOfView / 2) * aspect,
            scaleY: Math.tan(fieldOfView / 2)
        };

        this.#locations.waterFaceMul = water.getUniformLocation("water_face_mul");
        // null without FRESNEL: setting it does nothing
        this.#locations.fresnelStrength = water.getUniformLocation("fresnel_strength");
        this.#locations.waterTranslation = water.getUniformLocation("m_translation");
        this.#locations.waterDepthTranslation = waterDepth.getUniformLocation("m_translation");
        this.#meshHandler = new UIntMeshHandler(gl, aIn, aInXQuads, aInWater);
        this.#meshDrawer = new UIntMeshDrawer(gl, cubeSolid.getUniformLocation("m_translation"),
            xQuads.getUniformLocation("m_translation"), this.#locations.waterTranslation);
        this.#overdrawStats = this.#overdraw ? new OverdrawStats() : null;
    }

    /** uploads and frees the chunk meshes (for the world) */
    get meshHandler() {
        return this.#meshHandler;
    }

    /** draw calls and triangles of the last frame */
    get drawStats() {
        return this.#meshDrawer.stats;
    }

    /** with Settings.debug.overdraw: shader invocations per covered pixel, sampled every overdrawSampleInterval frames */
    get overdrawStats() {
        return this.#overdrawStats;
    }

    /**
     * The sky, after the opaque blocks: on the far plane with depth test LEQUAL, so only the pixels they left empty run
     * its fragment shader. Under water there's no sky to see; the clear colour (the water fog) stays.
     */
    #drawSky() {
        const gl = this.#gl;
        const sky = this.#sky;
        const { direction, right, up } = this.#camera;
        this.#programs.sky.use();
        gl.uniform3f(sky.forward, direction.x, direction.y, direction.z);
        gl.uniform3f(sky.right, right.x * sky.scaleX, right.y * sky.scaleX, right.z * sky.scaleX);
        gl.uniform3f(sky.up, up.x * sky.scaleY, up.y * sky.scaleY, up.z * sky.scaleY);
        gl.depthFunc(gl.LEQUAL);
        gl.depthMask(false);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.depthMask(true);
        gl.depthFunc(gl.LESS);
    }

    /**
     * Draws a frame. The camera's position and direction are the frame's (camera.update() done).
     * @param {World} world
     * @param {{x: number, y: number, z: number} | null} highlight the block to outline (world coordinates)
     * @param {boolean} sampleOverdraw with Settings.debug.overdraw: read back this frame's overdraw
     * @returns {FrameStats}
     */
    render(world, highlight, sampleOverdraw) {
        const gl = this.#gl;
        const { cubeSolid, xQuads, water, waterDepth, blockHighlight } = this.#programs;
        const camera = this.#camera;
        const overdraw = this.#overdraw;
        const meshDrawer = this.#meshDrawer;
        const visibleChunks = this.#visibleChunks;

        camera.calculateViewMatrix(this.#mView);
        this.#mProjection.mulOut(this.#mView, this.#mProjectionView);
        const camPos = camera.position;
        const inWater = world.isInWater(camPos.x, camPos.y - this.#nearPlaneReach, camPos.z);
        const fogState = this.#fog.get(inWater);
        if (!overdraw) {
            const clearColor = fogState.clearColor;
            gl.clearColor(clearColor[0], clearColor[1], clearColor[2], 1);
        }

        cubeSolid.use();
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.bindBuffer(gl.UNIFORM_BUFFER, this.#cameraBuffer);
        gl.bufferSubData(gl.UNIFORM_BUFFER, this.#cameraOffsets.projectionView, this.#mProjectionView._values, 0);
        gl.bufferSubData(gl.UNIFORM_BUFFER, this.#cameraOffsets.cameraPos, camPos._values, 0);
        gl.bufferSubData(gl.UNIFORM_BUFFER, this.#cameraOffsets.fog, fogState.uniformData, 0);
        gl.bindBuffer(gl.UNIFORM_BUFFER, null);

        this.#frustumCuller.updatePlanes();
        this.#texArray.bind(gl);
        let chunksInRange = 0;
        let chunksDrawn = 0;
        visibleChunks.reset();
        meshDrawer.stats.reset();
        if (overdraw) {
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.ONE, gl.ONE);
        }
        world.forEachChunkInRangeNearToFar(chunk => {
            chunksInRange++;
            if (!this.#frustumCuller.shouldDraw(chunk))
                return;
            chunksDrawn++;
            meshDrawer.draw(chunk.mesh);
            visibleChunks.put(chunk);
        });
        gl.bindVertexArray(null);
        if (overdraw) {
            gl.disable(gl.BLEND);
            gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
            if (sampleOverdraw)
                this.#overdrawStats.sample(gl);
            return { chunksInRange, chunksDrawn, inWater };
        }

        if (!inWater)
            this.#drawSky();

        if (highlight !== null) {
            gl.useProgram(blockHighlight.program);
            gl.bindBuffer(gl.ARRAY_BUFFER, this.#highlightBuffer);
            writeVoxelWireframe(this.#highlightVertices, highlight.x, highlight.y, highlight.z);
            gl.bufferData(gl.ARRAY_BUFFER, this.#highlightVertices, gl.DYNAMIC_DRAW);
            gl.vertexAttribPointer(this.#locations.aInHighlight, 3, gl.FLOAT, false, 0, 0);
            gl.drawArrays(gl.LINES, 0, 24);
        }

        gl.disable(gl.CULL_FACE);
        xQuads.use();
        for (const chunk of visibleChunks)
            meshDrawer.drawXQuads(chunk.mesh);

        // water: with the pre-pass only the nearest water face is blended into a pixel, whatever the draw order:
        // depth first, then colour with depth writes off, so a farther face can't blend under a nearer one.
        // From outside we see the outer sides of the water; from inside the fog does the tinting and only the
        // inner sides are drawn (darker and fainter, water_face_mul), so the surface is visible from below.
        gl.enable(gl.CULL_FACE);
        gl.cullFace(inWater ? gl.FRONT : gl.BACK);
        const prepass = Settings.water.prepass;
        if (prepass !== "off") {
            const depthOnly = prepass === "depth";
            (depthOnly ? waterDepth : water).use();
            const translation = depthOnly ? this.#locations.waterDepthTranslation : this.#locations.waterTranslation;
            gl.colorMask(false, false, false, false);
            for (const chunk of visibleChunks)
                meshDrawer.drawNonSolids(chunk.mesh, translation);
            gl.colorMask(true, true, true, true);
            gl.depthMask(false);
            gl.depthFunc(gl.LEQUAL);
        }
        water.use();
        gl.uniform4fv(this.#locations.waterFaceMul, fogState.waterFaceMul);
        // under water the surface is seen from below, where it would only get dark at a slant
        gl.uniform1f(this.#locations.fresnelStrength, inWater ? 0 : Settings.water.fresnelStrength);
        gl.enable(gl.BLEND);
        for (const chunk of visibleChunks)
            meshDrawer.drawNonSolids(chunk.mesh);
        gl.disable(gl.BLEND);
        gl.depthFunc(gl.LESS);
        gl.depthMask(true);
        gl.cullFace(gl.BACK);
        return { chunksInRange, chunksDrawn, inWater };
    }
}
