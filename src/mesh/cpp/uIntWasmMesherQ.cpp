#include "quad_encode.hpp"

extern "C"
    __attribute__((export_name("block_table"))) block_table_t*
    get_block_table() {
    return &block_table;
}

extern "C"
    __attribute__((export_name("max_block_id"))) uint
    get_max_block_id() {
    return MAX_BLOCK_ID;
}

// The fast mesher: a quad per visible face, found 32 blocks at a time.
//
// The input is the chunk with a 1 block border: 34 x 34 x 34 blocks, in rows of 34 along x. For each row, a 64-bit
// mask holds one yes/no per block (bit x for the block at x). A face is visible where the block is a cube and its
// neighbour doesn't hide it, so a whole row's faces of a direction are one AND NOT of two masks:
//
//     the row above: hides       = 1 1 1 0 0 1 1 1 ...
//     this row:      cubes       = 1 1 1 1 1 1 1 1 ...
//     up faces = cubes & ~hides  = 0 0 0 1 1 0 0 0 ...
//
// Down, front and back faces use the rows below, at y - 1 and at y + 1; left and right faces use this row's mask
// shifted by one bit (bit x then holds the block at x - 1, x + 1). Then only the blocks with a face to draw (and the
// x-quads and water) are visited, from the lowest x up, each encoded as a block-by-block loop would.

// the masks of all rows, bit x for the block at x (bits 0 and 33: the border)
namespace row_masks {
constexpr uint ROWS = CHUNK_SIZE_E * CHUNK_SIZE_E;
constexpr uint SOLID_BIT = 0x8000'0000u;
// x-quads and water (liquid)
constexpr uint SPECIAL_BITS = (1u << 30) | (1u << 29);

// hides the faces next to it: solid and not cutout
static uint64 hides[ROWS];
// solid (cutout too)
static uint64 solid[ROWS];
// a cube, drawn with faces (only inside the chunk: bits 1..32)
static uint64 cubes[ROWS];
// x-quads or water, drawn their own way (only inside the chunk)
static uint64 specials[ROWS];

inline_always static uint row_index(uint h, uint y) {
    return h * CHUNK_SIZE_E + y;
}

// the 32 blocks inside a row (x 1..32), as 4 masks (bit 0 for x = 1), with WebAssembly SIMD: 4 blocks at a time.
// A comparison of 4 blocks gives all bits set (yes) or 0 (no) per block; i32x4.bitmask takes the top bit of each,
// 4 blocks to 4 bits (the top bit of a block is the solid bit, so the solid ones need no comparison)
typedef uint u32x4 __attribute__((vector_size(16), aligned(4)));
typedef int i32x4 __attribute__((vector_size(16), aligned(4)));

struct inner_masks {
    uint hides, solid, cubes, specials;
};

inline_always static uint top_bits(u32x4 blocks) {
    return static_cast<uint>(__builtin_wasm_bitmask_i32x4(reinterpret_cast<i32x4>(blocks)));
}

inline_always static inner_masks inner_row(const uint* __restrict row, uint hide_bits) {
    const u32x4 hide_test = hide_bits - u32x4{}, solid_bit = SOLID_BIT - u32x4{}, special_bits = SPECIAL_BITS - u32x4{};
    inner_masks m{0, 0, 0, 0};
    for (uint k = 0; k < CHUNK_SIZE / 4; k++) {
        const u32x4 blocks = *reinterpret_cast<const u32x4*>(row + 1 + k * 4);
        const uint at = k * 4;
        m.hides |= top_bits((blocks & hide_test) == solid_bit) << at;
        m.solid |= top_bits(blocks) << at;
        m.specials |= top_bits((blocks & special_bits) != 0) << at;
    }
    // every cube is solid (the "cube" model, src/blocks.js); not a block value != 0 test: air has light bits
    m.cubes = m.solid & ~m.specials;
    return m;
}

// a row mask from the inner blocks' mask and the border blocks' bits
inline_always static uint64 row_mask(uint inner, bool first, bool last) {
    return static_cast<uint64>(inner) << 1 | static_cast<uint64>(first) | static_cast<uint64>(last) << (CHUNK_SIZE + 1);
}

static inline void compute(const uint* __restrict data) {
    // with cutout textures off cutout_flag is 0: cutout blocks hide faces like any solid one
    const uint hide_bits = SOLID_BIT | block_table.cutout_flag;
    for (uint r = 0; r < ROWS; r++) {
        const uint* __restrict row = data + r * CHUNK_SIZE_E;
        const inner_masks m = inner_row(row, hide_bits);
        const uint first = row[0], last = row[CHUNK_SIZE + 1];
        hides[r] = row_mask(m.hides, (first & hide_bits) == SOLID_BIT, (last & hide_bits) == SOLID_BIT);
        solid[r] = row_mask(m.solid, is_solid(first), is_solid(last));
        // the border isn't drawn
        cubes[r] = row_mask(m.cubes, false, false);
        specials[r] = row_mask(m.specials, false, false);
    }
}
}  // namespace row_masks

