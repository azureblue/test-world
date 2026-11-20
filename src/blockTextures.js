import definitions from "./blocks.json" with { type: "json" };
import { Resources } from "./utils.js";

/**
 * The pixels of one image: RGBA, rows from the top (like ImageData).
 * @typedef {{width: number, height: number, data: Uint8ClampedArray}} Pixels
 */

/** the size of a texture and of the tiles in the source images, in pixels */
export const TEXTURE_SIZE = definitions.tileSize;

/**
 * Operations on a texture's source images, in the order listed (`"ops"` in src/blocks.json, each `{name, ...params}`).
 * Each one takes the first images of the list and puts its result in their place. The colour ops keep the alpha.
 * @type {{[name: string]: {inputs: number, apply: (images: Pixels[], params: object) => Pixels}}}
 */
export const TEXTURE_OPS = {
    // [a, b, mask]: a where the mask is white, b where it's black, blended between (the mask's red channel)
    mask: {
        inputs: 3,
        apply([a, b, mask]) {
            const out = emptyPixels(a.width, a.height);
            for (let i = 0; i < out.data.length; i += 4) {
                const m = mask.data[i] / 255;
                for (let c = 0; c < 4; c++)
                    out.data[i + c] = Math.round(a.data[i + c] * m + b.data[i + c] * (1 - m));
            }
            return out;
        }
    },
    // every channel times the colour's ("#rrggbb", as 0..1) and factor (default 1; above 1 lightens, clamped)
    multiply: {
        inputs: 1,
        apply([image], { color, factor = 1 }) {
            const [r, g, b] = hexColor(color).map(c => c * factor);
            return mapPixels(image, (px) => [px[0] * r, px[1] * g, px[2] * b]);
        }
    },
    // hue rotated by hue degrees, saturation and lightness scaled (defaults 0, 1, 1): a different colour with the same
    // pattern of light and dark
    hsl: {
        inputs: 1,
        apply([image], { hue = 0, saturation = 1, lightness = 1 }) {
            return mapPixels(image, (px) => {
                const [h, s, l] = rgbToHsl(px[0] / 255, px[1] / 255, px[2] / 255);
                return hslToRgb(h + hue / 360, Math.min(s * saturation, 1), Math.min(l * lightness, 1)).map(c => c * 255);
            });
        }
    }
};

/**
 * A copy with every pixel's colour changed, the alpha kept.
 * @param {Pixels} image
 * @param {(rgb: number[]) => number[]} f rgb 0..255 -> rgb (rounded, clamped)
 * @returns {Pixels}
 */
function mapPixels(image, f) {
    const out = emptyPixels(image.width, image.height);
    const px = [0, 0, 0];
    for (let i = 0; i < out.data.length; i += 4) {
        px[0] = image.data[i]; px[1] = image.data[i + 1]; px[2] = image.data[i + 2];
        const [r, g, b] = f(px);
        out.data[i] = Math.round(r);
        out.data[i + 1] = Math.round(g);
        out.data[i + 2] = Math.round(b);
        out.data[i + 3] = image.data[i + 3];
    }
    return out;
}

/** "#rrggbb" -> [r, g, b] 0..1 */
function hexColor(color) {
    const m = /^#?([0-9a-f]{6})$/i.exec(color ?? "");
    if (m === null)
        throw new Error(`not a colour "${color}" (#rrggbb)`);
    const n = parseInt(m[1], 16);
    return [(n >> 16) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
}

/** r, g, b 0..1 -> [h 0..1, s, l] */
function rgbToHsl(r, g, b) {
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
    if (d === 0)
        return [0, 0, l];
    const s = d / (1 - Math.abs(2 * l - 1));
    const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h / 6, s, l];
}

/** h (any, wraps), s, l 0..1 -> [r, g, b] 0..1 */
function hslToRgb(h, s, l) {
    const c = (1 - Math.abs(2 * l - 1)) * s, hh = ((h % 1 + 1) % 1) * 6, x = c * (1 - Math.abs(hh % 2 - 1)), m = l - c / 2;
    const [r, g, b] = hh < 1 ? [c, x, 0] : hh < 2 ? [x, c, 0] : hh < 3 ? [0, c, x] : hh < 4 ? [0, x, c] : hh < 5 ? [x, 0, c] : [c, 0, x];
    return [r + m, g + m, b + m];
}

