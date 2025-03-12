class TextureAtlas {

    #image; #width; #height;
    #size;
    #texture;
    #prepared = false;
    #delta = 0.001;

    /**     
     * @param {HTMLImageElement} image 
     * @param {number} size 
     */
    constructor(image, size) {
        this.#image = image;
        this.#size = size;
        this.#width = image.naturalWidth
        this.#height = image.naturalHeight

    }
    
    /**
     * @param {WebGLRenderingContext} gl 
     */
    prepare(gl){
        this.#texture = gl.createTexture();        
        gl.bindTexture(gl.TEXTURE_2D, this.#texture);
        gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            this.#image,
        );
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        // gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        // gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
        // gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        // gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }

    /**
     * @param {WebGLRenderingContext} gl
     * @param {number} textureUnit 
     */
    bind(gl, textureUnit) {
        gl.activeTexture(gl.TEXTURE0 + textureUnit);
        gl.bindTexture(gl.TEXTURE_2D, this.#texture);
    }

    /**
     * 
     * @param {Float32Array} output 
     * @param {number} texColumn 
     */
    uvRect(output, texColumn) {
        output[0] = (this.#size * texColumn) / this.#width + this.#delta;
        output[1] = this.#delta;
        output[2] = (this.#size * texColumn) / this.#width + this.#delta;
        output[3] = 1 - this.#delta;
        output[4] = (this.#size * (texColumn + 1)) / this.#width - this.#delta;
        output[5] = 1 - this.#delta;
        output[6] = (this.#size * (texColumn + 1)) / this.#width - this.#delta;
        output[7] = this.#delta;
    }
}

export {TextureAtlas}
