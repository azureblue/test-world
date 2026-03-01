#include "common.hpp"

template <Direction dir>
__attribute__((always_inline)) static inline void encode_face(uint64* __restrict & out, uint64 pos_bits, uint64 bits, uint64 shadows) {
    uint64 cs0 = (shadows << 59) & 0x1800000000000000;
    uint64 cs1 = (shadows << 57) & 0x1800000000000000;
    uint64 cs2 = (shadows << 55) & 0x1800000000000000;
    uint64 cs3 = (shadows << 53) & 0x1800000000000000;

    constexpr uint64 mw = merge_vector_w_bits(dir);
    constexpr uint64 mh = merge_vector_h_bits(dir);
    constexpr uint64 mwh = merge_vector_wh_bits(dir);

    uint64 v0 = pos_bits | bits | cs0;
    uint64 v1 = pos_bits + mw | bits | cs1 | merge_bits_width;
    uint64 v2 = pos_bits + mwh | bits | cs2 | merge_bits_width_height;
    uint64 v3 = pos_bits + mh | bits | cs3 | merge_bits_height;

    if (cs0 + cs2 > cs1 + cs3) {
        out[0] = v0;
        out[1] = v1;
        out[2] = v2;
        out[3] = v0;
        out[4] = v2;
        out[5] = v3;
    } else {
        out[0] = v1;
        out[1] = v2;
        out[2] = v3;
        out[3] = v1;
        out[4] = v3;
        out[5] = v0;
    }
    out += 6;
}

uint complete(uint64* mesh_data_solid_base, uint64* mesh_data_water_base, uint64* mesh_solid_ptr, uint64* mesh_water_ptr) {
    uint nWater = mesh_water_ptr - mesh_data_water_base;
    uint nSolid = mesh_solid_ptr - mesh_data_solid_base;
    for (uint i = 0; i < nWater; i++) {
        *(mesh_data_solid_base + nSolid + i) = *(mesh_data_water_base + i);
    }
    return (nSolid + nWater) * 2;
}

extern "C"
    __attribute__((export_name("create_mesh")))
    uint
    create_mesh(uint* __restrict in_chunk_data_ptr, uint64* __restrict out_mesh_ptr) {
    uint64* mesh_solid_ptr = out_mesh_ptr;
    uint64* mesh_water_ptr = out_mesh_ptr + MAX_OUTPUT_UINTS64;

    array_3d data(in_chunk_data_ptr, CHUNK_SIZE_E, CHUNK_SIZE_E, CHUNK_SIZE_E);

    for (uint h = 1; h < CHUNK_SIZE + 1; h++) {
        for (uint y = 1; y < CHUNK_SIZE + 1; y++) {
            for (uint x = 1; x < CHUNK_SIZE + 1; x++) {
                uint64 pos_bits = (x - 1) | ((y - 1) << 7) | ((h - 1) << 14);
                uint block_id = data.get_hxy(h, x, y);
                if (block_id == BLOCK_EMPTY) {
                    continue;
                }

                const uint* block_textures = BLOCKS_TEXTURES[decode_block_id(block_id)];
                uint is_water = block_id == BLOCK_WATER;
                uint64*& face_buffer = is_water ? mesh_water_ptr : mesh_solid_ptr;
                uint above = data.get_hxy(h + 1, x, y);
                if (!is_solid(above)) {
                    if (is_water && above == BLOCK_WATER) {
                        continue;
                    }
                    uint shadows = 0;
                    if (!is_water) {
                        shadows = compute_ao_shadows<Direction::Up>(data, h, x, y);
                    }
                    const uint64 block_texture = block_textures[0];
                    uint64 bits = block_texture << 51 | (0ull << 48);
                    encode_face<Direction::Up>(face_buffer, pos_bits + Z_PLUS_1, bits, shadows);
                }

                if (is_water) {
                    continue;
                }

                if (!is_solid(data.get_hxy(h - 1, x, y))) {
                    uint shadows = compute_ao_shadows<Direction::Down>(data, h, x, y);
                    const uint64 block_texture = block_textures[5];
                    uint64 bits = block_texture << 51 | (5ull << 48);
                    encode_face<Direction::Down>(face_buffer, pos_bits + Y_PLUS_1, bits, shadows);
                }

                if (!is_solid(data.get_hxy(h, x, y - 1))) {
                    uint shadows = compute_ao_shadows<Direction::Front>(data, h, x, y);
                    const uint64 block_texture = block_textures[1];
                    uint64 bits = block_texture << 51 | (1ull << 48);
                    encode_face<Direction::Front>(face_buffer, pos_bits, bits, shadows);
                }

                if (!is_solid(data.get_hxy(h, x - 1, y))) {
                    uint shadows = compute_ao_shadows<Direction::Left>(data, h, x, y);
                    const uint64 block_texture = block_textures[2];
                    uint64 bits = block_texture << 51 | (2ull << 48);
                    encode_face<Direction::Left>(face_buffer, pos_bits + Y_PLUS_1, bits, shadows);
                }

                if (!is_solid(data.get_hxy(h, x, y + 1))) {
                    uint shadows = compute_ao_shadows<Direction::Back>(data, h, x, y);
                    const uint64 block_texture = block_textures[3];
                    uint64 bits = block_texture << 51 | (3ull << 48);
                    encode_face<Direction::Back>(face_buffer, pos_bits + X_PLUS_1 + Y_PLUS_1, bits, shadows);
                }

                if (!is_solid(data.get_hxy(h, x + 1, y))) {
                    uint shadows = compute_ao_shadows<Direction::Right>(data, h, x, y);
                    const uint64 block_texture = block_textures[4];
                    uint64 bits = block_texture << 51 | (4ull << 48);
                    encode_face<Direction::Right>(face_buffer, pos_bits + X_PLUS_1, bits, shadows);
                }
            }
        }
    }

    return complete(out_mesh_ptr, out_mesh_ptr + MAX_OUTPUT_UINTS64, mesh_solid_ptr, mesh_water_ptr);
}
