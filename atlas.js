import { ImagePixels } from "./utils.js";

class TextureAtlas {

    #size;
    #textures;

    constructor(textures, size) {
        this.#textures = textures;
        this.#size = size;
    }
    
    /**
     * @param {WebGLRenderingContext} gl 
     * @param {HTMLImageElement} image 
     * @param {number} size 
     */
    static create(gl, image, size){
        const width = image.width;
        const height = image.height;                
        let canvas = new OffscreenCanvas(width, height);
        let ctx = canvas.getContext("2d", {
            willReadFrequently: true
        });
        
        ctx.drawImage(image, 0, 0);
        const columns = width / size;
        const textures = [];
        for (let c = 0; c < columns; c++) {
            ctx.getImageData
            const texture = gl.createTexture();        
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.texImage2D(
                gl.TEXTURE_2D,
                0,
                gl.RGBA,
                gl.RGBA,
                gl.UNSIGNED_BYTE,
                ctx.getImageData(c * size, 0, size, size)
            );
            const ext = gl.getExtension("EXT_texture_filter_anisotropic");                
            const max = gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT);        
            
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.texParameterf(gl.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, max);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            gl.generateMipmap(gl.TEXTURE_2D);
            textures.push(texture);
        }

        return new TextureAtlas(textures, size);    
    }

    /**
     * @param {WebGLRenderingContext} gl
     * @param {number} textureUnit 
     * @param {number} idx
     */
    bind(gl, textureUnit, idx) {
        gl.activeTexture(gl.TEXTURE0 + textureUnit);
        gl.bindTexture(gl.TEXTURE_2D, this.#textures[idx]);
    }
}

export {TextureAtlas}
