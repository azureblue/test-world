import definitions from "./blocks.json" with { type: "json" };

/**
 * A block type, from src/blocks.json (docs/proposals/block-definitions.md).
 */
export class Block {
    #id
    #name
    #model
    #textureIds

    /**
     * @param {number} id
     * @param {string} name
     * @param {string} model "none", "cube" (a solid cube), "liquid" or "x_quads" (plants)
     * @param {number[]} textureIds texture layers by face: up, front, left, back, right, down (the mesher's Direction)
     */
    constructor(id, name, model, textureIds) {
        this.#id = id;
        this.#name = name;
        this.#model = model;
        this.#textureIds = textureIds;
    }

    get id() {
        return this.#id;
    }

    get name() {
        return this.#name;
    }

    get model() {
        return this.#model;
    }

    get textureIds() {
        return this.#textureIds;
    }

    get isSolid() {
        return this.#model === "cube";
    }
}

// A block value: bit 31 solid cube, bit 30 liquid, bit 29 x-quads (plants), bit 27 flowing (water that isn't a
// source, see world/waterFlow.js), bits 24..26 the height in 1/8 of a block (0 meaning full: water levels, later
// slabs; see mesh/cpp/blocks.hpp), bits 0..23 the block id. A plant in water (waterlogged) is the plant with the
// liquid bit, the water level and maybe the flowing bit: it's water for everything that checks isLiquid.
const SOLID_CUBE_BIT = 31;
const LIQUID_BIT = 30;
const X_QUADS = 29;
const FLOWING_BIT = 27;
const HEIGHT_SHIFT = 24;
const ID_MASK = 0xFFFFFF;
/** the water bits of a cell: liquid, flowing, height */
const WATER_BITS = (1 << LIQUID_BIT) | (1 << FLOWING_BIT) | (0b111 << HEIGHT_SHIFT);
export const BLOCK_HEIGHT_FULL = 8;
/** the level of water open to the air above, in 1/8 of a block (the generator's sea surface) */
export const WATER_SURFACE_LEVEL = 7;
/** block ids are below this: the size of the meshers' face table (MAX_BLOCK_ID in mesh/cpp/blocks.hpp) */
export const MAX_BLOCK_ID = 1024;

/** the kind bits of a block value by model */
const MODEL_BITS = {
    none: 0,
    cube: 1 << SOLID_CUBE_BIT,
    liquid: 1 << LIQUID_BIT,
    x_quads: 1 << X_QUADS
};

/** faces in the mesher's order (Direction in mesh/cpp/common.hpp) */
const FACES = ["up", "front", "left", "back", "right", "down"];

/**
 * The blocks of src/blocks.json; a block's textures are one name for all faces or {top, sides, bottom}.
 * @returns {Block[]} indexed by id
 */
function loadBlocks() {
    /** @type {Map<string, number>} texture name -> layer: its index in the list (blockTextures.js composes them so) */
    const layers = new Map(definitions.textures.map((t, i) => [t.name, i]));
    if (layers.size !== definitions.textures.length)
        throw new Error("blocks.json: texture names repeat");
    const layer = (name, block) => {
        if (!layers.has(name))
            throw new Error(`blocks.json: block ${block}: no texture "${name}"`);
        return layers.get(name);
    };
    const blocks = [];
    for (const def of definitions.blocks) {
        if (!(def.model in MODEL_BITS))
            throw new Error(`blocks.json: block ${def.name}: no model "${def.model}"`);
        if (!Number.isInteger(def.id) || def.id < 0 || def.id >= MAX_BLOCK_ID || blocks[def.id] !== undefined)
            throw new Error(`blocks.json: block ${def.name}: id ${def.id} invalid or taken`);
        const t = def.textures;
        if ((t === undefined) !== (def.model === "none"))
            throw new Error(`blocks.json: block ${def.name}: textures ${t === undefined ? "missing" : "for nothing to draw"}`);
        // nothing drawn: layer 0, never used
        const byFace = t === undefined ? null : typeof t === "string" ? FACES.map(() => t)
            : FACES.map(face => face === "up" ? t.top : face === "down" ? t.bottom : t.sides);
        const textureIds = byFace === null ? FACES.map(() => 0) : byFace.map(name => layer(name, def.name));
        blocks[def.id] = new Block(def.id, def.name, def.model, textureIds);
    }
    // the water vertices have 4 bits for the texture (mesh/cpp/quad_encode.hpp): liquid textures early in the list
    for (const block of blocks)
        if (block?.model === "liquid" && block.textureIds.some(id => id >= 16))
            throw new Error(`blocks.json: block ${block.name}: liquid textures must be among the first 16`);
    return blocks;
}

