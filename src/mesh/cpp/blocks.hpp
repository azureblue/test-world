#pragma once
#include "int.h"
inline constexpr uint BLOCKS_TEXTURES[20][6] = {
    {0, 0, 0, 0, 0, 0}, // 0
    {1, 1, 1, 1, 1, 1}, // 1
    {3, 2, 2, 2, 2, 1}, // 2
    {3, 3, 3, 3, 3, 3}, // 3
    {4, 4, 4, 4, 4, 4}, // 4
    {5, 5, 5, 5, 5, 5}, // 5
    {6, 6, 6, 6, 6, 6}, // 6
    {7, 7, 7, 7, 7, 7}, // 7
    {0, 8, 8, 8, 8, 0}, // 8
    {0, 9, 9, 9, 9, 0}, // 9
    {0}, // 10
    {0}, // 11
    {0}, // 12
    {0}, // 13
    {0}, // 14
    {0}, // 15
    {17, 16, 16, 16, 16, 17}, // 16
    {18, 18, 18, 18, 18, 18} // 17
};

constexpr uint BLOCK_WATER = 6;
constexpr uint BLOCK_EMPTY = 0;
constexpr uint WATER_TEXTURE = 6;

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
