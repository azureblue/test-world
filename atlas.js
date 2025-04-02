
class TextureAtlas {

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
        let tex3DCanvas = new OffscreenCanvas(height, width);
        let tex3DCtx = tex3DCanvas.getContext("2d");

        const columns = width / size;
        imageCtx.scale(1, -1);
        imageCtx.drawImage(image, 0, 0, width, -size);
        for (let i = 0; i < columns; i++) {
            tex3DCtx.putImageData(imageCtx.getImageData(i * size, 0, (i + 1) * size, size), 0, i * size);
        }
        const data = tex3DCtx.getImageData(0, 0, height, width);
        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D_ARRAY, texture);
        gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 5, gl.RGBA8, size, size, columns);
        // for (let c = 0; c < columns; c++) {            
        gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, 0, size, size, 4, gl.RGBA,
            gl.UNSIGNED_BYTE,
            data.data);
        // const ext = gl.getExtension("EXT_texture_filter_anisotropic");                
        // const max = gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT);        

        // gl.texParameterf(gl.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, max);
        gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_NEAREST);
        gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
        // }
        return new TextureAtlas(texture, size);
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

export { TextureAtlas };

