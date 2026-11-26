/**
 * The generators' names (gen/registry.js), without loading them: the registry imports every generator, and some load
 * their WebAssembly when imported, which the page doesn't need for a list (the world menu). The registry checks that
 * this list matches it.
 */
export const GENERATOR_NAMES = Object.freeze(["default", "test", "trees", "flat", "climate"]);
