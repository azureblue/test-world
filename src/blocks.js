import definitions from "./blocks.json" with { type: "json" };

/**
 * A block type, from src/blocks.json (docs/proposals/block-definitions.md).
 */
export class Block {
    #id
    #name
    #model
    #textureIds
    #cutoutTextureIds
    #light
    #full

    /**
     * @param {number} id
     * @param {string} name
     * @param {string} model "none", "cube" (a solid cube), "liquid", "x_quads" (plants) or "slab" (a shaped block,
     *   docs/proposals/shaped-blocks.md)
     * @param {number[]} textureIds texture layers by face: up, front, left, back, right, down (the mesher's Direction)
     * @param {number[] | null} cutoutTextureIds a cube's textures with holes (alpha 0), by face, used instead with
     *   Settings.render.cutoutLeaves: its faces are alpha tested, and it doesn't hide the faces next to it
     * @param {number} light the block light it gives, 0..15 (docs/proposals/lighting.md)
     * @param {string | null} full a slab's full block: two of its halves make it (a name in blocks.json)
     */
    constructor(id, name, model, textureIds, cutoutTextureIds = null, light = 0, full = null) {
        this.#id = id;
        this.#name = name;
        this.#model = model;
        this.#textureIds = textureIds;
        this.#cutoutTextureIds = cutoutTextureIds;
        this.#light = light;
        this.#full = full;
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

    get cutoutTextureIds() {
        return this.#cutoutTextureIds;
    }

    get light() {
        return this.#light;
    }

    get isSolid() {
        return this.#model === "cube";
    }

    /** a slab's full block (its name), null if none */
    get full() {
        return this.#full;
    }
}

// A block value: bit 31 solid cube, bit 30 liquid, bit 29 x-quads (plants), bit 28 shaped (slabs), bit 27 flowing
// (water that isn't a source, see world/waterFlow.js), bits 24..26 the height in 1/8 of a block (0 meaning full: water
// levels; see mesh/cpp/blocks.hpp), bit 16 cutout (a cube with cutout textures), bits 0..15 the block id. A plant in
// water (waterlogged) is the plant with the liquid bit, the water level and maybe the flowing bit: it's water for
// everything that checks isLiquid. A shaped block has no water: bits 23..27 are its shape (SHAPE_OCTANTS).
const SOLID_CUBE_BIT = 31;
const LIQUID_BIT = 30;
const X_QUADS = 29;
const SHAPED_BIT = 28;
const FLOWING_BIT = 27;
const HEIGHT_SHIFT = 24;
const SHAPE_SHIFT = 23;
const CUTOUT_BIT = 16;
const ID_MASK = 0xFFFF;
/** the water bits of a cell: liquid, flowing, height */
const WATER_BITS = (1 << LIQUID_BIT) | (1 << FLOWING_BIT) | (0b111 << HEIGHT_SHIFT);
/** a shaped block's shape bits */
const SHAPE_BITS = 0b11111 << SHAPE_SHIFT;
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
    x_quads: 1 << X_QUADS,
    slab: 1 << SHAPED_BIT
};

/**
 * Shaped blocks' shapes (docs/proposals/shaped-blocks.md): the index in a block value's shape bits. A shape is the
 * octants (half blocks) of the cell it fills, octant ox | oy << 1 | oz << 2: SHAPE_OCTANTS by index.
 */
export const SHAPES = Object.freeze({ SLAB_BOTTOM: 0, SLAB_TOP: 1 });
/** shapes are below this: 5 bits (MAX_SHAPES in mesh/cpp/blocks.hpp) */
export const MAX_SHAPES = 32;
/** the octants of each shape, by index (the meshers get them in their block table) */
export const SHAPE_OCTANTS = new Uint8Array(MAX_SHAPES);
SHAPE_OCTANTS[SHAPES.SLAB_BOTTOM] = 0b0000_1111;
SHAPE_OCTANTS[SHAPES.SLAB_TOP] = 0b1111_0000;
/** all 8 octants: a solid cube */
export const FULL_OCTANTS = 0xFF;

/** faces in the mesher's order (Direction in mesh/cpp/common.hpp) */
const FACES = ["up", "front", "left", "back", "right", "down"];

