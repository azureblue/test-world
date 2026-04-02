import { ChunkDataFactory } from "./chunk/chunk.js";
import { ChunkExtDataFactory } from "./chunk/extChunk.js";
import { ChunkGenerator, NoiseChunkGenerator } from "./gen/generator.js";
import { ChunkMesher } from "./mesh/mesh.js";
import { UIntExtWasmMesher } from "./mesh/uIntWasmMesher.js";

/**
 * @returns {ChunkDataFactory} 
 */
export function createChunkDataFactory() {
    return new ChunkExtDataFactory();
}

/**
 * @returns {ChunkGenerator}
 */
export function createGenerator() {
    return new NoiseChunkGenerator();
}
