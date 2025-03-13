class Program {

    #gl;
    /**
     * 
     * @param {WebGLRenderingContext} gl 
     * @param {string} vertexShaderSrc 
     * @param {string} fragmentShaderSrc 
     */
    constructor(gl, vertexShaderSrc, fragmentShaderSrc) {
        var vertexShader = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(vertexShader, vertexShaderSrc);
        gl.compileShader(vertexShader);
        if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS))
            throw "vertex shader compilation failed: " + gl.getShaderInfoLog(vertexShader);

        var fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(fragmentShader, fragmentShaderSrc);
        gl.compileShader(fragmentShader);
        if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS))
            throw "fragment shader compilation failed: " + gl.getShaderInfoLog(fragmentShader);

        var program = gl.createProgram();
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS))
            throw "program linkage failed: " + gl.getProgramInfoLog(program);

        this.program = program;
        this.#gl = gl;
    }

    getAttribLocation(name) {
        return this.#gl.getAttribLocation(this.program, name);
    }

    getUniformLocation(name) {
        return this.#gl.getUniformLocation(this.program, name);
    }

    use() {
        this.#gl.useProgram(this.program);
    }
}

export {Program}