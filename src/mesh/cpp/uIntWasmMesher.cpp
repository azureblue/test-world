#include "quad_encode.hpp"
#include "row_faces.hpp"
#include "shaped.hpp"

constexpr int DIRECTION_ENCODE[40] = {
    0, 0, 0, 0, 0, 0, 0, 0,
    1, 0, 0, 0, 1, 0, 0, 0,
    0, 1, 0, -1, 0, CHUNK_SIZE - 1, 0, 0,
    -1, 0, CHUNK_SIZE - 1, 0, -1, CHUNK_SIZE - 1, 0, 0,
    0, -1, CHUNK_SIZE - 1, 1, 0, 0, 0, 0};

// A face in a layer, 32 bits: bits 0..7 the AO shadows (2 bits per vertex) or the water's level and bottom, 8..19 the
// texture + 1 (0 is no face, so a face with texture 0 and no shadows is one), then the merge counters: 20..25 the
// width, 26..31 the height (1..32 each). Its vertices' light (12 bits each, layer_vertex_light) is at the same place in
// the light layers, 64 bits: written with every face and read only where there is one, so the scans over empty layers
// don't touch it and it's never cleared. Faces merge when both match.
constexpr uint LAYER_TEXTURE_SHIFT = 8;
constexpr uint LAYER_WIDTH_SHIFT = 20;
constexpr uint LAYER_HEIGHT_SHIFT = 26;
// what merged faces share (besides the light)
constexpr uint LAYER_FACE_BITS = (1u << LAYER_WIDTH_SHIFT) - 1;
// the face and its width: a row merged along x, to merge with the row's run above if both match
constexpr uint LAYER_FACE_WIDTH_BITS = (1u << LAYER_HEIGHT_SHIFT) - 1;

// the face layers: the current height's up and down faces (planes 0, 5), the side faces of the current height and the
// one below (planes 1..4 and 7..10, by turns), whose runs merge upwards; and their faces' light
static uint layers_data[CHUNK_SIZE * CHUNK_SIZE * 12];
static uint64 lights_data[CHUNK_SIZE * CHUNK_SIZE * 12];
typedef array_3d<CHUNK_SIZE, uint64> light_layers;
// per layer, its rows with a face (bit = row): the merges scan only them, and clearing a layer zeroes only them (the
// rows of no bit are 0; kept from one mesh to the next, the layers are cleared at the start)
static uint layer_rows[12];

// zeroes the layer's rows with a face
static inline void clear_layer(array_3d<CHUNK_SIZE>& layers, uint plane) {
    for (uint rows = layer_rows[plane]; rows != 0; rows &= rows - 1) {
        uint* row = layers.data + layers.row_idx(plane, __builtin_ctz(rows));
        for (uint i = 0; i < CHUNK_SIZE; i++)
            row[i] = 0;
    }
    layer_rows[plane] = 0;
}

static inline uint layer_face(uint texture, uint data) {
    return (texture + 1) << LAYER_TEXTURE_SHIFT | data;
}

static inline uint layer_face_texture(uint face) {
    return (face >> LAYER_TEXTURE_SHIFT & 0xfff) - 1;
}

static inline uint layer_width(uint face) {
    return face >> LAYER_WIDTH_SHIFT & 0x3f;
}

static inline uint layer_height(uint face) {
    return face >> LAYER_HEIGHT_SHIFT;
}

static inline uint with_layer_height(uint face, uint height) {
    return (face & LAYER_FACE_WIDTH_BITS) | height << LAYER_HEIGHT_SHIFT;
}

// a vertex's light (corner_light) in 12 bits: the sums of the sky darkness in bits 0..5, of the block light in 6..11
// (whole: halved sums lost half-steps, and a flat stretch in a gradient shows as a band)
static inline uint64 layer_vertex_light(uint light) {
    return (light >> SKY_DARKNESS_SHIFT & 0x3f) | (light >> BLOCK_LIGHT_SHIFT & 0x3f) << 6;
}

