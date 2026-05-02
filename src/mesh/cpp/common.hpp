#pragma once
#include "blocks.hpp"
#include "int.h"
#define inline_always __attribute__((always_inline)) inline

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
constexpr uint PLANE_SIZE_E = CHUNK_SIZE_E * CHUNK_SIZE_E;

constexpr uint X = 0;
constexpr uint Y = 1;
constexpr uint Z = 2;

namespace data_size {
constexpr uint DATA_INPUT_SIZE_IN_UINT32 = CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE;
constexpr uint MAX_VISIBLE_FACES = CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE * 3;
constexpr uint MAX_FACES = CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE * 3;
constexpr uint MAX_OUTPUT_UINTS = MAX_FACES * 6 * 2;
constexpr uint MAX_OUTPUT_UINTS64 = MAX_FACES * 6;
constexpr uint HEADER_SIZE_IN_UINT64 = 4;
}  // namespace data_size

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

    array_3d(uint* __restrict data) : data(data) {
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

    inline uint* __restrict get_ptr_hxy(uint h, uint x, uint y) const {
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

static inline uint offset_to_dir27(int x, int y, int z) {
    return (z + 1) * 9 + (y + 1) * 3 + (x + 1);
}

static inline uint dir27_is_bit_set(uint dir27, int x, int y, int z) {
    return (dir27 >> offset_to_dir27(x, y, z)) & 1;
}

static inline bool is_bit_set(uint value, uint bit) {
    return (value >> bit) & 1;
}

class aos {
   public:
    template <Direction DIR>
    inline_always static uint compute(const array_3d<CHUNK_SIZE_E>& data, uint h, uint x, uint y) {
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

   private:
    template <Direction dir>
    inline_always static uint ao_get(const array_3d<CHUNK_SIZE_E>& data, const dir_xy& d_xy, int h, int x, int y);
};

template <>
inline_always uint aos::ao_get<Direction::Up>(const array_3d<CHUNK_SIZE_E>& data, const dir_xy& d_xy, int h, int x, int y) {
    return data.get_hxy((h + 1), (x + d_xy.x), (y + d_xy.y));
}

template <>
inline_always uint aos::ao_get<Direction::Down>(const array_3d<CHUNK_SIZE_E>& data, const dir_xy& d_xy, int h, int x, int y) {
    return data.get_hxy((h - 1), (x + d_xy.x), (y - d_xy.y));
}

template <>
inline_always uint aos::ao_get<Direction::Front>(const array_3d<CHUNK_SIZE_E>& data, const dir_xy& d_xy, int h, int x, int y) {
    return data.get_hxy((h + d_xy.y), (x + d_xy.x), (y - 1));
}

template <>
inline_always uint aos::ao_get<Direction::Left>(const array_3d<CHUNK_SIZE_E>& data, const dir_xy& d_xy, int h, int x, int y) {
    return data.get_hxy((h + d_xy.y), (x - 1), (y - d_xy.x));
}

template <>
inline_always uint aos::ao_get<Direction::Back>(const array_3d<CHUNK_SIZE_E>& data, const dir_xy& d_xy, int h, int x, int y) {
    return data.get_hxy((h + d_xy.y), (x - d_xy.x), (y + 1));
}

template <>
inline_always uint aos::ao_get<Direction::Right>(const array_3d<CHUNK_SIZE_E>& data, const dir_xy& d_xy, int h, int x, int y) {
    return data.get_hxy((h + d_xy.y), (x + 1), (y + d_xy.x));
}

struct face_buffers {
    uint64* output_base;
    uint64* mesh_base;
    uint64* mesh_water_base;
    uint64* mesh_cutout_x_base;

    uint64* __restrict mesh_solid_cur;
    uint64* __restrict mesh_water_cur;
    uint64* __restrict mesh_cutout_x_cur;

    face_buffers(uint64* output_data_ptr) {
        output_base = output_data_ptr;
        mesh_base = output_data_ptr + data_size::HEADER_SIZE_IN_UINT64;
        mesh_water_base = mesh_base + data_size::MAX_OUTPUT_UINTS64;
        mesh_cutout_x_base = mesh_water_base + data_size::MAX_OUTPUT_UINTS64;
        mesh_solid_cur = mesh_base;
        mesh_water_cur = mesh_water_base;
        mesh_cutout_x_cur = mesh_cutout_x_base;
    }
};

static uint complete_buffers(face_buffers& buffers) {
    uint n_cutout_x = static_cast<uint>(buffers.mesh_cutout_x_cur - buffers.mesh_cutout_x_base);
    uint n_water = static_cast<uint>(buffers.mesh_water_cur - buffers.mesh_water_base);
    uint n_solid = static_cast<uint>(buffers.mesh_solid_cur - buffers.mesh_base);

    uint64* __restrict out = buffers.mesh_base + n_solid;

    for (uint i = 0; i < n_water; i++)
        *out++ = buffers.mesh_water_base[i];

    for (uint i = 0; i < n_cutout_x; i++)
        *out++ = buffers.mesh_cutout_x_base[i];

    uint solid_end = n_solid * 2;
    uint water_end = (n_solid + n_water) * 2;
    uint64 cutout_x_end = (n_solid + n_water + n_cutout_x) * 2;

    buffers.output_base[0] =
        (static_cast<uint64>(water_end) << 32) |
        static_cast<uint64>(solid_end);
    buffers.output_base[1] =
        (static_cast<uint64>(cutout_x_end));

    return (n_solid + n_water + n_cutout_x) * 2 + data_size::HEADER_SIZE_IN_UINT64 * 2;
}
