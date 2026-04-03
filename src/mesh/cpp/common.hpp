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
constexpr uint DATA_INPUT_SIZE_IN_UINT32 = CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE;
constexpr uint PLANE_SIZE = CHUNK_SIZE * CHUNK_SIZE;
constexpr uint CHUNK_SIZE_E = CHUNK_SIZE + 2;
constexpr uint PLANE_SIZE_E = CHUNK_SIZE_E * CHUNK_SIZE_E;
constexpr uint MAX_VISIBLE_FACES = CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE * 3;
constexpr uint MAX_FACES = CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE * 3;
constexpr uint MAX_OUTPUT_UINTS = MAX_FACES * 6 * 2;
constexpr uint MAX_OUTPUT_UINTS64 = MAX_FACES * 6;
constexpr uint HEADER_SIZE_IN_UINT64 = 4;

constexpr int SY = 34;
constexpr int PS = 1156;

constexpr uint X = 0;
constexpr uint Y = 1;
constexpr uint Z = 2;

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

template <uint SIZE_XY>
struct array_3d {
    uint* __restrict data;
    constexpr static const uint plane_size = SIZE_XY * SIZE_XY;
    constexpr static const uint sy = SIZE_XY;

    array_3d(uint* __restrict data): data(data) {
    }

    inline uint is_solid_at(uint idx) const {
        return data[idx] >> 31;
    }

    inline uint get_xyz(uint x, uint y, uint z) const {
        return data[z * plane_size + y * sy + x];
    }

    inline uint get_hxy(uint h, uint x, uint y) const {
        return data[h * plane_size + y * sy + x];
    }

    inline void set_xyz(uint x, uint y, uint z, uint value) {
        data[z * plane_size + y * sy + x] = value;
    }

    inline void set_hxy(uint h, uint x, uint y, uint value) {
        data[h * plane_size + y * sy + x] = value;
    }

    inline uint* get_plane(uint plane) const {
        return &data[plane * plane_size];
    }

    inline uint plane_idx(uint plane) const {
        return plane * plane_size;
    }

    inline uint row_idx(uint plane, uint row) const {
        return plane * plane_size + row * sy;
    }

    inline void set_idx(uint idx, uint value) {
        data[idx] = value;
    }

    inline uint get_idx(uint idx) const {
        return data[idx];
    }

    inline uint * __restrict get_ptr_hxy(uint h, uint x, uint y) const {
        return &data[h * plane_size + y * sy + x];
    }

