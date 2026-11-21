import { TEXTURE_SIZE } from "../blockTextures.js";
import { Camera, FrustumCuller } from "../camera.js";
import { CHUNK_SIZE } from "../chunk/chunk.js";
import { Fog } from "../fog.js";
import { mat4, Projection } from "../geom.js";
import { Program, withDefines } from "../gl.js";
import { UIntMeshDrawer, UIntMeshHandler } from "../mesh/uIntMesh.js";
import { rgb, Settings } from "../settings.js";
import { TextureArray } from "../textures.js";
import { GenericBuffer, Resources, writeVoxelWireframe } from "../utils.js";
import { PARTICLE_FLOATS, PARTICLE_INSTANCE, Particles } from "../world/particles.js";
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

/**
 * @returns {number[]} towards the sun (Settings.sky), unit length; the azimuth like the camera's yaw (0 along +x,
 *   growing clockwise seen from above)
 */
function sunDirection() {
    const rad = Math.PI / 180;
    const elevation = Settings.sky.sunElevation * rad, azimuth = Settings.sky.sunAzimuth * rad;
    return [Math.cos(elevation) * Math.cos(azimuth), -Math.cos(elevation) * Math.sin(azimuth), Math.sin(elevation)];
}

/**
 * The exponent k for which cos(angle)^k is 10% at the given angle: a highlight that size around a direction.
 * @param {number} degrees
 */
function tenPercentExponent(degrees) {
    return Math.log(0.1) / Math.log(Math.cos(degrees * Math.PI / 180));
}

/**
 * The water program's variant: the optional effect (Settings.water) as a #define, compiled in only when on.
 */
function waterDefines() {
    return { FRESNEL: Settings.water.fresnel ? true : undefined };
}

/**
 * What the water program gets for one camera state (above or under water).
 * @param {number} colorScale the texture colour's scale
 * @param {number} alpha the water's alpha
 * @param {number} fresnelStrength
 */
