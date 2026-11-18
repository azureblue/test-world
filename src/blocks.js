export class Block {
    #id
    #name
    #textureIds
    #isSolid

    constructor(id, name, textureIds, isSolid) {
        this.#id = id;
        this.#name = name;
        this.#textureIds = textureIds;
        this.#isSolid = isSolid;
    }

    get id() {
        return this.#id;
    }

    get textureIds() {
        return this.#textureIds;
    }

    get isSolid() {
        return this.#isSolid;
    }

    get name() {
        return this.#name;
    }

    get renderable() {

    }
}

// A block value: bit 31 solid cube, bit 30 liquid, bit 29 x-quads (plants), bits 24..26 the height in 1/8 of a block
// (0 meaning full: water levels, later slabs; see mesh/cpp/blocks.hpp), bits 0..23 the block id. A plant in water
// (waterlogged) is the plant with the liquid bit and the water level: it's water for everything that checks isLiquid.
const SOLID_CUBE_BIT = 31;
const LIQUID_BIT = 30;
const X_QUADS = 29;
const HEIGHT_SHIFT = 24;
const ID_MASK = 0xFFFFFF;
export const BLOCK_HEIGHT_FULL = 8;
/** the level of water open to the air above, in 1/8 of a block (the generator's sea surface) */
export const WATER_SURFACE_LEVEL = 7;
export const BLOCK_IDS = {
    EMPTY: 0,
    DIRT: 1 | (1 << SOLID_CUBE_BIT),
    DIRT_GRASS: 2 | (1 << SOLID_CUBE_BIT),
    GRASS: 3 | (1 << SOLID_CUBE_BIT),
    GRAVEL: 4 | (1 << SOLID_CUBE_BIT),
    ROCK: 5 | (1 << SOLID_CUBE_BIT),
    WATER: 6 | (1 << LIQUID_BIT),
    SAND: 7 | (1 << SOLID_CUBE_BIT),
    GRASS_SHORT_0: 8 | (1 << X_QUADS),
    GRASS_SHORT_1: 9 | (1 << X_QUADS),
    TREE_TRUNK: 16 | (1 << SOLID_CUBE_BIT),
    TREE_LEAVES: 17 | (1 << SOLID_CUBE_BIT),
    CHUNK_EDGE: 255
};

export const MODEL = {
    CUBE: 0,
    CROSS_2: 1
}

const BLOCK_EMPTY = BLOCK_IDS.EMPTY;
const BLOCK_CHUNK_EDGE = BLOCK_IDS.CHUNK_EDGE;
const BLOCK_WATER = BLOCK_IDS.WATER;

const BLOCKS = [
    new Block(0, "empty", [0, 0, 0, 0, 0, 0], false),
    new Block(1, "block_dirt", [1, 1, 1, 1, 1, 1], true),
    new Block(2, "block_dirtgrass", [3, 2, 2, 2, 2, 1], true),
    new Block(3, "block_grass", [3, 3, 3, 3, 3, 3], true),
    new Block(4, "block_gravel", [4, 4, 4, 4, 4, 4], true),
    new Block(5, "block_rock", [5, 5, 5, 5, 5, 5], true),
    new Block(6, "block_water", [6, 6, 6, 6, 6, 6], false),
    new Block(7, "block_sand", [7, 7, 7, 7, 7, 7], true),
    new Block(8, "block_grass_short_0", [0, 8, 8, 8, 8, 0], false),
    new Block(9, "block_grass_short_1", [0, 9, 9, 9, 9, 0], false),
    new Block(10, "empty_10", [0, 0, 0, 0, 0, 0], false),
    new Block(11, "empty_11", [0, 0, 0, 0, 0, 0], false),
    new Block(12, "empty_12", [0, 0, 0, 0, 0, 0], false),
    new Block(13, "empty_13", [0, 0, 0, 0, 0, 0], false),
    new Block(14, "empty_14", [0, 0, 0, 0, 0, 0], false),
    new Block(15, "empty_15", [0, 0, 0, 0, 0, 0], false),
    new Block(16, "tree_trunk", [17, 16, 16, 16, 16, 17], true),
    new Block(17, "tree_leaves", [18, 18, 18, 18, 18, 18], true)
]
Object.freeze(BLOCKS);

const BLOCK_SOLID = [
    false, //0
    true,  //1
    true,  //2
    true,  //3
    true,  //4
    true,  //5
    false, //6
    true,  //7
    false, //8
];
Object.freeze(BLOCK_SOLID);

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

/**
 * The cell with water at the level in it: water for an empty cell, the plant in water for a plant.
 * @param {number} block a cell that {@link canFlood}, or water (its level changes)
 * @param {number} level in 1/8 of a block, 1..8
 * @returns {number} unsigned, as chunk data returns blocks
 */
export function flooded(block, level) {
    return withHeight(isXQuads(block) ? block | (1 << LIQUID_BIT) : BLOCK_IDS.WATER, level);
}

/**
 * What's left of a cell when its block is removed: the water of a plant in water, otherwise nothing.
 * @param {number} block
 */
export function removed(block) {
    return isXQuads(block) && isLiquid(block) ? withHeight(BLOCK_IDS.WATER, blockHeight(block)) : BLOCK_IDS.EMPTY;
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

