#pragma once
#include "int.h"

enum Direction : uint {
    Up = 0,
    Front = 1,
    Left = 2,
    Back = 3,
    Right = 4,
    Down = 5,
    Diagonal0 = 6,
    Diagonal1 = 7
};

constexpr uint CHUNK_SIZE = 32;
constexpr uint PLANE_SIZE = CHUNK_SIZE * CHUNK_SIZE;
constexpr uint CHUNK_SIZE_E = CHUNK_SIZE + 2;
constexpr uint MAX_VISIBLE_FACES = CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE * 3;
constexpr uint PLANE_SIZE_E = CHUNK_SIZE_E * CHUNK_SIZE_E;
constexpr uint MAX_FACES = CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE * 3;
constexpr uint MAX_OUTPUT_UINTS = MAX_FACES * 6 * 2;
constexpr uint MAX_OUTPUT_UINTS64 = MAX_FACES * 6;

constexpr int SY = 34;
constexpr int PS = 1156;

constexpr uint X = 0;
constexpr uint Y = 1;
constexpr uint Z = 2;

constexpr uint UP = 0;
constexpr uint BLOCK_WATER = 6;
constexpr uint BLOCK_EMPTY = 0;

constexpr int64 VERTEX_OFFSETS[8][3] = {{0, 0, 1}, {0, 0, 0}, {0, 1, 0}, {1, 1, 0}, {1, 0, 0}, {0, 1, 0}, {0, 0, 0}, {0, 1, 0}};
constexpr int64 MERGE_VECTOR_W[8][3] = {{1, 0, 0}, {1, 0, 0}, {0, -1, 0}, {-1, 0, 0}, {0, 1, 0}, {1, 0, 0}, {1, 1, 0}, {1, -1, 0}};
constexpr int64 MERGE_VECTOR_H[8][3] = {{0, 1, 0}, {0, 0, 1}, {0, 0, 1}, {0, 0, 1}, {0, 0, 1}, {0, -1, 0}, {0, 0, 1}, {0, 0, 1}};
constexpr uint WINDING[4][6] = {{0, 1, 2, 0, 2, 3}, {3, 2, 0, 2, 1, 0}, {1, 2, 3, 1, 3, 0}, {0, 3, 1, 3, 2, 1}};
constexpr uint MERGE_MASKS_W[4] = {0, 1, 1, 0};
constexpr uint MERGE_MASKS_H[4] = {0, 0, 1, 1};

inline constexpr uint BLOCKS_TEXTURES[9][6] = {
    {0, 0, 0, 0, 0, 0},
    {1, 1, 1, 1, 1, 1},
    {3, 2, 2, 2, 2, 1},
    {3, 3, 3, 3, 3, 3},
    {4, 4, 4, 4, 4, 4},
    {5, 5, 5, 5, 5, 5},
    {6, 6, 6, 6, 6, 6},
    {7, 7, 7, 7, 7, 7},
    {0, 8, 8, 8, 8, 0},
};

constexpr uint WATER_TEXTURE = BLOCKS_TEXTURES[BLOCK_WATER][0];

__attribute__((always_inline)) static inline uint64 encode_pos_bits(uint h, uint x, uint y) {
    return h << 14 | y << 7 | x;
}

__attribute__((always_inline)) static inline uint64 encode_tex_bits(uint tex_id) {
    return static_cast<uint64>(tex_id) << 51;
}

__attribute__((always_inline)) constexpr uint64 encode_dir_bits(Direction dir) {
    return static_cast<uint64>(dir) << 48;
}

__attribute__((always_inline)) static inline uint64 encode_dir_tex_bits(Direction dir, const uint (&block_textures)[6]) {
    return encode_dir_bits(dir) | encode_tex_bits(block_textures[dir]);
}