/**
 * The block textures of src/blocks.json, composed from tiles of the source images; a texture's layer is its index in
 * the list (blocks.js numbers them the same way).
 * @param {(image: string, row: number, col: number) => Pixels} tileOf a tile of a source image (a copy, or one that
 *   isn't changed: the ops make new pixels)
 * @returns {Pixels[]} by layer
 */
export function composeTextures(tileOf) {
    /** @type {Map<string, Pixels>} */
    const byName = new Map();
    const layers = [];
    for (const def of definitions.textures) {
        const where = `blocks.json: texture ${def.name}`;
        let images = (Array.isArray(def.src) ? def.src : [def.src]).map(src => source(src, byName, tileOf, where));
        for (const { name, ...params } of def.ops ?? []) {
            const op = TEXTURE_OPS[name];
            if (op === undefined)
                throw new Error(`${where}: no op "${name}"`);
            if (images.length < op.inputs)
                throw new Error(`${where}: op ${name} needs ${op.inputs} images, has ${images.length}`);
            const inputs = images.slice(0, op.inputs);
            if (inputs.some(p => p.width !== inputs[0].width || p.height !== inputs[0].height))
                throw new Error(`${where}: op ${name}: images of different sizes`);
            try {
                images = [op.apply(inputs, params), ...images.slice(op.inputs)];
            } catch (e) {
                throw new Error(`${where}: op ${name}: ${e.message}`);
            }
        }
        if (images.length !== 1)
            throw new Error(`${where}: ${images.length} images left, not one (missing ops?)`);
        byName.set(def.name, images[0]);
        layers.push(images[0]);
    }
    return layers;
}

/**
 * A texture's source: `"image"` (an image of imageDir, without ".png": a texture-sized one, or its top left tile),
 * `"image,row,col"` (a tile of a bigger image, from the top left) or `"t:name"` (an earlier texture).
 * @returns {Pixels}
 */
function source(src, byName, tileOf, where) {
    if (src.startsWith("t:")) {
        const texture = byName.get(src.slice(2));
        if (texture === undefined)
            throw new Error(`${where}: no earlier texture "${src.slice(2)}"`);
        return texture;
    }
    const { image, row, col } = parseImageSource(src, where);
    return tileOf(image, row, col);
}

/**
 * @param {string} src a source that isn't a texture ("image" or "image,row,col")
 * @returns {{image: string, row: number, col: number}}
 */
function parseImageSource(src, where) {
    const [image, row = "0", col = "0", ...rest] = src.split(",");
    if (!/^[\w.-]+$/.test(image) || rest.length > 0 || !/^\d+$/.test(row) || !/^\d+$/.test(col))
        throw new Error(`${where}: bad source "${src}" (image, image,row,col or t:texture)`);
    return { image, row: Number(row), col: Number(col) };
}

/** the images the textures are made from (names in imageDir, without ".png") */
export function sourceImages() {
    const images = new Set();
    for (const def of definitions.textures)
        for (const src of Array.isArray(def.src) ? def.src : [def.src])
            if (!src.startsWith("t:"))
                images.add(parseImageSource(src, `blocks.json: texture ${def.name}`).image);
    return [...images];
}

/**
 * @param {number} width
 * @param {number} height
 * @returns {Pixels}
 */
function emptyPixels(width, height) {
    return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

/**
 * Cuts a tile out of an image's pixels.
 * @param {Pixels} image
 * @returns {Pixels}
 */
export function cutTile(image, row, col, size = TEXTURE_SIZE) {
    if ((row + 1) * size > image.height || (col + 1) * size > image.width)
        throw new Error(`tile ${row},${col} outside the image (${image.width}x${image.height})`);
    const tile = emptyPixels(size, size);
    for (let y = 0; y < size; y++) {
        const start = ((row * size + y) * image.width + col * size) * 4;
        tile.data.set(image.data.subarray(start, start + size * 4), y * size * 4);
    }
    return tile;
}

/**
 * Loads the source images of src/blocks.json and composes the block textures (in the page: it needs OffscreenCanvas).
 * @returns {Promise<Pixels[]>} by layer
 */
export async function loadBlockTextures() {
    /** @type {Map<string, Pixels>} */
    const images = new Map();
    await Promise.all(sourceImages().map(async (name) => {
        const bitmap = await Resources.loadImage(`./${definitions.imageDir}/${name}.png`);
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(bitmap, 0, 0);
        images.set(name, ctx.getImageData(0, 0, bitmap.width, bitmap.height));
    }));
    return composeTextures((image, row, col) => cutTile(images.get(image), row, col));
}
