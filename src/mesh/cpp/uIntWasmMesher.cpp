#include "quad_encode.hpp"

constexpr int DIRECTION_ENCODE[40] = {
    0, 0, 0, 0, 0, 0, 0, 0,
    1, 0, 0, 0, 1, 0, 0, 0,
    0, 1, 0, -1, 0, CHUNK_SIZE - 1, 0, 0,
    -1, 0, CHUNK_SIZE - 1, 0, -1, CHUNK_SIZE - 1, 0, 0,
    0, -1, CHUNK_SIZE - 1, 1, 0, 0, 0, 0};

constexpr uint layer_len = CHUNK_SIZE * CHUNK_SIZE;

// a face in a layer: the texture + 1 above the low byte (AO shadows, or the water's level and bottom); 0 is no face,
// so a face with texture 0 and no shadows isn't one; the merge counters go above (see merge_encode_face)
static inline uint layer_face(uint texture, uint data) {
    return ((texture + 1) << 8) | data;
}

static inline uint layer_face_texture(uint face) {
    return (face >> 8) - 1;
}


// Solid faces are sorted front-to-back per direction, so early depth test rejects hidden faces inside a chunk.
// A face is visible only from the side its normal points to, so for faces of one direction, a larger coordinate
// along the normal is always closer to any camera that can see them. Groups go in Direction order (Up first).
// Faces are written to a scratch area together with a bucket key, then counting-sorted into the output.
namespace solid_sort {
constexpr uint BUCKETS = SORT_BUCKETS;

static uint8 keys[data_size::MAX_FACES];
static uint count;

// x, y, h - block position of the face, normal is +h for Up, -h for Down, -y Front, -x Left, +y Back, +x Right
template <Direction DIR>
inline_always static uint key(uint x, uint y, uint h) {
    constexpr uint base = DIR * CHUNK_SIZE;
    if constexpr (DIR == Direction::Up)
        return base + (CHUNK_SIZE - 1 - h);
    else if constexpr (DIR == Direction::Down)
        return base + h;
    else if constexpr (DIR == Direction::Front)
        return base + y;
    else if constexpr (DIR == Direction::Left)
        return base + x;
    else if constexpr (DIR == Direction::Back)
        return base + (CHUNK_SIZE - 1 - y);
    else
        return base + (CHUNK_SIZE - 1 - x);
}

static inline uint64* scratch_base(face_buffers& buffers) {
    return buffers.mesh_cutout_x_base + data_size::MAX_CUTOUT_X_UINTS64;
}

static inline void begin(face_buffers& buffers) {
    count = 0;
    buffers.mesh_solid_cur = scratch_base(buffers);
}

template <Direction DIR>
inline_always static void encode_face(face_buffers& buffers, uint x, uint y, uint h, uint width, uint height, uint texture_id, uint shadows) {
    keys[count++] = static_cast<uint8>(key<DIR>(x, y, h));
    quad_encoder::encode_face<DIR>(buffers.mesh_solid_cur, x, y, h, width, height, texture_id, shadows);
}

static void finish(face_buffers& buffers) {
    uint offsets[BUCKETS];
    for (uint i = 0; i < BUCKETS; i++)
        offsets[i] = 0;
    for (uint i = 0; i < count; i++)
        offsets[keys[i]]++;
    uint sum = 0;
    for (uint i = 0; i < BUCKETS; i++) {
        uint n = offsets[i];
        offsets[i] = sum;
        sum += n;
    }
    const uint64* __restrict src = scratch_base(buffers);
    uint64* __restrict dst = buffers.mesh_base;
    for (uint i = 0; i < count; i++) {
        uint64* __restrict out = dst + offsets[keys[i]]++ * 6;
        out[0] = src[0];
        out[1] = src[1];
        out[2] = src[2];
        out[3] = src[3];
        out[4] = src[4];
        out[5] = src[5];
        src += 6;
    }
    buffers.mesh_solid_cur = dst + count * 6;
}
}  // namespace solid_sort

