import { ChunkGenerator } from "../chunk/chunk.js";
import { ClimateGenerator } from "./collection/climate.js";
import { FlatGenerator } from "./collection/flat.js";
import { NoiseChunkGenerator, TestGenerator } from "./generator.js";
import { TreeGalleryGenerator } from "./trees/treeGallery.js";

const ChunkGeneratorRegistry = {
    "default": NoiseChunkGenerator,
    "test": TestGenerator,
    "trees": TreeGalleryGenerator,
    "flat": FlatGenerator,
    "climate": ClimateGenerator
}

Object.freeze(ChunkGeneratorRegistry);

export const ChunkGeneratorFactory = {
    /**
     * @param {string} name a generator of the registry, or the path of a module (ending in .js, from the site's root,
     *   e.g. "/scenarios/pool.js") whose `world(seed)` returns a generator (a test scene, see SceneGenerator)
     * @param {number} seed an integer, the world's seed
     * @param {object} [params] the generator's own options
     * @returns {Promise<ChunkGenerator>} 
     */
    createForName: async function (name, seed, params = {}) {
        if (!Number.isInteger(seed))
            throw new Error(`a generator's seed must be an integer, got ${seed}`);
        if (name.endsWith(".js")) {
            const module = await import(new URL(name, self.location.href).href);
            if (typeof module.world !== "function")
                throw new Error(`generator module "${name}" has no world() function`);
            return await module.world(seed);
        }
        const GeneratorClass = ChunkGeneratorRegistry[name];
        if (!GeneratorClass) {
            throw new Error(`Chunk generator with name "${name}" not found in registry`);
        }
        return await GeneratorClass.create(seed, params);
    }
}