/**
 * The blocks of src/blocks.json; a block's textures (and a cube's optional cutout textures) are one name for all faces
 * or {top, sides, bottom}.
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
        if (def.cutout !== undefined && def.model !== "cube")
            throw new Error(`blocks.json: block ${def.name}: cutout textures on a ${def.model}, only cubes have them`);
        if (def.full !== undefined && def.model !== "slab")
            throw new Error(`blocks.json: block ${def.name}: a full block for a ${def.model}, only slabs have one`);
        const byFace = (t) => (typeof t === "string" ? FACES.map(() => t)
            : FACES.map(face => face === "up" ? t.top : face === "down" ? t.bottom : t.sides)).map(name => layer(name, def.name));
        // nothing drawn: layer 0, never used
        const textureIds = t === undefined ? FACES.map(() => 0) : byFace(t);
        const cutoutTextureIds = def.cutout === undefined ? null : byFace(def.cutout);
        const light = def.light ?? 0;
        if (!Number.isInteger(light) || light < 0 || light > 15)
            throw new Error(`blocks.json: block ${def.name}: light ${light}, 0..15`);
        // the light pass seeds an emitter's light in the open cells next to it: the emitter is a solid cube
        if (light > 0 && def.model !== "cube")
            throw new Error(`blocks.json: block ${def.name}: light on a ${def.model}, only cubes give light`);
        blocks[def.id] = new Block(def.id, def.name, def.model, textureIds, cutoutTextureIds, light, def.full ?? null);
    }
    // two halves of a slab make its full block: a cube
    for (const block of blocks)
        if (block?.full != null && blocks.find(b => b?.name === block.full)?.model !== "cube")
            throw new Error(`blocks.json: block ${block.name}: full block ${block.full} isn't a cube`);
    // the water vertices have 4 bits for the texture (mesh/cpp/quad_encode.hpp): liquid textures early in the list
    for (const block of blocks)
        if (block?.model === "liquid" && block.textureIds.some(id => id >= 16))
            throw new Error(`blocks.json: block ${block.name}: liquid textures must be among the first 16`);
    return blocks;
}

const BLOCKS = loadBlocks();
Object.freeze(BLOCKS);

/** the block light each block gives (0..15), by id: the light pass's emitters (world/lighting.js) */
export const BLOCK_LIGHT = new Uint8Array(MAX_BLOCK_ID);
for (const block of BLOCKS)
    if (block !== undefined)
        BLOCK_LIGHT[block.id] = block.light;

/** block values by name (the id with the model's kind bits), e.g. BLOCK_IDS.DIRT_GRASS */
export const BLOCK_IDS = Object.freeze(Object.fromEntries(
    BLOCKS.filter(b => b !== undefined).map(b => [b.name, (b.id | MODEL_BITS[b.model] | (b.cutoutTextureIds !== null ? 1 << CUTOUT_BIT : 0)) >>> 0])));

/** texture layers are below this: 8 bits in the solid vertices (mesh/cpp/quad_encode.hpp), the meshers' table */
export const MAX_TEXTURES = 256;
if (definitions.textures.length > MAX_TEXTURES)
    throw new Error(`blocks.json: ${definitions.textures.length} textures, at most ${MAX_TEXTURES}`);

/**
 * What the meshers need (UIntExtWasmMesher writes it into their memory, block_table_t in mesh/cpp/blocks.hpp): the
 * texture layer of every face of every block id, the water's (the water faces of water and of plants in water), and
 * with cutout the cutout blocks (their cutout textures instead, faces next to them not hidden) and textures (faces
 * drawn alpha tested, apart from the opaque ones).
 * @param {boolean} cutout whether blocks with cutout textures use them (Settings.render.cutoutLeaves)
 * @param {boolean} [cutoutBuried] with cutout: the cutout blocks covered on all sides use them too (their opaqueFaces
 *   are the cutout textures; Settings.render.cutoutBuriedLeaves)
 * @returns {{waterTexture: number, cutoutFlag: number, faces: Uint32Array, opaqueFaces: Uint32Array, cutoutTextures: Uint8Array}}
 *   faces: MAX_BLOCK_ID * 6, by id then face; opaqueFaces: the same with the opaque textures (cutout blocks covered on
 *   all sides use them); cutoutFlag: the cutout bit of block values with cutout, else 0; cutoutTextures: 1 by layer
 */
export function meshTextureTable(cutout, cutoutBuried = false) {
    const faces = new Uint32Array(MAX_BLOCK_ID * 6), opaqueFaces = new Uint32Array(MAX_BLOCK_ID * 6);
    const cutoutBlocks = new Uint8Array(MAX_BLOCK_ID), cutoutTextures = new Uint8Array(MAX_TEXTURES);
    for (const block of BLOCKS) {
        if (block === undefined)
            continue;
        const ids = cutout && block.cutoutTextureIds !== null ? block.cutoutTextureIds : block.textureIds;
        faces.set(ids, block.id * 6);
        opaqueFaces.set(cutoutBuried ? ids : block.textureIds, block.id * 6);
        if (ids !== block.textureIds) {
            cutoutBlocks[block.id] = 1;
            for (const id of ids)
                cutoutTextures[id] = 1;
        }
    }
    for (const block of BLOCKS)
        if (block !== undefined && !cutoutBlocks[block.id] && block.textureIds.some(id => cutoutTextures[id]))
            throw new Error(`blocks.json: block ${block.name} uses a cutout texture without being cutout`);
    return { waterTexture: BLOCKS[BLOCK_IDS.WATER & ID_MASK].textureIds[0], cutoutFlag: cutout ? 1 << CUTOUT_BIT : 0, faces, opaqueFaces, cutoutTextures };
}

