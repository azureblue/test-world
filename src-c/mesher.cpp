#include "int.h"

enum Direction : uint {
    DIRECTION_UP = 0,
    DIRECTION_FRONT = 1,
    DIRECTION_LEFT = 2,
    DIRECTION_BACK = 3,
    DIRECTION_RIGHT = 4,
    DIRECTION_DOWN = 5,
    DIRECTION_DIAGONAL_0 = 6,
    DIRECTION_DIAGONAL_1 = 7
};

const uint CHUNK_SIZE = 32;
const uint PLANE_SIZE = CHUNK_SIZE * CHUNK_SIZE;
const uint CHUNK_SIZE_E = CHUNK_SIZE + 2;
const uint MAX_VISIBLE_FACES = CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE * 3;
const uint PLANE_SIZE_E = CHUNK_SIZE_E * CHUNK_SIZE_E;

const uint X = 0;
const uint Y = 1;
const uint Z = 2;
const uint UP = 0;
const uint BLOCK_WATER = 6;
const uint BLOCK_EMPTY = 0;

const int VERTEX_OFFSETS[8][3] = {{0, 0, 1}, {0, 0, 0}, {0, 1, 0}, {1, 1, 0}, {1, 0, 0}, {0, 1, 0}, {0, 0, 0}, {0, 1, 0}};
const int MERGE_VECTOR_W[8][3] = {{1, 0, 0}, {1, 0, 0}, {0, -1, 0}, {-1, 0, 0}, {0, 1, 0}, {1, 0, 0}, {1, 1, 0}, {1, -1, 0}};
const int MERGE_VECTOR_H[8][3] = {{0, 1, 0}, {0, 0, 1}, {0, 0, 1}, {0, 0, 1}, {0, 0, 1}, {0, -1, 0}, {0, 0, 1}, {0, 0, 1}};
const uint WINDING[4][6] = {{0, 1, 2, 0, 2, 3}, {3, 2, 0, 2, 1, 0}, {1, 2, 3, 1, 3, 0}, {0, 3, 1, 3, 2, 1}};
const uint MERGE_MASKS_W[4] = {0, 1, 1, 0};
const uint MERGE_MASKS_H[4] = {0, 0, 1, 1};
const uint BLOCKS_TEXTURES[9][6] = {
    {0, 0, 0, 0, 0, 0},
    {1, 1, 1, 1, 1, 1},
    {3, 2, 2, 2, 2, 1},
    {3, 3, 3, 3, 3, 3},
    {4, 4, 4, 4, 4, 4},
    {5, 5, 5, 5, 5, 5},
    {6, 6, 6, 6, 6, 6},
    {7, 7, 7, 7, 7, 7},
    {0, 8, 8, 8, 8, 0},
};

const int DIRECTION_ENCODE[40] = {
    0, 0, 0, 0, 0, 0, 0, 0,
    1, 0, 0, 0, 1, 0, 0, 0,
    0, 1, 0, -1, 0, CHUNK_SIZE - 1, 0, 0,
    -1, 0, CHUNK_SIZE - 1, 0, -1, CHUNK_SIZE - 1, 0, 0,
    0, -1, CHUNK_SIZE - 1, 1, 0, 0, 0, 0};