// what to draw of a row's blocks, bit x for the block at x
struct row_faces {
    // the visible faces by direction
    uint64 up, down, front, left, back, right;
    // cutout cubes (leaves with holes): drawn alpha tested
    uint64 cutout;
    // cutout cubes solid on all 6 sides: drawn opaque instead (see is_buried in common.hpp)
    uint64 buried;
    // x-quads and water
    uint64 specials;

    inline_always uint64 blocks_to_visit() const {
        return up | down | front | left | back | right | specials;
    }
};

inline_always static row_faces faces_of_row(uint h, uint y) {
    using namespace row_masks;
    const uint r = row_index(h, y);
    const uint above = row_index(h + 1, y), below = row_index(h - 1, y);
    const uint in_front = row_index(h, y - 1), behind = row_index(h, y + 1);
    const uint64 cube = cubes[r];
    row_faces f;
    f.up = cube & ~hides[above];
    f.down = cube & ~hides[below];
    f.front = cube & ~hides[in_front];
    f.left = cube & ~(hides[r] << 1);
    f.back = cube & ~hides[behind];
    f.right = cube & ~(hides[r] >> 1);
    // a solid cube that doesn't hide faces is a cutout one
    f.cutout = cube & solid[r] & ~hides[r];
    f.buried = f.cutout & (solid[r] << 1) & (solid[r] >> 1) & solid[above] & solid[below] & solid[in_front] & solid[behind];
    f.specials = specials[r];
    return f;
}

inline_always static uint has(uint64 mask, uint x) {
    return (mask >> x) & 1;
}

// x-quads and water: block by block, as they're few
inline_always static void encode_special(face_buffers& buffers, const array_3d<CHUNK_SIZE_E>& data, uint h, uint x, uint y, uint block_data) {
    if (is_x_quads(block_data)) {
        const uint(&block_textures)[6] = block_table.faces[decode_block_id(block_data)];
        x_quads_encoder::encode_quad<Direction::Diagonal0>(buffers.mesh_cutout_x_cur, x - 1, y - 1, h - 1, block_textures[1], block_data);
        x_quads_encoder::encode_quad<Direction::Diagonal1>(buffers.mesh_cutout_x_cur, x - 1, y - 1, h - 1, block_textures[2], block_data);
        if (!is_water(block_data))
            return;
        // a plant in water: the water faces too
    }
    const uint water_texture = block_table.water_texture;
    auto& water_buffer = buffers.mesh_water_cur;
    uint level = block_height(block_data);
    if (!water_top_hidden(level, data.get_hxy(h + 1, x, y)))
        water_encoder::encode_face_q<Direction::Up>(water_buffer, x - 1, y - 1, h - 1, level, 0, water_texture);
    if (!water_bottom_hidden(data.get_hxy(h - 1, x, y)))
        water_encoder::encode_face_q<Direction::Down>(water_buffer, x - 1, y - 1, h - 1, level, 0, water_texture);
    uint bottom = water_side_bottom(level, data.get_hxy(h, x, y - 1));
    if (bottom < level)
        water_encoder::encode_face_q<Direction::Front>(water_buffer, x - 1, y - 1, h - 1, level, bottom, water_texture);
    bottom = water_side_bottom(level, data.get_hxy(h, x - 1, y));
    if (bottom < level)
        water_encoder::encode_face_q<Direction::Left>(water_buffer, x - 1, y - 1, h - 1, level, bottom, water_texture);
    bottom = water_side_bottom(level, data.get_hxy(h, x, y + 1));
    if (bottom < level)
        water_encoder::encode_face_q<Direction::Back>(water_buffer, x - 1, y - 1, h - 1, level, bottom, water_texture);
    bottom = water_side_bottom(level, data.get_hxy(h, x + 1, y));
    if (bottom < level)
        water_encoder::encode_face_q<Direction::Right>(water_buffer, x - 1, y - 1, h - 1, level, bottom, water_texture);
}

