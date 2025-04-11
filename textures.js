import { is2Pow } from "./utils.js";

export class TextureArray {

    #size;
    #texture;

    constructor(texture, size) {
        this.#texture = texture;
        this.#size = size;
    }

    /**
     * @param {WebGL2RenderingContext} gl 
     * @param {HTMLImageElement} image 
     * @param {number} size 
     */
    static create(gl, image, size) {
        const width = image.width;
        const height = image.height;
        let imageCanvas = new OffscreenCanvas(width, height);
        let imageCtx = imageCanvas.getContext("2d", { willReadFrequently: true });
        if (!is2Pow(size))
            throw "invalid size";
        const columns = Math.floor(width / size);
        imageCtx.scale(1, -1);
        imageCtx.drawImage(image, 0, 0, width, -size);
        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D_ARRAY, texture);
        gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 5, gl.RGBA8, size, size, columns);
        // for (let c = 0; c < columns; c++) {            
        for (let i = 0; i < columns; i++) {
            gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, i, size, size, 1, gl.RGBA,
                gl.UNSIGNED_BYTE,
                imageCtx.getImageData(i * size, 0, (i + 1) * size, size));
        }
        // const ext = gl.getExtension("EXT_texture_filter_anisotropic");                
        // const max = gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT);        

        // gl.texParameterf(gl.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, max);
        gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_NEAREST);
        gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
        // }
        return new TextureArray(texture, size);
    }

    /**
     * @param {WebGLRenderingContext} gl
     * @param {number} textureUnit 
     * @param {number} idx
     */
    bind(gl, textureUnit, idx) {
        gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.#texture);
    }
}

export class EdgeShadowGenerator {

    #canvas
    #ctx2d
    #size

    constructor(size) {
        this.#size = size;
        this.#canvas = new OffscreenCanvas(size, size);
        this.#ctx2d = this.#canvas.getContext("2d");
    }

    generate(shadowStart, shadowEnd) {
        const data = new ImageData(this.#size, this.#size);
        const shadowLen = shadowEnd - shadowStart;
        const shadowLenInPixels = shadowLen * this.#size;
        const shadowLenInPixelsOnImage = shadowEnd * this.#size;
        for (let x = 0; x < shadowLenInPixelsOnImage; x++) {
            let res = this.#smoothstep(0, shadowEnd, x / this.#size);
            let val = res * 255.0;
            for (let y = 0; y < this.#size; y++) {
                this.#setPixel(data, x, y, 0, 0, 0, val);
            }
        }
        this.#ctx2d.putImageData(data, 0, 0);        
    }

    
    /**
     * @param {ImageData} data 
     */
    #setPixel(data, x, y, r, g, b, a) {
        const idx = (y * this.#size + x) * 4;
        data.data[idx] = r;
        data.data[idx + 1] = g;
        data.data[idx + 2] = b;
        data.data[idx + 3] = a;
    }

    #smoothstep(edge0, edge1, x) {
        let t = (x - edge0) / (edge1 - edge0);
        if (t < 0.0)
            t = 0.0;
        if (t > 1.0)
            t = 1.0;
        return t * t * (3.0 - 2.0 * t);
    }
}

