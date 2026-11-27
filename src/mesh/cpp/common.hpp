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

// A face of a box by direction: its first vertex (the box's corner, plus these times the box's size), then the
// vertices along W, along W and H, along H (the encoders' vertex order, and the AO's v0..v3)
namespace quad_encoding {
constexpr int VERTEX_OFFSETS[8][3] = {{0, 0, 1}, {0, 0, 0}, {0, 1, 0}, {1, 1, 0}, {1, 0, 0}, {0, 1, 0}, {0, 0, 0}, {0, 1, 0}};
constexpr int MERGE_VECTOR_W[8][3] = {{1, 0, 0}, {1, 0, 0}, {0, -1, 0}, {-1, 0, 0}, {0, 1, 0}, {1, 0, 0}, {1, 1, 0}, {1, -1, 0}};
constexpr int MERGE_VECTOR_H[8][3] = {{0, 1, 0}, {0, 0, 1}, {0, 0, 1}, {0, 0, 1}, {0, 0, 1}, {0, -1, 0}, {0, 0, 1}, {0, 0, 1}};
}  // namespace quad_encoding

// by direction (up, front, left, back, right, down): the axis of its normal and whether the normal points along it
constexpr uint NORMAL_AXIS[6] = {Z, Y, X, Y, X, Z};
constexpr bool NORMAL_POSITIVE[6] = {true, false, false, true, true, false};

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
// below MAX_BLOCK_ID): bits 10..13 the sky light's darkness (15 - sky light), bits 17..20 the block light; solid cells
// 0. 0, data without light, is full sky light and no block light. Each field has 2 free bits above it, so the lights
// of 4 cells add up without carrying into the next field: the sums in bits 10..15 and 17..22 (60 at most).
constexpr uint SKY_DARKNESS_SHIFT = 10;
constexpr uint BLOCK_LIGHT_SHIFT = 17;
constexpr uint LIGHT_BITS = 15u << SKY_DARKNESS_SHIFT | 15u << BLOCK_LIGHT_SHIFT;
static_assert(MAX_BLOCK_ID <= 1u << SKY_DARKNESS_SHIFT);
// the sums' fields
constexpr uint SKY_DARKNESS_SUM_BITS = 0x3fu << SKY_DARKNESS_SHIFT;
constexpr uint BLOCK_LIGHT_SUM_BITS = 0x3fu << BLOCK_LIGHT_SHIFT;
static_assert(MAX_BLOCK_ID <= 1u << SKY_DARKNESS_SHIFT);

// the light of the input's cells (Lighting.compute: a byte per cell, bits 0..3 the sky darkness, 4..7 the block light)
// into their LIGHT_BITS; a plain loop, vectorized
inline void apply_light(uint* __restrict data, const uint8* __restrict light) {
    for (uint i = 0; i < CHUNK_SIZE_E * CHUNK_SIZE_E * CHUNK_SIZE_E; i++) {
        const uint l = light[i];
        data[i] |= (l & 15) << SKY_DARKNESS_SHIFT | (l >> 4) << BLOCK_LIGHT_SHIFT;
    }
}

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

// Whether the mesher's input has a shaped block (row_masks::compute): only then do faces look for shaped blocks'
// octants in their AO (face_ao).
inline bool input_has_shaped = false;

// a face vertex's AO (ao_value) and light (corner_light) by half-block cells
struct vertex_shading {
    uint ao, light;
};

