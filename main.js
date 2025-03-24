import { TextureAtlas } from "./atlas.js";
import { Chunk, ChunkDataLoader, ChunkManager, UIntChunkMesher, UIntMesh } from "./chunk.js";
import { PixelDataChunkGenerator } from "./generator.js";
import { Mat4, Vec2, Vec3 } from "./geom.js";
import { Program } from "./gl.js";
import { ImagePixels, Resources } from "./utils.js";

export async function start() {
    const textures = await Resources.loadImage("./images/textures.png");
    const heightmap = await Resources.loadImage("./images/heightmap.png");
    const heightmapPixels = ImagePixels.from(heightmap);
    const statsDiv = document.getElementById("stats");

    const canvas = document.createElement("canvas");
    document.body.appendChild(canvas);
    const gl = canvas.getContext("webgl2");
    gl.lineWidth(2);

    const baseProgram = new Program(
        gl,
        await Resources.loadText("shaders/base.vert"),
        await Resources.loadText("shaders/base.frag")
    );

    const chunk0Program = new Program(
        gl,
        await Resources.loadText("shaders/chunk0.vert"),
        await Resources.loadText("shaders/chunk0.frag")
    );

    const coordsProgram = new Program(
        gl,
        await Resources.loadText("shaders/coords.vert"),
        await Resources.loadText("shaders/coords.frag")
    );

    let fps = "";
    let fpsCounter = 0;

    const fpsTimer = window.setInterval(() => {
        fps = "" + fpsCounter;
        fpsCounter = 0;
    }, 1000);


    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.BLEND);

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    gl.viewport(0, 0, canvas.width, canvas.height);

    gl.clearColor(136 / 255, 198 / 255, 252 / 255, 1);
    gl.enable(gl.DEPTH_TEST);
    gl.frontFace(gl.CCW);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);


    document.body.style.margin = "0";
    document.body.style.overflow = "hidden";
    const aPosition = baseProgram.getAttribLocation("a_position");
    const aTexCoord = baseProgram.getAttribLocation("a_tex_coord");
    const aNormal = baseProgram.getAttribLocation("a_normal");
    const aIn = chunk0Program.getAttribLocation("a_in");
    const attrCoordLines = coordsProgram.getAttribLocation("a_position");
    const attrCoordLinesColors = coordsProgram.getAttribLocation("a_color");
    gl.enableVertexAttribArray(attrCoordLines);
    gl.enableVertexAttribArray(attrCoordLinesColors);


    UIntMesh.setGL(gl, aPosition, aNormal, aTexCoord);
    baseProgram.use();
    const tmp8Ar = new Uint8Array(9);
    const generator = new PixelDataChunkGenerator(heightmapPixels, new Vec2(heightmapPixels.width / 2, heightmapPixels.height / 2));
    const atlas = TextureAtlas.create(gl, textures, 16);
    const chunkLoader = new ChunkDataLoader((cx, cy) => generator.generateChunk(new Vec2(cx, cy)));
    const chunkManager = new ChunkManager(chunkLoader, new UIntChunkMesher());

    /**
     * @type {Array<Chunk>}
     */
    const chunks = [];
    for (let cx = -40; cx < 40; cx++)
        for (let cy = -40; cy < 40; cy++) {
            const chunk = await chunkManager.loadChunk(cx, cy)
            chunks.push(chunk);
        }

    const vCoordsLines = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vCoordsLines);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        0, 0, 0, 10, 0, 0,
        0, 0, 0, 0, 10, 0,
        0, 0, 0, 0, 0, 10,
    ]), gl.STATIC_DRAW);

    const vCoordsColors = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vCoordsColors);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        0.8, 0.0, 0.0,
        0.8, 0.0, 0.0,
        0, 0.8, 0.0,
        0, 0.8, 0.0,
        0.0, 0, 0.8,
        0.0, 0, 0.8
    ]), gl.STATIC_DRAW);


    const uCamera = gl.getUniformBlockIndex(baseProgram.program, "Camera");
    const uCameraSize = gl.getActiveUniformBlockParameter(baseProgram.program, uCamera, gl.UNIFORM_BLOCK_DATA_SIZE);
    const uCameraBuffer = gl.createBuffer();
    gl.bindBuffer(gl.UNIFORM_BUFFER, uCameraBuffer);
    gl.bufferData(gl.UNIFORM_BUFFER, uCameraSize, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.UNIFORM_BUFFER, null);
    gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, uCameraBuffer);
    const uCameraIndices = gl.getUniformIndices(baseProgram.program, ["proj", "view"]);
    const uCameraOffsets = gl.getActiveUniforms(baseProgram.program, uCameraIndices, gl.UNIFORM_OFFSET);

    const uCameraVariableInfo = {
        proj: {
            index: uCameraIndices[0],
            offset: uCameraOffsets[0]
        },
        view: {
            index: uCameraIndices[1],
            offset: uCameraOffsets[1]
        }
    };

    gl.uniformBlockBinding(baseProgram.program, gl.getUniformBlockIndex(baseProgram.program, "Camera"), 0);
    gl.uniformBlockBinding(coordsProgram.program, gl.getUniformBlockIndex(coordsProgram.program, "Camera"), 0);
    gl.uniformBlockBinding(chunk0Program.program, gl.getUniformBlockIndex(chunk0Program.program, "Camera"), 0);

    const fieldOfViewDeg = 70;
    const fieldOfView = (fieldOfViewDeg * Math.PI) / 180; // in radians
    const aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
    const zNear = 0.1;
    const zFar = 1000.0;
    const mProjection = Mat4.perspective({
        aspectRatio: aspect,
        fovYRadian: fieldOfView,
        far: zFar,
        near: zNear
    });

    // const mProjection = Mat4.orthographic({
    //     top: 0,
    //     bottom: 100,
    //     left: 0,
    //     right: 100,
    //     near: 0.1,
    //     far: 100
    // });

    gl.bindBuffer(gl.UNIFORM_BUFFER, uCameraBuffer);
    gl.bufferSubData(gl.UNIFORM_BUFFER, uCameraVariableInfo.proj.offset, mProjection._values, 0);


    // const uModel = baseProgram.getUniformLocation("m_matrix");
    const uTranslation = baseProgram.getUniformLocation("m_translation");
    const uChunk0Translation = chunk0Program.getUniformLocation("m_translation");

    let run = true;
    let time = 0;

    document.body.addEventListener("keydown", (ev) => {
        if (ev.key == " ")
            run = !run;
    })

    const chunkData00 = await chunkLoader.getChunk(0, 0);
    const peak = chunkData00.peak(0, 0);
    const cameraSpeed = 0.2;

    let pos = new Vec3(0, peak + 2, 0);

    const keys = {
        up: false,
        down: false,
        left: false,
        right: false,
    }

    const look = {
        yaw: 0,
        pitch: 0
    }

    const dir = new Vec3(0, 0, 0);
    const dir2 = new Vec2(0, 0);
    let pause = false;

    document.body.addEventListener("mousemove", (me) => {
        if (pause)
            return;
        look.yaw += me.movementX / 8;
        if (look.yaw > 360)
            look.yaw -= 360;
        if (look.yaw < 0)
            look.yaw += 360
        look.pitch -= me.movementY / 8;
        if (look.pitch > 89) {
            look.pitch = 89;
        }

        if (look.pitch < -89) {
            look.pitch = -89;
        }
    })

    document.body.addEventListener("keydown", (ev) => {
        if (ev.key == " ") {
            if (!pause) {
                pause = true;
            } else {
                pause = false;
                draw();
            }
        }
        if (ev.key == "w")
            keys.up = true;
        if (ev.key == "a")
            keys.left = true;
        if (ev.key == "s")
            keys.down = true;
        if (ev.key == "d")
            keys.right = true;
    }, true);

    document.body.addEventListener("keyup", (ev) => {
        if (ev.key == "w")
            keys.up = false;
        if (ev.key == "a")
            keys.left = false;
        if (ev.key == "s")
            keys.down = false;
        if (ev.key == "d")
            keys.right = false;
    }, true);

    canvas.addEventListener("click", async () => canvas.requestPointerLock());

    const PI_2_360 = 1 / 360 * Math.PI * 2;

    function draw() {
        const yawRads = look.yaw * PI_2_360;
        const pitchRads = look.pitch * PI_2_360;
        dir.x = Math.cos(yawRads) * Math.cos(pitchRads);
        dir.y = Math.sin(pitchRads);
        dir.z = Math.sin(yawRads) * Math.cos(pitchRads);

        dir2.x = Math.cos(yawRads);
        dir2.y = Math.sin(yawRads);

        dir.normalizeInPlace();
        dir2.normalizeInPlace();

        const up = new Vec3(0, 1, 0);
        const cameraRight = up.cross(dir).normalize();
        const cameraUp = new Vec3(0, 1, 0);
        const cameraFront = dir;

        const mView = Mat4.lookAt(pos, pos.add(cameraFront), cameraUp);

        if (run)
            time++;
        if (keys.up)
            pos = pos.add(dir.mulByScalar(cameraSpeed));
        if (keys.down)
            pos = pos.add(dir.mulByScalar(-1 * cameraSpeed));
        if (keys.left)
            pos = pos.add(cameraRight.mulByScalar(cameraSpeed));
        if (keys.right)
            pos = pos.add(cameraRight.mulByScalar(-1 * cameraSpeed));


    
        

        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        chunk0Program.use()
        gl.bindBuffer(gl.UNIFORM_BUFFER, uCameraBuffer);
        gl.bufferSubData(gl.UNIFORM_BUFFER, uCameraVariableInfo.view.offset, mView._values, 0);
        gl.bindBuffer(gl.UNIFORM_BUFFER, null);
        // gl.uniformMatrix4fv(uModel, false, mView.values);
        // for (let mesh of meshes) {
        //     mesh.bindVA();
        //     atlas.bind(gl, 0, mesh.textureId);
        //     // const modelMat = mesh.modelMatrix;
        //     const modelTranslation = mesh.modelTranslation;
        //     gl.uniform3f(uTranslation, modelTranslation.x, modelTranslation.y, modelTranslation.z);
        //     // gl.uniformMatrix4fv(uModel, false, modelMat.values);
        //     gl.drawElements(gl.TRIANGLES, mesh.idxsLen, gl.UNSIGNED_SHORT, 0);
        // }

        const downConeDeg = (Math.max(-look.pitch - 90 + (fieldOfViewDeg / 2), 0)) * PI_2_360;
        const cosDownConeDeg = Math.cos(downConeDeg);
        const _v = pos.y / cosDownConeDeg;
        const backoff = Math.sqrt(_v * _v - pos.y * pos.y);
        let chunkCulled = 0;
        for (let chunk of chunks) {

            const pos2d = dir2.mulByScalar(backoff);
            const pos2 =  new Vec2(pos.x - pos2d.x, pos.z - pos2d.y);
            const chunkPos1 = new Vec2(chunk.data.position.x * 16 - pos2.x, -chunk.data.position.y * 16 - pos2.y).normalize();
            const chunkPos2 = new Vec2(chunk.data.position.x * 16 + 16 - pos2.x, -chunk.data.position.y * 16 - pos2.y).normalize();
            const chunkPos3 = new Vec2(chunk.data.position.x * 16 + 16 - pos2.x, -chunk.data.position.y * 16 - 16 - pos2.y).normalize();
            const chunkPos4 = new Vec2(chunk.data.position.x * 16 - pos2.x, -chunk.data.position.y * 16 - 16 - pos2.y).normalize();            

            if (chunkPos1.dot(dir.xz) < 0 && chunkPos2.dot(dir.xz) < 0 && chunkPos3.dot(dir.xz) < 0 && chunkPos4.dot(dir.xz) < 0) {
                chunkCulled++;
                continue;
            }

            for (let mesh of chunk.meshes) {
                mesh.bindVA();
                atlas.bind(gl, 0, mesh.textureId);
                // const modelMat = mesh.modelMatrix;
                const modelTranslation = mesh.modelTranslation;
                gl.uniform3f(uChunk0Translation, modelTranslation.x, modelTranslation.y, modelTranslation.z);
                // gl.uniformMatrix4fv(uModel, false, modelMat.values);
                gl.drawArrays(gl.TRIANGLES, 0, mesh.len);
            }
        }
        gl.bindVertexArray(null);

        coordsProgram.use();

        gl.bindBuffer(gl.ARRAY_BUFFER, vCoordsLines);
        gl.vertexAttribPointer(attrCoordLines, 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, vCoordsColors);
        gl.vertexAttribPointer(attrCoordLinesColors, 3, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.LINES, 0, 6);
        statsDiv.textContent = `position x:${pos.x.toFixed(1)} z:${pos.z.toFixed(1)} y:${pos.y.toFixed(1)} ` +
        `direction x:${dir.x.toFixed(1)} z:${dir.z.toFixed(1)} y:${dir.y.toFixed(1)} ` +
        ` pitch:${look.pitch.toFixed(1)} yaw:${look.yaw.toFixed(1)} fps: ${fps} chunk culled: ${chunkCulled} cone down: ${downConeDeg}`;
    
        fpsCounter++;
        if (!pause)
            requestAnimationFrame(draw);
    }

    draw();

}
