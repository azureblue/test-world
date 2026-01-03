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
    constructor(ArrayClass, initialSize) {
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
    #size
    #height
    data

    /**
     * @param {number} size 
     * @param {number} height 
     */
    constructor(size, height) {
        this.#size = size | 0;
        this.#height = height | 0;
        this.#planeSize = (size * size) | 0;
        this.data = new Uint32Array((this.#planeSize * height));
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

    rowIdx(h, y) {
        return this.#planeSize * h + y * this.#size;
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
    fetch(h, x, y, array, len) {
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

const LOG_LEVEL_ERROR = 0;
const LOG_LEVEL_WARN = 1;
const LOG_LEVEL_INFO = 2;
const LOG_LEVEL_DEBUG = 3;

export class Logger {
    #name;
    static #logFunctions = [
        console.error,
        console.warn,
        console.info,
        console.debug
    ]

    static #logLevel = 2;

    constructor(name) {
        this.#name = name;
    }

    /**
     * @param {string} msg 
     */
    error(msg) {
        this.#log(msg, LOG_LEVEL_ERROR);
    }

    /**
     * @param {string} msg 
     */
    debug(msg) {
        this.#log(msg, LOG_LEVEL_DEBUG);
    }

    /**
     * @param {string} msg 
     */
    warn(msg) {
        this.#log(msg, LOG_LEVEL_WARN);
    }

    /**
     * @param {string} msg 
     */
    info(msg) {
        this.#log(msg, LOG_LEVEL_INFO);
    }

    #log(msg, level) {
        if (level < Logger.#logLevel) {
            Logger.#logFunctions[level](this.#prepareMsg(msg));
        }
    }

    #prepareMsg(msg) {
        return `${this.#name}: ${msg}`;
    }
}

export function perfDiff(startTime, precision = 2) {
    return (performance.now() - startTime).toPrecision(precision);
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