// Cutout faces (leaves with holes) are sorted the same way, so the depth test rejects more of their fragments before
// the alpha tested shader runs: written in place with a bucket key each, ordered by complete_buffers as it packs them.
// Up to twice as many as solid faces (the faces between cutout blocks are drawn too).
namespace cutout_sort {
static uint8 keys[data_size::MAX_FACES * 2];
static uint count;

static inline void begin() {
    count = 0;
}

template <Direction DIR>
inline_always static void encode_face(face_buffers& buffers, uint x, uint y, uint h, uint width, uint height, uint texture_id, uint shadows) {
    keys[count++] = static_cast<uint8>(solid_sort::key<DIR>(x, y, h));
    quad_encoder::encode_face<DIR>(buffers.mesh_cutout_cur, x, y, h, width, height, texture_id, shadows);
}
}  // namespace cutout_sort

template <Direction DIR>
static inline void merge_encode_face(face_buffers& buffers, uint h, uint layer_x, uint layer_y, uint width, uint height, uint data_texture_shadows) {
    constexpr uint dir_encode_base_idx = (DIR << 3);
    constexpr int dir_xx_mul = DIRECTION_ENCODE[dir_encode_base_idx + 0];
    constexpr int dir_xy_mul = DIRECTION_ENCODE[dir_encode_base_idx + 1];
    constexpr int dir_xx_add = DIRECTION_ENCODE[dir_encode_base_idx + 2];
    constexpr int dir_yx_mul = DIRECTION_ENCODE[dir_encode_base_idx + 3];
    constexpr int dir_yy_mul = DIRECTION_ENCODE[dir_encode_base_idx + 4];
    constexpr int dir_yy_add = DIRECTION_ENCODE[dir_encode_base_idx + 5];
    uint x = dir_xx_add + dir_xx_mul * layer_x + dir_xy_mul * layer_y;
    uint y = dir_yy_add + dir_yx_mul * layer_x + dir_yy_mul * layer_y;
    uint64 texture_id = layer_face_texture(data_texture_shadows);
    uint shadows = data_texture_shadows & 0b11111111;
    if (texture_id == block_table.water_texture) {
        water_encoder::encode_face<DIR>(buffers.mesh_water_cur, x, y, h, width, height, shadows & 0b1111, shadows >> 4, texture_id);
    } else if (block_table.cutout_textures[texture_id]) {
        cutout_sort::encode_face<DIR>(buffers, x, y, h, width, height, texture_id, shadows);
    } else {
        solid_sort::encode_face<DIR>(buffers, x, y, h, width, height, texture_id, shadows);
    }
}

template <>
inline void merge_encode_face<Direction::Up>(face_buffers& buffers, uint layer_h, uint layer_x, uint layer_y, uint width, uint height, uint data_texture_shadows) {
    uint x = layer_x;
    uint y = layer_y;
    uint h = layer_h;
    uint64 texture_id = layer_face_texture(data_texture_shadows);
    uint shadows = data_texture_shadows & 0b11111111;
    if (texture_id == block_table.water_texture) {
        water_encoder::encode_face<Direction::Up>(buffers.mesh_water_cur, x, y, h, width, height, shadows & 0b1111, shadows >> 4, texture_id);
    } else if (block_table.cutout_textures[texture_id]) {
        cutout_sort::encode_face<Direction::Up>(buffers, x, y, h, width, height, texture_id, shadows);
    } else {
        solid_sort::encode_face<Direction::Up>(buffers, x, y, h, width, height, texture_id, shadows);
    }
}

