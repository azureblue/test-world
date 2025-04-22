export class DataBuffer {
    #pos
    array

    /**
     * @param {Function} ArrayClass
     * @param {number} initialSize 
     */
    constructor(ArrayClass, initialSize) {
        this.#pos = 0;
        if (initialSize === undefined) 
            initialSize = 4;
        this.array = new ArrayClass(initialSize);
    }

    /**
     * @param {ArrayLike<number>} elements 
     */
    add(elements) {
        if (this.array.length - this.#pos < elements.length) {
            this.#extendSize();
            this.add(elements);
        } else {
            this.array.set(elements, this.#pos);
            this.#pos += elements.length;            
        }        
    }

    #extendSize() {
        const tmp = this.array;
        this.array.slice;
        this.array = new this.array.constructor(tmp.length * 2);
        this.array.set(tmp);
    }

    /**
     * @param {ArrayLike<number>} elements
     * @param {number} [firstCoord]  
     * @param {number} [secondCoord]  
     * @param {number} [thirdCoord]  
     */
    addTranslated(elements, firstCoord = 0, secondCoord, thirdCoord) {
        if (this.array.length - this.#pos < elements.length) {
            this.#extendSize();
            this.addTranslated(elements, firstCoord, secondCoord, thirdCoord);
        } else {
            this.array.set(elements, this.#pos);
            let stride = 1;
            if (secondCoord !== undefined)
                stride++;
            if (thirdCoord !== undefined)
                stride++;

            if (stride == 1) {
                for (let i = 0; i < elements.length; i++) {
                    this.array[this.#pos + i] += firstCoord;
                }
            } else if (stride == 2) {
                for (let i = 0; i < elements.length; i+=2) {
                    this.array[this.#pos + i] += firstCoord;
                    this.array[this.#pos + i + 1] += secondCoord;
                }
            } else if (stride == 3) {
                for (let i = 0; i < elements.length; i+=3) {
                    this.array[this.#pos + i] += firstCoord;
                    this.array[this.#pos + i + 1] += secondCoord;
                    this.array[this.#pos + i + 2] += thirdCoord;
                }
            }
            this.#pos += elements.length;
        }
    }

    /**
     * @returns {Float32Array | Uint32Array | Uint16Array | Uint8Array}
     */
    trimmed() {
        return this.array.subarray(0, this.#pos);
    }

    reset(size = 0) {
        this.#pos = 0;
        if (size !== 0) {
            this.array = new this.array.constructor(size);
        }
    }

    get length() {
        return this.#pos;
    }
}

export class Float32Buffer extends DataBuffer {
    /**
     * @param {number} [initialSize]
     */
    constructor(initialSize) {
        super(Float32Array, initialSize);
    }
}

export class UInt16Buffer extends DataBuffer {
    /**
     * @param {number} initialSize 
     */
    constructor(initialSize) {
        super(Uint16Array, initialSize);
    }
}

export class UInt32Buffer extends DataBuffer {
    /**
     * @param {number} initialSize 
     */
    constructor(initialSize) {
        super(Uint32Array, initialSize);
    }
}

export class Resources {
    static async loadText(src) {
        return await fetch(Resources.relativeToRoot(src)).then(r => r.text())
    }

    /**
     * @param {string} src 
     * @returns {Promise<HTMLImageElement>}
     */
    static loadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();            
            img.onload = () => resolve(img);
            img.onerror = (err) => reject(err);            
            img.src = Resources.relativeToRoot(src);
        });
    }

    static #ROOT = new URL('.', import.meta.url).href;
    static relativeToRoot(src) {
        return this.#ROOT + src;
    }
}

export class ImagePixels {

    #rowLength;
    #data;
    #stride = 4;

    /**
     * 
     * @param {ImageData} data 
     */
    constructor(data) {
        this.#data = data;        
        this.#rowLength = this.width * this.#stride;
    }

    /**
     * @param {HTMLImageElement} image 
     * @returns {ImagePixels}
     */
    static from(image) {
        const width = image.width;
        const height = image.height;                
        let canvas = new OffscreenCanvas(width, height);
        let ctx = canvas.getContext("2d");
        ctx.drawImage(image,0, 0);
        let data = ctx.getImageData(0, 0, width, height);
        return new ImagePixels(data, width, height);
    }

    get width() {
        return this.#data.width;
    }

    get height() {
        return this.#data.height;
    }

    /**
     * 
     * @param {number} x 
     * @param {number} y 
     */
    getR(x, y) {
        return this.#data.data[this.#rowLength * y + x * this.#stride];
    }

    /**
     * 
     * @param {number} x 
     * @param {number} y 
     * @param {number} w
     * @param {number} h
     * @param {ArrayLike} out
     * 
     */
    getRectR(x, y, w, h, out) {        
        for (let oy = 0; oy < h; oy++) 
            for (let ox = 0; ox < w; ox++) 
                out[oy * w + ox] = this.#data.data[this.#rowLength * y + x * this.#stride];
    }
}

export class Array3D {
    #planeSize
    #size
    #height
    data

    constructor(width, height) {
        this.#size = width | 0;
        this.#height = height | 0;
        this.#planeSize = (width * width) | 0;
        this.data = new Uint32Array(this.#planeSize * height);
    }

    set(h, x, y, v) {
        this.data[this.#planeSize * h + y * this.#size + x] = v;
    }

    get(h, x, y) {
        return this.data[this.#planeSize * h + y * this.#size + x];
    }

    fill(v) {
        this.data.fill(v);
    }

    index(h, x, y) {
        return this.#planeSize * h + y * this.#size + x;
    }
    
    /**
     * @param {number} h 
     * @param {number} x 
     * @param {number} y 
     * @param {Uint32Array} array 
     * @param {number} len 
     */
    put(h, x, y, array, len ) {
        const startIdx = this.#planeSize * h + y * this.#size + x;
        for (let i = 0; i < len; i++) {
            this.data[startIdx + i] = array[i];
        }
    }

    /**
     * @param {number} h 
     * @param {number} x 
     * @param {number} y 
     * @param {Uint32Array} array 
     * @param {number} len 
     */
    fetch(h, x, y, array, len ) {
        const startIdx = this.#planeSize * h + y * this.#size + x;
        for (let i = 0; i < len; i++) {
            array[i] = this.data[startIdx + i];
        }
    }

}

export class Cube27 {
    data = new Uint32Array(27);
    set(dh, dx, dy, v) {
        this.data[12 + 9 * dh + 3 * dy + dx] = v;
    }

    get(dh, dx, dy) {
        return this.data[12 + 9 * dh + 3 * dy + dx];
    }
}

export class Array2D {
    #width
    #data
    constructor(width, height = width) {
        this.#width = width;
        this.#data = new Uint32Array(width * height);
    }

    fill(v) {
        this.#data.fill(v);
    }

    get(x, y) {
        return this.#data[y * this.#width + x];
    }

    set(x, y, v) {
        this.#data[y * this.#width + x] = v;
    }

    /**
     * @param {number} x 
     * @param {number} y 
     * @param {Uint32Array} array 
     * @param {number} len 
     */
    put(x, y, array, len ) {
        const startIdx = y * this.#width + x;
        for (let i = 0; i < len; i++) {
            this.#data[startIdx + i] = array[i];
        }
    }

    /**
     * @param {number} x 
     * @param {number} y 
     * @param {Uint32Array} array 
     * @param {number} len 
     */
    fetch(x, y, array, len ) {
        const startIdx = y * this.#width + x;
        for (let i = 0; i < len; i++) {
            array[i] = this.#data[startIdx + i];
        }
    }

    /**
     * @param {number} y 
     * @param {Uint32Array} output 
     */
    getRow(y, output) {
        const offset = y * this.#width;
        for (let i = 0; i < this.#width; i++)
            output[i] = this.#data[offset + i];
    }   
    
    each(consumer) {
        this.#data.forEach((v, idx) => {
            consumer(idx % this.#width, Math.floor(idx / this.#width), v);
        });
    }
}

export function is2Pow(n) {
    return (n & (n - 1)) === 0;
}
