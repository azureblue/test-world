#include "common.hpp"

template <Direction DIR>
__attribute__((always_inline)) static inline void encode_face(uint64* __restrict& out, uint64 bits, uint64 shadows) {
    uint64 cs0 = (shadows << 59) & 0x1800000000000000;
    uint64 cs1 = (shadows << 57) & 0x1800000000000000;
    uint64 cs2 = (shadows << 55) & 0x1800000000000000;
    uint64 cs3 = (shadows << 53) & 0x1800000000000000;

    constexpr uint64 mw = merge_vector_w_bits(DIR);
    constexpr uint64 mh = merge_vector_h_bits(DIR);
    constexpr uint64 mwh = merge_vector_wh_bits(DIR);

    uint64 v0 = bits | cs0;
    uint64 v1 = bits + mw | cs1 | MERGE_BITS_WIDTH;
    uint64 v2 = bits + mwh | cs2 | MERGE_BITS_WIDTH_HEIGHT;
    uint64 v3 = bits + mh | cs3 | MERGE_BITS_HEIGHT;

    if (cs0 + cs2 > cs1 + cs3) {
        out[0] = v1;
        out[1] = v2;
        out[2] = v3;
        out[3] = v1;
        out[4] = v3;
        out[5] = v0;
    } else {
        out[0] = v0;
        out[1] = v1;
        out[2] = v2;
        out[3] = v0;
        out[4] = v2;
        out[5] = v3;
    }
    out += 6;
}

extern "C"
    __attribute__((export_name("create_mesh")))
    uint
    create_mesh(uint* __restrict in_chunk_data_ptr, uint64* __restrict out_data_ptr) {
    uint* __restrict in_adj_data_ptr = in_chunk_data_ptr + DATA_INPUT_SIZE_IN_UINT32;
    uint64* __restrict out_mesh_ptr = out_data_ptr + HEADER_SIZE_IN_UINT64;        
    uint64* mesh_solid_ptr = out_mesh_ptr;
    uint64* mesh_water_ptr = out_mesh_ptr + MAX_OUTPUT_UINTS64;

    array_3d<CHUNK_SIZE> data(in_chunk_data_ptr);
    array_3d<CHUNK_SIZE> adj_data(in_adj_data_ptr);

    for (uint h = 0; h < CHUNK_SIZE; h++) {
        for (uint y = 0; y < CHUNK_SIZE; y++) {
            for (uint x = 0; x < CHUNK_SIZE; x++) {
                const uint adj = adj_data.get_hxy(h, x, y);                
                uint block = data.get_hxy(h, x, y);
                if (block == BLOCK_EMPTY) {
                    continue;
                }
                uint64 pos_bits = encode_pos_bits(h, x, y);

                const uint(&block_textures)[6] = BLOCKS_TEXTURES[decode_block_id(block)];
                uint is_water = block == BLOCK_WATER;
                uint64*& face_buffer = is_water ? mesh_water_ptr : mesh_solid_ptr;
                uint above = data.get_hxy(h, x, y);
                if (!dir27_is_bit_set(adj, 0, 0, 1)) {
                    if (is_water && above == BLOCK_WATER) {
                        continue;
                    }
                    uint shadows = 0;
                    if (!is_water) {                        
                        shadows = compute_ao_shadows_2<Direction::Up>(adj);
                    }
                    uint64 bits = pos_bits | encode_dir_tex_bits(Direction::Up, block_textures);
                    encode_face<Direction::Up>(face_buffer, bits + POS_BITS_PLUS_1Z, shadows);
                }

                if (is_water) {
                    continue;
                }

                if (!dir27_is_bit_set(adj, 0, 0, -1)) {
                    uint shadows = compute_ao_shadows_2<Direction::Down>(adj);
                    uint64 bits = pos_bits | encode_dir_tex_bits(Direction::Down, block_textures);
                    encode_face<Direction::Down>(face_buffer, bits + POS_BITS_PLUS_1Y, shadows);
                }

                if (!dir27_is_bit_set(adj, 0, -1, 0)) {
                    uint shadows = compute_ao_shadows_2<Direction::Front>(adj);
                    uint64 bits = pos_bits | encode_dir_tex_bits(Direction::Front, block_textures);
                    encode_face<Direction::Front>(face_buffer, bits, shadows);
                }

                if (!dir27_is_bit_set(adj, -1, 0, 0)) {
                    uint shadows = compute_ao_shadows_2<Direction::Left>(adj);
                    uint64 bits = pos_bits | encode_dir_tex_bits(Direction::Left, block_textures);
                    encode_face<Direction::Left>(face_buffer, bits + POS_BITS_PLUS_1Y, shadows);
                }

                if (!dir27_is_bit_set(adj, 0, 1, 0)) {
                    uint shadows = compute_ao_shadows_2<Direction::Back>(adj);
                    uint64 bits = pos_bits | encode_dir_tex_bits(Direction::Back, block_textures);
                    encode_face<Direction::Back>(face_buffer, bits + POS_BITS_PLUS_1X + POS_BITS_PLUS_1Y, shadows);
                }

                if (!dir27_is_bit_set(adj, 1, 0, 0)) {
                    uint shadows = compute_ao_shadows_2<Direction::Right>(adj);
                    uint64 bits = pos_bits | encode_dir_tex_bits(Direction::Right, block_textures);
                    encode_face<Direction::Right>(face_buffer, bits + POS_BITS_PLUS_1X, shadows);
                }
            }
        }
    }

    return complete(out_data_ptr, out_mesh_ptr, out_mesh_ptr + MAX_OUTPUT_UINTS64, mesh_solid_ptr, mesh_water_ptr);
}
