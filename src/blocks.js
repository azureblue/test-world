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

const SOLID_BIT = 31;
const LIQUID_BIT = 30;
export const BLOCK_IDS = {
    EMPTY: 0,
    DIRT: 1 | (1 << SOLID_BIT),
    DIRT_GRASS: 2 | (1 << SOLID_BIT),
    GRASS: 3 | (1 << SOLID_BIT),
    GRAVE: 4 | (1 << SOLID_BIT),
    ROCK: 5 | (1 << SOLID_BIT),
    WATER: 6 | (1 << LIQUID_BIT),
    SAND: 7 | (1 << SOLID_BIT),
    GRASS_SHORT: 8 | (1 << SOLID_BIT),
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
    new Block(8, "block_grass_short", [0, 8, 8, 8, 8, 0], true)
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
    return (block >>> SOLID_BIT & 1) !== 0;
}

export function isSolidInt(block) {
    return block >>> SOLID_BIT & 1;
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

