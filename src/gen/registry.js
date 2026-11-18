import { ChunkGenerator } from "../chunk/chunk.js";
import { FlatGenerator } from "./collection/flat.js";
import { NoiseChunkGenerator, TestGenerator } from "./generator.js";
import { TreeTestGenerator } from "./treeTestGenerator.js";

const ChunkGeneratorRegistry = {
    "default": NoiseChunkGenerator,
    "test": TestGenerator,
    "trees": TreeTestGenerator,
    "flat": FlatGenerator
}

Object.freeze(ChunkGeneratorRegistry);

export const ChunkGeneratorFactory = {
    /**
     * @param {string} name a generator of the registry, or the path of a module (ending in .js, from the site's root,
     *   e.g. "/scenarios/pool.js") whose `world()` returns a generator (a test scene, see SceneGenerator)
     * @returns {Promise<ChunkGenerator>} 
     */
    createForName: async function (name, params = {}) {
        if (name.endsWith(".js")) {
            const module = await import(new URL(name, self.location.href).href);
            if (typeof module.world !== "function")
                throw new Error(`generator module "${name}" has no world() function`);
            return await module.world();
        }
        const GeneratorClass = ChunkGeneratorRegistry[name];
        if (!GeneratorClass) {
            throw new Error(`Chunk generator with name "${name}" not found in registry`);
        }
        return await GeneratorClass.create(params);
    }
}
