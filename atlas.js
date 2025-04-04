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
        let imageCtx = imageCanvas.getContext("2d");
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
            gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, i, size, size, 1 , gl.RGBA,
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

