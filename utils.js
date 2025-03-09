class ArrayBuffer {
    #pos
    #array

    /**
     * @param {Function} ArrayClass
     * @param {number} initialSize 
     */
    constructor(ArrayClass, initialSize) {        
        this.#pos = 0;
        this.#array = new ArrayClass(initialSize);
    }

    /**
     * @param {ArrayLike<number>} elements 
     */
    add(elements) {
        if (this.#array.length - this.#pos < elements.length) {
            const tmp = this.#array;
            this.#array.slice
            this.#array = new this.#array.constructor(tmp.length * 2);
            this.#array.set(tmp);
            this.add(elements);
        } else {
            this.#array.set(elements, this.#pos);
            this.#pos += elements.length;
        }        
    }

    trimmed() {
        return this.#array.subarray(0, this.#pos);
    }
}

class Float32Buffer extends ArrayBuffer{
    /**
     * @param {number} initialSize 
     */
    constructor(initialSize) {
        super(Float32Array, initialSize);
    }
}

class UInt16Buffer extends ArrayBuffer{
    /**
     * @param {number} initialSize 
     */
    constructor(initialSize) {
        super(Uint16Array, initialSize);
    }
}

export {
    Float32Buffer, UInt16Buffer
}
