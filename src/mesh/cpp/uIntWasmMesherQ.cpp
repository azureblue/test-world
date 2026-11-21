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

extern "C"
    __attribute__((export_name("create_mesh")))
    uint
    create_mesh(uint* __restrict in_chunk_data_ptr, uint64* __restrict out_data_ptr) {
    face_buffers buffers(out_data_ptr);
    array_3d<CHUNK_SIZE_E> data(in_chunk_data_ptr);

    for (uint h = 1; h < CHUNK_SIZE + 1; h++) {
        for (uint y = 1; y < CHUNK_SIZE + 1; y++) {
            for (uint x = 1; x < CHUNK_SIZE + 1; x++) {
                uint block_data = data.get_hxy(h, x, y);
                if (block_data == BLOCK_EMPTY) {
                    continue;
                }
                uint block_id = decode_block_id(block_data);

                const uint(&block_textures)[6] = block_table.faces[block_id];
                if (is_x_quads(block_data)) {
                    x_quads_encoder::encode_quad<Direction::Diagonal0>(buffers.mesh_cutout_x_cur, x - 1, y - 1, h - 1, block_textures[1]);
                    x_quads_encoder::encode_quad<Direction::Diagonal1>(buffers.mesh_cutout_x_cur, x - 1, y - 1, h - 1, block_textures[2]);
                    if (!is_water(block_data))
                        continue;
                    // a plant in water: the water faces too
                }

                uint above = data.get_hxy(h + 1, x, y);
                if (is_water(block_data)) {
                    const uint water_texture = block_table.water_texture;
                    auto& water_buffer = buffers.mesh_water_cur;
                    uint level = block_height(block_data);
                    if (!water_top_hidden(level, above))
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
                    continue;
                }
                // cutout blocks (leaves with holes) to their own output, drawn alpha tested
                auto& face_buffer = block_table.cutout_blocks[block_id] ? buffers.mesh_cutout_cur : buffers.mesh_solid_cur;

                if (!hides_face(above)) {
                    quad_encoder::encode_face_q<Direction::Up>(face_buffer, data, x, y, h, block_textures[Direction::Up]);
                }

                if (!hides_face(data.get_hxy(h - 1, x, y))) {
                    quad_encoder::encode_face_q<Direction::Down>(face_buffer, data, x, y, h, block_textures[Direction::Down]);
                }

                if (!hides_face(data.get_hxy(h, x, y - 1))) {
                    quad_encoder::encode_face_q<Direction::Front>(face_buffer, data, x, y, h, block_textures[Direction::Front]);
                }

                if (!hides_face(data.get_hxy(h, x - 1, y))) {
                    quad_encoder::encode_face_q<Direction::Left>(face_buffer, data, x, y, h, block_textures[Direction::Left]);
                }

                if (!hides_face(data.get_hxy(h, x, y + 1))) {
                    quad_encoder::encode_face_q<Direction::Back>(face_buffer, data, x, y, h, block_textures[Direction::Back]);
                }

                if (!hides_face(data.get_hxy(h, x + 1, y))) {
                    quad_encoder::encode_face_q<Direction::Right>(face_buffer, data, x, y, h, block_textures[Direction::Right]);
                }
            }
        }
    }

    return complete_buffers(buffers);
}
