#pragma once
#include "int.h"
// block ids are below this (MAX_BLOCK_ID in src/blocks.js)
constexpr uint MAX_BLOCK_ID = 1024;
// texture layers are below this (MAX_TEXTURES in src/blocks.js): 8 bits in the solid vertices
constexpr uint MAX_TEXTURES = 256;

// the texture layers of the blocks' faces, from src/blocks.json: written by the JS side once after instantiation
// (UIntExtWasmMesher, meshTextureTable in src/blocks.js), at the address the exported block_table() returns
struct block_table_t {
    // the water faces' texture (water, plants in water)
    uint water_texture;
    // by block id, then face (Direction: up, front, left, back, right, down)
    uint faces[MAX_BLOCK_ID][6];
    // 1: a cutout block (leaves with holes): solid, but it doesn't hide the faces next to it
    uint8 cutout_blocks[MAX_BLOCK_ID];
    // 1: a cutout texture: its faces go to the cutout output, drawn alpha tested
    uint8 cutout_textures[MAX_TEXTURES];
};
inline block_table_t block_table;

constexpr uint BLOCK_EMPTY = 0;

static inline bool is_solid(uint block) {
    return (block & 0x8000'0000u) != 0;
}

// a block's height in 1/8 of a block (water levels, later slabs): bits 24..26 of the block, 0 meaning full (8)
constexpr uint BLOCK_HEIGHT_SHIFT = 24;
constexpr uint BLOCK_HEIGHT_FULL = 8;

static inline bool is_x_quads(uint block) {
    return (block >> 29) & 1;
}

static inline uint is_solid_01(uint block) {
    return block >> 31;
}

static inline uint decode_block_id(uint id) {
    return id & 0xff'ffff;
}

// whether a block hides the face of its neighbour: solid and not cutout (its holes show what's behind)
static inline bool hides_face(uint block) {
    return is_solid(block) && !block_table.cutout_blocks[decode_block_id(block)];
}

static inline uint block_height(uint block) {
    uint height = (block >> BLOCK_HEIGHT_SHIFT) & 0b111;
    return height == 0 ? BLOCK_HEIGHT_FULL : height;
}

// water, or a plant in water (x-quads with the liquid bit): both have a water level and water faces
static inline bool is_water(uint block) {
    return (block >> 30) & 1;
}

// Water faces of a cell with water up to `level` (1/8 of a block). Top and bottom are drawn whole or not at all;
// a side face is drawn from the height the neighbour covers up to the level (from 0 next to air or a plant, from
// the neighbour's level next to lower water, not at all next to a solid block or water at least as high).

static inline bool water_top_hidden(uint level, uint above) {
    return level == BLOCK_HEIGHT_FULL && (is_solid(above) || is_water(above));
}

static inline bool water_bottom_hidden(uint below) {
    return is_solid(below) || (is_water(below) && block_height(below) == BLOCK_HEIGHT_FULL);
}

// the height a side face starts at; level or more: nothing to draw
static inline uint water_side_bottom(uint level, uint neighbour) {
    if (is_solid(neighbour))
        return level;
    if (is_water(neighbour))
        return block_height(neighbour) < level ? block_height(neighbour) : level;
    return 0;
}

// a water face's level and bottom in the low byte of the face data (merged faces must match)
static inline uint water_face_data(uint level, uint bottom) {
    return (bottom << 4) | level;
}