static inline bool is_solid(uint block) {
    return (block & 0x8000'0000) != 0;
}

static inline uint is_solid_int(uint block) {
    return block >> 31;
}

static inline uint decode_block_id(uint id) {
    return id & 0x7fff'ffff;
}

struct dir_xy {
    int x = 0;
    int y = 0;

    inline void set(int x, int y) {
        this->x = x;
        this->y = y;
    }
    inline void rotate_ccw() {
        int temp_x = x;
        x = -y;
        y = temp_x;
    }
};

struct array_3d {
    uint* __restrict data;
    uint plane_size;
    uint sy;

    array_3d(uint* data, uint sx, uint sy, uint sz) {
        this->data = data;
        this->plane_size = sx * sy;
        this->sy = sy;
    }

    inline uint get_xyz(uint x, uint y, uint z) {
        return *(this->data + (z * this->plane_size + y * this->sy + x));
    }

    inline uint get_hxy(uint h, uint x, uint y) {
        return *(this->data + (h * this->plane_size + y * this->sy + x));
    }

    inline void set_xyz(uint x, uint y, uint z, uint value) {
        *(this->data + (z * this->plane_size + y * this->sy + x)) = value;
    }

    inline void set_hxy(uint h, uint x, uint y, uint value) {
        *(this->data + (h * this->plane_size + y * this->sy + x)) = value;
    }

    inline uint plane_idx(uint plane) {
        return plane * this->plane_size;
    }

    inline uint row_idx(uint plane, uint row) {
        return plane * this->plane_size + row * this->sy;
    }

    inline void set_idx(uint idx, uint value) {
        *(this->data + idx) = value;
    }

    inline uint get_idx(uint idx) {
        return *(this->data + idx);
    }

    inline void fill_planes(uint from, uint n, uint value) {
        uint start = from * this->plane_size;
        uint end = (from + n) * this->plane_size;
        for (uint i = start; i < end; i++) {
            *(this->data + i) = value;
        }
    }
};

struct FaceBuffer {
    uint* __restrict mesh_data_solid;
    uint mesh_data_solid_idx;
    uint* __restrict mesh_data_water;
    uint mesh_data_water_idx;

    uint complete() {
        for (uint i = 0; i < this->mesh_data_water_idx; i++) {
            *(this->mesh_data_solid + this->mesh_data_solid_idx + i) = *(this->mesh_data_water + i);
        }
        return (this->mesh_data_solid_idx + this->mesh_data_water_idx);
    }

    void add_face(uint dir, uint h, uint x, uint y, uint width, uint height, uint data, bool reverse_winding) {
        uint texture_id = data >> 8;
        uint shadows = data & 0b11111111;
        uint corner0_shadow = shadows & 0b11;
        uint corner1_shadow = (shadows >> 2) & 0b11;
        uint corner2_shadow = (shadows >> 4) & 0b11;
        uint corner3_shadow = (shadows >> 6) & 0b11;
        uint merge_bits_width = width;
        uint merge_bits_height = height << 7;
        uint flip = (corner0_shadow + corner2_shadow > corner1_shadow + corner3_shadow) ? 1 : 0;

        uint reversed = reverse_winding ? 1 : 0;
        uint cs = corner0_shadow | (corner1_shadow << 2) | (corner2_shadow << 4) | (corner3_shadow << 6);
        // let corner_shadows = [corner0_shadow, corner1_shadow, corner2_shadow, corner3_shadow];
        uint lower = 0;
        if (texture_id == BLOCK_WATER && dir == UP) {
            lower = 2;
        }

        uint bits = 0 | lower << 29 | (texture_id & 0b01111'1111) << 19 | (dir & 0b111) << 16;

        const uint* vns = WINDING[(flip * 2 + reversed)];

        uint* dst;
        uint* __restrict idx;
        if (texture_id == BLOCK_WATER) {
            dst = this->mesh_data_water;
            idx = &this->mesh_data_water_idx;
        } else {
            dst = this->mesh_data_solid;
            idx = &this->mesh_data_solid_idx;
        };
        for (uint i = 0; i < 6; i++) {
            uint vn = vns[i];
            uint xb = x + (VERTEX_OFFSETS[dir][X] + MERGE_VECTOR_W[dir][X] * width * MERGE_MASKS_W[vn] + MERGE_VECTOR_H[dir][X] * height * MERGE_MASKS_H[vn]);
            uint yb = y + (VERTEX_OFFSETS[dir][Y] + MERGE_VECTOR_W[dir][Y] * width * MERGE_MASKS_W[vn] + MERGE_VECTOR_H[dir][Y] * height * MERGE_MASKS_H[vn]);
            uint zb = h + (VERTEX_OFFSETS[dir][Z] + MERGE_VECTOR_W[dir][Z] * width * MERGE_MASKS_W[vn] + MERGE_VECTOR_H[dir][Z] * height * MERGE_MASKS_H[vn]);
            uint pos_bits = zb << 14 | yb << 7 | xb;
            dst[(*idx)++] = pos_bits;
            dst[(*idx)++] = bits | (merge_bits_width * MERGE_MASKS_W[vn]) | (merge_bits_height * MERGE_MASKS_H[vn]) | (((cs >> (vn * 2)) & 3) << 27);            
        }
    }
};

extern "C"
__attribute__((export_name("create_mesh")))
uint create_mesh(uint* __restrict in_chunk_data_ptr, uint* __restrict out_mesh_ptr, uint* __restrict tmp_mesh_ptr) {
    dir_xy side_dir0;
    dir_xy side_dir1;
    dir_xy corner_dir;
    
    FaceBuffer buffer = {
        .mesh_data_solid = out_mesh_ptr,
        .mesh_data_solid_idx = 0,
        .mesh_data_water = tmp_mesh_ptr,
        .mesh_data_water_idx = 0,
    };

    array_3d data(in_chunk_data_ptr, CHUNK_SIZE_E, CHUNK_SIZE_E, CHUNK_SIZE_E);
    uint layers_data[CHUNK_SIZE * CHUNK_SIZE * 12];
    array_3d layers(layers_data, CHUNK_SIZE, CHUNK_SIZE, 12);
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
                uint block_id = data.get_hxy(h, x, y);
                if (block_id == BLOCK_EMPTY) {
                    continue;
                }
             const uint *block_textures = BLOCKS_TEXTURES[decode_block_id(block_id)];
                uint is_water = block_id == BLOCK_WATER;
                uint above = data.get_hxy(h + 1, x, y);
                if (!is_solid(above)) {
                    if (is_water && above == BLOCK_WATER) {
                        continue;
                    }
                    side_dir0.set(-1, 0);
                    side_dir1.set(0, -1);
                    corner_dir.set(-1, -1);
                    uint shadows = 0;
                    if (!is_water) {
                        for (uint v = 0; v < 4; v++) {
                            uint s0 = is_solid_int(data.get_hxy((h + 1) , (x  + side_dir0.x) , (y  + side_dir0.y) ));
                            uint s1 = is_solid_int(data.get_hxy((h + 1) , (x  + side_dir1.x) , (y  + side_dir1.y) ));
                            uint c = is_solid_int(data.get_hxy((h + 1) , (x  + corner_dir.x) , (y  + corner_dir.y) ));
                            shadows |= ((s0 + s1 == 2) ? 3 : (s0 + s1 + c)) << (v * 2);
                            side_dir0.rotate_ccw();
                            side_dir1.rotate_ccw();
                            corner_dir.rotate_ccw();
                        }
                    }

                    layers.set_hxy(0, real_x, real_y, (block_textures[0] << 8) | (shadows));
                }

                if (is_water) {
                    continue;
                }

                if (!is_solid(data.get_hxy(h - 1, x, y))) {
                    side_dir0.set(-1, 0);
                    side_dir1.set(0, -1);
                    corner_dir.set(-1, -1);
                    uint shadows = 0;
                    for (uint v = 0; v < 4; v++) {
                        uint s0 = is_solid_int(data.get_hxy((h - 1) , (x  + side_dir0.x) , (y  - side_dir0.y) ));
                        uint s1 = is_solid_int(data.get_hxy((h - 1) , (x  + side_dir1.x) , (y  - side_dir1.y) ));
                        uint c = is_solid_int(data.get_hxy((h - 1) , (x  + corner_dir.x) , (y  - corner_dir.y) ));
                        shadows |= ((s0 + s1 == 2) ? 3 : (s0 + s1 + c)) << (v * 2);
                        side_dir0.rotate_ccw();
                        side_dir1.rotate_ccw();
                        corner_dir.rotate_ccw();
                    }
                    layers.set_hxy(5, real_x, CHUNK_SIZE - 1 - real_y, (block_textures[5] << 8) | (shadows));
                }

                if (!is_solid(data.get_hxy(h, x, y - 1))) {
                    side_dir0.set(-1, 0);
                    side_dir1.set(0, -1);
                    corner_dir.set(-1, -1);
                    uint shadows = 0;
                    for (uint v = 0; v < 4; v++) {
                        uint s0 = is_solid_int(data.get_hxy((h  + side_dir0.y) , (x  + side_dir0.x) , (y - 1) ));
                        uint s1 = is_solid_int(data.get_hxy((h  + side_dir1.y) , (x  + side_dir1.x) , (y - 1) ));
                        uint c = is_solid_int(data.get_hxy((h  + corner_dir.y) , (x  + corner_dir.x) , (y - 1) ));
                        shadows |= ((s0 + s1 == 2) ? 3 : (s0 + s1 + c)) << (v * 2);
                        side_dir0.rotate_ccw();
                        side_dir1.rotate_ccw();
                        corner_dir.rotate_ccw();
                    }
                    layers.set_hxy(current_layer_offset + DIRECTION_FRONT, real_x, real_y, (block_textures[1] << 8) | shadows);
                }

                if (!is_solid(data.get_hxy(h, x - 1, y))) {
                    side_dir0.set(-1, 0);
                    side_dir1.set(0, -1);
                    corner_dir.set(-1, -1);
                    uint shadows = 0;
                    for (uint v = 0; v < 4; v++) {
                        uint s0 = is_solid_int(data.get_hxy((h  + side_dir0.y) , (x - 1) , (y  - side_dir0.x) ));
                        uint s1 = is_solid_int(data.get_hxy((h  + side_dir1.y) , (x - 1) , (y  - side_dir1.x) ));
                        uint c = is_solid_int(data.get_hxy((h  + corner_dir.y) , (x - 1) , (y  - corner_dir.x) ));
                        shadows |= ((s0 + s1 == 2) ? 3 : (s0 + s1 + c)) << (v * 2);
                        side_dir0.rotate_ccw();
                        side_dir1.rotate_ccw();
                        corner_dir.rotate_ccw();
                    }
                    layers.set_hxy(
                        current_layer_offset + DIRECTION_LEFT,
                        CHUNK_SIZE - 1 - real_y,
                        real_x,
                        (block_textures[2] << 8) | shadows
                    );
                }

                if (!is_solid(data.get_hxy(h, x, y + 1))) {
                    side_dir0.set(-1, 0);
                    side_dir1.set(0, -1);
                    corner_dir.set(-1, -1);
                    uint shadows = 0;
                    for (uint v = 0; v < 4; v++)                    {
                        uint s0 = is_solid_int(data.get_hxy((h  + side_dir0.y) , (x  - side_dir0.x) , (y + 1) ));
                        uint s1 = is_solid_int(data.get_hxy((h  + side_dir1.y) , (x  - side_dir1.x) , (y + 1) ));
                        uint c = is_solid_int(data.get_hxy((h  + corner_dir.y) , (x  - corner_dir.x) , (y + 1) ));
                        shadows |= ((s0 + s1 == 2) ? 3 : (s0 + s1 + c)) << (v * 2);
                        side_dir0.rotate_ccw();
                        side_dir1.rotate_ccw();
                        corner_dir.rotate_ccw();
                    }
                    layers.set_hxy(
                        current_layer_offset + DIRECTION_BACK,
                        CHUNK_SIZE - 1 - real_x,
                        CHUNK_SIZE - 1 - real_y,
                        (block_textures[3] << 8) | shadows
                    );
                }

                if (!is_solid(data.get_hxy(h, x + 1, y))) {
                    side_dir0.set(-1, 0);
                    side_dir1.set(0, -1);
                    corner_dir.set(-1, -1);
                    uint shadows = 0;
                    for (uint v = 0; v < 4; v++) {
                        uint s0 = is_solid_int(data.get_hxy((h  + side_dir0.y) , (x + 1) , (y  + side_dir0.x) ));
                        uint s1 = is_solid_int(data.get_hxy((h  + side_dir1.y) , (x + 1) , (y  + side_dir1.x) ));
                        uint c = is_solid_int(data.get_hxy((h  + corner_dir.y) , (x + 1) , (y  + corner_dir.x) ));
                        shadows |= ((s0 + s1 == 2) ? 3 : (s0 + s1 + c)) << (v * 2);
                        side_dir0.rotate_ccw();
                        side_dir1.rotate_ccw();
                        corner_dir.rotate_ccw();
                    }
                    layers.set_hxy(
                        current_layer_offset + DIRECTION_RIGHT,
                        real_y,
                        CHUNK_SIZE - 1 - real_x,
                        (block_textures[4] << 8) | shadows
                    );
                }
            }            
        }
        uint layer_len = CHUNK_SIZE * CHUNK_SIZE;

        for (uint dir = 1; dir < 5; dir++) {
            uint layer_start_current = layers.plane_idx(dir + current_layer_offset);
            uint layer_start_top = layers.plane_idx(dir + top_layer_offset);
            uint layer_end_idx = layer_start_current + PLANE_SIZE;
            uint dir_encode_base_idx = (dir << 3);
            int dir_xx_mul = DIRECTION_ENCODE[dir_encode_base_idx + 0];
            int dir_xy_mul = DIRECTION_ENCODE[dir_encode_base_idx + 1];
            int dir_xx_add = DIRECTION_ENCODE[dir_encode_base_idx + 2];
            int dir_yx_mul = DIRECTION_ENCODE[dir_encode_base_idx + 3];
            int dir_yy_mul = DIRECTION_ENCODE[dir_encode_base_idx + 4];
            int dir_yy_add = DIRECTION_ENCODE[dir_encode_base_idx + 5];

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
                    buffer.add_face(
                        dir,
                        real_h - top_h,
                        dir_xx_add + dir_xx_mul * x + dir_xy_mul * y,
                        dir_yy_add + dir_yx_mul * x + dir_yy_mul * y,
                        top_w,
                        top_h,
                        top & 0x1FFFF,
                        false
                    );
                }
                i += top_w;
            }
        }

        uint t_c [CHUNK_SIZE * 2];
        for (uint up_down = 0; up_down < 2; up_down++) {
            uint layer_idx = up_down * 5;
            for (uint i = 0; i < CHUNK_SIZE * 2; i++) {
                t_c[i] = 0;
            }
            uint current_row_idx = 0;
            uint top_row_idx;
            for (uint y = 0; y < CHUNK_SIZE; y++) {
                current_row_idx = (y & 1) * CHUNK_SIZE;
                top_row_idx = (CHUNK_SIZE - current_row_idx);
                uint row_idx = layers.row_idx(layer_idx, y);
                for (uint i = 0; i < CHUNK_SIZE; i++) {
                    t_c[(current_row_idx + i) ] = layers.get_idx((row_idx + i));
                }                
                for (uint i = 0; i < CHUNK_SIZE;) {
                    uint idx_i = (current_row_idx + i) ;
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
                    uint idx_i = (current_row_idx + i) ;
                    uint idx_top = (top_row_idx + i) ;
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
                        uint yy = (up_down == 0) ? (y - top_h) : ((CHUNK_SIZE - 1) - (y - top_h));
                        buffer.add_face(DIRECTION_UP + up_down * 5, real_h, i, yy, top_w, top_h, top & 0x1FFFF, false);
                    }
                    i += top_w;
                }
            }

            for (uint i = 0; i < CHUNK_SIZE;) {
                uint top = t_c[(current_row_idx + i) ];
                if (top == 0) {
                    i++;
                    continue;
                }
                uint top_h = top >> 25;
                uint top_w = (top >> 17) & 0xFF;
                uint y = (up_down == 0) ? (CHUNK_SIZE - top_h) : ((CHUNK_SIZE - 1) - (CHUNK_SIZE - top_h));
                buffer.add_face(DIRECTION_UP + up_down * 5, real_h, i, y, top_w, top_h, top & 0x1FFFF, false);
                i += top_w;
            }
        }
    }
    uint layer_len = CHUNK_SIZE * CHUNK_SIZE;

    for (uint dir = 1; dir < 5; dir++) {
        uint layer_start_current = layers.plane_idx(dir + current_layer_offset);
        uint dir_encode_base_idx = (dir << 3);
        uint dir_xx_mul = DIRECTION_ENCODE[dir_encode_base_idx + 0];
        uint dir_xy_mul = DIRECTION_ENCODE[dir_encode_base_idx + 1];
        uint dir_xx_add = DIRECTION_ENCODE[dir_encode_base_idx + 2];
        uint dir_yx_mul = DIRECTION_ENCODE[dir_encode_base_idx + 3];
        uint dir_yy_mul = DIRECTION_ENCODE[dir_encode_base_idx + 4];
        uint dir_yy_add = DIRECTION_ENCODE[dir_encode_base_idx + 5];

        for (uint i = 0; i < layer_len;) {
            uint top = layers.get_idx((layer_start_current + i));
            if (top == 0) {
                i++;
                continue;
            }
            uint top_h = top >> 25;
            uint top_w = (top >> 17) & 0xFF;
            uint x = i & 31;
            uint y = i >> 5;
            buffer.add_face(
                dir,
                CHUNK_SIZE - top_h,
                dir_xx_add + dir_xx_mul * x + dir_xy_mul * y,
                dir_yy_add + dir_yx_mul * x + dir_yy_mul * y,
                top_w,
                top_h,
                top & 0x1FFFF,
                false
            );
            i += top_w;
        }
    }
    return buffer.complete();
}
