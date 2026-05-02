#include "quad_encode.hpp"

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

                const uint(&block_textures)[6] = BLOCKS_TEXTURES[block_id];
                if (is_x_quads(block_data)) {
                    x_quads_encoder::encode_quad<Direction::Diagonal0>(buffers.mesh_cutout_x_cur, x - 1, y - 1, h - 1, block_textures[1]);
                    x_quads_encoder::encode_quad<Direction::Diagonal1>(buffers.mesh_cutout_x_cur, x - 1, y - 1, h - 1, block_textures[2]);
                    continue;
                }

                uint above = data.get_hxy(h + 1, x, y);
                if (block_id == BLOCK_WATER) {
                    if (!is_solid(above) && decode_block_id(above) != BLOCK_WATER) {
                        water_encoder::encode_face_q<Direction::Up>(
                            buffers.mesh_water_cur, x - 1, y - 1, h - 1, block_textures[Direction::Up]);
                    }
                    continue;
                }
                auto& face_buffer = buffers.mesh_solid_cur;
                uint64 pos_bits = quad_encoder::encode_pos_bits(x - 1, y - 1, h - 1);

                if (!is_solid(above)) {
                    uint shadows = aos::compute<Direction::Up>(data, h, x, y);
                    quad_encoder::encode_face_q<Direction::Up>(face_buffer, pos_bits, block_textures[Direction::Up], shadows);
                }

                if (!is_solid(data.get_hxy(h - 1, x, y))) {
                    uint shadows = aos::compute<Direction::Down>(data, h, x, y);
                    quad_encoder::encode_face_q<Direction::Down>(face_buffer, pos_bits, block_textures[Direction::Down], shadows);
                }

                if (!is_solid(data.get_hxy(h, x, y - 1))) {
                    uint shadows = aos::compute<Direction::Front>(data, h, x, y);
                    quad_encoder::encode_face_q<Direction::Front>(face_buffer, pos_bits, block_textures[Direction::Front], shadows);
                }

                if (!is_solid(data.get_hxy(h, x - 1, y))) {
                    uint shadows = aos::compute<Direction::Left>(data, h, x, y);
                    quad_encoder::encode_face_q<Direction::Left>(face_buffer, pos_bits, block_textures[Direction::Left], shadows);
                }

                if (!is_solid(data.get_hxy(h, x, y + 1))) {
                    uint shadows = aos::compute<Direction::Back>(data, h, x, y);
                    quad_encoder::encode_face_q<Direction::Back>(face_buffer, pos_bits, block_textures[Direction::Back], shadows);
                }

                if (!is_solid(data.get_hxy(h, x + 1, y))) {
                    uint shadows = aos::compute<Direction::Right>(data, h, x, y);
                    quad_encoder::encode_face_q<Direction::Right>(face_buffer, pos_bits, block_textures[Direction::Right], shadows);
                }
            }
        }
    }

    return complete_buffers(buffers);
}
