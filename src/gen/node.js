import { createBlend } from "../blend.js";
import { Array2D } from "../utils.js";

/**
 * @typedef Point
 * @type {object}
 * @property {number} x
 * @property {number} y
 */


/**
 * 
 * @param {number} x 
 * @param {number} y 
 * @returns {Point}
 */
export function point(x, y) {
    return {x, y};
}

export class Curve {
    /**
     * @param {number} x 
     */
    apply(x) {

    }
}

export class MultiCurve extends Curve {
    #curves
    /**
     * @param {Array<Curve>} curves 
     */
    constructor(curves) {
        super();
        this.#curves = curves;
    }

    apply(x) {
        let r = this.#curves[0].apply(x);
        for (let i = 1; i < this.#curves.length; i++) {
            r = this.#curves[i].apply(r);
        }
        return r;
    }
}

export class LinearCurve extends Curve {

    #n
    /**
     * @param {Array<Point>} points
     */
    constructor(points) {
        super();
        this.#n = points.length;
        if (this.#n < 1)
            throw "n < 1";
        this.points = points.sort((a, b) => a.x - b.x);
    }

    setControlPoint(pointId, pos) {
        throw "not implemented";
        // if (pointId == 0) {
        //     pos.x = Math.min(pos.x, this.points[1].x);
        // } else if (pointId == 1) {
        //     pos.x = Math.max(pos.x, this.points[0].x);
        // }
        // this.points[pointId].setTo(pos);
        // return pos;
    }

    /**
     * @param {number} x 
     */
    apply(x) {        
        if (x <= this.points[0].x)
            return this.points[0].y
        else if (x >= this.points[this.#n - 1].x)
            return this.points[this.#n - 1].y;
        for (let i = 1; i < this.#n; i++) {
            if (x <= this.points[i].x)
                return this.#lerp(x, this.points[i - 1], this.points[i]);
        }
        return this.#lerp(x);
    }

    /**
     * @param {number} x 
     * @param {Point} p1 
     * @param {Point} p2 
     * @returns 
     */
    #lerp(x, p1, p2) {
        return (p1.y * (p2.x - x) + p2.y * (x - p1.x)) / (p2.x - p1.x);
    }
}

// export class LinearCurve4 extends Curve {

//     constructor(p0, p1, p2, p3) {
//         super();        
//         this.points = [p0, p1, p2, p3].sort((a, b) => a.x - b.x);        
//     }

//     setControlPoint(pointId, pos) {
//         if (pointId == 0) {
//             pos.x = Math.min(pos.x, this.points[1].x);
//         } else if (pointId == 1) {
//             pos.x = Math.max(pos.x, this.points[0].x);
//             pos.x = Math.min(pos.x, this.points[2].x);
//         } else if (pointId == 2) {
//             pos.x = Math.max(pos.x, this.points[1].x);
//             pos.x = Math.min(pos.x, this.points[3].x);
//         } else if (pointId == 3) {
//             pos.x = Math.max(pos.x, this.points[2].x);
//         }
//         this.points[pointId].setTo(pos);
//         return pos;
//     }

//     /**
//      * @param {number} x 
//      */
//     apply(x) {
//         if (x <= this.points[0].x)
//             return this.points[0].y
//         if (x <= this.points[1].x) {
//             return this.#lerp(x, 0, 1);
//         }
//         if (x <= this.points[2].x) {
//             return this.#lerp(x, 1, 2);
//         }
//         if (x <= this.points[3].x) {
//             return this.#lerp(x, 2, 3);
//         }
//         else if (x >= this.points[3].x)
//             return this.points[3].y;
//     }

//     #lerp(x, p1, p2) {
//         return (this.points[p1].y * (this.points[p2].x - x) + this.points[p2].y * (x - this.points[p1].x)) / (this.points[p2].x - this.points[p1].x);
//     }
// }

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
