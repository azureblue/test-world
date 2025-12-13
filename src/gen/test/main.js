import { blend, BLEND_MODE } from "../../blend.js";
import { posToKey } from "../../chunk.js";
import { OpenSimplex2Noise } from "../../noise/noise.js";
import { BlendNode, CurveNode, GenericNode, GenNode, LinearCurve, MultiCurve, point } from "../node.js";

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

// function wang_hash2d(x, y, seed = 0) {
//     let h = x;
//     h = (h ^ 61) ^ (h >>> 16);
//     h = h + (h << 3);
//     h = h ^ (h >>> 4);
//     h = h * 0x27d4eb2d;
//     h = h ^ (h >>> 15);

//     h += y + seed;
//     h = (h ^ 61) ^ (h >>> 16);
//     h = h + (h << 3);
//     h = h ^ (h >>> 4);
//     h = h * 0x27d4eb2d;
//     h = h ^ (h >>> 15);

//     return (h >>> 0) / 0x100000000; // [0, 1)
// }

export function main() {
    const scale = 1;
    const node0 = new GenNode(new OpenSimplex2Noise({
        frequency: 0.01 * scale,
        octaves: 1
    }));

    renderNode(node0, getCanvas("canvas0"));

    const node1 = new GenericNode([node0], {
        gen: new OpenSimplex2Noise({
            seed: 123,
            frequency: 0.003 * scale,
            octaves: 4
        })
    }, (values, data, x, y) => blend(values[0], data.gen.gen(x, y), BLEND_MODE.NORMAL, 0.5));

    const riverNode = new GenNode(
        new OpenSimplex2Noise({
            seed: 1223357,
            frequency: 0.001 * scale,
            octaves: 2
        }));

    const riverWidthNode = new CurveNode(
        new GenNode(new OpenSimplex2Noise({
            seed: 123,
            frequency: 0.003 * scale,
            octaves: 2
        })),
        new LinearCurve([point(0, 0.0), point(1, 1)])
    );

    const riverCurveNode = new GenericNode([riverNode, riverWidthNode],
        {
            wideCurve: new LinearCurve([point(0.4, 1), point(0.495, 0.01), point(0.5005, 0.01), point(0.6, 1)]),
            curve: new LinearCurve([point(0, 0), point(0.4, 1)])
        }, (srcValues, data, x, y) => {
            const spread = 0.04 * srcValues[1];
            const spread2 = 0.05 * srcValues[1];
            data.wideCurve.points[1].x = 0.5 - spread / 2;
            data.wideCurve.points[2].x = 0.5 + spread / 2;
            data.wideCurve.points[0].x = 0.42 + spread2 / 2;
            data.wideCurve.points[3].x = 0.58 - spread2 / 2;
            return data.curve.apply(data.wideCurve.apply(srcValues[0]));
        }
    )

    const mergeNode = new BlendNode([node1, riverCurveNode], BLEND_MODE.MULTIPLY, 1);

    // renderNode(node1, getCanvas("canvas0"));
    renderNode(riverNode, getCanvas("canvas1"));
    renderNode(riverCurveNode, getCanvas("canvas2"));
    renderNode(mergeNode, getCanvas("canvas3"));
    renderNode(riverWidthNode, getCanvas("canvas4"));

}