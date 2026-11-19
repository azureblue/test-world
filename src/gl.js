export class Program {

    #gl;
    /**
     * @param {WebGL2RenderingContext} gl 
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

/**
 * Adds #define lines to a shader source, after its #version line: a variant of a shader, compiled as its own program,
 * so features that are off cost nothing and constants fold. true defines the name alone (for #ifdef), undefined leaves
 * it out; numbers become float literals, arrays of 2..4 numbers vecN; anything else (false too) is an error.
 * @param {string} source
 * @param {{[name: string]: true | number | number[] | undefined}} defines
 * @returns {string}
 */
export function withDefines(source, defines) {
    const float = (n) => Number.isInteger(n) ? n.toFixed(1) : String(n);
    const lines = [];
    for (const [name, value] of Object.entries(defines)) {
        if (value === undefined)
            continue;
        if (value === true)
            lines.push(`#define ${name}`);
        else if (typeof value === "number")
            lines.push(`#define ${name} ${float(value)}`);
        else if (Array.isArray(value))
            lines.push(`#define ${name} vec${value.length}(${value.map(float).join(", ")})`);
        else
            throw new Error(`withDefines: ${name} is ${JSON.stringify(value)}: true, a number, an array or undefined`);
    }
    const end = source.indexOf("\n");
    return source.slice(0, end + 1) + lines.join("\n") + (lines.length > 0 ? "\n" : "") + source.slice(end + 1);
}
