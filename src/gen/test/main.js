import { blend, BLEND_MODE } from "../../blend.js";
import { lerp, preciseLerp, smoothstep } from "../../functions.js";
import { CellularNoise, worley } from "../../noise/cellular.js";
import { FBM } from "../../noise/fbm.js";
import { DomainWrap, Noise, Preprocessor } from "../../noise/noise.js";
import { SimplexNoise, SimplexNoiseGenerator } from "../../noise/opensimplex2.js";
import { CurveRenderer, LinearCurve, point } from "../curve.js";
import { DomainWarpNode, RidgeNoiseNode } from "../generator.js";
import { BlendNode, CurveNode, GenericNode, GenNode, Node } from "../node.js";

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
            const r = node.gen(x, y, y * 256 + x);
            tmpImageData.data[baseIdx] = Math.floor(r * 256);
            tmpImageData.data[baseIdx + 1] = Math.floor(r * 256);
            tmpImageData.data[baseIdx + 2] = Math.floor(r * 256);
            tmpImageData.data[baseIdx + 3] = 255;
        }
    canvas.getContext("2d").putImageData(tmpImageData, 0, 0);
}

/**
 * 
 * @param {Node} node 
 * @param {HTMLCanvasElement} canvas 
 */
function renderNodeSlice(node, canvas, scale = 1.0, offset = {x: 0, y: 0}) {
    const w = canvas.width;
    const h = canvas.height;    
    const points = [];
    const genW = w * scale; 

    for (let x = 0; x < w; x++) {
            points.push({x: x / w, y: node.gen(offset.x + x * scale, 1)})
        }
    const curve = new LinearCurve(points);
    const renderer = new CurveRenderer();
    renderer.render(curve, canvas);    
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
    const node0 = new GenNode(new SimplexNoiseGenerator({
        frequency: 0.01 * scale,
        octaves: 1
    }));

    renderNode(node0, getCanvas("canvas0"));

    const node1 = new GenericNode([node0], {
        gen: new SimplexNoiseGenerator({
            seed: 123,
            frequency: 0.003 * scale,
            octaves: 4
        })
    }, (values, data, x, y) => blend(values[0], data.gen.gen(x, y), BLEND_MODE.NORMAL, 0.5));

    const riverNode = new GenNode(
        new SimplexNoiseGenerator({
            seed: 1223357,
            frequency: 0.001 * scale,
            octaves: 2
        }));

    const riverWidthNode = new CurveNode(
        new GenNode(new SimplexNoiseGenerator({
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
    // renderNode(riverCurveNode, getCanvas("canvas2"));
    // renderNode(mergeNode, getCanvas("canvas3"));
    // renderNode(riverWidthNode, getCanvas("canvas4"));


    const simplexNoise0 = new SimplexNoiseGenerator({
        seed: 1234,
        octaves: 4,
        frequency: 0.001 * scale,
        lacunarity: 2,
        gain: 0.5,
    });

    const noridge = new GenNode(new SimplexNoiseGenerator({
        seed: 1234,
        octaves: 1,
        frequency: 0.01,
        lacunarity: 2,
        gain: 0.5
    }));

    const cellular0 = new GenNode(new Noise(
        SimplexNoise.seed(1234),
        {
            preprocessors: [
                // new DomainWrap({
                //     noiseGenerator: NoiseSource.openSimplex2().seed(1234),
                //     warpFreq: 0.01 * scale,
                //     warpAmp: 20
                // })
            ],
            reducer: FBM.reducer({
                octaves: 1,
                frequency: 0.005,
                lacunarity: 2,
                gain: 0.5
            }, CellularNoise.worleyReducer(1234, (f1, f2) => 1 - Math.sqrt(f1))
                // , (v) => Math.abs(2.0 * v - 1)
            )
        }));

    const cellular1 = new GenNode(new Noise(
        SimplexNoise.seed(1234),
        {
            preprocessors: [
                new class extends Preprocessor {
                    preprocess(x, y, out) {
                        // zakładamy worleyF1F2_2D
                        const warpFreq = 0.001;
                        const warpAmp = 20;
                        const seed = 1234;
                        const wA = worley(seed + 11, x * warpFreq, y * warpFreq);
                        const wB = worley(seed + 23, x * warpFreq, y * warpFreq);

                        const wx = (1 - Math.sqrt(wA)) * 2 - 1;
                        const wy = (1 - Math.sqrt(wB)) * 2 - 1;

                        out[0] = x + wx * warpAmp;
                        out[1] = y + wy * warpAmp;

                    }
                }
                // new DomainWrap({
                //     noiseGenerator: SimplexNoise.seed(12341),
                //     warpFreq: 0.01,
                //     warpAmp: 40
                // })
            ],
            reducer: FBM.reducer({
                frequency: 0.005
            })
        }));


    const wrapNode = new DomainWarpNode(cellular0, simplexNoise0, {
        warpFreq: 0.02 * scale,
        warpAmp: 300
    });

    const wrapNode2 = new DomainWarpNode(node0, simplexNoise0, {
        warpFreq: 0.1 * scale,
        warpAmp: 100
    });

    const ridgeNode2 = new RidgeNoiseNode(SimplexNoiseGenerator.rawNoise, {
            seed: 23456,
            frequency: 0.02,
            octaves: 2

        });

    renderNodeSlice(cellular1, getCanvas("canvas4"), 1, {x: 10, y: 2});
    renderNode(noridge, getCanvas("canvas0"));
    renderNode(cellular0, getCanvas("canvas1"));
    renderNode(cellular1, getCanvas("canvas2"));
    renderNode(ridgeNode2, getCanvas("canvas3"));

}