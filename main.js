import { TextureAtlas } from "./atlas.js";
import { CubeGen, CubeSpec, Direction } from "./cube.js";
import { Mat4, Vec2, Vec3 } from "./geom.js";
import { Float32Buffer, UInt16Buffer } from "./utils.js";

export function start() {
    const img = new Image();
    img.onload = () => start2(img);
    img.src = "./images/textures.png";
}
function start2(img) {

    const canvas = document.createElement("canvas");
    document.body.appendChild(canvas);
    const gl = canvas.getContext("webgl");
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    gl.viewport(0, 0, canvas.width, canvas.height);
    const canvasAspect = canvas.width / canvas.height;

    gl.clearColor(0.2, 0.2, 0.2, 1);
    gl.enable(gl.DEPTH_TEST);
    gl.frontFace(gl.CW);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);

    document.body.style.margin = "0";
    document.body.style.overflow = "hidden";


    // Shader sources
    const vsSource = `
attribute vec3 a_position;
attribute vec3 a_color;
attribute vec2 aTextureCoord;
varying vec3 v_color;
uniform mat4 u_matrix;
uniform mat4 r_matrix;
varying highp vec2 vTextureCoord;

void main() {
    gl_Position = r_matrix * u_matrix * vec4(a_position, 1.0);
    // gl_Position = vec4(a_position, 1.0);
    v_color = a_color; //vec3(0.5, 0.0, 0.8);
    vTextureCoord = aTextureCoord;
}
`;

    const fsSource = `
precision mediump float;
varying vec3 v_color;
uniform sampler2D uSampler;
varying highp vec2 vTextureCoord;
void main() {
    // gl_FragColor = vec4(v_color, 1.0);
    gl_FragColor = texture2D(uSampler, vTextureCoord);    
}
`;

    function compileShader(type, source) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error("Shader Compilation Error:", gl.getShaderInfoLog(shader));
            return null;
        }
        return shader;
    }


    const vs = compileShader(gl.VERTEX_SHADER, vsSource);
    const fs = compileShader(gl.FRAGMENT_SHADER, fsSource);
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.useProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error("Shader Program Link Error:", gl.getProgramInfoLog(program));
    }

    const atlas = new TextureAtlas(img, 16);
    atlas.prepare(gl);
    atlas.bind(gl, 0);

    const float8 = new Float32Array(8);
    atlas.uvRect(float8, 2);
    const cubeGen = new CubeGen(new Vec3(0, 0, 0), 1);

    const cubeVs = new Float32Buffer();
    const cubeUVs = new Float32Buffer();
    const cubeIdxs = new UInt16Buffer();

    const offset = new Vec3(-0.5, -0.5, -0.5);
    cubeGen.genFace(Direction.FRONT, cubeVs, undefined, cubeUVs, cubeIdxs, offset, float8);
    cubeGen.genFace(Direction.LEFT, cubeVs, undefined, cubeUVs, cubeIdxs, offset, float8);
    cubeGen.genFace(Direction.BACK, cubeVs, undefined, cubeUVs, cubeIdxs, offset, float8);
    cubeGen.genFace(Direction.RIGHT, cubeVs, undefined, cubeUVs, cubeIdxs, offset, float8);
    atlas.uvRect(float8, 0);
    cubeGen.genFace(Direction.UP, cubeVs, undefined, cubeUVs, cubeIdxs, offset, float8);
    atlas.uvRect(float8, 1);
    cubeGen.genFace(Direction.DOWN, cubeVs, undefined, cubeUVs, cubeIdxs, offset, float8);


    const textureCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, textureCoordBuffer);
    // const faceDirtGrassCoords = new Float32Array(8);
    // atlas.uvRect(faceDirtGrassCoords, 2);
    // const texCoordinates = new Float32Array([
    //     ...faceDirtGrassCoords,
    //     ...faceDirtGrassCoords,
    //     ...faceDirtGrassCoords,
    //     ...faceDirtGrassCoords
    // ]);
    gl.bufferData(
        gl.ARRAY_BUFFER,
        cubeUVs.trimmed(),
        gl.STATIC_DRAW,
    );
    
    const vbo = gl.createBuffer();
    const vbo2 = gl.createBuffer();
    const cbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);    
    gl.bufferData(gl.ARRAY_BUFFER, cubeVs.trimmed(), gl.STATIC_DRAW);    
    // gl.bufferData(gl.ARRAY_BUFFER, CubeSpec.vertices.map(v => v - 0.5), gl.STATIC_DRAW);
    const aPosition = gl.getAttribLocation(program, "a_position");
    gl.vertexAttribPointer(aPosition, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(aPosition);
    gl.bindBuffer(gl.ARRAY_BUFFER, cbo);
    gl.bufferData(gl.ARRAY_BUFFER, CubeSpec.colors, gl.STATIC_DRAW);


    const aColor = gl.getAttribLocation(program, "a_color");


    gl.vertexAttribPointer(aColor, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(aColor);

    const ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);

    // const cuveIdx = Uint16Array.from([...CubeSpec.leftFaceIds, ...CubeSpec.rightFaceIds]);
    // const cuveIdx = Uint16Array.from([...CubeSpec.frontFaceIds, ...CubeSpec.backFaceIds]);
    const cuveIdx = Uint16Array.from([...CubeSpec.frontFaceIds]);
    // gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, squareIndices, gl.STATIC_DRAW);
    // gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, cuveIdx, gl.STATIC_DRAW);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, cubeIdxs.trimmed(), gl.STATIC_DRAW);

    // const aColor = gl.getAttribLocation(program, "a_color");
    // gl.vertexAttribPointer(aColor, 3, gl.FLOAT, false, 24, 12);
    // gl.enableVertexAttribArray(aColor);
    const aTextureCoord = gl.getAttribLocation(program, "aTextureCoord");
    const uSampler = gl.getUniformLocation(program, "uSampler");
    gl.bindBuffer(gl.ARRAY_BUFFER, textureCoordBuffer);
    gl.vertexAttribPointer(
        aTextureCoord,
        2,
        gl.FLOAT,
        false,
        0,
        0,
    );
    gl.enableVertexAttribArray(aTextureCoord);

    const uMatrix = gl.getUniformLocation(program, "u_matrix");
    const rMatrix = gl.getUniformLocation(program, "r_matrix");
    let run = true;
    let time = 0;
    //const mat = Matrix4.translation(-1, -1, 0).mulByMatrix4( Matrix4.scaling(0.5, 0.5, 1));
    document.body.addEventListener("keydown", (ev) => {
        if (ev.key == " ")
            run = !run;
    })

    const linesVs = new Float32Array([0, 0, 0, 0, 0, -1]);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo2);
    gl.bufferData(gl.ARRAY_BUFFER, linesVs, gl.STATIC_DRAW);    
    function draw() {
        if (run)
            time++;
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
            // .rotateY((time % 360) / 360 * Math.PI * 2)
            // .rotateX((time % 360) / 360 * Math.PI * 2)
            ;
        const worlds = Mat4.perspective( {
            aspectRatio: 1,
            near: 0.1,
            far: 1000,
            fovYRadian: Math.PI

        });
        // const mat_r = Matrix4.rotationY((time % 360) / 360 * Math.PI * 2);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        // modelViewMatrix[14] = -3;


        gl.uniformMatrix4fv(uMatrix, false, mat.values);
        gl.uniformMatrix4fv(rMatrix, false, mat_r.values);
        gl.drawElements(gl.TRIANGLES, cubeIdxs.length, gl.UNSIGNED_SHORT, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo2);
        gl.vertexAttribPointer(aPosition, 3, gl.FLOAT, false, 0, 0);
        gl.drawElements(gl.LINES, 2, gl.UNSIGNED_SHORT, 0);
        requestAnimationFrame(draw);
    }

    draw();

}