static inline bool is_solid(uint block) {
    return (block & 0x8000'0000u) != 0;
}

static inline uint is_solid_01(uint block) {
    return block >> 31;
}

static inline uint decode_block_id(uint id) {
    return id & 0x7fff'ffff;
}

struct dir_xy {
    int x;
    int y;

    inline void rotate_ccw() {
        int temp_x = x;
        x = -y;
        y = temp_x;
    }
};

struct array_3d {
    uint* __restrict data;
    uint plane_size;
    uint sy;

    array_3d(uint* data, uint sx, uint sy, uint sz) {
        this->data = data;
        this->plane_size = sx * sy;
        this->sy = sy;
    }

    inline uint is_solid_at(uint idx) const {
        return (*(this->data + idx)) >> 31;
    }

    inline uint get_xyz(uint x, uint y, uint z) const {
        return *(this->data + (z * this->plane_size + y * this->sy + x));
    }

    inline uint get_hxy(uint h, uint x, uint y) const {
        return *(this->data + (h * this->plane_size + y * this->sy + x));
    }

    inline void set_xyz(uint x, uint y, uint z, uint value) {
        *(this->data + (z * this->plane_size + y * this->sy + x)) = value;
    }

    inline void set_hxy(uint h, uint x, uint y, uint value) {
        *(this->data + (h * this->plane_size + y * this->sy + x)) = value;
    }

    inline uint plane_idx(uint plane) const {
        return plane * this->plane_size;
    }

    inline uint row_idx(uint plane, uint row) const {
        return plane * this->plane_size + row * this->sy;
    }

    inline void set_idx(uint idx, uint value) {
        *(this->data + idx) = value;
    }

    inline uint get_idx(uint idx) const {
        return *(this->data + idx);
    }

    inline void fill_planes(uint from, uint n, uint value) {
        uint start = from * this->plane_size;
        uint end = (from + n) * this->plane_size;
        for (uint i = start; i < end; i++) {
            *(this->data + i) = value;
        }
    }
};

constexpr uint64 POS_BITS_PLUS_1X = 1;
constexpr uint64 POS_BITS_PLUS_1Y = (1 << 7);
constexpr uint64 POS_BITS_PLUS_1Z = (1 << 14);

constexpr uint64 MERGE_BITS_WIDTH = 1ull << 32;
constexpr uint64 MERGE_BITS_HEIGHT = 1ull << 39;
constexpr uint64 MERGE_BITS_WIDTH_HEIGHT = MERGE_BITS_WIDTH | MERGE_BITS_HEIGHT;

consteval uint64 merge_vector_w_bits(Direction dir) {
    return (static_cast<uint64>(MERGE_VECTOR_W[dir][0]) << 0) + (static_cast<uint64>(MERGE_VECTOR_W[dir][1]) << 7) + (static_cast<uint64>(MERGE_VECTOR_W[dir][2]) << 14);
};

consteval uint64 merge_vector_h_bits(Direction dir) {
    return (static_cast<uint64>(MERGE_VECTOR_H[dir][0]) << 0) + (static_cast<uint64>(MERGE_VECTOR_H[dir][1]) << 7) + (static_cast<uint64>(MERGE_VECTOR_H[dir][2]) << 14);
};

consteval uint64 merge_vector_wh_bits(Direction dir) {
    return merge_vector_w_bits(dir) + merge_vector_h_bits(dir);
};

consteval uint64 vertex_offset_bits(Direction dir) {
    return (static_cast<uint64>(VERTEX_OFFSETS[dir][0]) << 0) + (static_cast<uint64>(VERTEX_OFFSETS[dir][1]) << 7) + (static_cast<uint64>(VERTEX_OFFSETS[dir][2]) << 14);
};

template <Direction dir>
__attribute__((always_inline)) static inline uint ao_get(const array_3d& data, const dir_xy& d_xy, uint h, uint x, uint y);

template <>
__attribute__((always_inline)) inline uint ao_get<Direction::Up>(const array_3d& data, const dir_xy& d_xy, uint h, uint x, uint y) {
    return data.get_hxy((h + 1), (x + d_xy.x), (y + d_xy.y));
}

template <>
__attribute__((always_inline)) inline uint ao_get<Direction::Down>(const array_3d& data, const dir_xy& d_xy, uint h, uint x, uint y) {
    return data.get_hxy((h - 1), (x + d_xy.x), (y + d_xy.y));
}

template <>
__attribute__((always_inline)) inline uint ao_get<Direction::Front>(const array_3d& data, const dir_xy& d_xy, uint h, uint x, uint y) {
    return data.get_hxy((h + d_xy.y), (x + d_xy.x), (y - 1));
}

template <>
__attribute__((always_inline)) inline uint ao_get<Direction::Left>(const array_3d& data, const dir_xy& d_xy, uint h, uint x, uint y) {
    return data.get_hxy((h + d_xy.y), (x - 1), (y - d_xy.x));
}

template <>
__attribute__((always_inline)) inline uint ao_get<Direction::Back>(const array_3d& data, const dir_xy& d_xy, uint h, uint x, uint y) {
    return data.get_hxy((h + d_xy.y), (x - d_xy.x), (y + 1));
}

template <>
__attribute__((always_inline)) inline uint ao_get<Direction::Right>(const array_3d& data, const dir_xy& d_xy, uint h, uint x, uint y) {
    return data.get_hxy((h + d_xy.y), (x + 1), (y + d_xy.x));
}

template <Direction DIR>
__attribute__((always_inline)) static inline uint compute_ao_shadows(const array_3d& data, uint h, uint x, uint y) {
    dir_xy s_d0{-1, 0};
    dir_xy s_d1{0, -1};
    dir_xy c_d{-1, -1};
    uint shadows = 0;
    for (uint v = 0; v < 4; v++) {
        uint s0 = is_solid_01(ao_get<DIR>(data, s_d0, h, x, y));
        uint s1 = is_solid_01(ao_get<DIR>(data, s_d1, h, x, y));
        uint c = is_solid_01(ao_get<DIR>(data, c_d, h, x, y));
        shadows |= ((s0 + s1 == 2) ? 3 : (s0 + s1 + c)) << (v * 2);
        s_d0.rotate_ccw();
        s_d1.rotate_ccw();
        c_d.rotate_ccw();
    }
    return shadows;
}
