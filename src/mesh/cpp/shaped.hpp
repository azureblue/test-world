#pragma once
#include "quad_encode.hpp"

// Shaped blocks (slabs; docs/proposals/shaped-blocks.md): a cell's 8 octants (half blocks), octant ox | oy << 1 |
// oz << 2, the ones of its shape filled (shape_octants). Both meshers draw them block by block, as they're few: the
// faces of the octants by quarters of the block's face, into the solid output. An octant's face is hidden by an octant
// next to it, in the cell or in the neighbour (a shaped one), or by a neighbour that hides faces. Each quarter's
// vertices get their AO and light by half-block cells (shade_vertex); the quarters in a plane are merged where all
// their vertices' AO and light are the same (a slab's top in the open is one quad).
namespace shaped {

// the cells' offsets in the input along x, y, z
constexpr uint AXIS_STEP[3] = {1, CHUNK_SIZE_E, PLANE_SIZE_E};

// A face of a box of octants: a rectangle of quarters (a, b: the 2 axes across the normal, half blocks)
struct rect {
    uint a, a_size, b, b_size;
};

// a quarter's vertices' AO and light, in the face's vertex order
struct quarter_shading {
    uint ao[4], light[4];
};

static inline bool is_uniform(const quarter_shading& s) {
    return s.ao[0] == s.ao[1] && s.ao[0] == s.ao[2] && s.ao[0] == s.ao[3] &&
           s.light[0] == s.light[1] && s.light[0] == s.light[2] && s.light[0] == s.light[3];
}

// The rectangles covering the quarters in a plane (bit qa | qb << 1): all 4, rows along a, columns along b, the rest
// one by one; quarters are merged only where merge(their bits) lets them.
template <typename Merge>
static inline uint quarter_rects(uint quarters, rect out[4], Merge merge) {
    if (quarters == 0b1111 && merge(0b1111u)) {
        out[0] = {0, 2, 0, 2};
        return 1;
    }
    uint n = 0;
    for (uint qb = 0; qb < 2; qb++) {
        const uint row = 0b11u << (qb * 2);
        if ((quarters & row) == row && merge(row)) {
            out[n++] = {0, 2, qb, 1};
            quarters &= ~row;
        }
    }
    for (uint qa = 0; qa < 2; qa++) {
        const uint column = 0b101u << qa;
        if ((quarters & column) == column && merge(column)) {
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
    // the cell's corner in half blocks: in the chunk (the vertices), in the input (the AO)
    const uint cell[3] = {(x - 1) * 2, (y - 1) * 2, (h - 1) * 2};
    const int input_cell[3] = {static_cast<int>(x) * 2, static_cast<int>(y) * 2, static_cast<int>(h) * 2};
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
            quarter_shading shading[4];
            for (uint q = 0; q < 4; q++) {
                uint c[3];
                c[n] = layer;
                c[a] = q & 1;
                c[b] = q >> 1;
                const uint octant = c[0] | c[1] << 1 | c[2] << 2;
                if (!(octants >> octant & 1))
                    continue;
                // the octant in front of the face: in the neighbour (its other layer) or in the cell
                const uint front = octant ^ (1u << n);
                const bool hidden = layer == outer ? neighbour_hides || (neighbour_octants >> front & 1) : (octants >> front & 1);
                if (hidden)
                    continue;
                quarters |= 1u << q;
                const int pos[3] = {input_cell[0] + static_cast<int>(c[0]), input_cell[1] + static_cast<int>(c[1]), input_cell[2] + static_cast<int>(c[2])};
                const int size[3] = {1, 1, 1};
                for_face_vertices(dir, pos, size, [&](uint k, const int vertex[3], const int w[3], const int hh[3]) {
                    const vertex_shading s = shade_vertex(data, vertex, n, NORMAL_POSITIVE[d], w, hh);
                    shading[q].ao[k] = s.ao;
                    shading[q].light[k] = s.light;
                });
            }
            if (quarters == 0)
                continue;
            // merged: quarters of one AO and light all over
            const auto merge = [&](uint merged) {
                const quarter_shading& first = shading[__builtin_ctz(merged)];
                for (uint m = merged; m != 0; m &= m - 1) {
                    const quarter_shading& s = shading[__builtin_ctz(m)];
                    if (!is_uniform(s) || s.ao[0] != first.ao[0] || s.light[0] != first.light[0])
                        return false;
                }
                return true;
            };
            rect rects[4];
            const uint count = quarter_rects(quarters, rects, merge);
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
                // a merged rectangle's quarters are all alike: its first one's shading
                const quarter_shading& s = shading[rects[i].a | rects[i].b << 1];
                quad_encoder::encode_shaped_face(out, dir, pos, size, static_cast<uint>(u), static_cast<uint>(v), textures[d], s.ao, s.light);
                face(dir);
            }
        }
    }
}
}  // namespace shaped
