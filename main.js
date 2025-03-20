import { TextureAtlas } from "./atlas.js";
import { ChunkDataLoader, ChunkManager, ChunkMesher, Mesh } from "./chunk.js";
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

    const coordsProgram = new Program(
        gl,
        await Resources.loadText("shaders/coords.vert"),
        await Resources.loadText("shaders/coords.frag")
    );


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
    const attrCoordLines = coordsProgram.getAttribLocation("a_position");
    const attrCoordLinesColors = coordsProgram.getAttribLocation("a_color");
    gl.enableVertexAttribArray(attrCoordLines);
    gl.enableVertexAttribArray(attrCoordLinesColors);


    Mesh.setGL(gl, aPosition, aNormal, aTexCoord);
    baseProgram.use();
    const tmp8Ar = new Uint8Array(9);
    const generator = new PixelDataChunkGenerator(heightmapPixels, new Vec2(heightmapPixels.width / 2, heightmapPixels.height / 2));
    // const generator = new PixelDataChunkGenerator(heightmapPixels, new Vec2(0, 16));
    const atlas = TextureAtlas.create(gl, textures, 16);
    const chunkLoader = new ChunkDataLoader((cx, cy) => generator.generateChunk(new Vec2(cx, cy)));
    const chunkManager = new ChunkManager(chunkLoader, new ChunkMesher());

    /**
     * @type {Array<Mesh>}
     */
    const meshes = [];
    for (let cx = -20; cx < 20; cx++)
        for (let cy = -20; cy < 20; cy++) {
            const chunk = await chunkManager.loadChunk(cx, cy)
            meshes.push(...chunk.meshes);
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


    const uView = baseProgram.getUniformLocation("v_matrix");
    const uProjection = baseProgram.getUniformLocation("p_matrix");
    const uModel = baseProgram.getUniformLocation("m_matrix");
    const cuMatrix = coordsProgram.getUniformLocation("u_matrix");
    const crMatrix = coordsProgram.getUniformLocation("r_matrix");
    let run = true;
    let time = 0;

    document.body.addEventListener("keydown", (ev) => {
        if (ev.key == " ")
            run = !run;
    })

    const chunkData00 = await chunkLoader.getChunk(0, 0);
    const peak = chunkData00.peak(0, 0);
    const cameraSpeed = 1;

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

    document.body.addEventListener("mousemove", (me) => {
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

    canvas.addEventListener("click", async () => {
        await canvas.requestPointerLock();
    });

    function draw() {
        dir.x = Math.cos(look.yaw / 360 * Math.PI * 2) * Math.cos(look.pitch / 360 * Math.PI * 2);
        dir.y = Math.sin(look.pitch / 360 * Math.PI * 2);
        dir.z = Math.sin(look.yaw / 360 * Math.PI * 2) * Math.cos(look.pitch / 360 * Math.PI * 2);

        dir.normalizeInPlace();

        const up = new Vec3(0, 1, 0);
        const cameraRight = up.cross(dir).normalize();
        const cameraUp = new Vec3(0, 1, 0);
        const cameraFront = dir;
        // const cameraUp = dir.cross(cameraRight);

        const lookAt = Mat4.lookAt(pos, pos.add(cameraFront), cameraUp);
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
        const fieldOfView = (70 * Math.PI) / 180; // in radians
        const aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
        const zNear = 0.1;
        const zFar = 1000.0;
        const matP = Mat4.perspective({
            aspectRatio: aspect,
            fovYRadian: fieldOfView,
            far: zFar,
            near: zNear
        });

        statsDiv.textContent = `position x:${pos.x.toFixed(1)} z: ${pos.z.toFixed(1)} y: ${pos.y.toFixed(1)} ` +
        `direction x:${dir.x.toFixed(1)} z: ${dir.z.toFixed(1)} y: ${dir.y.toFixed(1)}`;

        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        baseProgram.use();
        gl.uniformMatrix4fv(uView, false, lookAt.values);
        gl.uniformMatrix4fv(uProjection, false, matP.values);
        for (let mesh of meshes) {
            mesh.bindVA();
            atlas.bind(gl, 0, mesh.textureId);
            const modelMat = mesh.modelMatrix;
            gl.uniformMatrix4fv(uModel, false, modelMat.values);
            gl.drawElements(gl.TRIANGLES, mesh.idxsLen, gl.UNSIGNED_SHORT, 0);
            gl.bindVertexArray(null);
        }

        coordsProgram.use();
        gl.uniformMatrix4fv(cuMatrix, false, lookAt.values);
        // gl.uniformMatrix4fv(uMatrix, false, mat.values);
        gl.uniformMatrix4fv(crMatrix, false, matP.values);
        // gl.uniformMatrix4fv(rMatrix, false, mat_r.values);        
        gl.bindBuffer(gl.ARRAY_BUFFER, vCoordsLines);
        gl.vertexAttribPointer(attrCoordLines, 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, vCoordsColors);
        gl.vertexAttribPointer(attrCoordLinesColors, 3, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.LINES, 0, 6);
        requestAnimationFrame(draw);
    }

    draw();

}
