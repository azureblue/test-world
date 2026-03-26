import { getBlockById } from "./blocks.js";
import { Camera, FrustumCuller } from "./camera.js";
import { FVec3, mat4, Projection, vec3 } from "./geom.js";
import { Program } from "./gl.js";
import { KeyboardInput, MouseInput } from "./input.js";
import { UIntMeshDrawer, UIntMeshHandler } from "./mesh/uIntMesh.js";
import { FPSCounter } from "./perf.js";
import { TextureArray } from "./textures.js";
import { Replacer, Resources, writeVoxelWireframe } from "./utils.js";
import { Position, World } from "./world.js";

const VIEW_DISTANCE_SQ = (8 * 32) ** 2;
// const VIEW_DISTANCE_SQ = 409600.0;

export async function start() {
    document.body.style.margin = "0";
    document.body.style.overflow = "hidden";

    const textures = await Resources.loadImage("./images/textures.png");
    const statsDiv = document.getElementById("stats");

    const canvas = document.createElement("canvas");
    document.body.appendChild(canvas);
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    // canvas.style.width = window.innerWidth + "px";
    // canvas.style.height = window.innerHeight + "px";

    const gl = canvas.getContext("webgl2", {
        powerPreference: "high-performance",
        desynchronized: false
    });


    const chunk0Program = new Program(
        gl,
        Replacer.replace(await Resources.loadText("shaders/chunk0.vert"),
            {
                "viewDistanceSq": VIEW_DISTANCE_SQ.toFixed(1)
            }
        ),
        await Resources.loadText("shaders/chunk0.frag")
    );

    const blockHighlightProgram = new Program(
        gl,
        await Resources.loadText("shaders/blockhighlight.vert"),
        await Resources.loadText("shaders/blockhighlight.frag")
    );


    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.lineWidth(5);
    gl.clearColor(0.522, 0.855, 1, 1);
    gl.enable(gl.DEPTH_TEST);
    gl.frontFace(gl.CCW);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    const aIn = chunk0Program.getAttribLocation("a_in");    
    const aInBH = blockHighlightProgram.getAttribLocation("a_in");
    const bhBuffer = gl.createBuffer();
    gl.useProgram(blockHighlightProgram.program);
    gl.enableVertexAttribArray(aInBH);
    gl.bindBuffer(gl.ARRAY_BUFFER, bhBuffer);
    const bhFBuffer = new Float32Array(72);
    gl.bufferData(gl.ARRAY_BUFFER, bhFBuffer, gl.DYNAMIC_DRAW);
    gl.vertexAttribPointer(aInBH, 3, gl.FLOAT, false, 0, 0);

    gl.useProgram(chunk0Program.program);

    const texArray = TextureArray.create(gl, textures, 16);


    const uCamera = gl.getUniformBlockIndex(chunk0Program.program, "Camera");
    const uCameraSize = gl.getActiveUniformBlockParameter(chunk0Program.program, uCamera, gl.UNIFORM_BLOCK_DATA_SIZE);
    const uCameraBuffer = gl.createBuffer();
    gl.bindBuffer(gl.UNIFORM_BUFFER, uCameraBuffer);
    gl.bufferData(gl.UNIFORM_BUFFER, uCameraSize, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.UNIFORM_BUFFER, null);
    gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, uCameraBuffer);

    const uCameraIndices = gl.getUniformIndices(chunk0Program.program, ["cam_projection_view", "cam_pos"]);
    const uCameraOffsets = gl.getActiveUniforms(chunk0Program.program, uCameraIndices, gl.UNIFORM_OFFSET);

    const uCameraVariableInfo = {
        projection_view: {
            index: uCameraIndices[0],
            offset: uCameraOffsets[0]
        },
        pos: {
            index: uCameraIndices[1],
            offset: uCameraOffsets[1]
        }
    };

    gl.uniformBlockBinding(chunk0Program.program, gl.getUniformBlockIndex(chunk0Program.program, "Camera"), 0);
    gl.uniformBlockBinding(blockHighlightProgram.program, gl.getUniformBlockIndex(blockHighlightProgram.program, "Camera"), 0);

    const aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
    const fieldOfView = (60 * Math.PI) / 180;
    const projection = new Projection(fieldOfView, aspect, 0.1, 640.0);

    const mProjection = mat4();
    const mView = mat4();

    projection.apply(mProjection);
    const mProjectionView = mat4();


    gl.bindBuffer(gl.UNIFORM_BUFFER, uCameraBuffer);

    const uChunk0Translation = chunk0Program.getUniformLocation("m_translation");

    const meshHandler = new UIntMeshHandler(gl, aIn);
    const meshDrawer = new UIntMeshDrawer(gl, uChunk0Translation);

    const world = new World(meshHandler);

    // world.moveTo(0, 100, -0);
    // world.update();

    // const currentChunk = await world.getCurrentChunk();
    // const peek = currentChunk.peek(0, 0);
    const camera = new Camera(new FVec3(-5, 3, 0));
    // const camera = new Camera(new FVec3(75, -40, -23));
    const frustumCuller = new FrustumCuller(projection.frustum, camera);

    const cameraSpeed = 0.5;

    let pause = false;

    const mouseInput = new MouseInput(canvas, true);
    const keyboardInput = new KeyboardInput(document.body,
        [" ", "w", "a", "s", "d", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Control"], {
        " ": (pressed) => pressed && (pause = !pause)

    }
    );

    const fpsCounter = new FPSCounter();
    const pos = new Position();
    const lookAtPosition = new Position();
    const chunkVisibleExtra = Symbol('chunkVisibleExtra');
    let raycastBlock = null;
    mouseInput.onMouseDown(() => {
        if (pause) {
            return
        }
        if (raycastBlock !== null) {
            const logicPos = world.switchBlockPos(vec3(raycastBlock.x, raycastBlock.y, raycastBlock.z));
            world.removeBlock(logicPos);
        }
    });

    function draw() {
        if (pause) {
            requestAnimationFrame(draw);
            return;
        }
        const cameraSpeedMultiplier = 1;
        if (keyboardInput.isKeyPressed("w"))
            camera.moveForward(cameraSpeed * cameraSpeedMultiplier);
        if (keyboardInput.isKeyPressed("s"))
            camera.moveForward(-cameraSpeed * cameraSpeedMultiplier);
        if (keyboardInput.isKeyPressed("a"))
            camera.moveRight(-cameraSpeed * cameraSpeedMultiplier);
        if (keyboardInput.isKeyPressed("d"))
            camera.moveRight(cameraSpeed * cameraSpeedMultiplier);

        const mouseDelta = mouseInput.getDeltaAndReset()
        camera.changeYaw(mouseDelta.x * 0.2);
        camera.changePitch(-mouseDelta.y * 0.2);
        camera.update();

        camera.calculateViewMatrix(mView);
        mProjection.mulOut(mView, mProjectionView);


        chunk0Program.use()
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.bindBuffer(gl.UNIFORM_BUFFER, uCameraBuffer);
        gl.bufferSubData(gl.UNIFORM_BUFFER, uCameraVariableInfo.projection_view.offset, mProjectionView._values, 0);
        gl.bufferSubData(gl.UNIFORM_BUFFER, uCameraVariableInfo.pos.offset, camera.position._values, 0);
        gl.bindBuffer(gl.UNIFORM_BUFFER, null);
        world.moveToWorldPos(camera.position.x, camera.position.y, camera.position.z);

        frustumCuller.updatePlanes();
        let allChunks = 0;
        let chunksDrawn = 0;
        texArray.bind(gl);
        world.update();

        world.forEachChunkInRange(chunk => {
            allChunks++;
            if (!frustumCuller.shouldDraw(chunk)) {
                return;
            }
            chunksDrawn++;
            const mesh = chunk.mesh;
            meshDrawer.draw(mesh);            
        });
        gl.bindVertexArray(null);

        const camDir = camera.direction;
        const camPos = camera.position;
        pos.setWorld(camPos.x, camPos.y, camPos.z);
        raycastBlock = world.raycasti(camPos, camDir, 5);
        if (raycastBlock !== null) {
            // gl.disable(gl.DEPTH_TEST);
            // world.blockWorldAt(raycastBlock.x, raycastBlock.y, raycastBlock.z);
            // console.log(out.value);
            gl.useProgram(blockHighlightProgram.program);
            gl.bindBuffer(gl.ARRAY_BUFFER, bhBuffer);
            writeVoxelWireframe(bhFBuffer, raycastBlock.x, raycastBlock.y, raycastBlock.z);
            gl.bufferData(gl.ARRAY_BUFFER, bhFBuffer, gl.DYNAMIC_DRAW);
            gl.vertexAttribPointer(aInBH, 3, gl.FLOAT, false, 0, 0);
            gl.drawArrays(gl.LINES, 0, 24);
            // gl.enable(gl.DEPTH_TEST);
        }


        if (fpsCounter.getCurrentFrame() % 5 === 0) {
            const block = world.blockAt(pos.ix, pos.iy, pos.iz);

            statsDiv.textContent =
                `world pos ${pos.wx.toFixed(1)}x ${pos.wz.toFixed(1)}z ${pos.wy.toFixed(1)}y ` +
                `dir ${camDir.x.toFixed(1)}x ${camDir.z.toFixed(1)}z ${camDir.y.toFixed(1)}y ` +
                `cam ${camera.pitch.toFixed(1)}p ${camera.yaw.toFixed(1)}y ` +
                `fps ${fpsCounter.fps()} ` +
                `chunks ${chunksDrawn}/${allChunks}/${world.chunksInView} ` +
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
