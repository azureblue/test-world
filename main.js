import { TextureAtlas } from "./atlas.js";
import { CubeGen, CubeSpec, Direction } from "./cube.js";
import { Mat4, Vec3 } from "./geom.js";
import { Program } from "./gl.js";
import { Float32Buffer, Resources, UInt16Buffer } from "./utils.js";

export async function start() {
    const textures = await Resources.loadImage("./images/textures.png");

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
    gl.enable(gl.DEPTH_TEST) ; 
    gl.frontFace(gl.CCW);
    gl.enable(gl.CULL_FACE);  
    gl.cullFace(gl.BACK);


    document.body.style.margin = "0";
    document.body.style.overflow = "hidden";

    baseProgram.use();
    const atlas = new TextureAtlas(textures, 16);
    atlas.prepare(gl);
    atlas.bind(gl, 0);

    const float8 = new Float32Array(8);
    atlas.uvRect(float8, 2);
    const cubeGen = new CubeGen(new Vec3(0, 0, 0), 1);

    const cubeVs = new Float32Buffer();
    const cubeUVs = new Float32Buffer();
    const cubeIdxs = new UInt16Buffer();

    let offset = new Vec3(0, 0, 0)
    atlas.uvRect(float8, 2);
    cubeGen.genFace(Direction.FRONT, cubeVs, undefined, cubeUVs, cubeIdxs, offset, float8);
    cubeGen.genFace(Direction.LEFT, cubeVs, undefined, cubeUVs, cubeIdxs, offset, float8);
    cubeGen.genFace(Direction.BACK, cubeVs, undefined, cubeUVs, cubeIdxs, offset, float8);
    cubeGen.genFace(Direction.RIGHT, cubeVs, undefined, cubeUVs, cubeIdxs, offset, float8);
    atlas.uvRect(float8, 0);
    cubeGen.genFace(Direction.UP, cubeVs, undefined, cubeUVs, cubeIdxs, offset, float8);
    atlas.uvRect(float8, 1);
    cubeGen.genFace(Direction.DOWN, cubeVs, undefined, cubeUVs, cubeIdxs, offset, float8);

    offset = new Vec3(2, 0, 0)
    atlas.uvRect(float8, 2);
    cubeGen.genFace(Direction.FRONT, cubeVs, undefined, cubeUVs, cubeIdxs, offset, float8);
    cubeGen.genFace(Direction.LEFT, cubeVs, undefined, cubeUVs, cubeIdxs, offset, float8);
    cubeGen.genFace(Direction.BACK, cubeVs, undefined, cubeUVs, cubeIdxs, offset, float8);
    cubeGen.genFace(Direction.RIGHT, cubeVs, undefined, cubeUVs, cubeIdxs, offset, float8);
    atlas.uvRect(float8, 0);
    cubeGen.genFace(Direction.UP, cubeVs, undefined, cubeUVs, cubeIdxs, offset, float8);
    atlas.uvRect(float8, 1);
    cubeGen.genFace(Direction.DOWN, cubeVs, undefined, cubeUVs, cubeIdxs, offset, float8);


    const texCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, cubeUVs.trimmed(), gl.STATIC_DRAW);

    const vbo = gl.createBuffer();

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

    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, cubeVs.trimmed(), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(attrCoordLines);
    gl.enableVertexAttribArray(attrCoordLinesColors);


    const ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, cubeIdxs.trimmed(), gl.STATIC_DRAW);




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

    function draw() {
        if (run)
            time++;
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

        const modelM = Mat4.translation(0, 0, -15).rotateAround(new Vec3(0.5, 1, 0).normalize(), (time % 360) / 360 * Math.PI * 2);

        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
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
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo)
        gl.vertexAttribPointer(aPosition, 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
        gl.vertexAttribPointer(aTexCoord, 2, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo)

        gl.drawElements(gl.TRIANGLES, cubeIdxs.length, gl.UNSIGNED_SHORT, 0);
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
