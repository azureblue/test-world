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
// 2 quads per block, 6 vertices each, a uint64 per vertex
constexpr uint MAX_CUTOUT_X_UINTS64 = CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE * 12;
// the solid faces' sort scratch (the main mesher), after the x-quads
constexpr uint SORT_SCRATCH_UINTS64 = MAX_OUTPUT_UINTS64;
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

// a cube of SIZE_XY^3 values of type T (the block data, the main mesher's face layers and their 64-bit light)
template <uint SIZE_XY, typename T = uint>
struct array_3d {
    T* __restrict data;
    constexpr static const uint plane_size = SIZE_XY * SIZE_XY;
    constexpr static const uint sy = SIZE_XY;

    array_3d(T* __restrict data) : data(data) {
    }

    inline_always uint is_solid_at(uint idx) const {
        return data[idx] >> 31;
    }

    inline_always T get_xyz(uint x, uint y, uint z) const {
        return data[z * plane_size + y * sy + x];
    }

    inline_always T get_hxy(uint h, uint x, uint y) const {
        return data[h * plane_size + y * sy + x];
    }

    inline_always void set_xyz(uint x, uint y, uint z, T value) {
        data[z * plane_size + y * sy + x] = value;
    }

    inline_always void set_hxy(uint h, uint x, uint y, T value) {
        data[h * plane_size + y * sy + x] = value;
    }

    // a cutout block solid on all 6 sides: drawn opaque (opaque_faces), so looking through the outer leaves of a canopy
    // ends at its core instead of going through every leaf layer
    inline_always bool is_buried(uint h, uint x, uint y) const {
        uint idx = h * plane_size + y * sy + x;
        // the neighbours only for cutout blocks (a few of all)
        if (!(data[idx] & block_table.cutout_flag))
            return false;
        return is_solid_at(idx - 1) & is_solid_at(idx + 1) & is_solid_at(idx - sy) & is_solid_at(idx + sy) &
               is_solid_at(idx - plane_size) & is_solid_at(idx + plane_size);
    }

    inline_always T* get_plane(uint plane) const {
        return &data[plane * plane_size];
    }

    inline_always uint plane_idx(uint plane) const {
        return plane * plane_size;
    }

    inline_always uint row_idx(uint plane, uint row) const {
        return plane * plane_size + row * sy;
    }

    inline_always void set_idx(uint idx, T value) {
        data[idx] = value;
    }

    inline_always T get_idx(uint idx) const {
        return data[idx];
    }

    inline_always T* __restrict get_ptr_hxy(uint h, uint x, uint y) const {
        return &data[h * plane_size + y * sy + x];
    }

