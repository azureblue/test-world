import { Camera, FrustumCuller } from "./camera.js";
import { UIntMesh } from "./chunk.js";
import { Projection, FVec3, mat4, fvec3 } from "./geom.js";
import { Program } from "./gl.js";
import { FPSCounter } from "./perf.js";
import { TextureArray } from "./textures.js";
import { Replacer, Resources, writeVoxelWireframe } from "./utils.js";
import { BlockLocation, World } from "./world.js";

const VIEW_DISTANCE_SQ = (11 * 15) ** 2;
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

    const gl = canvas.getContext("webgl2", {
        powerPreference: "high-performance"
    });


    const chunk0Program = new Program(
        gl,
        Replacer.replace(await Resources.loadText("shaders/chunk0.vert"),
            {
                "viewDistanceSq": VIEW_DISTANCE_SQ.toFixed(1),
                "edgeShadowDistanceSq": (800.0).toFixed(1)
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

    UIntMesh.setGL(gl, aIn);
    const texArray = TextureArray.create(gl, textures, 16);
    
    const world = new World();
    
    const uCamera = gl.getUniformBlockIndex(chunk0Program.program, "Camera");
    const uCameraSize = gl.getActiveUniformBlockParameter(chunk0Program.program, uCamera, gl.UNIFORM_BLOCK_DATA_SIZE);
    const uCameraBuffer = gl.createBuffer();
    gl.bindBuffer(gl.UNIFORM_BUFFER, uCameraBuffer);
    gl.bufferData(gl.UNIFORM_BUFFER, uCameraSize, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.UNIFORM_BUFFER, null);
    gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, uCameraBuffer);

    const uCameraIndices = gl.getUniformIndices(chunk0Program.program, ["cam_proj", "cam_view", "cam_pos"]);
    const uCameraOffsets = gl.getActiveUniforms(chunk0Program.program, uCameraIndices, gl.UNIFORM_OFFSET);

    const uCameraVariableInfo = {
        proj: {
            index: uCameraIndices[0],
            offset: uCameraOffsets[0]
        },
        view: {
            index: uCameraIndices[1],
            offset: uCameraOffsets[1]
        },
        pos: {
            index: uCameraIndices[2],
            offset: uCameraOffsets[2]
        }
    };

    gl.uniformBlockBinding(chunk0Program.program, gl.getUniformBlockIndex(chunk0Program.program, "Camera"), 0);
    gl.uniformBlockBinding(blockHighlightProgram.program, gl.getUniformBlockIndex(blockHighlightProgram.program, "Camera"), 0);

    const aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
    const fieldOfView = (68 * Math.PI) / 180;
    const projection = new Projection(fieldOfView, aspect, 0.1, 640.0);

    const mProjection = mat4();
    const mView = mat4();

    projection.apply(mProjection);

    gl.bindBuffer(gl.UNIFORM_BUFFER, uCameraBuffer);
    gl.bufferSubData(gl.UNIFORM_BUFFER, uCameraVariableInfo.proj.offset, mProjection._values, 0);

    const uChunk0Translation = chunk0Program.getUniformLocation("m_translation");

    world.moveTo(0, 0, 1);
    world.update();

    const currentChunk = await world.getCurrentChunk();
    const peek = currentChunk.peek(0, 0);
    const camera = new Camera(new FVec3(0, peek + 2, 0));
    const frustumCuller = new FrustumCuller(projection.frustum, camera);

    const cameraSpeed = 0.5;

    const keys = {
        up: false,
        down: false,
        left: false,
        right: false,
        shift: false,
        ctrl: false
    }

    let pause = false;

    document.body.addEventListener("mousemove", (me) => {
        if (pause)
            return;
        camera.changeYaw(me.movementX * 0.2);
        camera.changePitch(-me.movementY * 0.2);
    })

    document.body.addEventListener("keydown", (ev) => {
        if (ev.key == " ") {
            if (!pause) {
                pause = true;
            } else {
                pause = false;
            }
        }
        if (ev.key == "Control")
            keys.ctrl = true;
        else if (ev.key == "w" || ev.key == "ArrowUp")
            keys.up = true;
        else if (ev.key == "a" || ev.key == "ArrowLeft")
            keys.left = true;
        else if (ev.key == "s" || ev.key == "ArrowDown")
            keys.down = true;
        else if (ev.key == "d" || ev.key == "ArrowRight")
            keys.right = true;
    }, true);

    document.body.addEventListener("keyup", (ev) => {

        if (ev.key == "Control")
            keys.ctrl = false;
        else if (ev.key == "w" || ev.key == "ArrowUp")
            keys.up = false;
        else if (ev.key == "a" || ev.key == "ArrowLeft")
            keys.left = false;
        else if (ev.key == "s" || ev.key == "ArrowDown")
            keys.down = false;
        else if (ev.key == "d" || ev.key == "ArrowRight")
            keys.right = false;
    }, true);

    canvas.addEventListener("click", async () => canvas.requestPointerLock());

    const fpsCounter = new FPSCounter();
    const blockLocation = new BlockLocation();
    const blockLocation2 = new BlockLocation();
    function draw() {
        if (pause) {
            requestAnimationFrame(draw);
            return;
        }
        const cameraSpeedMultiplier = keys.ctrl ? 0.2 : 1;
        if (keys.up)
            camera.moveForward(cameraSpeed * cameraSpeedMultiplier);
        if (keys.down)
            camera.moveForward(-cameraSpeed * cameraSpeedMultiplier);
        if (keys.left)
            camera.moveRight(-cameraSpeed * cameraSpeedMultiplier);
        if (keys.right)
            camera.moveRight(cameraSpeed * cameraSpeedMultiplier);

        camera.setLookAtMatrix(mView);

        chunk0Program.use()
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.bindBuffer(gl.UNIFORM_BUFFER, uCameraBuffer);
        gl.bufferSubData(gl.UNIFORM_BUFFER, uCameraVariableInfo.view.offset, mView._values, 0);
        gl.bufferSubData(gl.UNIFORM_BUFFER, uCameraVariableInfo.pos.offset, camera.position._values, 0);
        gl.bindBuffer(gl.UNIFORM_BUFFER, null);
        world.moveTo(camera.position.x, camera.position.z, camera.position.y);

        frustumCuller.updatePlanes();
        let allChunks = 0;
        let chunksDrawn = 0;
        texArray.bind(gl);
        world.update();
     
        world.render(chunk => {
            allChunks++;
            if (!frustumCuller.shouldDraw(chunk)) {
                return;
            }
            chunksDrawn++;
            const mesh = chunk.mesh;
            mesh.bindVA();
            const modelTranslation = mesh.modelTranslation;
            gl.uniform3f(uChunk0Translation, modelTranslation.x, modelTranslation.y, modelTranslation.z);
            gl.drawArrays(gl.TRIANGLES, 0, mesh.len);
            UIntMesh.unbind();
        });
        gl.bindVertexArray(null);

        const pos = camera.position;
        const dir = camera.direction;

        // const out = world.raycasti(pos, dir, 5);
        const out = null;
            if (out !== null) {
                // gl.disable(gl.DEPTH_TEST);
                world.blockAtWorldIPos(fvec3(out.x, out.y, out.z));
                // console.log(out.value);
                gl.useProgram(blockHighlightProgram.program);
                gl.bindBuffer(gl.ARRAY_BUFFER, bhBuffer);
                writeVoxelWireframe(bhFBuffer, out.x, out.y, out.z);
                gl.bufferData(gl.ARRAY_BUFFER, bhFBuffer, gl.DYNAMIC_DRAW);
                gl.vertexAttribPointer(aInBH, 3, gl.FLOAT, false, 0, 0);
                gl.drawArrays(gl.LINES, 0, 24);
                // gl.enable(gl.DEPTH_TEST);
            }

        
        if (fpsCounter.getCurrentFrame() % 5 === 0) {
            world.blockLocation(blockLocation, camera.position);
            const block = world.blockAtPos(camera.position);
            
            statsDiv.textContent = `position x:${pos.x.toFixed(1)} z:${pos.z.toFixed(1)} y:${pos.y.toFixed(1)} ` +
                `direction x:${dir.x.toFixed(1)} z:${dir.z.toFixed(1)} y:${dir.y.toFixed(1)} ` +
                ` pitch:${camera.pitch.toFixed(1)} yaw:${camera.yaw.toFixed(1)} fps: ${fpsCounter.fps()} chunks: ${chunksDrawn}/${allChunks}` +
                `chunk x:${blockLocation.chunkPos.x} y:${blockLocation.chunkPos.y} block pos x:${blockLocation.blockInChunkPos.x} y:${blockLocation.blockInChunkPos.y} z:${blockLocation.blockInChunkPos.z} block: ${block} ` +
                `${out === null ? "" : "looking at: " + out.block + " at: " + out.x + " " + out.y + " " + out.z}`;
        }
        requestAnimationFrame(draw);
        fpsCounter.frame();
    }

    fpsCounter.start();
    draw();
}
