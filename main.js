import { TextureAtlas } from "./atlas.js";
import { CubeGen, Direction } from "./cube.js";
import { Mat4, Vec3 } from "./geom.js";
import { Program } from "./gl.js";
import { Float32Buffer, ImagePixels, Resources, UInt16Buffer } from "./utils.js";

export async function start() {
    const textures = await Resources.loadImage("./images/textures.png");
    const heightmap = await Resources.loadImage("./images/heightmap.png");

    const heightmapPixels = ImagePixels.from(heightmap);

    const canvas = document.createElement("canvas");
    document.body.appendChild(canvas);
    const gl = canvas.getContext("webgl");

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
    const canvasAspect = canvas.width / canvas.height;

    gl.clearColor(0.2, 0.2, 0.2, 1);
    gl.enable(gl.DEPTH_TEST);
    gl.frontFace(gl.CCW);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);


    document.body.style.margin = "0";
    document.body.style.overflow = "hidden";

    baseProgram.use();
    const atlas = TextureAtlas.create(gl, textures, 16);

    const float8 = new Float32Array(8);
    atlas.uvRect(float8, 2);
    const cubeGen = new CubeGen(new Vec3(0, 0, 0), 1);

    const cubeGVs = new Float32Buffer();
    const cubeGUVs = new Float32Buffer();
    const cubeGIdxs = new UInt16Buffer();

    const cubeDVs = new Float32Buffer();
    const cubeDUVs = new Float32Buffer();
    const cubeDIdxs = new UInt16Buffer();

    const cubeDGVs = new Float32Buffer();
    const cubeDGUVs = new Float32Buffer();
    const cubeDGIdxs = new UInt16Buffer();


    let offset = new Vec3(0, 0, 0)
    atlas.uvRect(float8, 1);
    function addBlock(x, y, z, grass) {
        offset.x = x * 2;
        offset.y = y * 2;
        offset.z = z * 2;
        
        cubeGen.genFace(Direction.DOWN, cubeDVs, undefined, cubeDUVs, cubeDIdxs, offset, float8);
        if (grass) {            
            cubeGen.genFace(Direction.FRONT, cubeDGVs, undefined, cubeDGUVs, cubeDGIdxs, offset, float8);
            cubeGen.genFace(Direction.LEFT, cubeDGVs, undefined, cubeDGUVs, cubeDGIdxs, offset, float8);
            cubeGen.genFace(Direction.BACK, cubeDGVs, undefined, cubeDGUVs, cubeDGIdxs, offset, float8);
            cubeGen.genFace(Direction.RIGHT, cubeDGVs, undefined, cubeDGUVs, cubeDGIdxs, offset, float8);
            cubeGen.genFace(Direction.UP, cubeGVs, undefined, cubeGUVs, cubeGIdxs, offset, float8);
        } else {
            cubeGen.genFace(Direction.FRONT, cubeDVs, undefined, cubeDUVs, cubeDIdxs, offset, float8);
            cubeGen.genFace(Direction.LEFT, cubeDVs, undefined, cubeDUVs, cubeDIdxs, offset, float8);
            cubeGen.genFace(Direction.BACK, cubeDVs, undefined, cubeDUVs, cubeDIdxs, offset, float8);
            cubeGen.genFace(Direction.RIGHT, cubeDVs, undefined, cubeDUVs, cubeDIdxs, offset, float8);
            cubeGen.genFace(Direction.UP, cubeDVs, undefined, cubeDUVs, cubeDIdxs, offset, float8);
        }
    }

    for (let x = -50; x < 50; x++)
        for (let z = -50; z < 50; z++) {
            const h = heightmapPixels.getR(724 + x, 724 + z);
            for (let y = h - 1; y < h - 1; y++) {
                addBlock(x, y - 100, z, false);
            }
            addBlock(x, h - 100, z, true);
        }

    const vboD = gl.createBuffer();
    const vboDG = gl.createBuffer();
    const vboG = gl.createBuffer();

    const tboD = gl.createBuffer();
    const tboDG = gl.createBuffer();
    const tboG = gl.createBuffer();

    const iboD = gl.createBuffer();
    const iboDG = gl.createBuffer();
    const iboG = gl.createBuffer();


    const vCoordsLines = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vCoordsLines);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        0, 0, 0, 1, 0, 0,
        0, 0, 0, 0, 1, 0,
        0, 0, 0, 0, 0, 1,
    ]), gl.STATIC_DRAW);

    const vCoordsColors = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vCoordsColors);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        1, 0, 0,
        1, 0, 0,
        0, 1, 0,
        0, 1, 0,
        0, 0, 1,
        0, 0, 1
    ]), gl.STATIC_DRAW);

    const aPosition = baseProgram.getAttribLocation("a_position");
    const aTexCoord = baseProgram.getAttribLocation("a_tex_coord");
    const attrCoordLines = coordsProgram.getAttribLocation("a_position");
    const attrCoordLinesColors = coordsProgram.getAttribLocation("a_color");
    gl.enableVertexAttribArray(aTexCoord);
    gl.enableVertexAttribArray(aPosition);
    gl.enableVertexAttribArray(attrCoordLines);
    gl.enableVertexAttribArray(attrCoordLinesColors);

    gl.bindBuffer(gl.ARRAY_BUFFER, vboD);
    gl.bufferData(gl.ARRAY_BUFFER, cubeDVs.trimmed(), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, vboG);
    gl.bufferData(gl.ARRAY_BUFFER, cubeGVs.trimmed(), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, vboDG);
    gl.bufferData(gl.ARRAY_BUFFER, cubeDGVs.trimmed(), gl.STATIC_DRAW);



    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, iboD);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, cubeDIdxs.trimmed(), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, iboG);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, cubeGIdxs.trimmed(), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, iboDG);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, cubeDGIdxs.trimmed(), gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, tboD);
    gl.bufferData(gl.ARRAY_BUFFER, cubeDUVs.trimmed(), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, tboG);
    gl.bufferData(gl.ARRAY_BUFFER, cubeGUVs.trimmed(), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, tboDG);
    gl.bufferData(gl.ARRAY_BUFFER, cubeDGUVs.trimmed(), gl.STATIC_DRAW);


    const uMatrix = baseProgram.getUniformLocation("u_matrix");
    const rMatrix = baseProgram.getUniformLocation("r_matrix");
    const cuMatrix = coordsProgram.getUniformLocation("u_matrix");
    const crMatrix = coordsProgram.getUniformLocation("r_matrix");
    let run = true;
    let time = 0;

    document.body.addEventListener("keydown", (ev) => {
        if (ev.key == " ")
            run = !run;
    })

    function rY(angleInRadians) {
        var c = Math.cos(angleInRadians);
        var s = Math.sin(angleInRadians);

        return [
            c, 0, -s, 0,
            0, 1, 0, 0,
            s, 0, c, 0,
            0, 0, 0, 1,
        ];
    }

    const cameraSpeed = 0.2;
    let pos = new Vec3(0, 0, 5);

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

        const up = new Vec3(0, 1, 0);
        const cameraRight = up.cross(dir).normalize();
        const cameraUp = new Vec3(0, 1, 0);
        const cameraFront = dir.normalize();
        // const cameraUp = dir.cross(cameraRight);

        pos.add(cameraFront)

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
        // const matP = Mat4.orthographic({
        //         bottom: -4,
        //         left: -4,
        //         right: 4,
        //         top: 4,
        //         far: -8,
        //         near: 8
        //     });

        const modelM = lookAt; Mat4.identity()
            .rotateY(look.yDeg / 360 / 10 * Math.PI * 2)
            .rotateX(look.xDeg / 360 / 10 * Math.PI * 2)
            .translate(pos.x, pos.y, pos.z);

        gl.vertexAttribPointer(aPosition, 3, gl.FLOAT, false, 0, 0);

        const mat = Mat4.identity()
            //  .translate(-0.5, -0.5, -0.5)
            .scale(0.5, 0.5, 0.5);


        // .rotateX((time % 360) / 360 * Math.PI * 2)



        // .mulByMatrix4(Matrix4.rotationX(((time / 2) % 360) / 360 * Math.PI * 2))
        // .mulByMatrix4(Matrix4.rotationY((time % 360) / 360 * Math.PI * 2));
        ;
        // const mat_r = Matrix4.identity();
        const mat_r = Mat4.identity()
            .rotateAround(new Vec3(0.5, 1, 0).normalize(), (time % 360) / 360 * Math.PI * 2)
            //.rotateY((time % 360) / 360 * Math.PI * 2)
            // .rotateX((time % 360) / 360 * Math.PI * 2)
            ;
        // const worlds = Mat4.orthographic({
        //     bottom: -8,
        //     left: -8,
        //     right: 8,
        //     top: 8,
        //     far: 8,
        //     near: -8
        // });

        // const mat_r = Matrix4.rotationY((time % 360) / 360 * Math.PI * 2);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        // modelViewMatrix[14] = -3;

        const x = rY((time % 360) / 360 * Math.PI * 2);


        baseProgram.use();
        gl.uniformMatrix4fv(uMatrix, false, modelM.values);
        // gl.uniformMatrix4fv(uMatrix, false, mat.values);
        gl.uniformMatrix4fv(rMatrix, false, matP.values);
        // gl.uniformMatrix4fv(rMatrix, false, mat_r.values);
        atlas.bind(gl, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, vboG)
        gl.vertexAttribPointer(aPosition, 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, tboG);
        gl.vertexAttribPointer(aTexCoord, 2, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, iboG);
        gl.drawElements(gl.TRIANGLES, cubeGIdxs.length, gl.UNSIGNED_SHORT, 0);

        atlas.bind(gl, 0, 2);
        gl.bindBuffer(gl.ARRAY_BUFFER, vboDG)
        gl.vertexAttribPointer(aPosition, 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, tboDG);
        gl.vertexAttribPointer(aTexCoord, 2, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, iboDG);
        gl.drawElements(gl.TRIANGLES, cubeDGIdxs.length, gl.UNSIGNED_SHORT, 0);

        atlas.bind(gl, 0, 1);
        gl.bindBuffer(gl.ARRAY_BUFFER, vboD)
        gl.vertexAttribPointer(aPosition, 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, tboD);
        gl.vertexAttribPointer(aTexCoord, 2, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, iboD);
        gl.drawElements(gl.TRIANGLES, cubeDIdxs.length, gl.UNSIGNED_SHORT, 0);

        coordsProgram.use();
        gl.uniformMatrix4fv(cuMatrix, false, modelM.values);
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
