import { ChunkBlockData } from "../chunk/chunk.js";
import { ChunkExtDataFactory } from "../chunk/extChunk.js";
import { GeneratorPatterns } from "../gen/generator.js";
import { ivec3 } from "../geom.js";
import { UIntWasmMesher } from "../mesh/uIntWasmMesher.js";
import { Arrays, Float32Buffer } from "../utils.js";
async function sha1String(arr) {
    const view = new Uint8Array(
        arr.buffer,
        arr.byteOffset,
        arr.byteLength
    );

    const hashBuffer = await crypto.subtle.digest("SHA-1", view);
    const bytes = new Uint8Array(hashBuffer);

    return Array.from(bytes)
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");
}
export async function main() {
    await UIntWasmMesher.init();

    const mesher = new UIntWasmMesher({ quick: false });
    const chunkDataFactory = new ChunkExtDataFactory();
    let chunkDataCollection = {
        fullChecker: chunkDataFactory.createChunkDataFrom(GeneratorPatterns.fullChecker(new ChunkBlockData())),
        doubleChecker: chunkDataFactory.createChunkDataFrom(GeneratorPatterns.doubleChecker(new ChunkBlockData())),
        fullSolid: chunkDataFactory.createChunkDataFrom(GeneratorPatterns.fullSolid(new ChunkBlockData())),
        hStripes: chunkDataFactory.createChunkDataFrom(GeneratorPatterns.horizontalStripes(new ChunkBlockData())),
        vStripesY: chunkDataFactory.createChunkDataFrom(GeneratorPatterns.verticalStripesY(new ChunkBlockData())),
        vStripesX: chunkDataFactory.createChunkDataFrom(GeneratorPatterns.verticalStripesX(new ChunkBlockData())),
        border: chunkDataFactory.createChunkDataFrom(GeneratorPatterns.border(new ChunkBlockData()))
    };
    const keys = Object.keys(chunkDataCollection);
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
            const chunkData = chunkDataCollection[keys[i]];
            times.reset();
            let sum = 0;
            const reps = 100;
            for (let j = 0; j < reps; j++) {
                mesher.createMesh(ivec3(), chunkData);
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
        const chunkData = chunkDataCollection[keys[i]];
        const meshData = mesher.createMesh(ivec3(), chunkData);        
        
        const hash = await sha1String(meshData.data);
        console.log(`${keys[i].padEnd(13)} : mesh size ${meshData.data.length.toString().padEnd(7)} ${hash.substring(0, 8)}`);
        
        
    }
}