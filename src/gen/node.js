import { Blend, createBlend } from "../blend.js";
import { normalize, unnormalize } from "../functions.js";
import { Generator } from "../noise/noise.js";
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
    #iter = null;
    #id
    name
    #value = 0;
    srcNodes;
    #srcValues;

    /**
     * @param {Array<Node>} srcNodes 
     */
    constructor(srcNodes = [], name) {
        this.#id = Node.#ID++;
        this.srcNodes = srcNodes;
        this.#srcValues = new Float64Array(srcNodes.length);
        this.name = name || this.constructor.name + "-" + this.#id;        
    }


    get id() {
        return this.#id;
    }

    /**
     * @param {number} x 
     * @param {number} y 
     * @param {Float32Array} srcNodeValues 
     */
    $gen(x, y, srcNodeValues) {

    }

    gen(x, y, iteration) {
        if (iteration === this.#iter)
            return this.#value;

        for (let i = 0; i < this.srcNodes.length; i++) {
            this.#srcValues[i] = this.srcNodes[i].gen(x, y, iteration);
        }

        this.#value = this.$gen(x, y, this.#srcValues);
        if (iteration !== undefined)
            this.#iter = iteration;
        return this.#value;
    }

    static createConstValue(v) {
        return {
            gen: () => v
        };
    }
}

export class GenNode extends Node {
    #noiseGen;
    /**
     * @param {Generator} noiseGen 
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
    $gen(x, y, srcNodeValues) {
        return this.#noiseGen.gen(x, y);
    }
}

export class FunctionNode extends Node {
    constructor(srcNode, fun) {
        super([srcNode]);
        this.fun = fun;
    }

    $gen(x, y, values) {
        const v = values[0];
        return this.fun(v, x, y);
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

    /**
     * @param {Array<Node>} nodes 
     * @param {Blend} blend 
     */
    constructor(nodes, blend, {
        opacityNode = Node.createConstValue(1.0),
        preprocessor = x => x,
        preprocessors = null,
        postprocessor = x => x
    } = {}) {
        super([...nodes, opacityNode]);
        this.blend = blend;
        this.preprocessors = preprocessors || new Array(nodes.length).fill(preprocessor);
        if (this.preprocessors.length != nodes.length)
            throw new Error("Preprocessors length must match nodes length");
        this.postprocessor = postprocessor;
    }

    /**
     * @param {Float32Array} values 
     */
    $gen(x, y, values) {
        const lastIdx = values.length - 1;
        const opacity = values[lastIdx];
        const preprocessors = this.preprocessors;
        let r = preprocessors[0](values[0]);
        for (let i = 1; i < lastIdx; i++)
            r = this.blend.apply(r, preprocessors[i](values[i]), opacity);
        return this.postprocessor(r);
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
