import { ChunkGenerator } from "../chunk/chunk.js";
import { NoiseChunkGenerator, TestGenerator } from "./generator.js";

const ChunkGeneratorRegistry = {
    "default": NoiseChunkGenerator,
    "test": TestGenerator,
}

Object.freeze(ChunkGeneratorRegistry);

export const ChunkGeneratorFactory = {
    /**
     * @param {string} name
     * @returns {Promise<ChunkGenerator>} 
     */
    createForName: async function (name, params = {}) {
        const GeneratorClass = ChunkGeneratorRegistry[name];
        if (!GeneratorClass) {
            throw new Error(`Chunk generator with name "${name}" not found in registry`);
        }
        return await GeneratorClass.create(params);
    }
}
