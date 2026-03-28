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

    /**
     * @param {number} elements 
     */
    put(element) {
        if (this.array.length - this.#pos < 1) {
            this.#extendSize();
            this.put(element);
        } else {
            this.array[this.#pos] = element;
            this.#pos++;
        }
    }

    get(idx) {
        return this.array[idx];
    }

    #extendSize() {
        const tmp = this.array;
        this.array = new this.array.constructor(tmp.length * 2);
        this.array.set(tmp);
    }

    /**
     * @returns {Float32Array | Uint32Array | Uint16Array | Uint8Array}
     */
    trimmed() {
        return new this.array.constructor(this.array.subarray(0, this.#pos));
    }

    view() {
        return this.array.subarray(0, this.#pos);
    }

    reset(size = 0) {
        this.#pos = 0;
        if (size !== 0) {
            this.array = new this.array.constructor(size);
        }
    }

    *[Symbol.iterator]() {
        for (let i = 0; i < this.#pos; i++)
            yield this.array[i];
    }

    get length() {
        return this.#pos;
    }
}

export function checkParseInt(str) {
    const val = parseInt(str);
    if (isNaN(val)) {
        throw new Error(`Cannot parse integer from string: ${str}`);
    }
    return val;
}

export class Float32Buffer extends DataBuffer {
    /**
     * @param {number} [initialSize]
     */
    constructor(initialSize) {
        super(Float32Array, initialSize);
    }
}

export class Float64Buffer extends DataBuffer {
    /**
     * @param {number} [initialSize]
     */
    constructor(initialSize) {
        super(Float64Array, initialSize);
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

export class Int32Buffer extends DataBuffer {
    /**
     * @param {number} initialSize 
     */
    constructor(initialSize) {
        super(Int32Array, initialSize);
    }
}

export class Resources {
    static async loadText(src) {
        return await fetch(Resources.relativeToRoot(src)).then(r => r.text())
    }

    /**
     * @param {string} src 
     * @returns {Promise<ImageBitmap>}
     */
    static async loadImage(src) {
        const res = await fetch(Resources.relativeToRoot(src));
        const blob = await res.blob();
        const bitmap = await createImageBitmap(blob);
        return bitmap;
    }

    static #ROOT = new URL('.', import.meta.url).href;
    static relativeToRoot(src) {
        return this.#ROOT + src;
    }
}

/**
 * @template T
 */
export class GenericBuffer {
    #pos
    array

    /**
     * @param {number} initialSize 
     */
    constructor(initialSize) {
        this.#pos = 0;
        if (initialSize === undefined)
            initialSize = 4;
        this.array = new Array(initialSize);
    }

    /**
     * @param {ArrayLike<T>} elements 
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

    /**
     * @param {number} elements 
     */
    put(element) {
        if (this.array.length - this.#pos < 1) {
            this.#extendSize();
            this.put(element);
        } else {
            this.array[this.#pos] = element;
            this.#pos++;
        }
    }

    #extendSize() {
        this.array.length = this.array.length * 2;
    }

    /**
     * @returns {Array<T>}
     */
    trimmed() {
        return this.array.slice(0, this.#pos);
    }

    reset(size = 0) {
        this.#pos = 0;
        if (size !== 0) {
            this.array.length = size;
        }
    }

    /**
     * @generator
     * @yields {T} - Iterates over the elements in the buffer.
     */
    *[Symbol.iterator]() {
        for (let i = 0; i < this.#pos; i++)
            yield this.array[i];
    }

    /** @returns {T} */
    get(idx) {
        return this.array[idx];
    }

    get length() {
        return this.#pos;
    }
}

export function i32a(...elements) {
    return new Int32Array(elements);
}

export class MovingAverage {
    constructor(size = 10) {
        this.times = new Array(size).fill(0);
        this.fill = 0;
        this.timesIdx = 0;
        this.timesSum = 0;
    }
    add(value) {
        this.timesSum -= this.times[this.timesIdx];
        if (this.fill < this.times.length)
            this.fill++;
        this.times[this.timesIdx] = value;
        this.timesSum += value;
        this.timesIdx = (this.timesIdx + 1) % this.times.length;
    }
    average() {
        if (this.fill === 0)
            return 0;
        return this.timesSum / this.fill;
    }
}

export class ImagePixels {

    #rowLength;
    #data;
    #stride = 4;

    /**
     * @param {ImageData} data 
     */
    constructor(data) {
        this.#data = data;
        this.#rowLength = this.width * this.#stride;
    }

    /**
     * @param {CanvasImageSource} image 
     * @returns {ImagePixels}
     */
    static from(image) {
        const width = image.width;
        const height = image.height;
        let canvas = new OffscreenCanvas(width, height);
        let ctx = canvas.getContext("2d");
        ctx.drawImage(image, 0, 0);
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
    #xSize
    #ySize
    #zSize
    data

    /**
     * @param {number} xSize 
     * @param {number} ySize 
     * @param {number} zSize 
     * @param {Uint32Array} [data]
     */
    constructor(xSize, ySize, zSize, data = null) {
        this.#xSize = xSize | 0;
        this.#ySize = ySize | 0;
        this.#zSize = zSize | 0;
        this.#planeSize = (xSize * ySize) | 0;        
        if (data !== null) {
            if (data.length !== this.#planeSize * this.#zSize) 
                throw new Error(`Data length ${data.length} does not match expected size ${this.#planeSize * this.#zSize}`);
            this.data = data;
        } else {
            this.data = new Uint32Array(this.#planeSize * this.#zSize);
        }
    }

    setHXY(h, x, y, v) {
        this.data[this.#planeSize * h + y * this.#xSize + x] = v;
    }

    setXYZ(x, y, z, v) {
        this.data[this.#planeSize * z + y * this.#xSize + x] = v;
    }

    getHXY(h, x, y) {
        return this.data[this.#planeSize * h + y * this.#xSize + x];
    }

    getXYZ(x, y, z) {
        return this.data[this.#planeSize * z + y * this.#xSize + x];
    }

    fill(v) {
        this.data.fill(v);
    }

    index(h, x, y) {
        return this.#planeSize * h + y * this.#xSize + x;
    }

    rowIdx(h, y) {
        return this.#planeSize * h + y * this.#xSize;
    }

    planeIdx(h) {
        return this.#planeSize * h;
    }

    /**
     * @param {number} h 
     * @param {number} x 
     * @param {number} y 
     * @param {Uint32Array} array 
     * @param {number} len 
     */
    put(h, x, y, array, len) {        
        const startIdx = this.#planeSize * h + y * this.#xSize + x;
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
    fetch(h, x, y, array, len) {
        const startIdx = this.#planeSize * h + y * this.#xSize + x;
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
    data
    constructor(width, height = width) {
        this.#width = width;
        this.data = new Uint32Array(width * height);
    }

    fill(v) {
        this.data.fill(v);
    }

    get(x, y) {
        return this.data[y * this.#width + x];
    }

    set(x, y, v) {
        this.data[y * this.#width + x] = v;
    }

    /**
     * @param {number} x 
     * @param {number} y 
     * @param {Uint32Array} array 
     * @param {number} len 
     */
    put(x, y, array, len) {
        const startIdx = y * this.#width + x;
        for (let i = 0; i < len; i++) {
            this.data[startIdx + i] = array[i];
        }
    }

    rowIdx(y) {
        return y * this.#width;
    }

    /**
     * @param {number} x 
     * @param {number} y 
     * @param {Uint32Array} array 
     * @param {number} len 
     */
    fetch(x, y, array, len) {
        const startIdx = y * this.#width + x;
        for (let i = 0; i < len; i++) {
            array[i] = this.data[startIdx + i];
        }
    }

    /**
     * @param {number} y 
     * @param {Uint32Array} output 
     */
    getRow(y, output) {
        const offset = y * this.#width;
        for (let i = 0; i < this.#width; i++)
            output[i] = this.data[offset + i];
    }

    each(consumer) {
        this.data.forEach((v, idx) => {
            consumer(idx % this.#width, Math.floor(idx / this.#width), v);
        });
    }
}

export function is2Pow(n) {
    return (n & (n - 1)) === 0;
}

export function logHash(buffer, msg = "") {
    crypto.subtle.digest("SHA-1", buffer).then(hashBuffer => {
        const hashHex = (Array.from(new Uint8Array(hashBuffer)))
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");
        console.info("data hash: " + hashHex + " " + msg);
    });
}

export function perfDiffStr(startTime, precision = 2) {
    return (performance.now() - startTime).toPrecision(precision);
}

export function perfDiff(startTime) {
    return (performance.now() - startTime);
}

/**
 * @param {string} value 
 * @param {string} [type] 
 */
export function stringToBlobURL(value, type = "") {
    return URL.createObjectURL(new Blob([value], { type: type }));
}

export class Replacer {
    static replace(source, replaceMap, { keepComments = false, commentPrefix = '@' } = {}) {
        function escapeRegExp(text) {
            return text.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&');
        }

        const tokenPattern = '(?:\'[^\']*\'|"[^"]*"|`[^`]*`|[-+]?\\d*\\.\\d+|[-+]?\\d+(?:e[-+]?\\d+)?|true|false|null)';
        const commentPattern = `/\\*\\s*${escapeRegExp(commentPrefix)}(\\w+)\\s*\\*/`;
        const fullPattern = new RegExp(`(${tokenPattern})\\s*${commentPattern}`, 'gi');

        return source.replace(fullPattern, (fullMatch, token, key) => {
            if (!token) {
                console.warn(`Warning: No valid token found before key '${key}'.`);
                return fullMatch;
            }
            if (!(key in replaceMap)) {
                console.warn(`Warning: Key '${key}' not found in values map.`);
                return fullMatch;
            }
            const replacement = replaceMap[key];
            if (typeof replacement !== 'string') {
                console.warn(`Warning: Value for key '${key}' is not a string.`);
                return fullMatch;
            }
            return keepComments ? `${replacement} /*${commentPrefix}${key}*/` : replacement;
        });
    }
}

/**
 * Writes a slightly padded wireframe cube directly into a Float32Array for gl.LINES.
 * @param {Float32Array} target - Must have length 72 (24 vertices × 3 floats)
 * @param {number} x - Cube world X
 * @param {number} y - Cube world Y
 * @param {number} z - Cube world Z
 * @param {number} size - Cube size (default 1)
 * @param {number} pad - Padding to push lines outward (default 0.01)
 */
export function writeVoxelWireframe(target, x, y, z, size = 1, pad = 0.001) {
    const x0 = x - pad, y0 = y - pad, z0 = z - pad;
    const x1 = x + size + pad * 2, y1 = y + size + pad * 2, z1 = z + size + pad * 2;

    let i = 0;

    // Bottom face
    target[i++] = x0; target[i++] = y0; target[i++] = z0;
    target[i++] = x1; target[i++] = y0; target[i++] = z0;

    target[i++] = x1; target[i++] = y0; target[i++] = z0;
    target[i++] = x1; target[i++] = y0; target[i++] = z1;

    target[i++] = x1; target[i++] = y0; target[i++] = z1;
    target[i++] = x0; target[i++] = y0; target[i++] = z1;

    target[i++] = x0; target[i++] = y0; target[i++] = z1;
    target[i++] = x0; target[i++] = y0; target[i++] = z0;

    // Top face
    target[i++] = x0; target[i++] = y1; target[i++] = z0;
    target[i++] = x1; target[i++] = y1; target[i++] = z0;

    target[i++] = x1; target[i++] = y1; target[i++] = z0;
    target[i++] = x1; target[i++] = y1; target[i++] = z1;

    target[i++] = x1; target[i++] = y1; target[i++] = z1;
    target[i++] = x0; target[i++] = y1; target[i++] = z1;

    target[i++] = x0; target[i++] = y1; target[i++] = z1;
    target[i++] = x0; target[i++] = y1; target[i++] = z0;

    // Vertical edges
    target[i++] = x0; target[i++] = y0; target[i++] = z0;
    target[i++] = x0; target[i++] = y1; target[i++] = z0;

    target[i++] = x1; target[i++] = y0; target[i++] = z0;
    target[i++] = x1; target[i++] = y1; target[i++] = z0;

    target[i++] = x1; target[i++] = y0; target[i++] = z1;
    target[i++] = x1; target[i++] = y1; target[i++] = z1;

    target[i++] = x0; target[i++] = y0; target[i++] = z1;
    target[i++] = x0; target[i++] = y1; target[i++] = z1;
}

export const Arrays = {
    median(array) {
        const sorted = Array.from(array).sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    },
    min(array) {
        let min = Infinity;
        for (const value of array) {
            if (value < min) min = value;
        }
        return min;
    },
    max(array) {
        let max = -Infinity;
        for (const value of array) {
            if (value > max) max = value;
        }
        return max;
    },
    average(array) {
        let sum = 0;
        for (const value of array) {
            sum += value;
        }
        return sum / array.length;
    }
}

Object.freeze(Arrays);


/**
 * @param {ArrayBuffer} source 
 * @param {ArrayBuffer} target 
 * @param {number} byteTargetOffset - Offset in the target buffer to start copying to (default 0)
 */
export function copyData(source, target, byteTargetOffset = 0) {
    const sourceView = new Uint8Array(source);
    const targetView = new Uint8Array(target, byteTargetOffset);
    targetView.set(sourceView);
}

export class FixedSizeMap {
    #map;
    #keys;
    #maxSize;
    #nextIndex = 0;
    #count = 0;

    constructor(maxSize) {
        this.#map = new Map();
        this.#keys = new Array(maxSize);
        this.#maxSize = maxSize;
    }

    set(key, value) {
        if (this.#count === this.#maxSize) {
            this.#map.delete(this.#keys[this.#nextIndex]);
        } else {
            this.#count++;
        }

        this.#keys[this.#nextIndex] = key;
        this.#map.set(key, value);

        this.#nextIndex++;
        if (this.#nextIndex === this.#maxSize) {
            this.#nextIndex = 0;
        }
    }

    get(key) {
        return this.#map.get(key);
    }
}