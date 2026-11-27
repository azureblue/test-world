#pragma once
#include "quad_encode.hpp"

// Shaped blocks (slabs; docs/proposals/shaped-blocks.md): a cell's 8 octants (half blocks), octant ox | oy << 1 |
// oz << 2, the ones of its shape filled (shape_octants). Both meshers draw them block by block, as they're few: the
// faces of the octants by quarters of the block's face, the quarters in a plane merged (a slab's top is one quad),
// into the solid output. An octant's face is hidden by an octant next to it, in the cell or in the neighbour (a
// shaped one), or by a neighbour that hides faces. No AO; the light of the cell in front of the face (the own cell's
// for the faces inside it, or in front of a solid cutout neighbour, which has none).
namespace shaped {

// by direction (up, front, left, back, right, down): the axis of its normal and whether the normal points along it
constexpr uint NORMAL_AXIS[6] = {Z, Y, X, Y, X, Z};
constexpr bool NORMAL_POSITIVE[6] = {true, false, false, true, true, false};
// the cells' offsets in the input along x, y, z
constexpr uint AXIS_STEP[3] = {1, CHUNK_SIZE_E, PLANE_SIZE_E};

// A face of a box of octants: a rectangle of quarters (a, b: the 2 axes across the normal, half blocks)
struct rect {
    uint a, a_size, b, b_size;
};

// the rectangles covering the quarters in a plane (bit qa | qb << 1): all 4, rows along a, columns along b, the rest
// one by one
static inline uint quarter_rects(uint quarters, rect out[4]) {
    if (quarters == 0b1111) {
        out[0] = {0, 2, 0, 2};
        return 1;
    }
    uint n = 0;
    for (uint qb = 0; qb < 2; qb++) {
        const uint row = 0b11u << (qb * 2);
        if ((quarters & row) == row) {
            out[n++] = {0, 2, qb, 1};
            quarters &= ~row;
        }
    }
    for (uint qa = 0; qa < 2; qa++) {
        const uint column = 0b101u << qa;
        if ((quarters & column) == column) {
            out[n++] = {qa, 1, 0, 2};
            quarters &= ~column;
        }
    }
    for (; quarters != 0; quarters &= quarters - 1) {
        const uint q = __builtin_ctz(quarters);
        out[n++] = {q & 1, 1, q >> 1, 1};
    }
    return n;
}

// A shaped block's faces into out (the solid faces); face(dir) is called after each one (the main mesher's sort key).
// h, x, y: the block in the input (with its border), block: its value with the light.
template <typename OnFace>
static inline void encode(uint64* __restrict& out, const array_3d<CHUNK_SIZE_E>& data, uint h, uint x, uint y, uint block, OnFace face) {
    const uint octants = shape_octants(block);
    const uint(&textures)[6] = block_table.faces[decode_block_id(block)];
    const uint idx = h * PLANE_SIZE_E + y * CHUNK_SIZE_E + x;
    // the cell's corner in half blocks, in the chunk
    const uint cell[3] = {(x - 1) * 2, (y - 1) * 2, (h - 1) * 2};
    for (uint d = 0; d < 6; d++) {
        const Direction dir = static_cast<Direction>(d);
        const uint n = NORMAL_AXIS[d], a = (n + 1) % 3, b = (n + 2) % 3;
        // the octants' layer at the cell's face, and the one inside
        const uint outer = NORMAL_POSITIVE[d] ? 1 : 0;
        const uint neighbour = data.get_idx(NORMAL_POSITIVE[d] ? idx + AXIS_STEP[n] : idx - AXIS_STEP[n]);
        const bool neighbour_hides = hides_face(neighbour);
        const uint neighbour_octants = is_shaped(neighbour) ? shape_octants(neighbour) : 0;
        for (uint layer = 0; layer < 2; layer++) {
            uint quarters = 0;
            for (uint q = 0; q < 4; q++) {
                uint c[3];
                c[n] = layer;
                c[a] = q & 1;
                c[b] = q >> 1;
                const uint octant = c[0] | c[1] << 1 | c[2] << 2;
                if (!(octants >> octant & 1))
                    continue;
                // the octant in front of the face: in the neighbour (its other layer) or in the cell
                c[n] = 1 - layer;
                const uint front = c[0] | c[1] << 1 | c[2] << 2;
                const bool hidden = layer == outer ? neighbour_hides || (neighbour_octants >> front & 1) : (octants >> front & 1);
                if (!hidden)
                    quarters |= 1u << q;
            }
            if (quarters == 0)
                continue;
            const uint light = (layer == outer && !is_solid(neighbour) ? neighbour : block) & LIGHT_BITS;
            rect rects[4];
            const uint count = quarter_rects(quarters, rects);
            for (uint i = 0; i < count; i++) {
                uint pos[3], size[3], local[3];
                local[n] = layer;
                size[n] = 1;
                local[a] = rects[i].a;
                size[a] = rects[i].a_size;
                local[b] = rects[i].b;
                size[b] = rects[i].b_size;
                // the texture coordinates: where the face's first corner is on the cell's face (from the cell's face's
                // first corner), so a half face shows its half of the texture
                int u = 0, v = 0;
                for (uint k = 0; k < 3; k++) {
                    pos[k] = cell[k] + local[k];
                    const int from_cell_corner = static_cast<int>(local[k] + quad_encoding::VERTEX_OFFSETS[d][k] * size[k]) - quad_encoding::VERTEX_OFFSETS[d][k] * 2;
                    u += from_cell_corner * quad_encoding::MERGE_VECTOR_W[d][k];
                    v += from_cell_corner * quad_encoding::MERGE_VECTOR_H[d][k];
                }
                quad_encoder::encode_shaped_face(out, dir, pos, size, static_cast<uint>(u), static_cast<uint>(v), textures[d], light);
                face(dir);
            }
        }
    }
}
}  // namespace shaped
