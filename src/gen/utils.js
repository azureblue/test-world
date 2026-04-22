import { clamp, nomrmalizeRange, normalize } from "../functions.js";
import { Node } from "./node.js";

const ALPHA = 255 << 24 >>> 0;

/**
 * @param {ImageData} data 
 */
export function fillArr(ctx, fun) {
    for (let y = 0; y < w; y++)
        for (let x = 0; x < w; x++) {
            const c = Math.floor(fun(x, y) * 256);
            const baseIdx = (y * w + x) * 4;
            tmpImageData.data[baseIdx] = c;
            tmpImageData.data[baseIdx + 1] = c;
            tmpImageData.data[baseIdx + 2] = c;
            tmpImageData.data[baseIdx + 3] = 255;
        }

    ctx.putImageData(tmpImageData, 0, 0);
}

/**
 * @param {Node} node 
 * @param {HTMLCanvasElement} canvas 
 */
export function renderGen(node, canvas, { 
    scale = 1.0,
    pallete = PalleteMapper.grayscale11(),
    drawMiddleLines = false
 } = {}) {
    const w = canvas.width;
    const wHalf = w >> 1;
    const h = canvas.height;
    const hHalf = h >> 1;
    const c2d = canvas.getContext("2d");
    const tmpImageData = c2d.createImageData(w, h);
    const tmpDataUint32View = new Uint32Array(tmpImageData.data.buffer);
    for (let y = 0; y < w; y++)
        for (let x = 0; x < w; x++) {
            const genx = x - wHalf;
            const geny = h - y - hHalf - 1;
            const v = pallete(node.gen(genx / scale, geny / scale));
            tmpDataUint32View[y * w + x] = v;
        }
    c2d.putImageData(tmpImageData, 0, 0);

    if (drawMiddleLines) {
        c2d.lineWidth = 2;
        c2d.strokeStyle = "rgba(173,216,230,0.5)";
        c2d.beginPath();
        c2d.moveTo(0, h / 2);
        c2d.lineTo(w, h / 2);
        c2d.moveTo(w / 2, 0);
        c2d.lineTo(w / 2, h);
        c2d.stroke();
    }
}

/**
 * 
 * @param {Node} node 
 * @param {HTMLCanvasElement} canvas 
 */
export function renderGenSlice(node, canvas, width, offset = { x: 0, y: 0 }) {
    const w = canvas.width;
    const wHalf = w << 1;
    const h = canvas.height;
    const hHalf = h << 1;
    const points = [];

    for (let x = 0; x < w; x++) {
        const x01 = x / w;
        points.push({ x: x01, y: normalize(node.gen(offset.x + width * x01 - wHalf, offset.y - hHalf)) });
    }
    const curve = new LinearCurve(points);
    const renderer = new CurveRenderer();
    renderer.render(curve, canvas);
}


export const PalleteMapper = {
    grayscale11: () => v => {
        const c = clamp(Math.round(normalize(v) * 255), 0, 255);
        return ALPHA | (c << 16) | (c << 8) | c;
    },
    grayscale: (min, max) => v => {
        const c = clamp(Math.round(nomrmalizeRange(v, min, max) * 255), 0, 255);
        return ALPHA | (c << 16) | (c << 8) | c;
    }

}


export class RenderingNodeIntrospector {

    /**
     * @param {Node} node 
     * @param {HTMLCanvasElement} canvas 
     * @param {number} scale
     */
    constructor(node, canvas, {
        scale = 1.0,
        palleteMapper = PalleteMapper.grayscale11()
    } = {}) {
        this.iter = undefined;
        this.node = node;
        this.scale = scale;
        this.canvas = canvas;
        const savedGen = node.gen.bind(node);
        this.savedGen = savedGen;
        const cw = canvas.width;
        const ch = canvas.height;
        const hw = cw >> 1;
        const hh = ch >> 1;
        this.c2d = canvas.getContext("2d");
        this.imageData = this.c2d.createImageData(cw, ch);
        const dataUint32View = new Uint32Array(this.imageData.data.buffer);
        let lastIter = undefined;
        this.node.gen = function (x, y, iter) {
            const v = savedGen(x, y, iter);
            if (iter !== lastIter) {
                lastIter = iter;
                const pixelX = (Math.floor(x)) + hw;
                const pixelY = ch - ((Math.floor(y)) + hh) - 1;

                if (pixelX >= 0 && pixelX < cw && pixelY >= 0 && pixelY < ch) {
                    const tmpDataUint32View = dataUint32View;
                    tmpDataUint32View[pixelY * cw + pixelX] = ALPHA | palleteMapper(v);
                }
            }
            return v;
        }
    }

    release() {
        this.node.gen = this.savedGen;
    }

    flush() {
        this.c2d.putImageData(this.imageData, 0, 0);
    }
}