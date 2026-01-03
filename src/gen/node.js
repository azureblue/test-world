import { createBlend } from "../blend.js";
import { Array2D } from "../utils.js";
import { Curve } from "./curve.js";


class NodeEntry {

    /**@param {Node} node */
    constructor(node) {
        this.data = new Array2D(400, 400);
        this.extData = [];
        this.node = node;
        if (node instanceof CurveNode) {
            /**@type {CurveNode} */
            const curveNode = node;
            const curve = curveNode.curve;
            const curveArray = new Array2D(200, 200);
            for (let i = 0; i < 200; i++)
                curveArray.set(x, Math.round(curve.apply(x / 200) * 199), 255);
        }
    }
}

export class NodeRegistry {

    static #nodes = [];

}

export class Node {
    static #ID = 0;
    #id
    #name
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
        this.#name = this.constructor.name + "-" + this.#id;
    }

    get name() {
        return this.#name;
    }

    set name(name) {
        this.#name = name;
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

export class GenNode extends Node {
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

    /**@returns {Curve} */
    get curve() {
        return this.curve;
    }
}

export class BlendNode extends Node {

    #blendFunction
    /**
     * @param {Array<Node>} nodes 
     * @param {Function} blendMode 
     * @param {number} opacity 
     */
    constructor(nodes, blendMode, opacity) {
        super(nodes);
        this.#blendFunction = createBlend(blendMode, opacity);
    }

    /**
     * @param {Float32Array} values 
     */
    _gen(x, y, values) {
        let r = values[0];
        for (let i = 1; i < values.length; i++)
            r = this.#blendFunction(r, values[i]);
        return r;
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
