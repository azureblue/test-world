import { BLOCK_HEIGHT_FULL, blockHeight, flooded, getBlockById, isFlowing, isLiquid, isXQuads, removed, WATER_SURFACE_LEVEL, withHeight } from "./blocks.js";
import { ItemBar } from "./itemBar.js";
import { Camera, FrustumCuller } from "./camera.js";
import { Fog } from "./fog.js";
import { FVec3, mat4, Projection } from "./geom.js";
import { Program } from "./gl.js";
import { KeyboardInput, MouseInput } from "./input.js";
import { UIntMeshDrawer, UIntMeshHandler } from "./mesh/uIntMesh.js";
import { FPSCounter } from "./perf.js";
import { Player, PlayerInput } from "./player.js";
import { Settings } from "./settings.js";
import { Ticker } from "./ticker.js";
import { TextureArray } from "./textures.js";
import { GenericBuffer, Resources, writeVoxelWireframe } from "./utils.js";
import { Position, World } from "./world/world.js";

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

function formatK(n) {
    return n >= 1000 ? (n / 1000).toFixed(0) + "k" : n.toFixed(0);
}

export async function start() {
    const overdraw = Settings.debug.overdraw;

    document.body.style.margin = "0";
    document.body.style.overflow = "hidden";

    const textures = await Resources.loadImage("./images/textures.png");
    const statsDiv = document.getElementById("stats");
    // updating a text node's data in place avoids replacing the DOM child on every stats update
    const statsText = document.createTextNode("");
    statsDiv.replaceChildren(statsText);
    const showStats = Settings.debug.showStats;
    
    if (!showStats) {
        statsDiv.style.display = "none";
    }

    const canvas = document.createElement("canvas");
    document.body.appendChild(canvas);
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const gl = canvas.getContext("webgl2", {
        powerPreference: "high-performance",
        desynchronized: false,
        alpha: false
    });

    const cubeSolidProgram = new Program(
        gl,
        await Resources.loadText("shaders/cube_solid.vert"),
        await Resources.loadText(overdraw ? "shaders/overdraw.frag" : "shaders/cube_solid.frag")
    );
    const xQuadsProgram = new Program(
        gl,
        await Resources.loadText("shaders/x_quads.vert"),
        await Resources.loadText("shaders/x_quads.frag")
    );
    const waterProgram = new Program(
        gl,
        await Resources.loadText("shaders/water.vert"),
        await Resources.loadText("shaders/water.frag")
    );
    const waterDepthProgram = new Program(
        gl,
        await Resources.loadText("shaders/water_depth.vert"),
        await Resources.loadText("shaders/water_depth.frag")
    );
    const blockHighlightProgram = new Program(
        gl,
        await Resources.loadText("shaders/blockhighlight.vert"),
        await Resources.loadText("shaders/blockhighlight.frag")
    );

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.lineWidth(5);
    if (overdraw) {
        gl.clearColor(0, 0, 0, 1);
    }
    gl.enable(gl.DEPTH_TEST);
    gl.frontFace(gl.CCW);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    // blending is enabled only for the water pass, opaque passes skip the framebuffer read
    gl.disable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    const aIn = cubeSolidProgram.getAttribLocation("a_in");
    const aInXQuads = xQuadsProgram.getAttribLocation("a_in");
    const aInWater = waterProgram.getAttribLocation("a_in");
    const aInHighlight = blockHighlightProgram.getAttribLocation("a_in");
    const highlightBuffer = gl.createBuffer();
    gl.useProgram(blockHighlightProgram.program);
    gl.enableVertexAttribArray(aInHighlight);
    gl.bindBuffer(gl.ARRAY_BUFFER, highlightBuffer);
    const highlightVertices = new Float32Array(72);
    gl.bufferData(gl.ARRAY_BUFFER, highlightVertices, gl.DYNAMIC_DRAW);
    gl.vertexAttribPointer(aInHighlight, 3, gl.FLOAT, false, 0, 0);

    gl.useProgram(cubeSolidProgram.program);

    const texArray = TextureArray.create(gl, textures, 16);

    // the Camera block (shaders/README.md), one buffer bound to binding 0 for all programs
    const cameraBlockIndex = gl.getUniformBlockIndex(cubeSolidProgram.program, "Camera");
    const cameraBlockSize = gl.getActiveUniformBlockParameter(cubeSolidProgram.program, cameraBlockIndex, gl.UNIFORM_BLOCK_DATA_SIZE);
    const cameraBuffer = gl.createBuffer();
    gl.bindBuffer(gl.UNIFORM_BUFFER, cameraBuffer);
    gl.bufferData(gl.UNIFORM_BUFFER, cameraBlockSize, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.UNIFORM_BUFFER, null);
    gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, cameraBuffer);

    const cameraBlockIndices = gl.getUniformIndices(cubeSolidProgram.program, ["cam_projection_view", "cam_pos", "fog_inv_dist_sq"]);
    const [projectionViewOffset, cameraPosOffset, fogOffset] =
        gl.getActiveUniforms(cubeSolidProgram.program, cameraBlockIndices, gl.UNIFORM_OFFSET);

    gl.uniformBlockBinding(cubeSolidProgram.program, gl.getUniformBlockIndex(cubeSolidProgram.program, "Camera"), 0);
    gl.uniformBlockBinding(blockHighlightProgram.program, gl.getUniformBlockIndex(blockHighlightProgram.program, "Camera"), 0);

    const fog = new Fog(Settings.sky, Settings.water);

    const cameraSettings = Settings.camera;
    const aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
    const fieldOfView = cameraSettings.fieldOfView * Math.PI / 180;
    const projection = new Projection(fieldOfView, aspect, cameraSettings.near, cameraSettings.far);
    // the farthest the near plane reaches from the eye (its corners); while any of it can be below the water surface
    // the camera counts as in water, otherwise the clipped surface leaves the lower part of the view without water
    const nearPlaneReach = cameraSettings.near * Math.hypot(1, Math.tan(fieldOfView / 2), Math.tan(fieldOfView / 2) * aspect);

    const mProjection = mat4();
    const mView = mat4();
    projection.apply(mProjection);
    const mProjectionView = mat4();

    const cubeSolidTranslation = cubeSolidProgram.getUniformLocation("m_translation");
    const xQuadsTranslation = xQuadsProgram.getUniformLocation("m_translation");
    const waterTranslation = waterProgram.getUniformLocation("m_translation");
    const waterFaceMul = waterProgram.getUniformLocation("water_face_mul");
    const waterDepthTranslation = waterDepthProgram.getUniformLocation("m_translation");

    const meshHandler = new UIntMeshHandler(gl, aIn, aInXQuads, aInWater);
    const meshDrawer = new UIntMeshDrawer(gl, cubeSolidTranslation, xQuadsTranslation, waterTranslation);

    const world = new World(meshHandler);

    const camera = new Camera(new FVec3(...cameraSettings.startPosition));
    camera.changeYaw(cameraSettings.startYaw);
    camera.changePitch(cameraSettings.startPitch);
    const frustumCuller = new FrustumCuller(projection.frustum, camera);

    const player = new Player(world, cameraSettings.startPosition);
    const playerInput = new PlayerInput();
    const simulation = Settings.simulation;
    const ticker = new Ticker(simulation.tickRate, simulation.maxTicksPerFrame);

    let pause = false;

    const controls = Settings.controls;
    const mouseInput = new MouseInput(canvas, true);
    const keyboardInput = new KeyboardInput(document.body,
        [controls.forward, controls.back, controls.left, controls.right, controls.jump, controls.down, controls.sprint], {
        [controls.pause]: (pressed) => pressed && (pause = !pause),
        [controls.toggleFly]: (pressed) => pressed && player.toggleFly(),
        [controls.toggleNoclip]: (pressed) => pressed && player.toggleNoclip(),
        // 1..9 select a slot of the bar
        ...Object.fromEntries(Array.from({ length: 9 }, (_, i) => [String(i + 1), (pressed) => pressed && itemBar.select(i)]))
    });
    const itemBar = new ItemBar(document.body, Settings.interaction.itemBar, textures, 16);
    mouseInput.onWheel((direction) => pause || itemBar.scroll(direction));

    const fpsCounter = new FPSCounter();
    const pos = new Position();
    let raycastBlock = null;
    mouseInput.onMouseDown((button) => {
        if (pause) {
            return;
        }
        if (raycastBlock === null) {
            return;
        }
        if (button === 0) {
            // a plant in water leaves its water
            world.setBlockWorld(raycastBlock.x, raycastBlock.y, raycastBlock.z, removed(raycastBlock.block));
        } else if (button === 2) {
            const { nx, ny, nz } = raycastBlock;
            if (nx === 0 && ny === 0 && nz === 0) {
                return; // the camera is inside the block, no face was hit
            }
            const px = raycastBlock.x + nx, py = raycastBlock.y + ny, pz = raycastBlock.z + nz;
            // a block placed into the player only if it can lift the player onto it (swimming, jumping)
            const intoPlayer = player.intersectsBlock(px, py, pz) && !(player.mode === "fly" && player.noclip);
            if (intoPlayer && !player.canStepOnto(py)) {
                return;
            }
            const placeBlock = itemBar.block;
            const target = world.blockWorldAt(px, py, pz);
            let block = placeBlock;
            if (isLiquid(placeBlock)) {
                // placed water gets the level water has there: full under other water, the surface level otherwise
                block = withHeight(placeBlock, isLiquid(world.blockWorldAt(px, py + 1, pz)) ? BLOCK_HEIGHT_FULL : WATER_SURFACE_LEVEL);
            } else if (isXQuads(placeBlock) && isLiquid(target)) {
                // a plant placed into water stays in it
                block = flooded(placeBlock, blockHeight(target), isFlowing(target));
            }
            world.setBlockWorld(px, py, pz, block);
        }
    });

    const waterPrepass = Settings.water.prepass;
    const visibleChunks = new GenericBuffer(2000);
    const overdrawStats = overdraw ? new OverdrawStats() : null;

    // one simulation tick: the keys held now, the direction the camera looks now
    function tick() {
        const pressed = (key) => keyboardInput.isKeyPressed(key);
        playerInput.forward = (pressed(controls.forward) ? 1 : 0) - (pressed(controls.back) ? 1 : 0);
        playerInput.right = (pressed(controls.right) ? 1 : 0) - (pressed(controls.left) ? 1 : 0);
        playerInput.jump = pressed(controls.jump);
        playerInput.down = pressed(controls.down);
        playerInput.sprint = pressed(controls.sprint);
        player.tick(ticker.tickTime, playerInput, camera.directionXZ, camera.direction, camera.right);
    }

    let lastFrameTime = performance.now();

    function draw() {
        const now = performance.now();
        const frameTime = (now - lastFrameTime) / 1000;
        lastFrameTime = now;
        if (pause) {
            requestAnimationFrame(draw);
            return;
        }

        const mouseDelta = mouseInput.getDeltaAndReset();
        camera.changeYaw(mouseDelta.x * cameraSettings.mouseSensitivity);
        camera.changePitch(-mouseDelta.y * cameraSettings.mouseSensitivity);
        camera.update();

        ticker.advance(frameTime, tick);
        if (simulation.interpolate) {
            player.interpolatedEye(ticker.alpha, camera.position);
        } else {
            camera.position.x = player.eyeX;
            camera.position.y = player.eyeY;
            camera.position.z = player.eyeZ;
        }

        camera.calculateViewMatrix(mView);
        mProjection.mulOut(mView, mProjectionView);

        const camPos = camera.position;
        const inWater = world.isInWater(camPos.x, camPos.y - nearPlaneReach, camPos.z);
        const fogState = fog.get(inWater);
        if (!overdraw) {
            const clearColor = fogState.clearColor;
            gl.clearColor(clearColor[0], clearColor[1], clearColor[2], 1);
        }

        cubeSolidProgram.use();
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.bindBuffer(gl.UNIFORM_BUFFER, cameraBuffer);
        gl.bufferSubData(gl.UNIFORM_BUFFER, projectionViewOffset, mProjectionView._values, 0);
        gl.bufferSubData(gl.UNIFORM_BUFFER, cameraPosOffset, camPos._values, 0);
        gl.bufferSubData(gl.UNIFORM_BUFFER, fogOffset, fogState.uniformData, 0);
        gl.bindBuffer(gl.UNIFORM_BUFFER, null);
        world.moveToWorldPos(camPos.x, camPos.y, camPos.z);

        frustumCuller.updatePlanes();
        let allChunks = 0;
        let chunksDrawn = 0;
        texArray.bind(gl);
        world.update();

        visibleChunks.reset();
        meshDrawer.stats.reset();
        if (overdraw) {
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.ONE, gl.ONE);
        }
        world.forEachChunkInRangeNearToFar(chunk => {
            allChunks++;
            if (!frustumCuller.shouldDraw(chunk)) {
                return;
            }
            chunksDrawn++;
            meshDrawer.draw(chunk.mesh);
            visibleChunks.put(chunk);
        });

        gl.bindVertexArray(null);
        if (overdraw) {
            gl.disable(gl.BLEND);
            gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
            if (fpsCounter.getCurrentFrame() % Settings.debug.overdrawSampleInterval === 0) {
                overdrawStats.sample(gl);
            }
        }

        const camDir = camera.direction;
        pos.setWorld(camPos.x, camPos.y, camPos.z);
        raycastBlock = world.raycasti(camPos, camDir, Settings.interaction.reach);
        if (raycastBlock !== null && !overdraw) {
            gl.useProgram(blockHighlightProgram.program);
            gl.bindBuffer(gl.ARRAY_BUFFER, highlightBuffer);
            writeVoxelWireframe(highlightVertices, raycastBlock.x, raycastBlock.y, raycastBlock.z);
            gl.bufferData(gl.ARRAY_BUFFER, highlightVertices, gl.DYNAMIC_DRAW);
            gl.vertexAttribPointer(aInHighlight, 3, gl.FLOAT, false, 0, 0);
            gl.drawArrays(gl.LINES, 0, 24);
        }

        if (!overdraw) {
            gl.disable(gl.CULL_FACE);
            xQuadsProgram.use();
            for (let chunk of visibleChunks) {
                meshDrawer.drawXQuads(chunk.mesh);
            }

            // water: with the pre-pass only the nearest water face is blended into a pixel, whatever the draw order:
            // depth first, then colour with depth writes off, so a farther face can't blend under a nearer one.
            // From outside we see the outer sides of the water; from inside the fog does the tinting and only the
            // inner sides are drawn (darker and fainter, water_face_mul), so the surface is visible from below.
            gl.enable(gl.CULL_FACE);
            gl.cullFace(inWater ? gl.FRONT : gl.BACK);
            if (waterPrepass !== "off") {
                const depthOnly = waterPrepass === "depth";
                (depthOnly ? waterDepthProgram : waterProgram).use();
                const translation = depthOnly ? waterDepthTranslation : waterTranslation;
                gl.colorMask(false, false, false, false);
                for (let chunk of visibleChunks) {
                    meshDrawer.drawNonSolids(chunk.mesh, translation);
                }
                gl.colorMask(true, true, true, true);
                gl.depthMask(false);
                gl.depthFunc(gl.LEQUAL);
            }
            waterProgram.use();
            gl.uniform4fv(waterFaceMul, fogState.waterFaceMul);
            gl.enable(gl.BLEND);
            for (let chunk of visibleChunks) {
                meshDrawer.drawNonSolids(chunk.mesh);
            }
            gl.disable(gl.BLEND);
            gl.depthFunc(gl.LESS);
            gl.depthMask(true);
            gl.cullFace(gl.BACK);
        }


        if (showStats && fpsCounter.getCurrentFrame() % Settings.debug.statsInterval === 0) {
            const block = world.blockAt(pos.ix, pos.iy, pos.iz);
            const drawStats = meshDrawer.stats;

            statsText.data =
                `world pos ${pos.wx.toFixed(1)}x ${pos.wz.toFixed(1)}z ${pos.wy.toFixed(1)}y ` +
                `dir ${camDir.x.toFixed(1)}x ${camDir.z.toFixed(1)}z ${camDir.y.toFixed(1)}y ` +
                `cam ${camera.pitch.toFixed(1)}p ${camera.yaw.toFixed(1)}y ` +
                `fps ${fpsCounter.fps()} ` +
                `${player.mode}${player.mode === "fly" && player.noclip ? " noclip" : ""}` +
                `${player.mode === "walk" ? (player.inWater ? " swimming" : player.onGround ? " ground" : " air") : ""} ` +
                `chunks ${chunksDrawn}/${allChunks}/${world.chunksInView} ` +
                `draws s:${drawStats.solidDraws} w:${drawStats.waterDraws} x:${drawStats.xQuadDraws} ` +
                `tris s:${formatK(drawStats.solidTris)} w:${formatK(drawStats.waterTris)} x:${formatK(drawStats.xQuadTris)} ` +
                (overdraw ? `overdraw avg:${overdrawStats.avg.toFixed(2)} max:${overdrawStats.max} ` : "") +
                `pos x:${pos.ix} y:${pos.iy} z:${pos.iz} ` +
                `chunk x:${pos.cx} y:${pos.cy} z:${pos.cz} ` +
                `local x:${pos.bx} y:${pos.by} z:${pos.bz} ` +
                `${getBlockById(block).name} ` +
                `${raycastBlock === null ? "" : "looking at " + getBlockById(raycastBlock.block).name + " at " + raycastBlock.x + " " + raycastBlock.y + " " + raycastBlock.z}`;
        }
        requestAnimationFrame(draw);
        fpsCounter.frame();
    }

    fpsCounter.start();
    draw();
}