function waterState(colorScale, alpha, fresnelStrength) {
    return {
        // water_color: multiplies vec4(texture.rgb, 1)
        color: new Float32Array([colorScale, colorScale, colorScale, alpha]),
        // fresnel: the strength and log2(1 - alpha), see water.frag
        fresnel: new Float32Array([fresnelStrength, Math.log2(Math.max(1 - alpha, 1e-6))])
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
 * Draws the world from the camera: the opaque blocks, the cutout blocks (leaves with holes, alpha tested, their own
 * program so only they discard), the particles (block fragments, one instanced draw), the sky, the selected block's outline, plants, then water (blended, with an optional
 * depth pre-pass). Owns the shader programs, the block textures and the Camera and Fog uniform
 * blocks (shaders/README.md) shared by them.
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
    #fogBuffer;
    /** the fog state (Fog.get) the Fog buffer holds: it's written only when that changes */
    #fogInBuffer = null;
    #highlightBuffer;
    #highlightVertices = new Float32Array(72);
    // the automatic fog distance: as far as the loaded chunks reach from the camera in every direction. Chunks are
    // kept by their chunk distance from the camera's chunk (at most renderDistance), so in some directions the last
    // one is missing and the world ends half a chunk sooner; and the camera can be half a chunk off its chunk's centre
    #fog = new Fog(Settings.sky, Settings.water, Math.max(1, Settings.world.renderDistance - 1.5) * CHUNK_SIZE);
    // the water faces above water: the opacity; from inside water (the surface from below, air pockets) darker and
    // fainter, and no Fresnel (it would only get dark at a slant)
    #water = {
        above: waterState(1, Settings.water.opacity, Settings.water.fresnelStrength),
        under: waterState(Settings.water.underwater.faceColorScale,
            Settings.water.underwater.faceAlphaScale * Settings.water.opacity, 0)
    };
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
    /** the particles' vertex array and instance buffer (room for Settings.particles.max), the camera vectors */
    #particles;

    /**
     * @param {WebGL2RenderingContext} gl
     * @param {import("../blockTextures.js").Pixels[]} textures the block textures by layer (loadBlockTextures)
     * @param {Camera} camera
     * @returns {Promise<WorldRenderer>}
     */
    static async create(gl, textures, camera) {
        const program = async (vert, frag, defines = {}) => new Program(gl,
            withDefines(await Resources.loadText(`shaders/${vert}`), defines),
            withDefines(await Resources.loadText(`shaders/${frag}`), defines));
        const cubeFrag = Settings.debug.overdraw ? "overdraw.frag" : "cube_solid.frag";
        const programs = {
            cubeSolid: await program("cube_solid.vert", cubeFrag),
            // the cube program with the alpha test (cube_solid.frag, CUTOUT), for the cutout faces
            cubeCutout: await program("cube_solid.vert", cubeFrag, { CUTOUT: true }),
            xQuads: await program("x_quads.vert", "x_quads.frag"),
            water: await program("water.vert", "water.frag", waterDefines()),
            waterDepth: await program("water_depth.vert", "water_depth.frag"),
            blockHighlight: await program("blockhighlight.vert", "blockhighlight.frag"),
            particles: await program("particles.vert", "particles.frag"),
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
        this.#texArray = TextureArray.create(gl, textures, TEXTURE_SIZE);

        // the Camera and Fog blocks (shaders/README.md): one buffer each, Camera bound to binding 0, Fog to 1, for all
        // programs that declare them (Camera the vertex shaders, Fog the fragment shaders)
        const blockBuffer = (program, name, binding) => {
            const size = gl.getActiveUniformBlockParameter(program.program, gl.getUniformBlockIndex(program.program, name), gl.UNIFORM_BLOCK_DATA_SIZE);
            const buffer = gl.createBuffer();
            gl.bindBuffer(gl.UNIFORM_BUFFER, buffer);
            gl.bufferData(gl.UNIFORM_BUFFER, size, gl.DYNAMIC_DRAW);
            gl.bindBuffer(gl.UNIFORM_BUFFER, null);
            gl.bindBufferBase(gl.UNIFORM_BUFFER, binding, buffer);
            for (const p of Object.values(programs)) {
                const index = gl.getUniformBlockIndex(p.program, name);
                if (index !== gl.INVALID_INDEX)
                    gl.uniformBlockBinding(p.program, index, binding);
            }
            return buffer;
        };
        this.#cameraBuffer = blockBuffer(cubeSolid, "Camera", 0);
        const cameraBlockIndices = gl.getUniformIndices(cubeSolid.program, ["cam_projection_view", "cam_pos"]);
        const [projectionView, cameraPos] = gl.getActiveUniforms(cubeSolid.program, cameraBlockIndices, gl.UNIFORM_OFFSET);
        this.#cameraOffsets = { projectionView, cameraPos };
        // x_quads.frag: cube_solid's fragment shader is overdraw.frag in the overdraw view, without fog
        this.#fogBuffer = blockBuffer(xQuads, "Fog", 1);

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
        let u = [-sunDir[1], sunDir[0], 0];
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

        this.#locations.waterColor = water.getUniformLocation("water_color");
        // null without FRESNEL: setting it does nothing
        this.#locations.fresnel = water.getUniformLocation("fresnel");
        this.#locations.waterTranslation = water.getUniformLocation("m_translation");
        this.#locations.waterDepthTranslation = waterDepth.getUniformLocation("m_translation");
        this.#meshHandler = new UIntMeshHandler(gl, aIn, aInXQuads, aInWater);
        this.#meshDrawer = new UIntMeshDrawer(gl, cubeSolid.getUniformLocation("m_translation"),
            xQuads.getUniformLocation("m_translation"), this.#locations.waterTranslation,
            programs.cubeCutout.getUniformLocation("m_translation"));
        this.#overdrawStats = this.#overdraw ? new OverdrawStats() : null;

        // the particles: their array uploaded as it is (Particles.data), per instance the fields the shader takes
        // (position and size, texture patch, light; particles.vert); the corners come from gl_VertexID, so no vertex
        // buffer
        const particleVa = gl.createVertexArray(), particleVb = gl.createBuffer();
        gl.bindVertexArray(particleVa);
        gl.bindBuffer(gl.ARRAY_BUFFER, particleVb);
        gl.bufferData(gl.ARRAY_BUFFER, Settings.particles.max * PARTICLE_FLOATS * 4, gl.DYNAMIC_DRAW);
        const stride = PARTICLE_FLOATS * 4;
        const fields = PARTICLE_INSTANCE;
        for (const [location, size, field] of [[0, 4, fields.position], [1, 4, fields.texture], [2, 1, fields.light]]) {
            gl.enableVertexAttribArray(location);
            gl.vertexAttribPointer(location, size, gl.FLOAT, false, stride, field * 4);
            gl.vertexAttribDivisor(location, 1);
        }
        gl.bindVertexArray(null);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
        const particleProgram = programs.particles;
        this.#particles = {
            va: particleVa, vb: particleVb,
            right: particleProgram.getUniformLocation("u_right"), up: particleProgram.getUniformLocation("u_up")
        };
    }

    /**
     * The particles: their instances uploaded, a camera-facing square each, alpha tested like the cutout blocks.
     * @param {Particles} particles
     */
    #drawParticles(particles) {
        const count = particles.count;
        if (count === 0)
            return;
        const gl = this.#gl, p = this.#particles, camera = this.#camera;
        this.#programs.particles.use();
        gl.uniform3f(p.right, camera.right.x, camera.right.y, camera.right.z);
        gl.uniform3f(p.up, camera.up.x, camera.up.y, camera.up.z);
        gl.bindBuffer(gl.ARRAY_BUFFER, p.vb);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, particles.data, 0, count * PARTICLE_FLOATS);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
        gl.bindVertexArray(p.va);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
        gl.bindVertexArray(null);
        this.#meshDrawer.stats.particles = count;
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
     * @param {{x: number, y: number, z: number} | null} highlight the block to outline
     * @param {boolean} sampleOverdraw with Settings.debug.overdraw: read back this frame's overdraw
     * @param {Particles} [particles] the block fragments to draw (updated for this frame)
     * @returns {FrameStats}
     */
    render(world, highlight, sampleOverdraw, particles = null) {
        const gl = this.#gl;
        const { cubeSolid, cubeCutout, xQuads, water, waterDepth, blockHighlight } = this.#programs;
        const camera = this.#camera;
        const overdraw = this.#overdraw;
        const meshDrawer = this.#meshDrawer;
        const visibleChunks = this.#visibleChunks;

        camera.calculateViewMatrix(this.#mView);
        this.#mProjection.mulOut(this.#mView, this.#mProjectionView);
        const camPos = camera.position;
        const inWater = world.isInWater(camPos.x, camPos.y, camPos.z - this.#nearPlaneReach);
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
        if (this.#fogInBuffer !== fogState) {
            gl.bindBuffer(gl.UNIFORM_BUFFER, this.#fogBuffer);
            gl.bufferSubData(gl.UNIFORM_BUFFER, 0, fogState.uniformData, 0);
            this.#fogInBuffer = fogState;
        }
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
        // after all opaque blocks, so they hide most of it before its fragment shader (with its discard) runs
        cubeCutout.use();
        for (const chunk of visibleChunks)
            meshDrawer.drawCutout(chunk.mesh);
        gl.bindVertexArray(null);
        if (overdraw) {
            gl.disable(gl.BLEND);
            gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
            if (sampleOverdraw)
                this.#overdrawStats.sample(gl);
            return { chunksInRange, chunksDrawn, inWater };
        }

        if (particles !== null)
            this.#drawParticles(particles);

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
        // inner sides are drawn (darker and fainter, water_color), so the surface is visible from below.
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
        const waterState = inWater ? this.#water.under : this.#water.above;
        gl.uniform4fv(this.#locations.waterColor, waterState.color);
        gl.uniform2fv(this.#locations.fresnel, waterState.fresnel);
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
