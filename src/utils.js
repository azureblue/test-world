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
        this.array.slice;
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

export class Int64 {
    static ZERO = Int64.fromNumber(0);
    constructor(low = 0, high = 0) {
        this.low = low | 0;
        this.high = high | 0;
    }

    static fromNumber(n) {
        return new Int64(n | 0, (n / 4294967296) | 0);
    }

    static fromBits(low, high) {
        return new Int64(low, high);
    }

    static fromBigInt(b) {
        const l = Number(b & 0xFFFFFFFFn);
        const h = Number((b >> 32n) & 0xFFFFFFFFn);
        return new Int64(l, h << 0); // cast to signed 32-bit
    }

    set(low, high) {
        this.low = low | 0;
        this.high = high | 0;
        return this;
    }

    toNumber() {
        return this.high * 4294967296 + (this.low >>> 0);
    }

    toBigInt() {
        return (BigInt(this.high) << 32n) | BigInt(this.low >>> 0);
    }

    toString() {
        return this.toBigInt().toString();
    }

    isZero() {
        return (this.low | this.high) === 0;
    }

    clone() {
        return new Int64(this.low, this.high);
    }

    neg_n() {
        const low = (~this.low + 1) | 0;
        const high = (~this.high + (low === 0 ? 1 : 0)) | 0;
        return new Int64(low, high);
    }

    add_n(b) {
        const a = this;
        const l = (a.low >>> 0) + (b.low >>> 0);
        const carry = l > 0xFFFFFFFF ? 1 : 0;
        const h = (a.high + b.high + carry) | 0;
        return new Int64(l | 0, h);
    }

    /**
     * @param {Int64} b 
     * @param {Int64} dst 
     * @returns 
     */
    add(b, dst) {
        const l = (this.low >>> 0) + (b.low >>> 0);
        const carry = l > 0xFFFFFFFF ? 1 : 0;
        return dst.set(l, this.high + b.high + carry);
    }

    sub_n(b) {
        const l = (this.low >>> 0) - (b.low >>> 0);
        const borrow = l < 0 ? 1 : 0;
        const h = (this.high - b.high - borrow) | 0;
        return new Int64(l | 0, h);
    }

    and_n(b) {
        return new Int64(this.low & b.low, this.high & b.high);
    }

    /**
     * @param {Int64} b 
     * @param {Int64} dst 
     * @returns 
     */
    and(b, dst) {
        return dst.set(this.low & b.low, this.high & b.high);
    }

    or_n(b) {
        return new Int64(this.low | b.low, this.high | b.high);
    }

    xor_n(b) {
        return new Int64(this.low ^ b.low, this.high ^ b.high);
    }

    /**
     * @param {Int64} b 
     * @param {Int64} dst 
     * @returns 
     */
    xor(b, dst) {
        return dst.set(this.low ^ b.low, this.high ^ b.high);
    }

    shiftLeft_n(n) {
        n &= 63;
        if (n === 0) return this.clone();
        if (n < 32) {
            const low = this.low << n;
            const high = (this.high << n) | (this.low >>> (32 - n));
            return new Int64(low, high);
        }
        return new Int64(0, this.low << (n - 32));
    }

    shiftRight_n(n) {
        n &= 63;
        if (n === 0) return this.clone();
        if (n < 32) {
            const low = (this.low >>> n) | (this.high << (32 - n));
            const high = this.high >> n;
            return new Int64(low, high);
        }
        const high = this.high >> 31;
        return new Int64(this.high >> (n - 32), high);
    }

    /**
   * @param {Int64} b 
   * @param {Int64} dst 
   * @returns 
   */
    shiftRight(n, dst) {
        n &= 63;
        if (n === 0) {
            return dst.set(this.low, this.high);
        }
        if (n < 32) {
            const low = (this.low >>> n) | (this.high << (32 - n));
            const high = this.high >> n;
            return dst.set(low, high);
        }
        const high = this.high >> 31;
        return dst.set(this.high >> (n - 32), high);

    }

    equals(b) {
        return this.low === b.low && this.high === b.high;
    }

    compare(b) {
        return this.high === b.high
            ? (this.low >>> 0) - (b.low >>> 0)
            : this.high - b.high;
    }

    mul_n(b) {
        const aLow = this.low >>> 0, aHigh = this.high | 0;
        const bLow = b.low >>> 0, bHigh = b.high | 0;

        const aLowL = aLow & 0xFFFF, aLowH = aLow >>> 16;
        const bLowL = bLow & 0xFFFF, bLowH = bLow >>> 16;

        const lo = Math.imul(aLowL, bLowL);

        const mid = Math.imul(aLowL, bLowH) + Math.imul(aLowH, bLowL);

        let high = (mid >>> 16) + Math.imul(aLowH, bLowH);

        const low = (lo + ((mid & 0xFFFF) << 16)) >>> 0;
        high += (low < lo) ? 1 : 0;

        high = (high + Math.imul(aLow, bHigh) + Math.imul(aHigh, bLow)) | 0;

        return new Int64(low | 0, high);
    }

    /**
     * @param {Int64} b 
     * @param {Int64} dst 
     * @returns 
     */
    mul(b, dst) {
        const aLow = this.low >>> 0, aHigh = this.high | 0;
        const bLow = b.low >>> 0, bHigh = b.high | 0;

        const aLowL = aLow & 0xFFFF, aLowH = aLow >>> 16;
        const bLowL = bLow & 0xFFFF, bLowH = bLow >>> 16;

        const lo = Math.imul(aLowL, bLowL);

        const mid = Math.imul(aLowL, bLowH) + Math.imul(aLowH, bLowL);

        let high = (mid >>> 16) + Math.imul(aLowH, bLowH);

        high += ((lo + ((mid & 0xFFFF) << 16)) >>> 0 < lo) ? 1 : 0;

        dst.high = (high + Math.imul(aLow, bHigh) + Math.imul(aHigh, bLow)) | 0;
        dst.low = (lo + ((mid & 0xFFFF) << 16)) >>> 0;
        return dst;
    }
}
