import { blend, BLEND_FUNCTION } from "../../blend.js";
import { normalize, unnormalize } from "../../functions.js";
import { CellularNoise } from "../../noise/cellular.js";
import { FBM } from "../../noise/fbm.js";
import { Hash01Noise } from "../../noise/hashNoise.js";
import { DomainWrap, Noise, Extractor } from "../../noise/noise.js";
import { SimplexNoise, SimplexNoiseGenerator } from "../../noise/opensimplex2.js";
import { CurveRenderer, LinearCurve, point } from "../curve.js";
import { DomainWarpNode } from "../generator.js";
import { baseNode0, baseNode1, baseNode2, baseNode3, baseNodePlateau, blendNode0, blendNode1, cellularNode0 } from "../generators.js";
import { BlendNode, CurveNode, GenericNode, GenNode, Node } from "../node.js";
import { PalleteMapper, renderGen, RenderingNodeIntrospector } from "../utils.js";
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
    }, (values, data, x, y) => blend(values[0], data.gen.gen(x, y), BLEND_FUNCTION.NORMAL, 0.5));

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

    const mergeNode = new BlendNode([node1, riverCurveNode], BLEND_FUNCTION.MULTIPLY, 1);

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
            }, Extractor.func(v => unnormalize(1 - Math.abs(v)))
            )
        }
    );

    // renderGenSlice(cellular00, getCanvas("slice0"), 400, { x: 0, y: 200 });
    // renderGenSlice(cellular0, getCanvas("slice1"), 400, { x: 0, y: 200 });
    // renderGen(cellular00, getCanvas("canvas0"), true);
    // renderGen(baseNode0, getCanvas("canvas0"), { scale: 1.0, drawMiddleLines: false });
    const baseNode0Renderer = new RenderingNodeIntrospector(baseNode0, getCanvas("canvas0"));
    const baseNode1Renderer = new RenderingNodeIntrospector(baseNode1, getCanvas("canvas1"), {
        palleteMapper: PalleteMapper.grayscale(-0.6, -0.4)
    });
    const baseNodePlateauRenderer = new RenderingNodeIntrospector(baseNodePlateau, getCanvas("canvas2"));

    const baseNode2Renderer = new RenderingNodeIntrospector(baseNode2, getCanvas("canvas3"));
    const baseNode3Renderer = new RenderingNodeIntrospector(baseNode3, getCanvas("canvas4"));
    const blendNode0Renderer = new RenderingNodeIntrospector(blendNode0, getCanvas("canvas5"));
    const blendNode1Renderer = new RenderingNodeIntrospector(blendNode1, getCanvas("canvas6"));
    renderGen(cellularNode0, getCanvas("canvas7"), {scale: 100.0});
    // renderGen(baseNode1, getCanvas("canvas1"), { scale: 1.0, drawMiddleLines: false });
    // renderGen(baseNode2, getCanvas("canvas2"), { scale: 1.0, drawMiddleLines: false });
    // renderGen(blendNode0, getCanvas("canvas3"), { scale: 1.0, drawMiddleLines: false });
    // for (let i = 0; i < 400; i++)
    //     for (let j = 0; j < 400; j++)
    //         blendNode0.gen(i - 200, j - 200, i * 400 + j);




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
    renderTerrain(getCanvas("canvas8"), -200, -200, 400, 400,
        //     // (x, y) => image1.data[((y * canvas1.width) + x) * 4] / 255.0 * 2.0 - 1.0);
        (x, y) => blendNode0.gen(x, -y, y * 400 + x),
        {
            heightMapResolution: 1,
            gridN: 400
        }
    );
    baseNode0Renderer.flush();
    baseNode1Renderer.flush();
    baseNodePlateauRenderer.flush();
    baseNode2Renderer.flush();
    baseNode3Renderer.flush();
    blendNode0Renderer.flush();
    blendNode1Renderer.flush();
}
