#pragma once
#include "quad_encode.hpp"

// Shaped blocks (slabs; docs/proposals/shaped-blocks.md): a cell's 8 octants (half blocks), octant ox | oy << 1 |
// oz << 2, the ones of its shape filled (shape_octants). Both meshers draw them block by block, as they're few: the
// faces of the octants by quarters of the block's face, into the solid output, and the faces of the blocks next to
// them the same way (encode_cube_faces: only what they leave open). An octant's face is hidden by an octant next to
// it, in the cell or in the neighbour (a shaped one), or by a neighbour that hides faces. The quarters in a plane are
// merged into the largest rectangles (a slab's top is one quad, a wall's strip under a slab spans its block): a corner
// in the middle of a whole face's edge (a T-junction) would show as a seam, and faces meeting at a corner agree there.
// AO and light at their corners: by half-block cells (shade_vertex) for a slab's faces; the blocks next to slabs by
// half cells at their faces' corners only (face_ao): a block's quarters blend the AO of its whole face (outer_vertex),
// so a half-high slab beside a wall doesn't make a half-high band of AO on it.
namespace shaped {

// the cells' offsets in the input along x, y, z
constexpr uint AXIS_STEP[3] = {1, CHUNK_SIZE_E, PLANE_SIZE_E};

// A face of a box of octants: a rectangle of quarters (a, b: the 2 axes across the normal, half blocks)
struct rect {
    uint a, a_size, b, b_size;
};

// The rectangles covering the quarters in a plane (bit qa | qb << 1): all 4, rows along a, columns along b, the rest
// one by one.
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

// the cells the shader divides a vertex's light by: the open ones, as its AO tells (cube_solid.vert)
static inline uint open_cells(uint ao) {
    return ao == 3 ? 1 : 4 - ao;
}

// Two vertices' shading averaged, as the shader would show it half way between them: the shadow of both AO levels
// (blend), the light per open cell (divided by the first's)
static inline vertex_shading average(vertex_shading v0, vertex_shading v1) {
    const uint o0 = open_cells(v0.ao), o1 = open_cells(v1.ao), o = o0;
    uint light = 0;
    constexpr uint shifts[2] = {SKY_DARKNESS_SHIFT, BLOCK_LIGHT_SHIFT};
    for (const uint shift : shifts) {
        // (l0 / o0 + l1 / o1) / 2 * o, rounded
        const uint num = ((v0.light >> shift & 0x3f) * o1 + (v1.light >> shift & 0x3f) * o0) * o, den = 2 * o0 * o1;
        light |= (num + den / 2) / den << shift;
    }
    return {v0.ao, light, v1.ao};
}

// A vertex of a quarter in the plane of its cell's face (the outer layer), in the middle of an edge of that face, next
// to the block across the edge drawing its whole face in the same plane (a wall's face under the one a slab half
// covers): that face has no vertex there, it blends the edge's two corners. The vertex gets the same, else the two
// faces don't meet (AO fading over half a block above the edge, over a whole one under it). vertex, cell: in half
// blocks in the input (cell: the block's corner).
static inline vertex_shading edge_middle(const array_3d<CHUNK_SIZE_E>& data, vertex_shading shading, const int vertex[3], const int cell[3], uint d) {
    const uint n = NORMAL_AXIS[d];
    const uint across[2] = {(n + 1) % 3, (n + 2) % 3};
    for (uint e = 0; e < 2; e++) {
        // the edge is across axis `on` (at its 0 or 2), the vertex in its middle along `along`
        const uint on = across[e], along = across[1 - e];
        const int at = vertex[on] - cell[on];
        if ((at != 0 && at != 2) || vertex[along] - cell[along] != 1)
            continue;
        int next[3] = {cell[0] / 2, cell[1] / 2, cell[2] / 2};
        next[on] += at == 0 ? -1 : 1;
        int front[3] = {next[0], next[1], next[2]};
        front[n] += NORMAL_POSITIVE[d] ? 1 : -1;
        const uint block = data.get_hxy(next[2], next[0], next[1]), in_front = data.get_hxy(front[2], front[0], front[1]);
        // a whole face: a solid block's not hidden, not by quarters (a shaped block in front, unless it's cutout)
        if (!is_solid(block) || hides_face(in_front) || (is_shaped(in_front) && hides_face(block)))
            continue;
        // its corners on the edge, as it has them (by cells)
        vertex_shading next_corners[4], corners[2];
        block_face_corners(data, static_cast<Direction>(d), next[2], next[0], next[1], next_corners);
        const int next_pos[3] = {next[0] * 2, next[1] * 2, next[2] * 2}, size[3] = {2, 2, 2};
        for_face_vertices(static_cast<Direction>(d), next_pos, size, [&](uint k, const int v[3], const int*, const int*) {
            if (v[on] == vertex[on] && v[along] == vertex[along] - 1)
                corners[0] = next_corners[k];
            else if (v[on] == vertex[on] && v[along] == vertex[along] + 1)
                corners[1] = next_corners[k];
        });
        return average(corners[0], corners[1]);
    }
    return shading;
}

// A vertex of a quarter in the plane of its cell's face (the outer layer). At a corner of the face: the face's corner
// as a whole face has it (face_ao: as the faces next to it in the plane have it). A cube's
// (a block next to a slab, drawn by quarters): the AO its whole face would have there, its corners blended (the
// shadow of two AO levels, half way along an edge), the light by half cells (none from behind the slab), divided by
// that AO's open cells; a slab's: its own AO by half cells. In the middle of an edge next to a whole face: edge_middle.
// own: the face's corners (block_face_corners); vertex, cell: in half blocks in the input.
static inline vertex_shading outer_vertex(const array_3d<CHUNK_SIZE_E>& data, const vertex_shading own[4], vertex_shading shading, const int vertex[3], const int cell[3], uint d, bool cube) {
    using namespace quad_encoding;
    // where on the face, from its first corner along W and H (0..2)
    int u = 0, v = 0;
    for (uint k = 0; k < 3; k++) {
        const int rel = vertex[k] - (cell[k] + VERTEX_OFFSETS[d][k] * 2);
        u += rel * MERGE_VECTOR_W[d][k];
        v += rel * MERGE_VECTOR_H[d][k];
    }
    // the corner at u, v (0 or 2): the face's vertex order
    const auto corner = [](int cu, int cv) { return cv == 0 ? (cu == 0 ? 0u : 1u) : (cu == 0 ? 3u : 2u); };
    if (u != 1 && v != 1)
        return own[corner(u, v)];
    if (cube) {
        // half way along an edge: its corners; the middle (no quarter next to a slab has a corner there): a diagonal's
        const uint ka = u == 1 ? corner(0, v == 1 ? 0 : v) : corner(u, 0), kb = u == 1 ? corner(2, v == 1 ? 2 : v) : corner(u, 2);
        const uint ao = own[ka].ao, from = open_cells(shading.ao), to = open_cells(ao);
        uint light = 0;
        constexpr uint shifts[2] = {SKY_DARKNESS_SHIFT, BLOCK_LIGHT_SHIFT};
        for (const uint shift : shifts)
            light |= ((shading.light >> shift & 0x3f) * to + from / 2) / from << shift;
        shading = {ao, light, own[kb].ao};
    }
    return edge_middle(data, shading, vertex, cell, d);
}

// A block's faces by octants into out (the solid faces), in the directions given (bit by Direction); face(dir) is
// called after each one (the main mesher's sort key). h, x, y: the block in the input (with its border), block: its
// value with the light.
template <typename OnFace>
static inline void encode_octants(uint64* __restrict& out, const array_3d<CHUNK_SIZE_E>& data, uint h, uint x, uint y, uint block, uint octants, uint directions, OnFace face) {
    const uint(&textures)[6] = block_table.faces[decode_block_id(block)];
    const uint idx = h * PLANE_SIZE_E + y * CHUNK_SIZE_E + x;
    // the cell's corner in half blocks: in the chunk (the vertices), in the input (the AO)
    const uint cell[3] = {(x - 1) * 2, (y - 1) * 2, (h - 1) * 2};
    const int input_cell[3] = {static_cast<int>(x) * 2, static_cast<int>(y) * 2, static_cast<int>(h) * 2};
    for (uint d = 0; d < 6; d++) {
        if (!(directions >> d & 1))
            continue;
        const Direction dir = static_cast<Direction>(d);
        // the face's corners as a whole face has them (outer_vertex)
        vertex_shading own[4];
        block_face_corners(data, dir, h, x, y, own);
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
                const uint front = octant ^ (1u << n);
                const bool hidden = layer == outer ? neighbour_hides || (neighbour_octants >> front & 1) : (octants >> front & 1);
                if (!hidden)
                    quarters |= 1u << q;
            }
            if (quarters == 0)
                continue;
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
                // the corners' AO and light, in the input
                const int input_pos[3] = {input_cell[0] + static_cast<int>(local[0]), input_cell[1] + static_cast<int>(local[1]), input_cell[2] + static_cast<int>(local[2])};
                const int input_size[3] = {static_cast<int>(size[0]), static_cast<int>(size[1]), static_cast<int>(size[2])};
                vertex_shading shading[4];
                for_face_vertices(dir, input_pos, input_size, [&](uint k, const int vertex[3], const int w[3], const int hh[3]) {
                    shading[k] = shade_vertex(data, vertex, n, NORMAL_POSITIVE[d], w, hh);
                    if (layer == outer)
                        shading[k] = outer_vertex(data, own, shading[k], vertex, input_cell, d, octants == 0xff);
                });
                quad_encoder::encode_shaped_face(out, dir, pos, size, static_cast<uint>(u), static_cast<uint>(v), textures[d], shading);
                face(dir);
            }
        }
    }
}
// a shaped block's faces (see encode_octants)
template <typename OnFace>
static inline void encode(uint64* __restrict& out, const array_3d<CHUNK_SIZE_E>& data, uint h, uint x, uint y, uint block, OnFace face) {
    encode_octants(out, data, h, x, y, block, shape_octants(block), 0x3f, face);
}

// A cube's faces toward the shaped blocks next to it (row_faces::next_to_shaped), as a block of 8 octants: only the
// quarters they leave open, so no face reaches past what's seen (a wall's face half covered by a slab: its corners
// behind the slab would bring the light from above the slab).
template <typename OnFace>
static inline void encode_cube_faces(uint64* __restrict& out, const array_3d<CHUNK_SIZE_E>& data, uint h, uint x, uint y, uint block, OnFace face) {
    const uint idx = h * PLANE_SIZE_E + y * CHUNK_SIZE_E + x;
    uint directions = 0;
    for (uint d = 0; d < 6; d++) {
        const uint n = NORMAL_AXIS[d];
        directions |= static_cast<uint>(is_shaped(data.get_idx(NORMAL_POSITIVE[d] ? idx + AXIS_STEP[n] : idx - AXIS_STEP[n]))) << d;
    }
    encode_octants(out, data, h, x, y, block, 0xff, directions, face);
}
}  // namespace shaped
