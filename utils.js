class DataBuffer {
    #pos
    #array

    /**
     * @param {Function} ArrayClass
     * @param {number} initialSize 
     */
    constructor(ArrayClass, initialSize) {
        this.#pos = 0;
        if (initialSize === undefined) 
            initialSize = 4;
        this.#array = new ArrayClass(initialSize);
    }

    /**
     * @param {ArrayLike<number>} elements 
     */
    add(elements) {
        if (this.#array.length - this.#pos < elements.length) {
            this.extendSize();
            this.add(elements);
        } else {
            this.#array.set(elements, this.#pos);
            this.#pos += elements.length;            
        }
        
    }

    extendSize() {
        const tmp = this.#array;
        this.#array.slice;
        this.#array = new this.#array.constructor(tmp.length * 2);
        this.#array.set(tmp);
    }

    /**
     * @param {ArrayLike<number>} elements
     * @param {number} [firstCoord]  
     * @param {number} [secondCoord]  
     * @param {number} [thirdCoord]  
     */
    addTranslated(elements, firstCoord = 0, secondCoord, thirdCoord) {
        if (this.#array.length - this.#pos < elements.length) {
            this.extendSize();
            this.addTranslated(elements, firstCoord, secondCoord, thirdCoord);
        } else {
            this.#array.set(elements, this.#pos);
            let stride = 1;
            if (secondCoord !== undefined)
                stride++;
            if (thirdCoord !== undefined)
                stride++;

            if (stride == 1) {
                for (let i = 0; i < elements.length; i++) {
                    this.#array[this.#pos + i] += firstCoord;
                }
            } else if (stride == 2) {
                for (let i = 0; i < elements.length; i+=2) {
                    this.#array[this.#pos + i] += firstCoord;
                    this.#array[this.#pos + i + 1] += secondCoord;
                }
            } else if (stride == 3) {
                for (let i = 0; i < elements.length; i+=3) {
                    this.#array[this.#pos + i] += firstCoord;
                    this.#array[this.#pos + i + 1] += secondCoord;
                    this.#array[this.#pos + i + 2] += thirdCoord;
                }
            }
            this.#pos += elements.length;
        }
    }

    /**
     * 
     * @returns {Float32Array | Uint16Array}
     */
    trimmed() {
        return this.#array.subarray(0, this.#pos);
    }

    get length() {
        return this.#pos;
    }
}

class Float32Buffer extends DataBuffer {
    /**
     * @param {number} [initialSize]
     */
    constructor(initialSize) {
        super(Float32Array, initialSize);
    }
}

class UInt16Buffer extends DataBuffer {
    /**
     * @param {number} initialSize 
     */
    constructor(initialSize) {
        super(Uint16Array, initialSize);
    }
}

class Resources {
    static async loadText(src) {
        return await fetch(src).then(r => r.text())
    }

    /**
     * 
     * @param {string} src 
     * @returns {Promise<HTMLImageElement>}
     */
    static loadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();            
            img.onload = () => resolve(img);
            img.onerror = (err) => reject(err);
            img.src = src;
        });
    }
}

class ImagePixels {

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
}



export {
    Float32Buffer, UInt16Buffer, ImagePixels, Resources
}
