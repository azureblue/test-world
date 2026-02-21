import { ChunkData, ChunkDataExtended } from "../chunk.js";
import { GeneratorPatterns } from "../gen/generator.js";
import { ivec3 } from "../geom.js";
import { UIntWasmMesher } from "../mesher.js";
import { Arrays, Float32Buffer } from "../utils.js";

export async function main() {
    await UIntWasmMesher.init();
    const mesher = new UIntWasmMesher();
    let chunkDataE = {
        fullChecker: ChunkDataExtended.fromChunkData(GeneratorPatterns.fullChecker(new ChunkData())),
        doubleChecker: ChunkDataExtended.fromChunkData(GeneratorPatterns.doubleChecker(new ChunkData())),
        fullSolid: ChunkDataExtended.fromChunkData(GeneratorPatterns.fullSolid(new ChunkData())),
        hStripes: ChunkDataExtended.fromChunkData(GeneratorPatterns.horizontalStripes(new ChunkData())),
        vStripesY: ChunkDataExtended.fromChunkData(GeneratorPatterns.verticalStripesY(new ChunkData())),
        vStripesX: ChunkDataExtended.fromChunkData(GeneratorPatterns.verticalStripesX(new ChunkData())),
        border: ChunkDataExtended.fromChunkData(GeneratorPatterns.border(new ChunkData()))
    };
    const keys = Object.keys(chunkDataE);
    const times = new Float32Buffer(200);
    let totalTotalTime = 0;
    let totalTotalSum = 0;
    let totalTotalCount = 0;
    for (let t = 0; t < 4; t++) {
        let totalTime = 0;
        let totalSum = 0;
        let totalCount = 0;
        console.log(`--- run ${t} ---`);
        for (let i = 0; i < keys.length; i++) {
            const chunkData = chunkDataE[keys[i]];
            times.reset();
            let sum = 0;
            const reps = 100;
            for (let j = 0; j < reps; j++) {
                mesher.createMeshes(ivec3(), chunkData);
                const lastMeshTime = mesher.lastMeshTime();
                times.put(lastMeshTime);
                sum += lastMeshTime;
                totalTime += lastMeshTime;
                totalSum += lastMeshTime;
                totalCount++;
            }
            console.log(`${keys[i].padEnd(13)} : avg ${(sum / reps).toFixed(2).padEnd(5)} min ${Arrays.min(times.view()).toFixed(2).padEnd(5)} max ${Arrays.max(times.view()).toFixed(2).padEnd(5)} median ${Arrays.median(times.view()).toFixed(2).padEnd(5)}`);
        }
        if (t > 0) {
            totalTotalCount++;
            totalTotalTime += totalTime;
            totalTotalSum += totalSum;
        }
        console.log(`test time: ${(totalTime).toFixed(2)} ms`);
        console.log(`test avg: ${(totalTime / totalCount).toFixed(2)} ms`);
    }
    console.log(`total test time: ${(totalTotalTime).toFixed(2)} ms`);
    console.log(`total test avg: ${(totalTotalSum / totalTotalCount).toFixed(2)} ms`);
    for (let i = 0; i < keys.length; i++) {
        const chunkData = chunkDataE[keys[i]];
        const meshData = mesher.createMeshes(ivec3(), chunkData);
         console.log(`${keys[i].padEnd(13)} : mesh size ${meshData.input.length}`);
    }
}