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
        gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 5, gl.RGBA8, size, size, 64);
        for (let i = 0; i < columns; i++) {
            gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, i, size, size, 1, gl.RGBA,
                gl.UNSIGNED_BYTE,
                imageCtx.getImageData(i * size, 0, (i + 1) * size, size));
        }
        gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_NEAREST);
        gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.REPEAT);
        gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
        return new TextureArray(texture, size);
    }

    /**
     * @param {WebGLRenderingContext} gl
     * @param {number} textureUnit 
     * @param {number} idx
     */
    bind(gl) {
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

    generate(shadowStart, shadowEnd, alphaStart, alphaEnd, r, g, b) {
        const size = this.#size;
        const imageDataArray = Array(21);
        const shadowLen = shadowEnd - shadowStart;
        const shadowLenInPixelsOnImage = shadowEnd * size;
        const alphaRange = alphaEnd - alphaStart;

        const empty = new ImageData(size, size);
        const left = new ImageData(size, size);
        const down = new ImageData(size, size);

        const pixel = new Uint8Array([r, g, b, 0]);        

        for (let x = 0; x < shadowLenInPixelsOnImage; x++) {
            let res = this.#smoothstep(shadowStart, shadowEnd, x / size);
            let val = (1.0 - res) * alphaRange + alphaStart;
            pixel[3] = val;
            for (let y = 0; y < size; y++) {
                this.#setPixel(left, x, y, pixel);
                this.#setPixel(down, y, size - x - 1, pixel);
            }
        }

        const corner0 = new ImageData(size, size);
        for (let x = 0; x < size; x++) {
            for (let y = 0; y < size; y++) {
                const a0 = this.#getA(left, x, y);
                const a1 = this.#getA(down, x, y);
                pixel[3] = Math.min(a0, a1);
                this.#setPixel(corner0, x, y, pixel);
            }
        }

        const cross0 = new ImageData(size, size);
        for (let x = 0; x < size; x++) {
            for (let y = 0; y < size; y++) {
                const a0 = this.#getA(left, x, y);
                const a1 = this.#getA(down, x, y);
                pixel[3] = Math.max(a0, a1);
                this.#setPixel(cross0, x, y, pixel);
            }
        }

        imageDataArray[0] = empty;
        imageDataArray[1] = corner0;
        imageDataArray[2] = left;
        imageDataArray[3] = down;
        imageDataArray[4] = cross0;

        for (let r = 1; r <= 3; r++) {
            for (let i = 0; i < 5; i++) {
                imageDataArray[r * 5 + i] = empty;
                imageDataArray[r * 5 + i] = new ImageData(size, size);
                imageDataArray[r * 5 + i] = new ImageData(size, size);
                imageDataArray[r * 5 + i] = new ImageData(size, size);
                imageDataArray[r * 5 + i] = new ImageData(size, size);
                for (let x = 0; x < size; x++) {
                    for (let y = 0; y < size; y++) {
                        this.#getPixel(imageDataArray[(r - 1) * 5 + i], x, y, pixel);
                        this.#setPixel(imageDataArray[r * 5 + i], y, size - x - 1, pixel);
                    }
                }
            }
        }
        
        const tmp0 = new Uint8Array([r, g, b, 0]);
        const tmp1 = new Uint8Array([r, g, b, 0]);


        const all = new ImageData(size, size);
        const cross3 = imageDataArray[14];
        for (let x = 0; x < size; x++) {
            for (let y = 0; y < size; y++) {
                const a0 = this.#getA(cross0, x, y);                
                const a1 = this.#getA(cross3, x, y);
                pixel[3] = Math.max(a0, a1);
                this.#setPixel(all, x, y, pixel);
            }
        }

        imageDataArray[20] = all;
        
        for(let data of imageDataArray) {
            for (let y = 0; y < size / 2; y++)
                for (let x = 0; x < size; x++) {
                    this.#getPixel(data, x, y, tmp0);
                    this.#getPixel(data, x, size - y - 1, tmp1);
                    this.#setPixel(data, x, y, tmp1);
                    this.#setPixel(data, x, size - y - 1, tmp0);
                }
        }
        return imageDataArray;
    }


    /**
     * @param {ImageData} data 
     * @param {Uint8Array} pixelData 
     */
    #setPixel(data, x, y, pixelData) {
        const idx = (y * this.#size + x) * 4;
        data.data.set(pixelData, idx);
    }

    /**
     * @param {ImageData} data 
     * @param {Uint8Array} pixelData
     */
    #getPixel(data, x, y, pixelData) {
        const idx = (y * this.#size + x) * 4;
        pixelData[0] = data.data[idx];
        pixelData[1] = data.data[idx + 1];
        pixelData[2] = data.data[idx + 2];
        pixelData[3] = data.data[idx + 3];
    }
    /**
     * @param {ImageData} data 
     */
    #getA(data, x, y) {
        const idx = (y * this.#size + x) * 4;
        return data.data[idx + 3];
    }

    #smoothstep(edge0, edge1, x) {
        let t = (x - edge0) / (edge1 - edge0);
        if (t < 0.0)
            t = 0.0;
        if (t > 1.0)
            t = 1.0;
        return t * t * (3.0 - 2.0 * t);
    }

    /** @param {CanvasRenderingContext2D} ctx */
    applyTo(ctx) {
        ctx.putImageData(this.#ctx2d.getImageData(0, 0, this.#size, this.#size), 0, 0);
    }
}
