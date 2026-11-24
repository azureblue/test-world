#include "quad_encode.hpp"
#include "row_faces.hpp"

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

// The fast mesher: a quad per visible face (row_faces.hpp: the faces found 32 blocks at a time), each encoded as a
// block-by-block loop would.

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
    create_mesh(uint* __restrict in_chunk_data_ptr, uint64* __restrict out_data_ptr, const uint8* __restrict light_ptr) {
    // the cells' light (null: full sky light everywhere, no block light)
    if (light_ptr != nullptr)
        apply_light(in_chunk_data_ptr, light_ptr);
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