template <>
inline void merge_encode_face<Direction::Down>(face_buffers& buffers, uint layer_h, uint layer_x, uint layer_y, uint width, uint height, uint data_texture_shadows) {
    uint x = layer_x;
    uint y = (CHUNK_SIZE - 1) - layer_y;
    uint h = layer_h;
    uint64 texture_id = layer_face_texture(data_texture_shadows);
    uint shadows = data_texture_shadows & 0b11111111;
    if (texture_id == block_table.water_texture) {
        water_encoder::encode_face<Direction::Down>(buffers.mesh_water_cur, x, y, h, width, height, shadows & 0b1111, shadows >> 4, texture_id);
    } else if (block_table.cutout_textures[texture_id]) {
        cutout_sort::encode_face<Direction::Down>(buffers, x, y, h, width, height, texture_id, shadows);
    } else {
        solid_sort::encode_face<Direction::Down>(buffers, x, y, h, width, height, texture_id, shadows);
    }
}

template <Direction DIR>
void merge_side_faces(face_buffers& buffer, array_3d<CHUNK_SIZE>& layers, uint& current_layer_offset, uint& top_layer_offset, uint real_h) {
    uint layer_start_current = layers.plane_idx(DIR + current_layer_offset);
    uint layer_start_top = layers.plane_idx(DIR + top_layer_offset);
    uint layer_end_idx = layer_start_current + PLANE_SIZE;

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
    __attribute__((export_name("create_mesh"))) uint
    create_mesh(uint* __restrict in_chunk_data_ptr, uint64* __restrict out_data_ptr) {
    face_buffers buffers(out_data_ptr);
    solid_sort::begin(buffers);
    cutout_sort::begin();

    array_3d<CHUNK_SIZE_E> data(in_chunk_data_ptr);
    uint layers_data[CHUNK_SIZE * CHUNK_SIZE * 12];
    array_3d<CHUNK_SIZE> layers(layers_data);
    layers.fill_planes(6, 5, 0);

    uint current_layer_offset = 0;
    uint top_layer_offset = 0;

    for (uint h = 1; h < CHUNK_SIZE + 1; h++) {
        uint real_h = h - 1;
        current_layer_offset = (real_h & 1) * 6;
        top_layer_offset = 6 - current_layer_offset;
        layers.fill_planes(0, 1, 0);
        layers.fill_planes(5, 1, 0);
        layers.fill_planes(current_layer_offset + 1, 5, 0);

        for (uint y = 1; y < CHUNK_SIZE + 1; y++) {
            for (uint x = 1; x < CHUNK_SIZE + 1; x++) {
                uint real_x = x - 1;
                uint real_y = y - 1;
                uint block_data = data.get_hxy(h, x, y);
                uint block_id = decode_block_id(block_data);
                if (block_id == BLOCK_EMPTY) {
                    continue;
                }
                const uint* block_textures = block_table.faces[block_id];

                if (is_x_quads(block_data)) {                    
                    x_quads_encoder::encode_quad<Direction::Diagonal0>(buffers.mesh_cutout_x_cur, real_x, real_y, real_h, block_textures[1]);
                    x_quads_encoder::encode_quad<Direction::Diagonal1>(buffers.mesh_cutout_x_cur, real_x, real_y, real_h, block_textures[2]);
                    if (!is_water(block_data))
                        continue;
                    // a plant in water: the water faces too
                }

                uint above = data.get_hxy(h + 1, x, y);

                if (is_water(block_data)) {
                    const uint water_texture = block_table.water_texture;
                    // no AO on water, the low byte of the face data holds the water level and the side face bottom
                    uint level = block_height(block_data);
                    if (!water_top_hidden(level, above))
                        layers.set_hxy(0, real_x, real_y, layer_face(water_texture, water_face_data(level, 0)));
                    if (!water_bottom_hidden(data.get_hxy(h - 1, x, y)))
                        layers.set_hxy(5, real_x, CHUNK_SIZE - 1 - real_y, layer_face(water_texture, water_face_data(level, 0)));
                    uint bottom = water_side_bottom(level, data.get_hxy(h, x, y - 1));
                    if (bottom < level)
                        layers.set_hxy(current_layer_offset + Direction::Front, real_x, real_y, layer_face(water_texture, water_face_data(level, bottom)));
                    bottom = water_side_bottom(level, data.get_hxy(h, x - 1, y));
                    if (bottom < level)
                        layers.set_hxy(current_layer_offset + Direction::Left, CHUNK_SIZE - 1 - real_y, real_x, layer_face(water_texture, water_face_data(level, bottom)));
                    bottom = water_side_bottom(level, data.get_hxy(h, x, y + 1));
                    if (bottom < level)
                        layers.set_hxy(current_layer_offset + Direction::Back, CHUNK_SIZE - 1 - real_x, CHUNK_SIZE - 1 - real_y, layer_face(water_texture, water_face_data(level, bottom)));
                    bottom = water_side_bottom(level, data.get_hxy(h, x + 1, y));
                    if (bottom < level)
                        layers.set_hxy(current_layer_offset + Direction::Right, real_y, CHUNK_SIZE - 1 - real_x, layer_face(water_texture, water_face_data(level, bottom)));
                    continue;
                }

                if (!hides_face(above)) {
                    uint shadows = ao_shadows::encode<Direction::Up>(data, h, x, y);
                    layers.set_hxy(0, real_x, real_y, layer_face(block_textures[0], shadows));
                }

                if (!hides_face(data.get_hxy(h - 1, x, y))) {
                    uint shadows = ao_shadows::encode<Direction::Down>(data, h, x, y);
                    layers.set_hxy(5, real_x, CHUNK_SIZE - 1 - real_y, layer_face(block_textures[5], shadows));
                }

                if (!hides_face(data.get_hxy(h, x, y - 1))) {
                    uint shadows = ao_shadows::encode<Direction::Front>(data, h, x, y);
                    layers.set_hxy(current_layer_offset + Direction::Front, real_x, real_y, layer_face(block_textures[1], shadows));
                }

                if (!hides_face(data.get_hxy(h, x - 1, y))) {
                    uint shadows = ao_shadows::encode<Direction::Left>(data, h, x, y);
                    layers.set_hxy(
                        current_layer_offset + Direction::Left,
                        CHUNK_SIZE - 1 - real_y,
                        real_x,
                        layer_face(block_textures[2], shadows));
                }

                if (!hides_face(data.get_hxy(h, x, y + 1))) {
                    uint shadows = ao_shadows::encode<Direction::Back>(data, h, x, y);
                    layers.set_hxy(
                        current_layer_offset + Direction::Back,
                        CHUNK_SIZE - 1 - real_x,
                        CHUNK_SIZE - 1 - real_y,
                        layer_face(block_textures[3], shadows));
                }

                if (!hides_face(data.get_hxy(h, x + 1, y))) {
                    uint shadows = ao_shadows::encode<Direction::Right>(data, h, x, y);
                    layers.set_hxy(
                        current_layer_offset + Direction::Right,
                        real_y,
                        CHUNK_SIZE - 1 - real_x,
                        layer_face(block_textures[4], shadows));
                }
            }
        }

        merge_top_down_faces<Direction::Up>(buffers, layers, real_h);
        merge_top_down_faces<Direction::Down>(buffers, layers, real_h);
        merge_side_faces<Direction::Front>(buffers, layers, current_layer_offset, top_layer_offset, real_h);
        merge_side_faces<Direction::Left>(buffers, layers, current_layer_offset, top_layer_offset, real_h);
        merge_side_faces<Direction::Back>(buffers, layers, current_layer_offset, top_layer_offset, real_h);
        merge_side_faces<Direction::Right>(buffers, layers, current_layer_offset, top_layer_offset, real_h);
    }

    merge_side_faces_finish<Direction::Front>(buffers, layers, current_layer_offset);
    merge_side_faces_finish<Direction::Left>(buffers, layers, current_layer_offset);
    merge_side_faces_finish<Direction::Back>(buffers, layers, current_layer_offset);
    merge_side_faces_finish<Direction::Right>(buffers, layers, current_layer_offset);

    solid_sort::finish(buffers);
    return complete_buffers(buffers, cutout_sort::keys);
}
