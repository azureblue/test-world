#include "int.h"

enum class Direction : uint {
    Up = 0,
    Front = 1,
    Left = 2,
    Back = 3,
    Right = 4,
    Down = 5,
    Diagonal0 = 6,
    Diagonal1 = 7
};

constexpr uint toUint(Direction dir) {
    return static_cast<uint>(dir);
}

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

constexpr uint UP = 0;
constexpr uint BLOCK_WATER = 6;
constexpr uint BLOCK_EMPTY = 0;

constexpr int64 VERTEX_OFFSETS[8][3] = {{0, 0, 1}, {0, 0, 0}, {0, 1, 0}, {1, 1, 0}, {1, 0, 0}, {0, 1, 0}, {0, 0, 0}, {0, 1, 0}};
constexpr int64 MERGE_VECTOR_W[8][3] = {{1, 0, 0}, {1, 0, 0}, {0, -1, 0}, {-1, 0, 0}, {0, 1, 0}, {1, 0, 0}, {1, 1, 0}, {1, -1, 0}};
constexpr int64 MERGE_VECTOR_H[8][3] = {{0, 1, 0}, {0, 0, 1}, {0, 0, 1}, {0, 0, 1}, {0, 0, 1}, {0, -1, 0}, {0, 0, 1}, {0, 0, 1}};