    inline void fill_planes(uint from, uint n, uint value) {
        uint start = from * plane_size;
        uint end = (from + n) * plane_size;
        for (uint i = start; i < end; i++) {
            data[i] = value;
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

static inline uint offset_to_dir27(int x, int y, int z) {
    return (z + 1) * 9 + (y + 1) * 3 + (x + 1);
}

static inline uint dir27_is_bit_set(uint dir27, int x, int y, int z) {
    return (dir27 >> offset_to_dir27(x, y, z)) & 1;
}

template <Direction dir>
__attribute__((always_inline)) static inline uint ao_get(const array_3d<CHUNK_SIZE_E>& data, const dir_xy& d_xy, int h, int x, int y);

template <>
__attribute__((always_inline)) inline uint ao_get<Direction::Up>(const array_3d<CHUNK_SIZE_E>& data, const dir_xy& d_xy, int h, int x, int y) {
    return data.get_hxy((h + 1), (x + d_xy.x), (y + d_xy.y));
}

template <>
__attribute__((always_inline)) inline uint ao_get<Direction::Down>(const array_3d<CHUNK_SIZE_E>& data, const dir_xy& d_xy, int h, int x, int y) {
    return data.get_hxy((h - 1), (x + d_xy.x), (y - d_xy.y));
}

template <>
__attribute__((always_inline)) inline uint ao_get<Direction::Front>(const array_3d<CHUNK_SIZE_E>& data, const dir_xy& d_xy, int h, int x, int y) {
    return data.get_hxy((h + d_xy.y), (x + d_xy.x), (y - 1));
}

template <>
__attribute__((always_inline)) inline uint ao_get<Direction::Left>(const array_3d<CHUNK_SIZE_E>& data, const dir_xy& d_xy, int h, int x, int y) {
    return data.get_hxy((h + d_xy.y), (x - 1), (y - d_xy.x));
}

template <>
__attribute__((always_inline)) inline uint ao_get<Direction::Back>(const array_3d<CHUNK_SIZE_E>& data, const dir_xy& d_xy, int h, int x, int y) {
    return data.get_hxy((h + d_xy.y), (x - d_xy.x), (y + 1));
}

template <>
__attribute__((always_inline)) inline uint ao_get<Direction::Right>(const array_3d<CHUNK_SIZE_E>& data, const dir_xy& d_xy, int h, int x, int y) {
    return data.get_hxy((h + d_xy.y), (x + 1), (y + d_xy.x));
}


template <Direction dir>
__attribute__((always_inline)) static inline uint ao_get_2(uint adj, const dir_xy& d_xy);

template <>
__attribute__((always_inline)) inline uint ao_get_2<Up>(uint adj, const dir_xy& d_xy) {
    return adj >> offset_to_dir27(d_xy.x, d_xy.y, 1) & 1;    
}

template <>
__attribute__((always_inline)) inline uint ao_get_2<Down>(uint adj, const dir_xy& d_xy) {
    return adj >> offset_to_dir27(d_xy.x, d_xy.y, -1) & 1;
}

template <>
__attribute__((always_inline)) inline uint ao_get_2<Front>(uint adj, const dir_xy& d_xy) {
    return adj >> offset_to_dir27(d_xy.x, -1, d_xy.y) & 1;
}

template <>
__attribute__((always_inline)) inline uint ao_get_2<Left>(uint adj, const dir_xy& d_xy) {
    return adj >> offset_to_dir27(-1, -d_xy.x , d_xy.y) & 1;
}

template <>
__attribute__((always_inline)) inline uint ao_get_2<Back>(uint adj, const dir_xy& d_xy) {
    return adj >> offset_to_dir27(-d_xy.x, 1, d_xy.y) & 1;    
}

template <>
__attribute__((always_inline)) inline uint ao_get_2<Right>(uint adj, const dir_xy& d_xy) {
    return adj >> offset_to_dir27(1, d_xy.x, d_xy.y) & 1;    
}


template <Direction DIR>
__attribute__((always_inline)) static inline uint compute_ao_shadows(const array_3d<CHUNK_SIZE_E>& data, uint h, uint x, uint y) {
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


template <Direction DIR>
__attribute__((always_inline)) static inline uint compute_ao_shadows_2(const uint adj) {
    dir_xy s_d0{-1, 0};
    dir_xy s_d1{0, -1};
    dir_xy c_d{-1, -1};
    uint shadows = 0;
    for (uint v = 0; v < 4; v++) {
        uint s0 = ao_get_2<DIR>(adj, s_d0);
        uint s1 = ao_get_2<DIR>(adj, s_d1);
        uint c = ao_get_2<DIR>(adj, c_d);
        shadows |= ((s0 + s1 == 2) ? 3 : (s0 + s1 + c)) << (v * 2);
        s_d0.rotate_ccw();
        s_d1.rotate_ccw();
        c_d.rotate_ccw();
    }
    return shadows;
}


static uint complete(uint64* out_data_ptr, uint64* mesh_data_solid_base, uint64* mesh_data_water_base, uint64* mesh_solid_ptr, uint64* mesh_water_ptr) {
    uint nWater = mesh_water_ptr - mesh_data_water_base;
    uint nSolid = mesh_solid_ptr - mesh_data_solid_base;
    for (uint i = 0; i < nWater; i++) {
        *(mesh_data_solid_base + nSolid + i) = *(mesh_data_water_base + i);
    }
    uint64 solidEnd = nSolid * 2;
    out_data_ptr[0] = solidEnd;
    return (nSolid + nWater) * 2 + HEADER_SIZE_IN_UINT64 * 2;
}

// template <Direction DIR>
// __attribute__((always_inline)) static inline uint compute_ao_shadows(const array_3d<CHUNK_SIZE_E>& data, uint h, uint x, uint y);

// template <>
// __attribute__((always_inline)) inline uint compute_ao_shadows<Direction::Up>(const array_3d<CHUNK_SIZE_E>& data, uint h, uint x, uint y) {
//     uint* __restrict base = data.get_ptr_hxy(h, x, y);
//     int c00, c01, c02, c10, c11, c12, c20, c21, c22, c30, c31, c32;
//     int shadows = 0;

//     c02 = is_solid_01(base[1121]);
//     c01 = c10 = is_solid_01(base[1122]);
//     c12 = is_solid_01(base[1123]);
//     c00 = c31 = is_solid_01(base[1155]);
//     c11 = c20 = is_solid_01(base[1157]);
//     c32 = is_solid_01(base[1189]);
//     c21 = c30 = is_solid_01(base[1190]);
//     c22 = is_solid_01(base[1191]);
//     shadows |= ((c00 + c01 == 2) ? 3 : (c00 + c01 + c02)) << 0;
//     shadows |= ((c10 + c11 == 2) ? 3 : (c10 + c11 + c12)) << 2;
//     shadows |= ((c20 + c21 == 2) ? 3 : (c20 + c21 + c22)) << 4;
//     shadows |= ((c30 + c31 == 2) ? 3 : (c30 + c31 + c32)) << 6;
//     return shadows;
// }

// template <>
// __attribute__((always_inline)) inline uint compute_ao_shadows<Direction::Front>(const array_3d<CHUNK_SIZE_E>& data, uint h, uint x, uint y) {
//     uint* __restrict base = data.get_ptr_hxy(h, x, y);
//     int c00, c01, c02, c10, c11, c12, c20, c21, c22, c30, c31, c32;
//     int shadows = 0;

//     c02 = is_solid_01(base[-1191]);
//     c01 = c10 = is_solid_01(base[-1190]);
//     c12 = is_solid_01(base[-1189]);
//     c00 = c31 = is_solid_01(base[-35]);
//     c11 = c20 = is_solid_01(base[-33]);
//     c32 = is_solid_01(base[1121]);
//     c21 = c30 = is_solid_01(base[1122]);
//     c22 = is_solid_01(base[1123]);
//     shadows |= ((c00 + c01 == 2) ? 3 : (c00 + c01 + c02)) << 0;
//     shadows |= ((c10 + c11 == 2) ? 3 : (c10 + c11 + c12)) << 2;
//     shadows |= ((c20 + c21 == 2) ? 3 : (c20 + c21 + c22)) << 4;
//     shadows |= ((c30 + c31 == 2) ? 3 : (c30 + c31 + c32)) << 6;
//     return shadows;
// }

// template <>
// __attribute__((always_inline)) inline uint compute_ao_shadows<Direction::Left>(const array_3d<CHUNK_SIZE_E>& data, uint h, uint x, uint y) {
//     uint* __restrict base = data.get_ptr_hxy(h, x, y);
//     int c00, c01, c02, c10, c11, c12, c20, c21, c22, c30, c31, c32;
//     int shadows = 0;

//     c12 = is_solid_01(base[-1191]);
//     c01 = c10 = is_solid_01(base[-1157]);
//     c02 = is_solid_01(base[-1123]);
//     c11 = c20 = is_solid_01(base[-35]);
//     c00 = c31 = is_solid_01(base[33]);
//     c22 = is_solid_01(base[1121]);
//     c21 = c30 = is_solid_01(base[1155]);
//     c32 = is_solid_01(base[1189]);
//     shadows |= ((c00 + c01 == 2) ? 3 : (c00 + c01 + c02)) << 0;
//     shadows |= ((c10 + c11 == 2) ? 3 : (c10 + c11 + c12)) << 2;
//     shadows |= ((c20 + c21 == 2) ? 3 : (c20 + c21 + c22)) << 4;
//     shadows |= ((c30 + c31 == 2) ? 3 : (c30 + c31 + c32)) << 6;
//     return shadows;
// }

// template <>
// __attribute__((always_inline)) inline uint compute_ao_shadows<Direction::Back>(const array_3d<CHUNK_SIZE_E>& data, uint h, uint x, uint y) {
//     uint* __restrict base = data.get_ptr_hxy(h, x, y);
//     int c00, c01, c02, c10, c11, c12, c20, c21, c22, c30, c31, c32;
//     int shadows = 0;

//     c12 = is_solid_01(base[-1123]);
//     c01 = c10 = is_solid_01(base[-1122]);
//     c02 = is_solid_01(base[-1121]);
//     c11 = c20 = is_solid_01(base[33]);
//     c00 = c31 = is_solid_01(base[35]);
//     c22 = is_solid_01(base[1189]);
//     c21 = c30 = is_solid_01(base[1190]);
//     c32 = is_solid_01(base[1191]);
//     shadows |= ((c00 + c01 == 2) ? 3 : (c00 + c01 + c02)) << 0;
//     shadows |= ((c10 + c11 == 2) ? 3 : (c10 + c11 + c12)) << 2;
//     shadows |= ((c20 + c21 == 2) ? 3 : (c20 + c21 + c22)) << 4;
//     shadows |= ((c30 + c31 == 2) ? 3 : (c30 + c31 + c32)) << 6;
//     return shadows;
// }

// template <>
// __attribute__((always_inline)) inline uint compute_ao_shadows<Direction::Right>(const array_3d<CHUNK_SIZE_E>& data, uint h, uint x, uint y) {
//     uint* __restrict base = data.get_ptr_hxy(h, x, y);
//     int c00, c01, c02, c10, c11, c12, c20, c21, c22, c30, c31, c32;
//     int shadows = 0;

//     c02 = is_solid_01(base[-1189]);
//     c01 = c10 = is_solid_01(base[-1155]);
//     c12 = is_solid_01(base[-1121]);
//     c00 = c31 = is_solid_01(base[-33]);
//     c11 = c20 = is_solid_01(base[35]);
//     c32 = is_solid_01(base[1123]);
//     c21 = c30 = is_solid_01(base[1157]);
//     c22 = is_solid_01(base[1191]);
//     shadows |= ((c00 + c01 == 2) ? 3 : (c00 + c01 + c02)) << 0;
//     shadows |= ((c10 + c11 == 2) ? 3 : (c10 + c11 + c12)) << 2;
//     shadows |= ((c20 + c21 == 2) ? 3 : (c20 + c21 + c22)) << 4;
//     shadows |= ((c30 + c31 == 2) ? 3 : (c30 + c31 + c32)) << 6;
//     return shadows;
// }

// template <>
// __attribute__((always_inline)) inline uint compute_ao_shadows<Direction::Down>(const array_3d<CHUNK_SIZE_E>& data, uint h, uint x, uint y) {
//     uint* __restrict base = data.get_ptr_hxy(h, x, y);
//     int c00, c01, c02, c10, c11, c12, c20, c21, c22, c30, c31, c32;
//     int shadows = 0;

//     c32 = is_solid_01(base[-1191]);
//     c21 = c30 = is_solid_01(base[-1190]);
//     c22 = is_solid_01(base[-1189]);
//     c00 = c31 = is_solid_01(base[-1157]);
//     c11 = c20 = is_solid_01(base[-1155]);
//     c02 = is_solid_01(base[-1123]);
//     c01 = c10 = is_solid_01(base[-1122]);
//     c12 = is_solid_01(base[-1121]);
//     shadows |= ((c00 + c01 == 2) ? 3 : (c00 + c01 + c02)) << 0;
//     shadows |= ((c10 + c11 == 2) ? 3 : (c10 + c11 + c12)) << 2;
//     shadows |= ((c20 + c21 == 2) ? 3 : (c20 + c21 + c22)) << 4;
//     shadows |= ((c30 + c31 == 2) ? 3 : (c30 + c31 + c32)) << 6;
//     return shadows;
// }