    inline void fill_planes(uint from, uint n, T value) {
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

// A cell's light, only in the mesher's input (docs/proposals/lighting.md), in bits the block values leave 0 (ids are
// below MAX_BLOCK_ID): bits 11..13 the sky light's darkness (7 - sky light), bits 17..19 the block light; solid cells 0.
// 0, data without light, is full sky light and no block light. Each field has 2 free bits above it, so the lights of 4
// cells add up without carrying into the next field (28 at most).
constexpr uint SKY_DARKNESS_SHIFT = 11;
constexpr uint BLOCK_LIGHT_SHIFT = 17;
constexpr uint LIGHT_BITS = 7u << SKY_DARKNESS_SHIFT | 7u << BLOCK_LIGHT_SHIFT;
static_assert(MAX_BLOCK_ID <= 1u << SKY_DARKNESS_SHIFT);

// A vertex's light: the sum of the face's front cell and the 3 cells around the vertex (sides a, b, diagonal c), still
// in LIGHT_BITS' fields. Solid cells add 0: the shader divides by the open cells, which the vertex's AO tells. With
// both sides solid the diagonal is behind a wall corner (its light would leak through): left out, the front alone.
inline_always static uint corner_light(uint front, uint a, uint b, uint c) {
    const uint diagonal_mask = LIGHT_BITS & (((a & b) >> 31) - 1);
    return (front & LIGHT_BITS) + (a & LIGHT_BITS) + (b & LIGHT_BITS) + (c & diagonal_mask);
}

// a face's AO shadows (v) and light (l, see corner_light) per vertex
class ao_shadows {
   public:
    struct vertex_data {
        uint v0;
        uint v1;
        uint v2;
        uint v3;
        uint l0;
        uint l1;
        uint l2;
        uint l3;
    };
    template <Direction DIR>
    inline_always static vertex_data compute(const array_3d<CHUNK_SIZE_E>& data, uint h, uint x, uint y);

   private:
    // the cells around a vertex: sides a, b, diagonal c
    inline_always static uint ao_value(uint a, uint b, uint c) {
        const uint s = is_solid_01(a) + is_solid_01(b);
        return s == 2 ? 3 : s + is_solid_01(c);
    }
};

template <>
inline_always ao_shadows::vertex_data ao_shadows::compute<Direction::Up>(const array_3d<CHUNK_SIZE_E>& data, uint h, uint x, uint y) {
    uint* __restrict base = data.get_ptr_hxy(h, x, y);
    constexpr int S = CHUNK_SIZE_E;
    constexpr int P = PLANE_SIZE_E;
    ao_shadows::vertex_data shadows;
    const uint front = base[P];
    uint c0 = base[P - S - 1];
    uint c1 = base[P - S];
    uint c2 = base[P - S + 1];
    uint c3 = base[P - 1];
    shadows.v0 = ao_value(c3, c1, c0);
    shadows.l0 = corner_light(front, c3, c1, c0);
    uint c4 = base[P + 1];
    shadows.v1 = ao_value(c1, c4, c2);
    shadows.l1 = corner_light(front, c1, c4, c2);
    uint c5 = base[P + S - 1];
    uint c6 = base[P + S];
    shadows.v3 = ao_value(c6, c3, c5);
    shadows.l3 = corner_light(front, c6, c3, c5);
    uint c7 = base[P + S + 1];
    shadows.v2 = ao_value(c4, c6, c7);
    shadows.l2 = corner_light(front, c4, c6, c7);
    return shadows;
}

template <>
inline_always ao_shadows::vertex_data ao_shadows::compute<Direction::Front>(const array_3d<CHUNK_SIZE_E>& data, uint h, uint x, uint y) {
    uint* __restrict base = data.get_ptr_hxy(h, x, y);
    constexpr int S = CHUNK_SIZE_E;
    constexpr int P = PLANE_SIZE_E;
    ao_shadows::vertex_data shadows;
    const uint front = base[-S];

    uint c0 = base[-P - S - 1];
    uint c1 = base[-P - S];
    uint c2 = base[-P - S + 1];
    uint c3 = base[-S - 1];
    shadows.v0 = ao_value(c3, c1, c0);
    shadows.l0 = corner_light(front, c3, c1, c0);
    uint c4 = base[-S + 1];
    shadows.v1 = ao_value(c1, c4, c2);
    shadows.l1 = corner_light(front, c1, c4, c2);
    uint c5 = base[P - S - 1];
    uint c6 = base[P - S];
    shadows.v3 = ao_value(c6, c3, c5);
    shadows.l3 = corner_light(front, c6, c3, c5);
    uint c7 = base[P - S + 1];
    shadows.v2 = ao_value(c4, c6, c7);
    shadows.l2 = corner_light(front, c4, c6, c7);
    return shadows;
}

template <>
inline_always ao_shadows::vertex_data ao_shadows::compute<Direction::Left>(const array_3d<CHUNK_SIZE_E>& data, uint h, uint x, uint y) {
    uint* __restrict base = data.get_ptr_hxy(h, x, y);
    constexpr int S = CHUNK_SIZE_E;
    constexpr int P = PLANE_SIZE_E;
    ao_shadows::vertex_data shadows;
    const uint front = base[-1];
    uint c0 = base[-P - S - 1];
    uint c1 = base[-P - 1];
    uint c2 = base[-P + S - 1];
    uint c3 = base[-S - 1];
    shadows.v1 = ao_value(c1, c3, c0);
    shadows.l1 = corner_light(front, c1, c3, c0);
    uint c4 = base[S - 1];
    shadows.v0 = ao_value(c4, c1, c2);
    shadows.l0 = corner_light(front, c4, c1, c2);
    uint c5 = base[P - S - 1];
    uint c6 = base[P - 1];
    shadows.v2 = ao_value(c3, c6, c5);
    shadows.l2 = corner_light(front, c3, c6, c5);
    uint c7 = base[P + S - 1];
    shadows.v3 = ao_value(c6, c4, c7);
    shadows.l3 = corner_light(front, c6, c4, c7);
    return shadows;
}

template <>
inline_always ao_shadows::vertex_data ao_shadows::compute<Direction::Back>(const array_3d<CHUNK_SIZE_E>& data, uint h, uint x, uint y) {
    uint* __restrict base = data.get_ptr_hxy(h, x, y);
    constexpr int S = CHUNK_SIZE_E;
    constexpr int P = PLANE_SIZE_E;
    ao_shadows::vertex_data shadows;
    const uint front = base[S];
    uint c0 = base[-P + S - 1];
    uint c1 = base[-P + S];
    uint c2 = base[-P + S + 1];
    uint c3 = base[S - 1];
    shadows.v1 = ao_value(c1, c3, c0);
    shadows.l1 = corner_light(front, c1, c3, c0);
    uint c4 = base[S + 1];
    shadows.v0 = ao_value(c4, c1, c2);
    shadows.l0 = corner_light(front, c4, c1, c2);
    uint c5 = base[P + S - 1];
    uint c6 = base[P + S];
    shadows.v2 = ao_value(c3, c6, c5);
    shadows.l2 = corner_light(front, c3, c6, c5);
    uint c7 = base[P + S + 1];
    shadows.v3 = ao_value(c6, c4, c7);
    shadows.l3 = corner_light(front, c6, c4, c7);
    return shadows;
}

template <>
inline_always ao_shadows::vertex_data ao_shadows::compute<Direction::Right>(const array_3d<CHUNK_SIZE_E>& data, uint h, uint x, uint y) {
    constexpr int S = CHUNK_SIZE_E;
    constexpr int P = PLANE_SIZE_E;
    uint* __restrict base = data.get_ptr_hxy(h, x, y);
    ao_shadows::vertex_data shadows;
    const uint front = base[1];
    uint c0 = base[-P - S + 1];
    uint c1 = base[-P + 1];
    uint c2 = base[-P + S + 1];
    uint c3 = base[-S + 1];
    shadows.v0 = ao_value(c3, c1, c0);
    shadows.l0 = corner_light(front, c3, c1, c0);
    uint c4 = base[S + 1];
    shadows.v1 = ao_value(c1, c4, c2);
    shadows.l1 = corner_light(front, c1, c4, c2);
    uint c5 = base[P - S + 1];
    uint c6 = base[P + 1];
    shadows.v3 = ao_value(c6, c3, c5);
    shadows.l3 = corner_light(front, c6, c3, c5);
    uint c7 = base[P + S + 1];
    shadows.v2 = ao_value(c4, c6, c7);
    shadows.l2 = corner_light(front, c4, c6, c7);
    return shadows;
}

template <>
inline_always ao_shadows::vertex_data ao_shadows::compute<Direction::Down>(const array_3d<CHUNK_SIZE_E>& data, uint h, uint x, uint y) {
    uint* __restrict base = data.get_ptr_hxy(h, x, y);
    constexpr int S = CHUNK_SIZE_E;
    constexpr int P = PLANE_SIZE_E;
    ao_shadows::vertex_data shadows;
    const uint front = base[-P];
    uint c0 = base[-P - S - 1];
    uint c1 = base[-P - S];
    uint c2 = base[-P - S + 1];
    uint c3 = base[-P - 1];
    shadows.v3 = ao_value(c1, c3, c0);
    shadows.l3 = corner_light(front, c1, c3, c0);
    uint c4 = base[-P + 1];
    shadows.v2 = ao_value(c4, c1, c2);
    shadows.l2 = corner_light(front, c4, c1, c2);
    uint c5 = base[-P + S - 1];
    uint c6 = base[-P + S];
    shadows.v0 = ao_value(c3, c6, c5);
    shadows.l0 = corner_light(front, c3, c6, c5);
    uint c7 = base[-P + S + 1];
    shadows.v1 = ao_value(c6, c4, c7);
    shadows.l1 = corner_light(front, c6, c4, c7);
    return shadows;
}

// The output areas: solid faces, water faces, x-quads, the main mesher's sort scratch, cutout cube faces (the solid
// faces' format; up to twice as many as solid faces can be, the faces between cutout blocks are drawn too).
// complete_buffers packs them after the solid faces, each copied to before where it is: solid, water, x-quads, cutout.
struct face_buffers {
    uint64* output_base;
    uint64* mesh_base;
    uint64* mesh_water_base;
    uint64* mesh_cutout_x_base;
    uint64* mesh_cutout_base;

    uint64* __restrict mesh_solid_cur;
    uint64* __restrict mesh_water_cur;
    uint64* __restrict mesh_cutout_x_cur;
    uint64* __restrict mesh_cutout_cur;

    face_buffers(uint64* output_data_ptr) {
        output_base = output_data_ptr;
        mesh_base = output_data_ptr + data_size::HEADER_SIZE_IN_UINT64;
        mesh_water_base = mesh_base + data_size::MAX_OUTPUT_UINTS64;
        mesh_cutout_x_base = mesh_water_base + data_size::MAX_OUTPUT_UINTS64;
        mesh_cutout_base = mesh_cutout_x_base + data_size::MAX_CUTOUT_X_UINTS64 + data_size::SORT_SCRATCH_UINTS64;
        mesh_solid_cur = mesh_base;
        mesh_water_cur = mesh_water_base;
        mesh_cutout_x_cur = mesh_cutout_x_base;
        mesh_cutout_cur = mesh_cutout_base;
    }
};

// sort buckets of faces (front-to-back per direction, see solid_sort in uIntWasmMesher.cpp)
constexpr uint SORT_BUCKETS = 6 * CHUNK_SIZE;

// header (uint32): solid end, water end, x-quads end, cutout end (in uint32 of the output after the header).
// cutout_keys: a sort bucket per cutout face, to order them (a counting sort, as they're copied); nullptr: as written.
// The cutout faces are copied to before their area (at most twice as many faces as solid faces can be, solid and
// cutout together; see face_buffers), so writing them in any order doesn't overwrite one not copied yet.
static uint complete_buffers(face_buffers& buffers, const uint8* cutout_keys = nullptr) {
    uint n_cutout_x = static_cast<uint>(buffers.mesh_cutout_x_cur - buffers.mesh_cutout_x_base);
    uint n_water = static_cast<uint>(buffers.mesh_water_cur - buffers.mesh_water_base);
    uint n_solid = static_cast<uint>(buffers.mesh_solid_cur - buffers.mesh_base);
    uint n_cutout = static_cast<uint>(buffers.mesh_cutout_cur - buffers.mesh_cutout_base);

    uint64* __restrict out = buffers.mesh_base + n_solid;

    for (uint i = 0; i < n_water; i++)
        *out++ = buffers.mesh_water_base[i];

    for (uint i = 0; i < n_cutout_x; i++)
        *out++ = buffers.mesh_cutout_x_base[i];

    if (cutout_keys == nullptr) {
        for (uint i = 0; i < n_cutout; i++)
            *out++ = buffers.mesh_cutout_base[i];
    } else {
        uint offsets[SORT_BUCKETS];
        for (uint i = 0; i < SORT_BUCKETS; i++)
            offsets[i] = 0;
        uint faces = n_cutout / 6;
        for (uint i = 0; i < faces; i++)
            offsets[cutout_keys[i]]++;
        uint sum = 0;
        for (uint i = 0; i < SORT_BUCKETS; i++) {
            uint n = offsets[i];
            offsets[i] = sum;
            sum += n;
        }
        const uint64* __restrict src = buffers.mesh_cutout_base;
        for (uint i = 0; i < faces; i++, src += 6) {
            uint64* __restrict dst = out + offsets[cutout_keys[i]]++ * 6;
            for (uint k = 0; k < 6; k++)
                dst[k] = src[k];
        }
    }

    uint solid_end = n_solid * 2;
    uint water_end = (n_solid + n_water) * 2;
    uint cutout_x_end = (n_solid + n_water + n_cutout_x) * 2;
    uint cutout_end = (n_solid + n_water + n_cutout_x + n_cutout) * 2;

    buffers.output_base[0] = (static_cast<uint64>(water_end) << 32) | solid_end;
    buffers.output_base[1] = (static_cast<uint64>(cutout_end) << 32) | cutout_x_end;

    return cutout_end;
}
