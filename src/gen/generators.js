import { Blend, BLEND_FUNCTION as BlendFunction, Clamp } from "../blend.js";
import { logistic, normalize, smoothstep, spreadSin11, spreadTanh11, unnormalize } from "../functions.js";
import { CellularNoise } from "../noise/cellular.js";
import { FBM } from "../noise/fbm.js";
import { Hash01Noise } from "../noise/hashNoise.js";
import { DomainProcessor, DomainWrap, Noise, Processor } from "../noise/noise.js";
import { SimplexNoise } from "../noise/opensimplex2.js";
import { BlendNode, GenNode } from "./node.js";

export function testgen() {
    return blendNode0;
}
export const baseNode1 = new GenNode(new Noise(
    SimplexNoise.seed(1234),
    {
        preprocessors: [

        ],
        reducer: FBM.reducer({
            frequency: 0.05,
            octaves: 5,
            lacunarity: 1.7,
            gain: 0.5
        }),
        postprocessors: [
            Processor.of(v => v * 0.02 - 0.5)
        ]
    }));


export const baseNode0 = new GenNode(new Noise(
    SimplexNoise.seed(128334),
    // SimplexNoise.seed(1192),
    {
        preprocessors: [
            DomainWrap.basic({
                noiseGenerator: new Noise(
                    SimplexNoise.seed(123634), { reducer: FBM.reducer({ octaves: 6, frequency: 1 }) }
                ),
                warpFreq: 0.005,
                warpAmp: 100
            })
        ],
        reducer: FBM.reducer({
            octaves: 5,
            frequency: 0.002,
            lacunarity: 2,
            gain: 0.5
        }),
        postprocessors: [
            Processor.of(v => spreadSin11(v, 0.4) * 0.4 + 0.2)
        ]
    }));

export const baseNodePlateau = new GenNode(new Noise(
    SimplexNoise.seed(2228334),
    // SimplexNoise.seed(1192),
    {
        preprocessors: [
            DomainWrap.basic({
                noiseGenerator: new Noise(
                    SimplexNoise.seed(23634), { reducer: FBM.reducer({ octaves: 6, frequency: 1 }) }
                ),
                warpFreq: 0.005,
                warpAmp: 100
            })
        ],
        reducer: FBM.reducer({
            octaves: 5,
            frequency: 0.002,
            lacunarity: 2,
            gain: 0.5
        }),
        postprocessors: [
            Processor.of(v => spreadSin11(v, 0.4)),
            Processor.of(v => v * 0.2 - 0.5)
        ]
    }));

export const baseNode2 = new GenNode(new Noise(
    SimplexNoise.seed(11234),
    {
        preprocessors: [

        ],
        reducer: FBM.reducer({
            octaves: 5,
            frequency: 0.009
        }),
        postprocessors: [
            Processor.of(v => spreadTanh11(v, 4) * 0.9),
            Processor.of(normalize)
        ]
    }));


export const baseNode3 = new GenNode(new Noise(
    SimplexNoise.seed(12234),
    {
        preprocessors: [

        ],
        reducer: FBM.reducer({
            octaves: 5,
            frequency: 0.009
        }),
        postprocessors: [
            Processor.of(v => smoothstep(0.3, 0.8, (v + 1) / 2))
        ]
    })
);

export const cellularNode0 = new GenNode(new Noise(    
    CellularNoise.worleyGenerator(123111, (f1, f2) => {
        const a =  unnormalize(1 - Math.min(1, Math.sqrt(f2)));
        return a;
    })
)
);

export const blendNode1 = new BlendNode(
    [baseNodePlateau, baseNode1], new Blend(BlendFunction.MULTIPLY, Clamp.none), {
    opacityNode: baseNode2,
    preprocessor: normalize,
    postprocessor: unnormalize
});
export const blendNode0 = new BlendNode(
    [blendNode1, baseNode0], new Blend(BlendFunction.MULTIPLY, Clamp.none), {
    opacityNode: baseNode3,
    preprocessor: normalize,
    postprocessor: v => unnormalize(v) + 0.7
});
const test1 = new Noise(
    SimplexNoise.seed(1234),
    // SimplexNoise.seed(1192),
    {
        preprocessors: [
            DomainWrap.basic({
                noiseGenerator: new Noise(
                    SimplexNoise.seed(1234), { reducer: FBM.reducer({ octaves: 5, frequency: 1 }) }
                ),
                // noiseGenerator: CellularNoise.worleyGenerator(123111, (f1, f2) => {
                //     const a = unnormalize(1 - Math.sqrt(f1)) / 2;
                //     return a// spreadTanh11(a);
                // }),

                warpFreq: 0.005,
                warpAmp: 100
            })
        ],
        reducer: FBM.reducer({
            octaves: 4,
            frequency: 0.002,
            lacunarity: 2,
            gain: 0.5
        }

            // , CellularNoise.worleyReducer(123111, (f1, f2) => {
            //     const a = unnormalize(1 - f1);
            //     return clamp(logistic(a, 1), -1, 1);// spreadTanh11(a);
            // })
        ),
        postprocessors: [
            Processor.of(v => spreadSin11(v, 0.4))
        ]
    });
const test0 = new Noise(
    SimplexNoise.seed(1234),
    // SimplexNoise.seed(1192),
    {
        preprocessors: [
            DomainWrap.basic({
                noiseGenerator: new Noise(
                    SimplexNoise.seed(1234), { reducer: FBM.reducer({ octaves: 1, frequency: 1 }) }
                ),
                // noiseGenerator: CellularNoise.worleyGenerator(123111, (f1, f2) => {
                //     const a = unnormalize(1 - Math.sqrt(f1)) / 2;
                //     return logistic(a, 8)// spreadTanh11(a);
                // }),

                warpFreq: 0.01,
                warpAmp: 10
            })
        ],
        reducer: FBM.reducer({
            octaves: 1,
            frequency: 0.005,
            lacunarity: 1.5,
            gain: 0.7
        }
            , CellularNoise.worleyReducer(123111, (f1, f2) => {
                const a = unnormalize(1 - f1);
                return 1 - logistic(a, 8);// spreadTanh11(a);
            })
        )
    });
const g0 = new Noise(
    new Hash01Noise(5678),
    // SimplexNoise.seed(1192),
    {
        preprocessors: [
            DomainWrap.basic({
                noiseGenerator: new Noise(
                    SimplexNoise.seed(1234), { reducer: FBM.reducer({ octaves: 5, frequency: 0.005 }) }
                ),
                warpFreq: 1,
                warpAmp: 100
            })
        ],
        reducer: FBM.reducer({
            octaves: 5,
            frequency: 0.005,
            lacunarity: 1.5,
            gain: 0.8
        }
            //     , CellularNoise.worleyReducer(123111, (f1, f2) => {
            //         const a = unnormalize(1 - Math.sqrt(f1)) / 2;
            //         return spreadTanh11(a);
            //     })
        )
    });
