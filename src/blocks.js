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

const SOLID_CUBE_BIT = 31;
const LIQUID_BIT = 30;
const X_QUADS = 29;
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

export function isLiquidInt(block) {
    return block >>> LIQUID_BIT & 1;
}

export function getBlockById(id) {
    return BLOCKS[id & 0x7FFFFFF];
}