// a cube's visible faces: faces has bit d set for the face in direction d (Direction: up, front, left, back, right, down)
inline_always static void encode_cube(face_buffers& buffers, const array_3d<CHUNK_SIZE_E>& data, uint h, uint x, uint y, uint faces, bool cutout, bool buried) {
    const uint block_id = decode_block_id(data.get_hxy(h, x, y));
    const uint(&block_textures)[6] = buried ? block_table.opaque_faces[block_id] : block_table.faces[block_id];
    // cutout blocks (leaves with holes) to their own output, drawn alpha tested; buried ones are opaque
    auto& face_buffer = cutout && !buried ? buffers.mesh_cutout_cur : buffers.mesh_solid_cur;
    if (is_bit_set(faces, Direction::Up))
        quad_encoder::encode_face_q<Direction::Up>(face_buffer, data, x, y, h, block_textures[Direction::Up]);
    if (is_bit_set(faces, Direction::Down))
        quad_encoder::encode_face_q<Direction::Down>(face_buffer, data, x, y, h, block_textures[Direction::Down]);
    if (is_bit_set(faces, Direction::Front))
        quad_encoder::encode_face_q<Direction::Front>(face_buffer, data, x, y, h, block_textures[Direction::Front]);
    if (is_bit_set(faces, Direction::Left))
        quad_encoder::encode_face_q<Direction::Left>(face_buffer, data, x, y, h, block_textures[Direction::Left]);
    if (is_bit_set(faces, Direction::Back))
        quad_encoder::encode_face_q<Direction::Back>(face_buffer, data, x, y, h, block_textures[Direction::Back]);
    if (is_bit_set(faces, Direction::Right))
        quad_encoder::encode_face_q<Direction::Right>(face_buffer, data, x, y, h, block_textures[Direction::Right]);
}

extern "C"
    __attribute__((export_name("create_mesh")))
    uint
    create_mesh(uint* __restrict in_chunk_data_ptr, uint64* __restrict out_data_ptr) {
    face_buffers buffers(out_data_ptr);
    array_3d<CHUNK_SIZE_E> data(in_chunk_data_ptr);
    row_masks::compute(in_chunk_data_ptr);

    for (uint h = 1; h < CHUNK_SIZE + 1; h++) {
        for (uint y = 1; y < CHUNK_SIZE + 1; y++) {
            const row_faces f = faces_of_row(h, y);
            // the blocks with something to draw, x up: the lowest bit left each time
            for (uint64 todo = f.blocks_to_visit(); todo != 0; todo &= todo - 1) {
                const uint x = static_cast<uint>(__builtin_ctzll(todo));
                if (has(f.specials, x)) {
                    encode_special(buffers, data, h, x, y, data.get_hxy(h, x, y));
                    continue;
                }
                const uint faces = has(f.up, x) << Direction::Up | has(f.front, x) << Direction::Front |
                                   has(f.left, x) << Direction::Left | has(f.back, x) << Direction::Back |
                                   has(f.right, x) << Direction::Right | has(f.down, x) << Direction::Down;
                encode_cube(buffers, data, h, x, y, faces, has(f.cutout, x), has(f.buried, x));
            }
        }
    }

    return complete_buffers(buffers);
}
