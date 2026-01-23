import { blend, BLEND_MODE } from "../../blend.js";
import { normalize, spreadSin11, unnormalize } from "../../functions.js";
import { CellularNoise } from "../../noise/cellular.js";
import { FBM } from "../../noise/fbm.js";
import { Hash01Noise } from "../../noise/hashNoise.js";
import { DomainWrap, Noise, Postprocessor, Reducer } from "../../noise/noise.js";
import { SimplexNoise, SimplexNoiseGenerator } from "../../noise/opensimplex2.js";
import { CurveRenderer, LinearCurve, point } from "../curve.js";
import { DomainWarpNode } from "../generator.js";
import { BlendNode, CurveNode, GenericNode, GenNode, Node } from "../node.js";
import { renderTerrain } from "./terrainRenderer.js";

function updateCanvases() {
    document.querySelectorAll("canvas").forEach(canvas => {
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;
    })
}

/**
 * @param {string} id 
 * @returns {HTMLCanvasElement}
 */
function getCanvas(id) {
    return document.getElementById(id);
}

/**
 * 
 * @param {Node} node 
 * @param {HTMLCanvasElement} canvas 
 */
function renderGen(node, canvas, drawMiddleLines = false) {
    const w = canvas.width;
    const wHalf = w >> 1;
    const h = canvas.height;
    const hHalf = h >> 1;
    const c2d = canvas.getContext("2d");
    const tmpImageData = c2d.createImageData(w, h);
    for (let x = 0; x < w; x++)
        for (let y = 0; y < w; y++) {
            const baseIdx = (y * w + x) * 4;
            const r = normalize(node.gen(x - wHalf, h - y - hHalf - 1));
            tmpImageData.data[baseIdx] = Math.floor(r * 256);
            tmpImageData.data[baseIdx + 1] = Math.floor(r * 256);
            tmpImageData.data[baseIdx + 2] = Math.floor(r * 256);
            tmpImageData.data[baseIdx + 3] = 255;
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
function renderGenSlice(node, canvas, width, offset = { x: 0, y: 0 }) {
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
    updateCanvases();
    const scale = 1;
    const node0 = new GenNode(new SimplexNoiseGenerator({
        frequency: 0.01 * scale,
        octaves: 1
    }));

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
    // renderGen(riverNode, getCanvas("canvas1"));
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

    const cellular1 = new GenNode(new Noise(
        SimplexNoise.seed(1234),
        {
            preprocessors: [

            ],
            reducer: FBM.reducer({
                frequency: 0.005
            })
        }));


    const cellular11 = new GenNode(new Noise(
        SimplexNoise.seed(1234),
        {
            reducer: FBM.reducer({ octaves: 4, frequency: 0.005 })
        }
    ));

    const cellular0 = new Noise(
        // new Hasn2DNoise((Date.now() * 0.001) | 0),
         new Hash01Noise((Date.now() * 0.1) | 0),
        // SimplexNoise.seed(1192),
        {
            preprocessors: [
                // DomainWrap.basic({
                //     noiseGenerator: new Noise(
                //         SimplexNoise.seed(123634), { reducer: FBM.reducer({ octaves: 6, frequency: 1 }) }
                //     ),
                //     // noiseGenerator: CellularNoise.worleyGenerator(123111, (f1, f2) => {
                //     //     const a = unnormalize(1 - Math.sqrt(f1)) / 2;
                //     //     return a// spreadTanh11(a);
                //     // }),

                //     warpFreq: 0.005,
                //     warpAmp: 100
                // })
            ],
            reducer: FBM.reducer({
                octaves: 1,
                frequency: 0.5,
                lacunarity: 2,
                gain: 0.5
            }

                // , CellularNoise.worleyReducer(123111, (f1, f2) => {
                //     const a = unnormalize(1 - f1);
                //     return clamp(logistic(a, 1), -1, 1);// spreadTanh11(a);
                // })
            ),
            postprocessors: [
                //  Postprocessor.of(v => v < 0.5 ? -1 : 1)
            ]
        });

    const cellular00 = new Noise(
        SimplexNoise.seed(10),
        {
            preprocessors: [
                DomainWrap.basic({
                    noiseGenerator: new Noise(
                        SimplexNoise.seed(1234), { reducer: FBM.reducer({ octaves: 10, frequency: 0.005 }) }
                    ),
                    warpFreq: 1,
                    warpAmp: 100
                })
            ],
            reducer: FBM.reducer({
                octaves: 2,
                frequency: 0.01,
                lacunarity: 2,
                gain: 0.4
            }, CellularNoise.worleyReducer(191, (f1, f2) => {
                const a = unnormalize(1 - Math.sqrt(f1));
                return a;//1 - spreadTanh(a);
            }))
        });

    const wrapNode = new DomainWarpNode(cellular0, simplexNoise0, {
        warpFreq: 0.02 * scale,
        warpAmp: 300
    });

    const wrapNode2 = new DomainWarpNode(node0, simplexNoise0, {
        warpFreq: 0.1 * scale,
        warpAmp: 100
    });

    const ridgeNode2 = new Noise(
        SimplexNoise.seed(1234),
        {
            reducer: FBM.reducer({
                octaves: 4,
                frequency: 0.01,
                lacunarity: 2,
                gain: 0.5
            }, Reducer.func(v => unnormalize(1 - Math.abs(v)))
            )
        }
    );

    renderGenSlice(cellular00, getCanvas("slice0"), 400, { x: 0, y: 200 });
    // renderGenSlice(cellular0, getCanvas("slice1"), 400, { x: 0, y: 200 });
    // renderGen(cellular00, getCanvas("canvas0"), true);
    renderGen(cellular0, getCanvas("canvas1"), false);
    renderGen(cellular1, getCanvas("canvas2"), true);
    renderGen(ridgeNode2, getCanvas("canvas3"), true);

    const canvas1 = getCanvas("canvas1");
    // renderIsoPerPixel(getCanvas("canvas0"), 800, 800, (x, y) => cellular0.gen(x - 400, 800 - 1 - y - 400), {
    //     step: 4,          // 800/4 => ~200x200 komórek (szybko i wygląda dobrze)
    //     tileX: 1,
    //     tileY: 0.4,
    //     heightAmp: 70,    // “pion”
    //     ambient: 0.30,
    //     fog: 0,
    //     // light: { x: -0.35, y: -0.55, z: 0.75 },
    //     light: { x: 1, y: 1, z: 1 },
    // });

    const image1 = canvas1.getContext("2d").getImageData(0, 0, canvas1.width, canvas1.height);
    renderTerrain(getCanvas("canvas0"), -400, -400, 800, 800,
    // (x, y) => image1.data[((y * canvas1.width) + x) * 4] / 255.0 * 2.0 - 1.0);
    (x, y) => cellular0.gen(x, -y),
    {
        heightMapResolution: 2,
        gridN: 500
    }
);
}
