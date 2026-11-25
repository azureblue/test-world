/**
 * A multisampled framebuffer (colour and depth) the size of the canvas: the frame is drawn into it ({@link bind}) and
 * its samples averaged into the canvas ({@link resolve}). The sample count is ours to choose: the context's own
 * multisampling (antialias: true) is the browser's choice, usually 4.
 */
export class MultisampleTarget {
    /** @type {WebGL2RenderingContext} */
    #gl;
    /** @type {WebGLFramebuffer} */
    #framebuffer;
    #width;
    #height;
    /** the samples per pixel
     * @type {number} */
    samples;

    /**
     * @param {WebGL2RenderingContext} gl
     * @param {number} samples the samples per pixel asked for, at least 2: the GPU's highest count up to it is used
     *   (WebGL 2 has at least 4)
     * @returns {MultisampleTarget}
     */
    static create(gl, samples) {
        // the canvas's colour format: resolving into it needs the same (RGB8 for a context without alpha)
        const format = gl.getContextAttributes().alpha ? gl.RGBA8 : gl.RGB8;
        // the counts the GPU has for the colour format, highest first
        const supported = gl.getInternalformatParameter(gl.RENDERBUFFER, format, gl.SAMPLES);
        const count = Array.from(supported).find(s => s <= samples);
        if (count === undefined || count < 2)
            throw new Error(`no multisampling with up to ${samples} samples, the GPU has ${Array.from(supported)}`);
        return new MultisampleTarget(gl, count, format);
    }

    /**
     * Use {@link MultisampleTarget.create}.
     * @param {WebGL2RenderingContext} gl
     * @param {number} samples
     * @param {GLenum} format the colour format
     */
    constructor(gl, samples, format) {
        this.#gl = gl;
        this.samples = samples;
        this.#width = gl.drawingBufferWidth;
        this.#height = gl.drawingBufferHeight;
        this.#framebuffer = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.#framebuffer);
        for (const [bufferFormat, attachment] of [[format, gl.COLOR_ATTACHMENT0], [gl.DEPTH_COMPONENT24, gl.DEPTH_ATTACHMENT]]) {
            const buffer = gl.createRenderbuffer();
            gl.bindRenderbuffer(gl.RENDERBUFFER, buffer);
            gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, bufferFormat, this.#width, this.#height);
            gl.framebufferRenderbuffer(gl.FRAMEBUFFER, attachment, gl.RENDERBUFFER, buffer);
        }
        const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
        gl.bindRenderbuffer(gl.RENDERBUFFER, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        if (status !== gl.FRAMEBUFFER_COMPLETE)
            throw new Error(`multisampled framebuffer (${samples} samples) incomplete: 0x${status.toString(16)}`);
    }

    /** draws go to it from now: before the frame's clear */
    bind() {
        this.#gl.bindFramebuffer(this.#gl.FRAMEBUFFER, this.#framebuffer);
    }

    /** averages the samples into the canvas, at the frame's end; draws go to the canvas after it */
    resolve() {
        const gl = this.#gl, width = this.#width, height = this.#height;
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.#framebuffer);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
        gl.blitFramebuffer(0, 0, width, height, 0, 0, width, height, gl.COLOR_BUFFER_BIT, gl.NEAREST);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
}
