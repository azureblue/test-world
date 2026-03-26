import { ChunkDataFactory } from "./chunk/chunk.js";
import { ChunkExtDataFactory } from "./chunk/extChunk.js";
import { ChunkGenerator, NoiseChunkGenerator } from "./gen/generator.js";
import { ChunkMesher } from "./mesh/mesh.js";
import { UIntWasmMesher } from "./mesh/uIntWasmMesher.js";

/**
 * @returns {ChunkDataFactory} 
 */
export function createChunkDataFactory() {
    return new ChunkExtDataFactory();
}

await UIntWasmMesher.init();

/**
 * @returns {ChunkMesher}
 */
export function createMesher() {
    return new UIntWasmMesher({ quick: false });
}

/**
 * @returns {ChunkMesher}
 */
export function createFastMesher() {
    return new UIntWasmMesher({ quick: true });
}

/**
 * @returns {ChunkGenerator}
 */
export function createGenerator() {
    return new NoiseChunkGenerator();
}
