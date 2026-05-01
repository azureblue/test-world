#pragma once
#include "int.h"
inline constexpr uint BLOCKS_TEXTURES[9][6] = {
    {0, 0, 0, 0, 0, 0},
    {1, 1, 1, 1, 1, 1},
    {3, 2, 2, 2, 2, 1},
    {3, 3, 3, 3, 3, 3},
    {4, 4, 4, 4, 4, 4},
    {5, 5, 5, 5, 5, 5},
    {6, 6, 6, 6, 6, 6},
    {7, 7, 7, 7, 7, 7},
    {0, 9, 9, 9, 9, 0},
};

constexpr uint BLOCK_WATER = 6;
constexpr uint BLOCK_EMPTY = 0;
constexpr uint WATER_TEXTURE = 6;

static inline bool is_solid(uint block) {
    return (block & 0x8000'0000u) != 0;
}

static inline bool is_x_quads(uint block) {
    return (block >> 29) & 1;
}

static inline uint is_solid_01(uint block) {
    return block >> 31;
}

static inline uint decode_block_id(uint id) {
    return id & 0x7fff'fff;
}


