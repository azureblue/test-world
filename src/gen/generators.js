import { logistic, spreadSin11, unnormalize } from "../functions.js";
import { CellularNoise } from "../noise/cellular.js";
import { FBM } from "../noise/fbm.js";
import { Hash01Noise } from "../noise/hashNoise.js";
import { DomainWrap, Noise, Postprocessor } from "../noise/noise.js";
import { SimplexNoise } from "../noise/opensimplex2.js";

export function testgen() {
    return test2;
}

const test2 = new Noise(
        SimplexNoise.seed(128334),
        // SimplexNoise.seed(1192),
        {
            preprocessors: [
                DomainWrap.basic({
                    noiseGenerator: new Noise(
                        SimplexNoise.seed(123634), { reducer: FBM.reducer({ octaves: 6, frequency: 1 }) }
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
                octaves: 5,
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
                Postprocessor.of(v => spreadSin11(v, 0.4))
            ]
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
                Postprocessor.of(v => spreadSin11(v, 0.4))
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
                ,CellularNoise.worleyReducer(123111, (f1, f2) => {
                    const a = unnormalize(1 - f1);
                    return  1 - logistic(a, 8);// spreadTanh11(a);
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