// A face vertex's AO and light by half-block cells, as ao_shadows by cells: a half cell is filled in a solid block or
// in a shaped block's octant, and a filled one has no light. vertex: in half blocks, in the input; n, n_positive: the
// normal's axis and side; w, h: unit steps (-1, 0, 1 per axis) from the vertex along the face's two edges into it.
// The 4 half cells in front of the vertex: in the face's corner (front), across the edge along h (a), across the
// one along w (b), diagonal (c).
static inline vertex_shading shade_vertex(const array_3d<CHUNK_SIZE_E>& data, const int vertex[3], uint n, bool n_positive, const int w[3], const int h[3]) {
    uint filled[4], light[4];
    for (uint i = 0; i < 4; i++) {
        const int sw = (i & 1) ? -1 : 1, sh = (i & 2) ? -1 : 1;
        int half[3];
        for (uint k = 0; k < 3; k++) {
            // a point inside the half cell, in quarter blocks: a quarter off the vertex along the normal and the edges
            const int quarter = vertex[k] * 2 + (k == n ? (n_positive ? 1 : -1) : 0) + sw * w[k] + sh * h[k];
            half[k] = quarter >> 1;
        }
        const uint block = data.get_hxy(half[2] >> 1, half[0] >> 1, half[1] >> 1);
        const uint octant = (half[0] & 1) | (half[1] & 1) << 1 | (half[2] & 1) << 2;
        filled[i] = is_solid_01(block) | (static_cast<uint>(is_shaped(block)) & (shape_octants(block) >> octant & 1));
        // the front one in a shaped block's octant (a face half covered by a slab beside it): the shader takes it as
        // open, a 0 would be full sky light; the shaped block's cell's light (its open part's) instead
        light[i] = filled[i] ? (i == 0 && !is_solid(block) ? block & LIGHT_BITS : 0) : block & LIGHT_BITS;
    }
    // as ao_value and corner_light: both sides filled, the diagonal is behind a wall corner
    const uint sides = filled[1] + filled[2];
    return {sides == 2 ? 3 : sides + filled[3], light[0] + light[1] + light[2] + (sides == 2 ? 0 : light[3])};
}

// the 4 vertices of a box's face (a cell's: pos its corner, size 2): vertex k's position and steps into the face
// (shade_vertex), in half blocks
template <typename Shade>
static inline void for_face_vertices(Direction dir, const int pos[3], const int size[3], Shade shade) {
    using namespace quad_encoding;
    for (uint k = 0; k < 4; k++) {
        const int dw = k == 1 || k == 2, dh = k >= 2;
        int vertex[3], w[3], h[3];
        for (uint a = 0; a < 3; a++) {
            vertex[a] = pos[a] + VERTEX_OFFSETS[dir][a] * size[a] + dw * MERGE_VECTOR_W[dir][a] * size[a] + dh * MERGE_VECTOR_H[dir][a] * size[a];
            w[a] = (dw ? -1 : 1) * MERGE_VECTOR_W[dir][a];
            h[a] = (dh ? -1 : 1) * MERGE_VECTOR_H[dir][a];
        }
        shade(k, vertex, w, h);
    }
}

// a block's face AO by half cells (next to shaped blocks): h, x, y the block in the input
template <Direction DIR>
static inline ao_shadows::vertex_data ao_by_half_cells(const array_3d<CHUNK_SIZE_E>& data, uint h, uint x, uint y) {
    const int pos[3] = {static_cast<int>(x) * 2, static_cast<int>(y) * 2, static_cast<int>(h) * 2}, size[3] = {2, 2, 2};
    uint ao[4], light[4];
    for_face_vertices(DIR, pos, size, [&](uint k, const int vertex[3], const int w[3], const int hh[3]) {
        const vertex_shading s = shade_vertex(data, vertex, NORMAL_AXIS[DIR], NORMAL_POSITIVE[DIR], w, hh);
        ao[k] = s.ao;
        light[k] = s.light;
    });
    return {ao[0], ao[1], ao[2], ao[3], light[0], light[1], light[2], light[3]};
}

// A block face's AO and light (ao_shadows::compute), by half cells when a shaped block is in the 3 x 3 cells in front
// of it (AO_BY_HALF_CELLS: always, to test them against each other)
template <Direction DIR>
inline_always static ao_shadows::vertex_data face_ao(const array_3d<CHUNK_SIZE_E>& data, uint h, uint x, uint y) {
#ifdef AO_BY_HALF_CELLS
    return ao_by_half_cells<DIR>(data, h, x, y);
#else
    if (input_has_shaped) {
        constexpr uint step[3] = {1, CHUNK_SIZE_E, PLANE_SIZE_E};
        constexpr uint n = NORMAL_AXIS[DIR], a = (n + 1) % 3, b = (n + 2) % 3;
        const uint front = h * PLANE_SIZE_E + y * CHUNK_SIZE_E + x + (NORMAL_POSITIVE[DIR] ? step[n] : -step[n]);
        uint any = 0;
        for (uint i = front - step[a] - step[b], ia = 0; ia < 3; ia++, i += step[a])
            for (uint j = i, ib = 0; ib < 3; ib++, j += step[b])
                any |= data.get_idx(j);
        if (any >> 28 & 1)
            return ao_by_half_cells<DIR>(data, h, x, y);
    }
    return ao_shadows::compute<DIR>(data, h, x, y);
#endif
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