// a face's data (the AO shadows, or the water's level and bottom) and its vertices' light
struct face_shading_t {
    uint data;
    uint64 light;
};

template <Direction DIR>
static inline face_shading_t face_shading(const array_3d<CHUNK_SIZE_E>& data, uint h, uint x, uint y) {
    const ao_shadows::vertex_data v = ao_shadows::compute<DIR>(data, h, x, y);
    return {v.v0 | v.v1 << 2 | v.v2 << 4 | v.v3 << 6,
            layer_vertex_light(v.l0) | layer_vertex_light(v.l1) << 12 | layer_vertex_light(v.l2) << 24 | layer_vertex_light(v.l3) << 36};
}

// a face into the layers: plane, then the layer's x and y
static inline void set_face(array_3d<CHUNK_SIZE>& layers, light_layers& lights, uint plane, uint lx, uint ly, uint texture, face_shading_t shading) {
    layers.set_hxy(plane, lx, ly, layer_face(texture, shading.data));
    lights.set_hxy(plane, lx, ly, shading.light);
    layer_rows[plane] |= 1u << ly;
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

// key for a direction known at run time
static inline uint key(Direction dir, uint x, uint y, uint h) {
    switch (dir) {
        case Direction::Up: return key<Direction::Up>(x, y, h);
        case Direction::Front: return key<Direction::Front>(x, y, h);
        case Direction::Left: return key<Direction::Left>(x, y, h);
        case Direction::Back: return key<Direction::Back>(x, y, h);
        case Direction::Right: return key<Direction::Right>(x, y, h);
        default: return key<Direction::Down>(x, y, h);
    }
}

static inline uint64* scratch_base(face_buffers& buffers) {
    return buffers.mesh_cutout_x_base + data_size::MAX_CUTOUT_X_UINTS64;
}

static inline void begin(face_buffers& buffers) {
    count = 0;
    buffers.mesh_solid_cur = scratch_base(buffers);
}

template <Direction DIR>
inline_always static void encode_face(face_buffers& buffers, uint x, uint y, uint h, uint width, uint height, uint texture_id, uint shadows, uint64 light) {
    keys[count++] = static_cast<uint8>(key<DIR>(x, y, h));
    quad_encoder::encode_face<DIR>(buffers.mesh_solid_cur, x, y, h, width, height, texture_id, shadows, light);
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
inline_always static void encode_face(face_buffers& buffers, uint x, uint y, uint h, uint width, uint height, uint texture_id, uint shadows, uint64 light) {
    keys[count++] = static_cast<uint8>(solid_sort::key<DIR>(x, y, h));
    quad_encoder::encode_face<DIR>(buffers.mesh_cutout_cur, x, y, h, width, height, texture_id, shadows, light);
}
}  // namespace cutout_sort

// a merged face to its output: water, cutout or solid; x, y, h the block position of its first corner
template <Direction DIR>
inline_always static void encode_merged(face_buffers& buffers, uint x, uint y, uint h, uint width, uint height, uint face, uint64 light) {
    const uint texture_id = layer_face_texture(face);
    const uint shadows = face & 0xff;
    if (texture_id == block_table.water_texture) {
        water_encoder::encode_face<DIR>(buffers.mesh_water_cur, x, y, h, width, height, shadows & 0b1111, shadows >> 4, texture_id);
    } else if (block_table.cutout_textures[texture_id]) {
        cutout_sort::encode_face<DIR>(buffers, x, y, h, width, height, texture_id, shadows, light);
    } else {
        solid_sort::encode_face<DIR>(buffers, x, y, h, width, height, texture_id, shadows, light);
    }
}

template <Direction DIR>
static inline void merge_encode_face(face_buffers& buffers, uint h, uint layer_x, uint layer_y, uint width, uint height, uint face, uint64 light) {
    constexpr uint dir_encode_base_idx = (DIR << 3);
    constexpr int dir_xx_mul = DIRECTION_ENCODE[dir_encode_base_idx + 0];
    constexpr int dir_xy_mul = DIRECTION_ENCODE[dir_encode_base_idx + 1];
    constexpr int dir_xx_add = DIRECTION_ENCODE[dir_encode_base_idx + 2];
    constexpr int dir_yx_mul = DIRECTION_ENCODE[dir_encode_base_idx + 3];
    constexpr int dir_yy_mul = DIRECTION_ENCODE[dir_encode_base_idx + 4];
    constexpr int dir_yy_add = DIRECTION_ENCODE[dir_encode_base_idx + 5];
    uint x = dir_xx_add + dir_xx_mul * layer_x + dir_xy_mul * layer_y;
    uint y = dir_yy_add + dir_yx_mul * layer_x + dir_yy_mul * layer_y;
    encode_merged<DIR>(buffers, x, y, h, width, height, face, light);
}

template <>
inline void merge_encode_face<Direction::Up>(face_buffers& buffers, uint layer_h, uint layer_x, uint layer_y, uint width, uint height, uint face, uint64 light) {
    encode_merged<Direction::Up>(buffers, layer_x, layer_y, layer_h, width, height, face, light);
}

template <>
inline void merge_encode_face<Direction::Down>(face_buffers& buffers, uint layer_h, uint layer_x, uint layer_y, uint width, uint height, uint face, uint64 light) {
    encode_merged<Direction::Down>(buffers, layer_x, (CHUNK_SIZE - 1) - layer_y, layer_h, width, height, face, light);
}

template <Direction DIR>
void merge_side_faces(face_buffers& buffer, array_3d<CHUNK_SIZE>& layers, const light_layers& lights, uint& current_layer_offset, uint& top_layer_offset, uint real_h) {
    uint layer_start_current = layers.plane_idx(DIR + current_layer_offset);
    uint layer_start_top = layers.plane_idx(DIR + top_layer_offset);

    for (uint rows = layer_rows[DIR + current_layer_offset]; rows != 0; rows &= rows - 1) {
        uint row_start = layer_start_current + __builtin_ctz(rows) * CHUNK_SIZE;
        uint row_end = row_start + CHUNK_SIZE;
        for (uint i = row_start; i < row_end;) {
            uint j = i + 1;
            uint data_i = layers.get_idx(i);
            if (data_i == 0) {
                i++;
                continue;
            }
            const uint64 light_i = lights.get_idx(i);
            while (j < row_end) {
                if (data_i != layers.get_idx(j) || light_i != lights.get_idx(j))
                    break;
                j += 1;
            }
            layers.set_idx(i, data_i | 1u << LAYER_HEIGHT_SHIFT | (j - i) << LAYER_WIDTH_SHIFT);
            i = j;
        }
    }
    // the runs of the layer below (top: merged upwards so far) grow by this height's or end; a row's runs end in it,
    // and the rows with none are 0
    for (uint rows = layer_rows[DIR + top_layer_offset]; rows != 0; rows &= rows - 1) {
        uint row_start = __builtin_ctz(rows) * CHUNK_SIZE;
        for (uint i = row_start; i < row_start + CHUNK_SIZE;) {
            uint top = layers.get_idx((layer_start_top + i));
            if (top == 0) {
                i++;
                continue;
            }
            uint top_w = layer_width(top);
            uint top_h = layer_height(top);
            uint cur = layers.get_idx((layer_start_current + i));
            const uint64 top_light = lights.get_idx(layer_start_top + i);
            if ((top & LAYER_FACE_WIDTH_BITS) == (cur & LAYER_FACE_WIDTH_BITS) && top_h < CHUNK_SIZE && top_light == lights.get_idx(layer_start_current + i)) {
                layers.set_idx((layer_start_current + i), with_layer_height(cur, top_h + 1));
            } else {
                uint x = i & 31;
                uint y = i >> 5;
                merge_encode_face<DIR>(buffer, real_h - top_h, x, y, top_w, top_h, top & LAYER_FACE_BITS, top_light);
            }
            i += top_w;
        }
    }
}

template <Direction DIR>
void merge_top_down_faces(face_buffers& buffer, array_3d<CHUNK_SIZE>& layers, const light_layers& lights, uint real_h) {
    // the current row and the one before, copied from the layer: the runs merged along x, then upwards (y); a run's
    // light is its first face's in the layer
    // (only rows with a face are copied: a row's half holds its runs only while the next row has top_any)
    uint t_c[CHUNK_SIZE * 2];

    const uint rows = layer_rows[DIR];
    // the row before has faces (its runs in t_c)
    bool top_any = false;
    for (uint y = 0; y < CHUNK_SIZE; y++) {
        const bool cur_any = rows >> y & 1;
        if (!cur_any && !top_any)
            continue;
        uint current_row_idx = (y & 1) * CHUNK_SIZE;
        uint top_row_idx = (CHUNK_SIZE - current_row_idx);
        uint row_idx = layers.row_idx(DIR, y);
        for (uint i = 0; i < CHUNK_SIZE; i++) {
            t_c[(current_row_idx + i)] = cur_any ? layers.get_idx(row_idx + i) : 0;
        }
        for (uint i = 0; cur_any && i < CHUNK_SIZE;) {
            uint idx_i = (current_row_idx + i);
            if (t_c[idx_i] == 0) {
                i += 1;
                continue;
            }
            const uint64 light_i = lights.get_idx(row_idx + i);
            uint j = i + 1;
            for (; j < CHUNK_SIZE; j++) {
                uint idx_j = (current_row_idx + j);
                if (t_c[idx_i] != t_c[idx_j] || light_i != lights.get_idx(row_idx + j)) {
                    break;
                }
            }
            t_c[idx_i] |= 1u << LAYER_HEIGHT_SHIFT | (j - i) << LAYER_WIDTH_SHIFT;
            i = j;
        }
        for (uint i = 0; top_any && i < CHUNK_SIZE;) {
            uint idx_i = (current_row_idx + i);
            uint idx_top = (top_row_idx + i);
            uint top = t_c[idx_top];
            if (top == 0) {
                i++;
                continue;
            }
            uint top_w = layer_width(top);
            uint top_h = layer_height(top);
            uint cur = t_c[idx_i];
            const uint64 top_light = lights.get_idx(row_idx - CHUNK_SIZE + i);
            if ((top & LAYER_FACE_WIDTH_BITS) == (cur & LAYER_FACE_WIDTH_BITS) && top_light == lights.get_idx(row_idx + i)) {
                t_c[idx_i] = with_layer_height(cur, top_h + 1);
            } else {
                merge_encode_face<DIR>(buffer, real_h, i, y - top_h, top_w, top_h, top & LAYER_FACE_BITS, top_light);
            }
            i += top_w;
        }
        top_any = cur_any;
    }

    // the last row's runs (its half: y = 31 is odd)
    for (uint i = 0; top_any && i < CHUNK_SIZE;) {
        uint top = t_c[(CHUNK_SIZE + i)];
        if (top == 0) {
            i++;
            continue;
        }
        uint top_h = layer_height(top);
        uint top_w = layer_width(top);
        uint y = (CHUNK_SIZE - top_h);
        merge_encode_face<DIR>(buffer, real_h, i, y, top_w, top_h, top & LAYER_FACE_BITS, lights.get_idx(layers.row_idx(DIR, CHUNK_SIZE - 1) + i));
        i += top_w;
    }
}

template <Direction DIR>
void merge_side_faces_finish(face_buffers& buffer, array_3d<CHUNK_SIZE>& layers, const light_layers& lights, uint& current_layer_offset) {
    const uint layer_start_current = layers.plane_idx(DIR + current_layer_offset);

    for (uint rows = layer_rows[DIR + current_layer_offset]; rows != 0; rows &= rows - 1) {
        uint row_start = __builtin_ctz(rows) * CHUNK_SIZE;
        for (uint i = row_start; i < row_start + CHUNK_SIZE;) {
            uint top = layers.get_idx((layer_start_current + i));
            if (top == 0) {
                i++;
                continue;
            }
            uint top_w = layer_width(top);
            uint top_h = layer_height(top);
            uint x = i & 31;
            uint y = i >> 5;
            merge_encode_face<DIR>(buffer, CHUNK_SIZE - top_h, x, y, top_w, top_h, top & LAYER_FACE_BITS, lights.get_idx(layer_start_current + i));
            i += top_w;
        }
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
    create_mesh(uint* __restrict in_chunk_data_ptr, uint64* __restrict out_data_ptr, const uint8* __restrict light_ptr) {
    // the cells' light (null: full sky light everywhere, no block light)
    if (light_ptr != nullptr)
        apply_light(in_chunk_data_ptr, light_ptr);
    face_buffers buffers(out_data_ptr);
    row_masks::compute(in_chunk_data_ptr);
    solid_sort::begin(buffers);
    cutout_sort::begin();

    array_3d<CHUNK_SIZE_E> data(in_chunk_data_ptr);
    array_3d<CHUNK_SIZE> layers(layers_data);
    light_layers lights(lights_data);
    for (uint plane = 0; plane < 12; plane++)
        clear_layer(layers, plane);

    uint current_layer_offset = 0;
    uint top_layer_offset = 0;

    for (uint h = 1; h < CHUNK_SIZE + 1; h++) {
        uint real_h = h - 1;
        current_layer_offset = (real_h & 1) * 6;
        top_layer_offset = 6 - current_layer_offset;
        clear_layer(layers, Direction::Up);
        clear_layer(layers, Direction::Down);
        for (uint dir = Direction::Front; dir <= Direction::Right; dir++)
            clear_layer(layers, current_layer_offset + dir);

        for (uint y = 1; y < CHUNK_SIZE + 1; y++) {
            const row_faces f = faces_of_row(h, y);
            const uint real_y = y - 1;
            // the blocks with something to draw, x up: the lowest bit left each time
            for (uint64 todo = f.blocks_to_visit(); todo != 0; todo &= todo - 1) {
                const uint x = static_cast<uint>(__builtin_ctzll(todo));
                const uint real_x = x - 1;
                const uint block_data = data.get_hxy(h, x, y);

                if (has(f.specials, x)) {
                    if (is_shaped(block_data)) {
                        shaped::encode(buffers.mesh_solid_cur, data, h, x, y, block_data, [&](Direction dir) {
                            solid_sort::keys[solid_sort::count++] = static_cast<uint8>(solid_sort::key(dir, real_x, real_y, real_h));
                        });
                        continue;
                    }
                    if (is_x_quads(block_data)) {
                        const uint(&block_textures)[6] = block_table.faces[decode_block_id(block_data)];
                        x_quads_encoder::encode_quad<Direction::Diagonal0>(buffers.mesh_cutout_x_cur, real_x, real_y, real_h, block_textures[1], block_data);
                        x_quads_encoder::encode_quad<Direction::Diagonal1>(buffers.mesh_cutout_x_cur, real_x, real_y, real_h, block_textures[2], block_data);
                        if (!is_water(block_data))
                            continue;
                        // a plant in water: the water faces too
                    }
                    const uint water_texture = block_table.water_texture;
                    // no AO on water, the low byte of the face data holds the water level and the side face bottom
                    uint level = block_height(block_data);
                    if (!water_top_hidden(level, data.get_hxy(h + 1, x, y)))
                        set_face(layers, lights, 0, real_x, real_y, water_texture, {water_face_data(level, 0), 0});
                    if (!water_bottom_hidden(data.get_hxy(h - 1, x, y)))
                        set_face(layers, lights, 5, real_x, CHUNK_SIZE - 1 - real_y, water_texture, {water_face_data(level, 0), 0});
                    uint bottom = water_side_bottom(level, data.get_hxy(h, x, y - 1));
                    if (bottom < level)
                        set_face(layers, lights, current_layer_offset + Direction::Front, real_x, real_y, water_texture, {water_face_data(level, bottom), 0});
                    bottom = water_side_bottom(level, data.get_hxy(h, x - 1, y));
                    if (bottom < level)
                        set_face(layers, lights, current_layer_offset + Direction::Left, CHUNK_SIZE - 1 - real_y, real_x, water_texture, {water_face_data(level, bottom), 0});
                    bottom = water_side_bottom(level, data.get_hxy(h, x, y + 1));
                    if (bottom < level)
                        set_face(layers, lights, current_layer_offset + Direction::Back, CHUNK_SIZE - 1 - real_x, CHUNK_SIZE - 1 - real_y, water_texture, {water_face_data(level, bottom), 0});
                    bottom = water_side_bottom(level, data.get_hxy(h, x + 1, y));
                    if (bottom < level)
                        set_face(layers, lights, current_layer_offset + Direction::Right, real_y, CHUNK_SIZE - 1 - real_x, water_texture, {water_face_data(level, bottom), 0});
                    continue;
                }

                const uint block_id = decode_block_id(block_data);
                const uint* block_textures = has(f.buried, x) ? block_table.opaque_faces[block_id] : block_table.faces[block_id];

                if (has(f.up, x)) {
                    const face_shading_t shading = face_shading<Direction::Up>(data, h, x, y);
                    set_face(layers, lights, 0, real_x, real_y, block_textures[0], shading);
                }

                if (has(f.down, x)) {
                    const face_shading_t shading = face_shading<Direction::Down>(data, h, x, y);
                    set_face(layers, lights, 5, real_x, CHUNK_SIZE - 1 - real_y, block_textures[5], shading);
                }

                if (has(f.front, x)) {
                    const face_shading_t shading = face_shading<Direction::Front>(data, h, x, y);
                    set_face(layers, lights, current_layer_offset + Direction::Front, real_x, real_y, block_textures[1], shading);
                }

                if (has(f.left, x)) {
                    const face_shading_t shading = face_shading<Direction::Left>(data, h, x, y);
                    set_face(layers, lights, current_layer_offset + Direction::Left, CHUNK_SIZE - 1 - real_y, real_x, block_textures[2], shading);
                }

                if (has(f.back, x)) {
                    const face_shading_t shading = face_shading<Direction::Back>(data, h, x, y);
                    set_face(layers, lights, current_layer_offset + Direction::Back, CHUNK_SIZE - 1 - real_x, CHUNK_SIZE - 1 - real_y, block_textures[3], shading);
                }

                if (has(f.right, x)) {
                    const face_shading_t shading = face_shading<Direction::Right>(data, h, x, y);
                    set_face(layers, lights, current_layer_offset + Direction::Right, real_y, CHUNK_SIZE - 1 - real_x, block_textures[4], shading);
                }
            }
        }

        merge_top_down_faces<Direction::Up>(buffers, layers, lights, real_h);
        merge_top_down_faces<Direction::Down>(buffers, layers, lights, real_h);
        merge_side_faces<Direction::Front>(buffers, layers, lights, current_layer_offset, top_layer_offset, real_h);
        merge_side_faces<Direction::Left>(buffers, layers, lights, current_layer_offset, top_layer_offset, real_h);
        merge_side_faces<Direction::Back>(buffers, layers, lights, current_layer_offset, top_layer_offset, real_h);
        merge_side_faces<Direction::Right>(buffers, layers, lights, current_layer_offset, top_layer_offset, real_h);
    }

    merge_side_faces_finish<Direction::Front>(buffers, layers, lights, current_layer_offset);
    merge_side_faces_finish<Direction::Left>(buffers, layers, lights, current_layer_offset);
    merge_side_faces_finish<Direction::Back>(buffers, layers, lights, current_layer_offset);
    merge_side_faces_finish<Direction::Right>(buffers, layers, lights, current_layer_offset);

    solid_sort::finish(buffers);
    return complete_buffers(buffers, cutout_sort::keys);
}