const uint WINDING[4][6] = {{0, 1, 2, 0, 2, 3}, {3, 2, 0, 2, 1, 0}, {1, 2, 3, 1, 3, 0}, {0, 3, 1, 3, 2, 1}};
const uint MERGE_MASKS_W[4] = {0, 1, 1, 0};
const uint MERGE_MASKS_H[4] = {0, 0, 1, 1};
const uint BLOCKS_TEXTURES[9][6] = {
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

static inline bool is_solid(uint block) {
    return (block & 0x8000'0000) != 0;
}

static inline uint is_solid_int(uint block) {
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

constexpr uint64 X_PLUS_1 = 1;
constexpr uint64 Y_PLUS_1 = (1 << 7);
constexpr uint64 Z_PLUS_1 = (1 << 14);

constexpr uint64 merge_bits_width = 1ull << 32;
constexpr uint64 merge_bits_height = 1ull << 39;
constexpr uint64 merge_bits_width_height = merge_bits_width | merge_bits_height;

consteval uint64 merge_vector_w_bits(Direction dir) {
    return (static_cast<uint64>(MERGE_VECTOR_W[toUint(dir)][0]) << 0) + (static_cast<uint64>(MERGE_VECTOR_W[toUint(dir)][1]) << 7) + (static_cast<uint64>(MERGE_VECTOR_W[toUint(dir)][2]) << 14);
};

consteval uint64 merge_vector_h_bits(Direction dir) {
    return (static_cast<uint64>(MERGE_VECTOR_H[toUint(dir)][0]) << 0) + (static_cast<uint64>(MERGE_VECTOR_H[toUint(dir)][1]) << 7) + (static_cast<uint64>(MERGE_VECTOR_H[toUint(dir)][2]) << 14);
};

consteval uint64 merge_vector_wh_bits(Direction dir) {
    return merge_vector_w_bits(dir) + merge_vector_h_bits(dir);
};

consteval uint64 vertex_offset_bits(Direction dir) {
    return (static_cast<uint64>(VERTEX_OFFSETS[toUint(dir)][0]) << 0) + (static_cast<uint64>(VERTEX_OFFSETS[toUint(dir)][1]) << 7) + (static_cast<uint64>(VERTEX_OFFSETS[toUint(dir)][2]) << 14);
};

template <Direction dir>
__attribute__((always_inline)) static inline void encode_face(uint64* __restrict & out, uint64 pos_bits, uint64 bits, uint64 shadows) {
    uint64 cs0 = (shadows << 59) & 0x1800000000000000;
    uint64 cs1 = (shadows << 57) & 0x1800000000000000;
    uint64 cs2 = (shadows << 55) & 0x1800000000000000;
    uint64 cs3 = (shadows << 53) & 0x1800000000000000;

    constexpr uint64 mw = merge_vector_w_bits(dir);
    constexpr uint64 mh = merge_vector_h_bits(dir);
    constexpr uint64 mwh = merge_vector_wh_bits(dir);

    uint64 v0 = pos_bits | bits | cs0;
    uint64 v1 = pos_bits + mw | bits | cs1 | merge_bits_width;
    uint64 v2 = pos_bits + mwh | bits | cs2 | merge_bits_width_height;
    uint64 v3 = pos_bits + mh | bits | cs3 | merge_bits_height;

    if (cs0 + cs2 > cs1 + cs3) {
        out[0] = v0;
        out[1] = v1;
        out[2] = v2;
        out[3] = v0;
        out[4] = v2;
        out[5] = v3;
    } else {
        out[0] = v1;
        out[1] = v2;
        out[2] = v3;
        out[3] = v1;
        out[4] = v3;
        out[5] = v0;
    }
    out += 6;
}

uint complete(uint64* mesh_data_solid_base, uint64* mesh_data_water_base, uint64* mesh_solid_ptr, uint64* mesh_water_ptr) {
    uint nWater = mesh_water_ptr - mesh_data_water_base;
    uint nSolid = mesh_solid_ptr - mesh_data_solid_base;
    for (uint i = 0; i < nWater; i++) {
        *(mesh_data_solid_base + nSolid + i) = *(mesh_data_water_base + i);
    }
    return (nSolid + nWater) * 2;
}

template <Direction dir>
struct ao_access;

template <>
struct ao_access<Direction::Up> {
    __attribute__((always_inline)) static inline uint get(const array_3d& data, const dir_xy& d_xy, uint h, uint x, uint y) {
        return data.get_hxy((h + 1), (x + d_xy.x), (y + d_xy.y));
    }
};

template <>
struct ao_access<Direction::Down> {
    __attribute__((always_inline)) static inline uint get(const array_3d& data, const dir_xy& d_xy, uint h, uint x, uint y) {
        return data.get_hxy((h - 1), (x + d_xy.x), (y + d_xy.y));
    }
};

template <>
struct ao_access<Direction::Front> {
    __attribute__((always_inline)) static inline uint get(const array_3d& data, const dir_xy& d_xy, uint h, uint x, uint y) {
        return data.get_hxy((h + d_xy.y), (x + d_xy.x), (y - 1));
    }
};

template <>
struct ao_access<Direction::Left> {
    __attribute__((always_inline)) static inline uint get(const array_3d& data, const dir_xy& d_xy, uint h, uint x, uint y) {
        return data.get_hxy((h + d_xy.y), (x - 1), (y - d_xy.x));
    }
};

template <>
struct ao_access<Direction::Back> {
    __attribute__((always_inline)) static inline uint get(const array_3d& data, const dir_xy& d_xy, uint h, uint x, uint y) {
        return data.get_hxy((h + d_xy.y), (x - d_xy.x), (y + 1));
    }
};

template <>
struct ao_access<Direction::Right> {
    __attribute__((always_inline)) static inline uint get(const array_3d& data, const dir_xy& d_xy, uint h, uint x, uint y) {
        return data.get_hxy((h + d_xy.y), (x + 1), (y + d_xy.x));
    }
};

template <Direction dir>
__attribute__((always_inline)) static inline uint compute_ao_shadows(const array_3d& data, uint h, uint x, uint y) {
    dir_xy s_d0{-1, 0};
    dir_xy s_d1{0, -1};
    dir_xy c_d{-1, -1};
    uint shadows = 0;
    for (uint v = 0; v < 4; v++) {
        uint s0 = is_solid_int(ao_access<dir>::get(data, s_d0, h, x, y));
        uint s1 = is_solid_int(ao_access<dir>::get(data, s_d1, h, x, y));
        uint c = is_solid_int(ao_access<dir>::get(data, c_d, h, x, y));
        shadows |= ((s0 + s1 == 2) ? 3 : (s0 + s1 + c)) << (v * 2);
        s_d0.rotate_ccw();
        s_d1.rotate_ccw();
        c_d.rotate_ccw();
    }
    return shadows;
}

extern "C"
    __attribute__((export_name("create_mesh")))
    uint
    create_mesh(uint* __restrict in_chunk_data_ptr, uint64* __restrict out_mesh_ptr) {
    uint64* mesh_solid_ptr = out_mesh_ptr;
    uint64* mesh_water_ptr = out_mesh_ptr + MAX_OUTPUT_UINTS64;

    array_3d data(in_chunk_data_ptr, CHUNK_SIZE_E, CHUNK_SIZE_E, CHUNK_SIZE_E);

    for (uint h = 1; h < CHUNK_SIZE + 1; h++) {
        for (uint y = 1; y < CHUNK_SIZE + 1; y++) {
            for (uint x = 1; x < CHUNK_SIZE + 1; x++) {
                uint64 pos_bits = (x - 1) | ((y - 1) << 7) | ((h - 1) << 14);
                uint block_id = data.get_hxy(h, x, y);
                if (block_id == BLOCK_EMPTY) {
                    continue;
                }

                const uint* block_textures = BLOCKS_TEXTURES[decode_block_id(block_id)];
                uint is_water = block_id == BLOCK_WATER;
                uint64*& face_buffer = is_water ? mesh_water_ptr : mesh_solid_ptr;
                uint above = data.get_hxy(h + 1, x, y);
                if (!is_solid(above)) {
                    if (is_water && above == BLOCK_WATER) {
                        continue;
                    }
                    uint shadows = 0;
                    if (!is_water) {
                        shadows = compute_ao_shadows<Direction::Up>(data, h, x, y);
                    }
                    const uint64 block_texture = block_textures[0];
                    uint64 bits = block_texture << 51 | (0ull << 48);
                    encode_face<Direction::Up>(face_buffer, pos_bits + Z_PLUS_1, bits, shadows);
                }

                if (is_water) {
                    continue;
                }

                if (!is_solid(data.get_hxy(h - 1, x, y))) {
                    uint shadows = compute_ao_shadows<Direction::Down>(data, h, x, y);
                    const uint64 block_texture = block_textures[5];
                    uint64 bits = block_texture << 51 | (5ull << 48);
                    encode_face<Direction::Down>(face_buffer, pos_bits + Y_PLUS_1, bits, shadows);
                }

                if (!is_solid(data.get_hxy(h, x, y - 1))) {
                    uint shadows = compute_ao_shadows<Direction::Front>(data, h, x, y);
                    const uint64 block_texture = block_textures[1];
                    uint64 bits = block_texture << 51 | (1ull << 48);
                    encode_face<Direction::Front>(face_buffer, pos_bits, bits, shadows);
                }

                if (!is_solid(data.get_hxy(h, x - 1, y))) {
                    uint shadows = compute_ao_shadows<Direction::Left>(data, h, x, y);
                    const uint64 block_texture = block_textures[2];
                    uint64 bits = block_texture << 51 | (2ull << 48);
                    encode_face<Direction::Left>(face_buffer, pos_bits + Y_PLUS_1, bits, shadows);
                }

                if (!is_solid(data.get_hxy(h, x, y + 1))) {
                    uint shadows = compute_ao_shadows<Direction::Back>(data, h, x, y);
                    const uint64 block_texture = block_textures[3];
                    uint64 bits = block_texture << 51 | (3ull << 48);
                    encode_face<Direction::Back>(face_buffer, pos_bits + X_PLUS_1 + Y_PLUS_1, bits, shadows);
                }

                if (!is_solid(data.get_hxy(h, x + 1, y))) {
                    uint shadows = compute_ao_shadows<Direction::Right>(data, h, x, y);
                    const uint64 block_texture = block_textures[4];
                    uint64 bits = block_texture << 51 | (4ull << 48);
                    encode_face<Direction::Right>(face_buffer, pos_bits + X_PLUS_1, bits, shadows);
                }
            }
        }
    }

    return complete(out_mesh_ptr, out_mesh_ptr + MAX_OUTPUT_UINTS64, mesh_solid_ptr, mesh_water_ptr);
}
