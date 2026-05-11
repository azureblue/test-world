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

    array_3d(uint* __restrict data) : data(data) {
    }

    inline_always uint is_solid_at(uint idx) const {
        return data[idx] >> 31;
    }

    inline_always uint get_xyz(uint x, uint y, uint z) const {
        return data[z * plane_size + y * sy + x];
    }

    inline_always uint get_hxy(uint h, uint x, uint y) const {
        return data[h * plane_size + y * sy + x];
    }

    inline_always void set_xyz(uint x, uint y, uint z, uint value) {
        data[z * plane_size + y * sy + x] = value;
    }

    inline_always void set_hxy(uint h, uint x, uint y, uint value) {
        data[h * plane_size + y * sy + x] = value;
    }

    inline_always uint* get_plane(uint plane) const {
        return &data[plane * plane_size];
    }

    inline_always uint plane_idx(uint plane) const {
        return plane * plane_size;
    }

    inline_always uint row_idx(uint plane, uint row) const {
        return plane * plane_size + row * sy;
    }

    inline_always void set_idx(uint idx, uint value) {
        data[idx] = value;
    }

    inline_always uint get_idx(uint idx) const {
        return data[idx];
    }

    inline_always uint* __restrict get_ptr_hxy(uint h, uint x, uint y) const {
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

inline_always constexpr static uint offset_to_dir27(int x, int y, int z) {
    return (z + 1) * 9 + (y + 1) * 3 + (x + 1);
}

inline_always constexpr static uint dir27_is_bit_set(uint dir27, int x, int y, int z) {
    return (dir27 >> offset_to_dir27(x, y, z)) & 1;
}

inline_always constexpr static bool is_bit_set(uint value, uint bit) {
    return (value >> bit) & 1;
}

class ao_shadows {
   public:
    struct vertex_data {
        uint v0;
        uint v1;
        uint v2;
        uint v3;
    };
    template <Direction DIR>
    inline_always static vertex_data compute(const array_3d<CHUNK_SIZE_E>& data, uint h, uint x, uint y);

    template <Direction DIR>
    inline_always static uint encode(const array_3d<CHUNK_SIZE_E>& data, uint h, uint x, uint y) {
        vertex_data shadows = compute<DIR>(data, h, x, y);
        return (shadows.v0) | (shadows.v1 << 2) | (shadows.v2 << 4) | (shadows.v3 << 6);
    }

   private:
    inline_always static constexpr uint ao_value(uint a, uint b, uint c) {
        const uint s = a + b;
        return s == 2 ? 3 : s + c;
    }
};

template <>
inline_always ao_shadows::vertex_data ao_shadows::compute<Direction::Up>(const array_3d<CHUNK_SIZE_E>& data, uint h, uint x, uint y) {
    uint* __restrict base = data.get_ptr_hxy(h, x, y);
    constexpr int S = CHUNK_SIZE_E;
    constexpr int P = PLANE_SIZE_E;
    ao_shadows::vertex_data shadows;
    uint c0 = is_solid_01(base[P - S - 1]);
    uint c1 = is_solid_01(base[P - S]);
    uint c2 = is_solid_01(base[P - S + 1]);
    uint c3 = is_solid_01(base[P - 1]);
    shadows.v0 = ao_value(c3, c1, c0);
    uint c4 = is_solid_01(base[P + 1]);
    shadows.v1 = ao_value(c1, c4, c2);
    uint c5 = is_solid_01(base[P + S - 1]);
    uint c6 = is_solid_01(base[P + S]);
    shadows.v3 = ao_value(c6, c3, c5);
    uint c7 = is_solid_01(base[P + S + 1]);
    shadows.v2 = ao_value(c4, c6, c7);
    return shadows;
}

template <>
inline_always ao_shadows::vertex_data ao_shadows::compute<Direction::Front>(const array_3d<CHUNK_SIZE_E>& data, uint h, uint x, uint y) {
    uint* __restrict base = data.get_ptr_hxy(h, x, y);
    constexpr int S = CHUNK_SIZE_E;
    constexpr int P = PLANE_SIZE_E;
    ao_shadows::vertex_data shadows;
    uint c0 = is_solid_01(base[-P - S - 1]);
    uint c1 = is_solid_01(base[-P - S]);
    uint c2 = is_solid_01(base[-P - S + 1]);
    uint c3 = is_solid_01(base[-S - 1]);
    shadows.v0 = ao_value(c3, c1, c0);
    uint c4 = is_solid_01(base[-S + 1]);
    shadows.v1 = ao_value(c1, c4, c2);
    uint c5 = is_solid_01(base[P - S - 1]);
    uint c6 = is_solid_01(base[P - S]);
    shadows.v3 = ao_value(c6, c3, c5);
    uint c7 = is_solid_01(base[P - S + 1]);
    shadows.v2 = ao_value(c4, c6, c7);
    return shadows;
}

template <>
inline_always ao_shadows::vertex_data ao_shadows::compute<Direction::Left>(const array_3d<CHUNK_SIZE_E>& data, uint h, uint x, uint y) {
    uint* __restrict base = data.get_ptr_hxy(h, x, y);
    constexpr int S = CHUNK_SIZE_E;
    constexpr int P = PLANE_SIZE_E;
    ao_shadows::vertex_data shadows;
    uint c0 = is_solid_01(base[-P - S - 1]);
    uint c1 = is_solid_01(base[-P - 1]);
    uint c2 = is_solid_01(base[-P + S - 1]);
    uint c3 = is_solid_01(base[-S - 1]);
    shadows.v1 = ao_value(c1, c3, c0);
    uint c4 = is_solid_01(base[S - 1]);
    shadows.v0 = ao_value(c4, c1, c2);
    uint c5 = is_solid_01(base[P - S - 1]);
    uint c6 = is_solid_01(base[P - 1]);
    shadows.v2 = ao_value(c3, c6, c5);
    uint c7 = is_solid_01(base[P + S - 1]);
    shadows.v3 = ao_value(c6, c4, c7);
    return shadows;
}

template <>
inline_always ao_shadows::vertex_data ao_shadows::compute<Direction::Back>(const array_3d<CHUNK_SIZE_E>& data, uint h, uint x, uint y) {
    uint* __restrict base = data.get_ptr_hxy(h, x, y);
    constexpr int S = CHUNK_SIZE_E;
    constexpr int P = PLANE_SIZE_E;
    ao_shadows::vertex_data shadows;
    uint c0 = is_solid_01(base[-P + S - 1]);
    uint c1 = is_solid_01(base[-P + S]);
    uint c2 = is_solid_01(base[-P + S + 1]);
    uint c3 = is_solid_01(base[S - 1]);
    shadows.v1 = ao_value(c1, c3, c0);
    uint c4 = is_solid_01(base[S + 1]);
    shadows.v0 = ao_value(c4, c1, c2);
    uint c5 = is_solid_01(base[P + S - 1]);
    uint c6 = is_solid_01(base[P + S]);
    shadows.v2 = ao_value(c3, c6, c5);
    uint c7 = is_solid_01(base[P + S + 1]);
    shadows.v3 = ao_value(c6, c4, c7);
    return shadows;
}

template <>
inline_always ao_shadows::vertex_data ao_shadows::compute<Direction::Right>(const array_3d<CHUNK_SIZE_E>& data, uint h, uint x, uint y) {
    constexpr int S = CHUNK_SIZE_E;
    constexpr int P = PLANE_SIZE_E;
    uint* __restrict base = data.get_ptr_hxy(h, x, y);
    ao_shadows::vertex_data shadows;
    uint c0 = is_solid_01(base[-P - S + 1]);
    uint c1 = is_solid_01(base[-P + 1]);
    uint c2 = is_solid_01(base[-P + S + 1]);
    uint c3 = is_solid_01(base[-S + 1]);
    shadows.v0 = ao_value(c3, c1, c0);
    uint c4 = is_solid_01(base[S + 1]);
    shadows.v1 = ao_value(c1, c4, c2);
    uint c5 = is_solid_01(base[P - S + 1]);
    uint c6 = is_solid_01(base[P + 1]);
    shadows.v3 = ao_value(c6, c3, c5);
    uint c7 = is_solid_01(base[P + S + 1]);
    shadows.v2 = ao_value(c4, c6, c7);
    return shadows;
}

template <>
inline_always ao_shadows::vertex_data ao_shadows::compute<Direction::Down>(const array_3d<CHUNK_SIZE_E>& data, uint h, uint x, uint y) {
    uint* __restrict base = data.get_ptr_hxy(h, x, y);
    constexpr int S = CHUNK_SIZE_E;
    constexpr int P = PLANE_SIZE_E;
    ao_shadows::vertex_data shadows;
    uint c0 = is_solid_01(base[-P - S - 1]);
    uint c1 = is_solid_01(base[-P - S]);
    uint c2 = is_solid_01(base[-P - S + 1]);
    uint c3 = is_solid_01(base[-P - 1]);
    shadows.v3 = ao_value(c1, c3, c0);
    uint c4 = is_solid_01(base[-P + 1]);
    shadows.v2 = ao_value(c4, c1, c2);
    uint c5 = is_solid_01(base[-P + S - 1]);
    uint c6 = is_solid_01(base[-P + S]);
    shadows.v0 = ao_value(c3, c6, c5);
    uint c7 = is_solid_01(base[-P + S + 1]);
    shadows.v1 = ao_value(c6, c4, c7);
    return shadows;
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
