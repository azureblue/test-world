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

    get renderable() {
        
    }
}

export const BLOCK_IDS = {
    EMPTY: 0,
    DIRT: 1,
    DIRT_GRASS: 2,
    GRASS: 3,
    GRAVE: 4,
    ROCK: 5,
    WATER: 6,
    SAND: 7,
    CHUNK_EDGE: 255
};

const BLOCK_EMPTY = BLOCK_IDS.EMPTY;
const BLOCK_CHUNK_EDGE = BLOCK_IDS.CHUNK_EDGE;
const BLOCK_WATER = BLOCK_IDS.WATER;

export const BLOCKS = [
    null,
    new Block(1, "dirt", [1, 1, 1, 1, 1, 1], true),
    new Block(2, "dirtgrass", [3, 2, 2, 2, 2, 1], true),
    new Block(1, "grass", [3, 3, 3, 3, 3, 3], true),
    new Block(1, "gravel", [4, 4, 4, 4, 4, 4], true),
    new Block(1, "rock", [5, 5, 5, 5, 5, 5], true),
    new Block(1, "water", [6, 6, 6, 6, 6, 6], false),
    new Block(1, "sand", [7, 7, 7, 7, 7, 7], true)
]


export function isSolid(block) {
    return (block != BLOCK_EMPTY && block != BLOCK_CHUNK_EDGE && block != BLOCK_WATER);
}

export function isSolidInt(block) {
    return (block != BLOCK_EMPTY && block != BLOCK_CHUNK_EDGE && block != BLOCK_WATER) ? 1 : 0;
}

Object.freeze(BLOCKS);