const BLOCKS = loadBlocks();
Object.freeze(BLOCKS);

/** block values by name (the id with the model's kind bits), e.g. BLOCK_IDS.DIRT_GRASS */
export const BLOCK_IDS = Object.freeze(Object.fromEntries(
    BLOCKS.filter(b => b !== undefined).map(b => [b.name, b.id | MODEL_BITS[b.model]])));

/**
 * What the meshers need (UIntExtWasmMesher writes it into their memory): the texture layer of every face of every
 * block id, and the water's (the water faces of water and of plants in water).
 * @returns {{waterTexture: number, faces: Uint32Array}} faces: MAX_BLOCK_ID * 6, by id then face
 */
export function meshTextureTable() {
    const faces = new Uint32Array(MAX_BLOCK_ID * 6);
    for (const block of BLOCKS)
        if (block !== undefined)
            faces.set(block.textureIds, block.id * 6);
    return { waterTexture: BLOCKS[BLOCK_IDS.WATER & ID_MASK].textureIds[0], faces };
}

export function isSolid(block) {
    return (block >>> SOLID_CUBE_BIT & 1) !== 0;
}

export function isSolidInt(block) {
    return block >>> SOLID_CUBE_BIT & 1;
}

export function isLiquid(block) {
    return (block >>> LIQUID_BIT & 1) !== 0;
}

export function isXQuads(block) {
    return (block >>> X_QUADS & 1) !== 0;
}

/**
 * Whether water can flow into the cell: empty, or a plant not in water yet.
 * @param {number} block
 */
export function canFlood(block) {
    return block === BLOCK_IDS.EMPTY || (isXQuads(block) && !isLiquid(block));
}

/** water that isn't a source: it stays only as long as its neighbours feed it (world/waterFlow.js) */
export function isFlowing(block) {
    return (block >>> FLOWING_BIT & 1) !== 0;
}

/** source water: generated or placed, it never drains */
export function isSource(block) {
    return isLiquid(block) && !isFlowing(block);
}

/**
 * The cell with water at the level in it: water for an empty cell or water, the plant in water for a plant.
 * @param {number} block a cell that {@link canFlood}, or water (its water changes)
 * @param {number} level in 1/8 of a block, 1..8
 * @param {boolean} flowing
 * @returns {number} unsigned, as chunk data returns blocks
 */
export function flooded(block, level, flowing = false) {
    const water = isXQuads(block) ? (block & ~WATER_BITS) | (1 << LIQUID_BIT) : BLOCK_IDS.WATER;
    return withHeight(flowing ? water | (1 << FLOWING_BIT) : water, level);
}

/**
 * The cell without its water: nothing for water, the plant for a plant in water.
 * @param {number} block
 * @returns {number} unsigned
 */
export function drained(block) {
    return isXQuads(block) ? (block & ~WATER_BITS) >>> 0 : BLOCK_IDS.EMPTY;
}

/**
 * What's left of a cell when its block is removed: the water of a plant in water, otherwise nothing.
 * @param {number} block
 */
export function removed(block) {
    return isXQuads(block) && isLiquid(block) ? flooded(BLOCK_IDS.EMPTY, blockHeight(block), isFlowing(block)) : BLOCK_IDS.EMPTY;
}

export function isLiquidInt(block) {
    return block >>> LIQUID_BIT & 1;
}

export function getBlockById(id) {
    return BLOCKS[id & ID_MASK];
}

/**
 * @param {number} block
 * @returns {number} the height in 1/8 of a block, 1..8
 */
export function blockHeight(block) {
    const height = (block >>> HEIGHT_SHIFT) & 0b111;
    return height === 0 ? BLOCK_HEIGHT_FULL : height;
}

/**
 * @param {number} block
 * @param {number} height in 1/8 of a block, 1..8
 * @returns {number} the block with that height (unsigned, as chunk data returns blocks)
 */
export function withHeight(block, height) {
    return ((block & ~(0b111 << HEIGHT_SHIFT)) | ((height & 0b111) << HEIGHT_SHIFT)) >>> 0;
}