/**
 * The opaque texture of every texture layer: a cutout block's cutout texture to its opaque one, every other layer to
 * itself. The far leaves are drawn with them (WorldRenderer).
 * @returns {Uint32Array} MAX_TEXTURES layers
 */
export function opaqueTextureTable() {
    const table = new Uint32Array(MAX_TEXTURES).map((_, i) => i);
    for (const block of BLOCKS)
        if (block !== undefined && block.cutoutTextureIds !== null)
            block.cutoutTextureIds.forEach((id, face) => table[id] = block.textureIds[face]);
    return table;
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

/**
 * The faces of a cell octants close: all 4 octants at the face filled. Bits by face: 0 -x, 1 +x, 2 -y, 3 +y, 4 -z, 5 +z;
 * the octants at each.
 */
const FACE_OCTANTS = [0b0101_0101, 0b1010_1010, 0b0011_0011, 0b1100_1100, 0b0000_1111, 0b1111_0000];
export const FACE_UP = 1 << 5, FACE_DOWN = 1 << 4;
/** by shape, the faces its octants close */
const SHAPE_CLOSED_FACES = SHAPE_OCTANTS.map(octants => FACE_OCTANTS.reduce((faces, f, i) => faces | ((octants & f) === f ? 1 << i : 0), 0));

/**
 * The faces of a shaped block's cell its octants close (bits: 0 -x, 1 +x, 2 -y, 3 +y, 4 -z, 5 +z): light passes
 * through the others (docs/proposals/lighting.md; the empty octants of a shape are connected). 0 for anything else.
 * @param {number} block
 */
export function closedFaces(block) {
    return isShaped(block) ? SHAPE_CLOSED_FACES[blockShape(block)] : 0;
}

/**
 * Whether a block stops the sky light falling straight down: a solid one, a shaped one with its top or bottom closed
 * (a slab; not a vertical slab).
 * @param {number} block
 */
export function stopsSkyLight(block) {
    return isSolid(block) || (closedFaces(block) & (FACE_UP | FACE_DOWN)) !== 0;
}

/** a shaped block (a slab): it fills the octants of its shape (blockOctants) */
export function isShaped(block) {
    return (block >>> SHAPED_BIT & 1) !== 0;
}

/**
 * @param {number} block a shaped block
 * @returns {number} its shape, a value of SHAPES
 */
export function blockShape(block) {
    return (block & SHAPE_BITS) >>> SHAPE_SHIFT;
}

/**
 * @param {number} block a shaped block
 * @param {number} shape a value of SHAPES
 * @returns {number} the block with that shape (unsigned)
 */
export function withShape(block, shape) {
    return ((block & ~SHAPE_BITS) | (shape << SHAPE_SHIFT)) >>> 0;
}

/**
 * The octants (half blocks) of its cell a block fills, bit ox | oy << 1 | oz << 2: all of a solid cube, its shape's of
 * a shaped block, none of anything else (water, plants: they don't block).
 * @param {number} block
 */
export function blockOctants(block) {
    return isSolid(block) ? FULL_OCTANTS : isShaped(block) ? SHAPE_OCTANTS[blockShape(block)] : 0;
}

/**
 * Whether a block fills the point of its cell (a position in the cell, 0..1 each): see blockOctants.
 * @param {number} block
 */
export function fillsPoint(block, fx, fy, fz) {
    return (blockOctants(block) >> ((fx >= 0.5 ? 1 : 0) | (fy >= 0.5 ? 2 : 0) | (fz >= 0.5 ? 4 : 0)) & 1) !== 0;
}

/**
 * The box around octants, in a cell (0..1 each).
 * @param {number} octants a mask (blockOctants), not 0
 * @returns {number[]} x0, y0, z0, x1, y1, z1
 */
export function octantsBox(octants) {
    const box = [1, 1, 1, 0, 0, 0];
    for (let o = 0; o < 8; o++) {
        if (!(octants >> o & 1))
            continue;
        for (let a = 0; a < 3; a++) {
            const at = (o >> a & 1) / 2;
            box[a] = Math.min(box[a], at);
            box[a + 3] = Math.max(box[a + 3], at + 0.5);
        }
    }
    return box;
}

export function isLiquidInt(block) {
    return block >>> LIQUID_BIT & 1;
}

export function getBlockById(id) {
    return BLOCKS[id & ID_MASK];
}

/**
 * The bits of a block value that are its state, not given by its kind in blocks.json: the water bits (liquid for a
 * plant in water, flowing, the level), a shaped block's shape. A block value is its kind's value (BLOCK_IDS) with
 * these (save/chunkCodec.js).
 * @param {number} block
 */
export function blockState(block) {
    return (block & (WATER_BITS | SHAPE_BITS)) >>> 0;
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

