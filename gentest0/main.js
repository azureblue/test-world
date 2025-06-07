import { blend, BLEND_MODE } from "../src/blend.js";
import { posToKey } from "../src/chunk.js";
import { Curve } from "../src/geom.js";
import { Noise, NoiseGenerator } from "../src/noise/noise.js";

/**
 * @param {string} id 
 * @returns {HTMLCanvasElement}
 */
function getCanvas(id) {
    return document.getElementById(id);
}

const w = 400;
const h = 400;

const tmpImageData = new ImageData(w, h);

/**
 * 
 * @param {Node} node 
 * @param {HTMLCanvasElement} canvas 
 */
function renderNode(node, canvas) {
    for (let x = 0; x < w; x++)
        for (let y = 0; y < w; y++) {
            const baseIdx = (y * w + x) * 4;
            const r = node.gen(x, y, posToKey(x, y));
            tmpImageData.data[baseIdx] = Math.floor(r * 256);
            tmpImageData.data[baseIdx + 1] = Math.floor(r * 256);
            tmpImageData.data[baseIdx + 2] = Math.floor(r * 256);
            tmpImageData.data[baseIdx + 3] = 255;
        }
    canvas.getContext("2d").putImageData(tmpImageData, 0, 0);
}

/**
 * @param {ImageData} data 
 */
function fillArr(ctx, fun) {
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

export class Node {
    static #ID = 0;
    #id
    #iter = -1;
    #value = 0;
    #srcNodes;
    #srcNodeValues;

    /**
     * @param {Array<Node>} srcNodes 
     */
    constructor(srcNodes = []) {
        this.#srcNodes = srcNodes;
        this.#srcNodeValues = new Float64Array(srcNodes.length);
        this.#id = Node.#ID++;
    }

    get id() {
        return this.#id;
    }

    /**
     * @param {number} x 
     * @param {number} y 
     * @param {Float32Array} srcNodeValues 
     */
    _gen(x, y, srcNodeValues) {

    }

    gen(x, y, iter) {
        if (iter === this.#iter)
            return this.#value;

        for (let i = 0; i < this.#srcNodes.length; i++) {
            this.#srcNodeValues[i] = this.#srcNodes[i].gen(x, y, iter);
        }

        this.#value = this._gen(x, y, this.#srcNodeValues);
        this.#iter = iter;
        return this.#value;
    }
}

export class NoiseNode extends Node {
    #noiseGen;
    /**
     * @param {NoiseGenerator} noiseGen 
     */
    constructor(noiseGen) {
        super();
        this.#noiseGen = noiseGen;
    }

    /**
     * @param {number} x 
     * @param {number} y 
     * @param {Float32Array} srcNodeValues 
     */
    _gen(x, y, srcNodeValues) {
        return this.#noiseGen.gen(x, y);
    }
}

export class CurveNode extends Node {
    #curve

    /**
     * @param {Node} srcNode 
     * @param {Curve} curve 
     */
    constructor(srcNode, curve) {
        super([srcNode]);
        this.#curve = curve;
    }

    /**
     * @param {number} x 
     * @param {number} y 
     * @param {Float32Array} srcNodeValues 
     */
    _gen(x, y, srcNodeValues) {
        return this.#curve.apply(srcNodeValues[0]);
    }
}

/**
 * @template T
 */
export class GenericNode extends Node {
    #data
    #fun
    /**
     * @param {Array<Node>} srcNodes 
     * @param {T} dataObject 
     * @param {(values: Float64Array, dataObject: T, x: number, y, number) => number} fun 
     */
    constructor(srcNodes, dataObject, fun) {
        super(srcNodes);
        this.#data = dataObject;
        this.#fun = fun;
    }

    _gen(x, y, values) {
        return this.#fun(values, this.#data, x, y);
    }
}
export function main() {
    const node0 = new GenericNode([], {
        gen: new Noise({
            frequency: 0.01,
            octaves: 4
        })
    }, (values, data, x, y) => data.gen.gen(x, y));

    renderNode(node0, getCanvas("canvas0"));

    const node1 = new GenericNode([node0], {
        gen: new Noise({
            seed: 123,
            frequency: 0.01,
            octaves: 4
        })
    }, (values, data, x, y) => blend(values[0], data.gen.gen(x, y), BLEND_MODE.SUB, 1));

    renderNode(node1, getCanvas("canvas0"));

}