#include "common.hpp"

constexpr int DIRECTION_ENCODE[40] = {
    0, 0, 0, 0, 0, 0, 0, 0,
    1, 0, 0, 0, 1, 0, 0, 0,
    0, 1, 0, -1, 0, CHUNK_SIZE - 1, 0, 0,
    -1, 0, CHUNK_SIZE - 1, 0, -1, CHUNK_SIZE - 1, 0, 0,
    0, -1, CHUNK_SIZE - 1, 1, 0, 0, 0, 0};

constexpr uint layer_len = CHUNK_SIZE * CHUNK_SIZE;
constexpr uint LIQUID_ABOVE_BIT = 30;

template <Direction DIR>
__attribute__((always_inline)) static inline void encode_face(uint64* __restrict& out, uint64 bits, uint64 w, uint64 h, uint64 shadows) {
    uint64 cs0 = (shadows << 59) & 0x1800000000000000;
    uint64 cs1 = (shadows << 57) & 0x1800000000000000;
    uint64 cs2 = (shadows << 55) & 0x1800000000000000;
    uint64 cs3 = (shadows << 53) & 0x1800000000000000;

    uint64 mw = merge_vector_w_bits(DIR) * w;
    uint64 mh = merge_vector_h_bits(DIR) * h;
    uint64 mwh = mw + mh;
    uint64 mbw = MERGE_BITS_WIDTH * w;
    uint64 mbh = MERGE_BITS_HEIGHT * h;

    uint64 v0 = bits | cs0;
    uint64 v1 = bits + mw | cs1 | mbw;
    uint64 v2 = bits + mwh | cs2 | mbw | mbh;
    uint64 v3 = bits + mh | cs3 | mbh;

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


template <Direction DIR>
static inline void merge_encode_face(face_buffers& buffers, uint h, uint layer_x, uint layer_y, uint width, uint height, uint data_texture_shadows) {
    constexpr uint dir_encode_base_idx = (DIR << 3);
    constexpr int dir_xx_mul = DIRECTION_ENCODE[dir_encode_base_idx + 0];
    constexpr int dir_xy_mul = DIRECTION_ENCODE[dir_encode_base_idx + 1];
    constexpr int dir_xx_add = DIRECTION_ENCODE[dir_encode_base_idx + 2];
    constexpr int dir_yx_mul = DIRECTION_ENCODE[dir_encode_base_idx + 3];
    constexpr int dir_yy_mul = DIRECTION_ENCODE[dir_encode_base_idx + 4];
    constexpr int dir_yy_add = DIRECTION_ENCODE[dir_encode_base_idx + 5];
    uint x = dir_xx_add + dir_xx_mul * layer_x + dir_xy_mul * layer_y + VERTEX_OFFSETS[DIR][X];
    uint y = dir_yy_add + dir_yx_mul * layer_x + dir_yy_mul * layer_y + VERTEX_OFFSETS[DIR][Y];
    uint64 texture_id = data_texture_shadows >> 8;
    uint shadows = data_texture_shadows & 0b11111111;
    uint64 bits = encode_pos_bits(h, x, y) | encode_tex_bits(texture_id) | encode_dir_bits(DIR);
    if (texture_id == WATER_TEXTURE) {
        encode_face<DIR>(buffers.mesh_water_cur, bits, width, height, shadows);
    } else {
        encode_face<DIR>(buffers.mesh_solid_cur, bits, width, height, shadows);
    }
}

template <>
inline void merge_encode_face<Direction::Up>(face_buffers& buffers, uint layer_h, uint layer_x, uint layer_y, uint width, uint height, uint data_texture_shadows) {
    uint x = layer_x;
    uint y = layer_y;
    uint h = layer_h + 1;
    uint64 texture_id = data_texture_shadows >> 8;
    uint shadows = data_texture_shadows & 0b11111111;
    uint64 bits = encode_pos_bits(h, x, y) | encode_tex_bits(texture_id) | encode_dir_bits(Direction::Up);
    if (texture_id == WATER_TEXTURE) {
        encode_face<Direction::Up>(buffers.mesh_water_cur, bits, width, height, shadows);
    } else {
        encode_face<Direction::Up>(buffers.mesh_solid_cur, bits, width, height, shadows);
    }
}

template <>
inline void merge_encode_face<Direction::Down>(face_buffers& buffers, uint layer_h, uint layer_x, uint layer_y, uint width, uint height, uint data_texture_shadows) {
    uint x = layer_x;
    uint y = (CHUNK_SIZE - 1) - layer_y + 1;
    uint h = layer_h;
    uint64 texture_id = data_texture_shadows >> 8;
    uint shadows = data_texture_shadows & 0b11111111;
    uint64 bits = encode_pos_bits(h, x, y) | encode_tex_bits(texture_id) | encode_dir_bits(Direction::Down);
    if (texture_id == WATER_TEXTURE) {
        encode_face<Direction::Down>(buffers.mesh_water_cur, bits, width, height, shadows);
    } else {
        encode_face<Direction::Down>(buffers.mesh_solid_cur, bits, width, height, shadows);
    }
}

template <Direction DIR>
void merge_side_faces(face_buffers& buffer, array_3d<CHUNK_SIZE>& layers, uint& current_layer_offset, uint& top_layer_offset, uint real_h) {
    uint layer_start_current = layers.plane_idx(DIR + current_layer_offset);
    uint layer_start_top = layers.plane_idx(DIR + top_layer_offset);
    uint layer_end_idx = layer_start_current + PLANE_SIZE;
    constexpr uint dir_encode_base_idx = (DIR << 3);
    constexpr int dir_xx_mul = DIRECTION_ENCODE[dir_encode_base_idx + 0];
    constexpr int dir_xy_mul = DIRECTION_ENCODE[dir_encode_base_idx + 1];
    constexpr int dir_xx_add = DIRECTION_ENCODE[dir_encode_base_idx + 2];
    constexpr int dir_yx_mul = DIRECTION_ENCODE[dir_encode_base_idx + 3];
    constexpr int dir_yy_mul = DIRECTION_ENCODE[dir_encode_base_idx + 4];
    constexpr int dir_yy_add = DIRECTION_ENCODE[dir_encode_base_idx + 5];

    for (uint y = layer_start_current; y < layer_end_idx; y += CHUNK_SIZE) {
        uint row_end = y + CHUNK_SIZE;
        for (uint i = y; i < row_end;) {
            uint j = i + 1;
            uint data_i = layers.get_idx(i);
            if (data_i == 0) {
                i++;
                continue;
            }
            while (j < row_end) {
                if (data_i != layers.get_idx(j))
                    break;
                j += 1;
            }
            layers.set_idx(i, data_i | 1 << 25 | (j - i) << 17);
            i = j;
        }
    }
    for (uint i = 0; i < layer_len;) {
        uint top = layers.get_idx((layer_start_top + i));
        if (top == 0) {
            i++;
            continue;
        }
        uint top_w = (top >> 17) & 0xFF;
        uint top_h = top >> 25;
        uint cur = layers.get_idx((layer_start_current + i));
        if ((top & 0x01FFFFFF) == (cur & 0x01FFFFFF) && top_h < CHUNK_SIZE) {
            layers.set_idx((layer_start_current + i), (cur & 0x01FFFFFF) | ((top_h + 1) << 25));
        } else {
            uint x = i & 31;
            uint y = i >> 5;
            merge_encode_face<DIR>(buffer, real_h - top_h, x, y, top_w, top_h, top & 0x1FFFF);
        }
        i += top_w;
    }
}

template <Direction DIR>
void merge_top_down_faces(face_buffers& buffer, array_3d<CHUNK_SIZE>& layers, uint real_h) {
    uint t_c[CHUNK_SIZE * 2];

    for (uint i = 0; i < CHUNK_SIZE * 2; i++) {
        t_c[i] = 0;
    }
    uint current_row_idx = 0;
    uint top_row_idx;
    for (uint y = 0; y < CHUNK_SIZE; y++) {
        current_row_idx = (y & 1) * CHUNK_SIZE;
        top_row_idx = (CHUNK_SIZE - current_row_idx);
        uint row_idx = layers.row_idx(DIR, y);
        for (uint i = 0; i < CHUNK_SIZE; i++) {
            t_c[(current_row_idx + i)] = layers.get_idx(row_idx + i);
        }
        for (uint i = 0; i < CHUNK_SIZE;) {
            uint idx_i = (current_row_idx + i);
            if (t_c[idx_i] == 0) {
                i += 1;
                continue;
            }
            uint j = i + 1;
            for (; j < CHUNK_SIZE; j++) {
                uint idx_j = (current_row_idx + j);
                if (t_c[idx_i] != t_c[idx_j]) {
                    break;
                }
            }
            t_c[idx_i] |= (1 << 25) | ((j - i) << 17);
            i = j;
        }
        for (uint i = 0; i < CHUNK_SIZE;) {
            uint idx_i = (current_row_idx + i);
            uint idx_top = (top_row_idx + i);
            uint top = t_c[idx_top];
            if (top == 0) {
                i++;
                continue;
            }
            uint top_w = (top >> 17) & 0xFF;
            uint top_h = top >> 25;
            uint cur = t_c[idx_i];
            if ((top & 0x01FFFFFF) == (cur & 0x01FFFFFF)) {
                t_c[idx_i] = cur & 0x01FFFFFF | (top_h + 1) << 25;
            } else {
                merge_encode_face<DIR>(buffer, real_h, i, y - top_h, top_w, top_h, top & 0x1FFFF);
            }
            i += top_w;
        }
    }

    for (uint i = 0; i < CHUNK_SIZE;) {
        uint top = t_c[(current_row_idx + i)];
        if (top == 0) {
            i++;
            continue;
        }
        uint top_h = top >> 25;
        uint top_w = (top >> 17) & 0xFF;
        uint y = (CHUNK_SIZE - top_h);
        merge_encode_face<DIR>(buffer, real_h, i, y, top_w, top_h, top & 0x1FFFF);
        i += top_w;
    }
}

template <Direction DIR>
void merge_side_faces_finish(face_buffers& buffer, array_3d<CHUNK_SIZE>& layers, uint& current_layer_offset) {
    const uint layer_start_current = layers.plane_idx(DIR + current_layer_offset);
    constexpr uint dir_encode_base_idx = (DIR << 3);
    constexpr int dir_xx_mul = DIRECTION_ENCODE[dir_encode_base_idx + 0];
    constexpr int dir_xy_mul = DIRECTION_ENCODE[dir_encode_base_idx + 1];
    constexpr int dir_xx_add = DIRECTION_ENCODE[dir_encode_base_idx + 2];
    constexpr int dir_yx_mul = DIRECTION_ENCODE[dir_encode_base_idx + 3];
    constexpr int dir_yy_mul = DIRECTION_ENCODE[dir_encode_base_idx + 4];
    constexpr int dir_yy_add = DIRECTION_ENCODE[dir_encode_base_idx + 5];

    for (uint i = 0; i < layer_len;) {
        uint top = layers.get_idx((layer_start_current + i));
        if (top == 0) {
            i++;
            continue;
        }
        uint top_w = (top >> 17) & 0xFF;
        uint top_h = top >> 25;
        uint x = i & 31;
        uint y = i >> 5;
        merge_encode_face<DIR>(buffer, CHUNK_SIZE - top_h, x, y, top_w, top_h, top & 0x1FFFF);
        i += top_w;
    }
}

extern "C"
    __attribute__((export_name("create_mesh"))) uint
    create_mesh(uint* __restrict in_chunk_data_ptr, uint64* __restrict out_data_ptr) {
    uint* __restrict in_adj_data_ptr = in_chunk_data_ptr + DATA_INPUT_SIZE_IN_UINT32;    
    face_buffers buffers(out_data_ptr);

    array_3d<CHUNK_SIZE> data(in_chunk_data_ptr);
    array_3d<CHUNK_SIZE> adj_data(in_adj_data_ptr);

    uint layers_data[CHUNK_SIZE * CHUNK_SIZE * 12];
    array_3d<CHUNK_SIZE> layers(layers_data);
    layers.fill_planes(6, 5, 0);

    uint current_layer_offset = 0;
    uint top_layer_offset = 0;

    for (uint h = 0; h < CHUNK_SIZE; h++) {
        current_layer_offset = (h & 1) * 6;
        top_layer_offset = 6 - current_layer_offset;
        layers.fill_planes(0, 1, 0);
        layers.fill_planes(5, 1, 0);
        layers.fill_planes(current_layer_offset + 1, 5, 0);

        for (uint y = 0; y < CHUNK_SIZE; y++) {
            for (uint x = 0; x < CHUNK_SIZE; x++) {
                uint block_data = data.get_hxy(h, x, y);
                uint block_id = decode_block_id(block_data);
                const uint adj = adj_data.get_hxy(h, x, y);                
                if (block_id == BLOCK_EMPTY) {
                    continue;
                }
                const uint* block_textures = BLOCKS_TEXTURES[block_id];
                uint is_water = block_id == BLOCK_WATER;
                bool is_liquid_above = is_bit_set(adj, LIQUID_ABOVE_BIT);
                if (!dir27_is_bit_set(adj, 0, 0, 1)) {
                    if (is_water && is_liquid_above) {
                        continue;
                    }
                    uint shadows = 0;
                    if (!is_water) {
                        shadows = compute_ao_shadows_2<Direction::Up>(adj);
                    }
                    layers.set_hxy(0, x, y, (block_textures[0] << 8) | (shadows));
                }

                if (is_water) {
                    continue;
                }

                if (!dir27_is_bit_set(adj, 0, 0, -1)) {
                    uint shadows = compute_ao_shadows_2<Direction::Down>(adj);
                    layers.set_hxy(5, x, CHUNK_SIZE - 1 - y, (block_textures[5] << 8) | (shadows));
                }

                if (!dir27_is_bit_set(adj, 0, -1, 0)) {
                    uint shadows = compute_ao_shadows_2<Direction::Front>(adj);
                    layers.set_hxy(current_layer_offset + Direction::Front, x, y, (block_textures[1] << 8) | shadows);
                }

                if (!dir27_is_bit_set(adj, -1, 0, 0)) {
                    uint shadows = compute_ao_shadows_2<Direction::Left>(adj);
                    layers.set_hxy(
                        current_layer_offset + Direction::Left,
                        CHUNK_SIZE - 1 - y,
                        x,
                        (block_textures[2] << 8) | shadows);
                }

                if (!dir27_is_bit_set(adj, 0, 1, 0)) {
                    uint shadows = compute_ao_shadows_2<Direction::Back>(adj);
                    layers.set_hxy(
                        current_layer_offset + Direction::Back,
                        CHUNK_SIZE - 1 - x,
                        CHUNK_SIZE - 1 - y,
                        (block_textures[3] << 8) | shadows);
                }

                if (!dir27_is_bit_set(adj, 1, 0, 0)) {
                    uint shadows = compute_ao_shadows_2<Direction::Right>(adj);
                    layers.set_hxy(
                        current_layer_offset + Direction::Right,
                        y,
                        CHUNK_SIZE - 1 - x,
                        (block_textures[4] << 8) | shadows);
                }
            }
        }

        merge_top_down_faces<Direction::Up>(buffers, layers, h);
        merge_top_down_faces<Direction::Down>(buffers, layers, h);
        merge_side_faces<Direction::Front>(buffers, layers, current_layer_offset, top_layer_offset, h);
        merge_side_faces<Direction::Left>(buffers, layers, current_layer_offset, top_layer_offset, h);
        merge_side_faces<Direction::Back>(buffers, layers, current_layer_offset, top_layer_offset, h);
        merge_side_faces<Direction::Right>(buffers, layers, current_layer_offset, top_layer_offset, h);
    }

    merge_side_faces_finish<Direction::Front>(buffers, layers, current_layer_offset);
    merge_side_faces_finish<Direction::Left>(buffers, layers, current_layer_offset);
    merge_side_faces_finish<Direction::Back>(buffers, layers, current_layer_offset);
    merge_side_faces_finish<Direction::Right>(buffers, layers, current_layer_offset);

    return complete_buffers(buffers);
}
