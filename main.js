import {Matrix3, Matrix4, Matrix4x4} from "./matrixgl/matrix.js"

class Face {
    constructor(vertices, indices) {
        this.vertices = new Float32Array(vertices);
        this.indices = new Int16Array(indices);
    }
}
class CubeSpec {    
    
    static vertices = new Float32Array([
        //front face
        0, 0, 0, // 0
        0, 1, 0, // 1
        1, 1, 0, // 2
        1, 0, 0, // 3
        //back face
        0, 0, 1, // 4
        0, 1, 1, // 5
        1, 1, 1, // 6
        1, 0, 1  // 7
    ]);
    static frontFaceIds = new Uint16Array([
        0, 1, 2, 0, 2, 3
    ]);
    static backFaceIds = new Uint16Array([
        0 + 4, 2 + 4, 1 + 4, 0 + 4, 3 + 4, 2 + 4
    ]);
    static leftFaceIds = new Uint16Array([
        0, 4, 5, 0, 5, 1
    ]);
}

export function start() {
    const canvas = document.createElement("canvas");
    document.body.appendChild(canvas);
    const gl = canvas.getContext("webgl");
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    gl.viewport(0, 0, canvas.width, canvas.height);
    const canvasAspect = canvas.width / canvas.height;

    gl.clearColor(0.2, 0.2, 0.2, 1);
    gl.enable(gl.DEPTH_TEST);
    // gl.enable(gl.CULL_FACE);
    // gl.cullFace(gl.BACK);

    document.body.style.margin = "0";
    document.body.style.overflow = "hidden";


    // Shader sources
    const vsSource = `
attribute vec3 a_position;    
varying vec3 v_color;
uniform mat4 u_matrix;
void main() {
    gl_Position = u_matrix * vec4(a_position, 1.0);
    v_color = vec3(0.5, 0.0, 0.8);
}
`;

    const fsSource = `
precision mediump float;
varying vec3 v_color;
void main() {
    gl_FragColor = vec4(v_color, 1.0);
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

    const squareVertices = new Float32Array([
        0, 0, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0
    ]);

    const squareIndices = new Uint16Array([
        0, 2, 1, 2, 0, 3
    ]);

    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    // gl.bufferData(gl.ARRAY_BUFFER, squareVertices, gl.STATIC_DRAW);
    const cubeVxs = CubeSpec.vertices;
    gl.bufferData(gl.ARRAY_BUFFER, cubeVxs, gl.STATIC_DRAW);

    const aPosition = gl.getAttribLocation(program, "a_position");
    gl.vertexAttribPointer(aPosition, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(aPosition);

    const ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    
    // const cuveIdx = Uint16Array.from([...CubeSpec.frontFaceIds, ...CubeSpec.backFaceIds, ...CubeSpec.leftFaceIds]);
    const cuveIdx = Uint16Array.from([...CubeSpec.leftFaceIds]);
    // gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, squareIndices, gl.STATIC_DRAW);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, cuveIdx, gl.STATIC_DRAW);

    // const aColor = gl.getAttribLocation(program, "a_color");
    // gl.vertexAttribPointer(aColor, 3, gl.FLOAT, false, 24, 12);
    // gl.enableVertexAttribArray(aColor);
    
    
    const uMatrix = gl.getUniformLocation(program, "u_matrix");
    let time = 0;
    //const mat = Matrix4.translation(-1, -1, 0).mulByMatrix4( Matrix4.scaling(0.5, 0.5, 1));
    
    function draw() {
        time++;
        const mat = Matrix4.identity()
        .scale(0.5, 0.5 * canvasAspect, 0.5)        
        .translate(-0.5, -0.5, -0.5)
        // .rotateX((time % 360) / 360 * Math.PI * 2)
               
        .rotateY(time / 360 * Math.PI * 2)
        
            
            // .mulByMatrix4(Matrix4.rotationX(((time / 2) % 360) / 360 * Math.PI * 2))
            // .mulByMatrix4(Matrix4.rotationY((time % 360) / 360 * Math.PI * 2));
            ;
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        // modelViewMatrix[14] = -3;
        

        gl.uniformMatrix4fv(uMatrix, false, mat.values);
        gl.drawElements(gl.TRIANGLES, cuveIdx.length, gl.UNSIGNED_SHORT, 0);
        requestAnimationFrame(draw);
    }

    draw();

}