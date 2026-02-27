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

constexpr uint CHUNK_SIZE = 32;
constexpr uint PLANE_SIZE = CHUNK_SIZE * CHUNK_SIZE;
constexpr uint CHUNK_SIZE_E = CHUNK_SIZE + 2;
constexpr uint MAX_VISIBLE_FACES = CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE * 3;
constexpr uint PLANE_SIZE_E = CHUNK_SIZE_E * CHUNK_SIZE_E;
constexpr uint MAX_FACES = CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE * 3;
constexpr uint MAX_OUTPUT_UINTS = MAX_FACES * 6 * 2;
constexpr uint MAX_OUTPUT_UINTS64 = MAX_FACES * 6;

constexpr int SY = 34;
constexpr int PS = 1156;

constexpr uint UP = 0;
constexpr uint BLOCK_WATER = 6;
constexpr uint BLOCK_EMPTY = 0;

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

    inline uint is_solid_at(uint idx) {
        return (*(this->data + idx)) >> 31;
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

const uint64 merge_bits_width = 1ull << 32;
const uint64 merge_bits_height = 1ull << 39;
void encode_face_up(uint64*& out, uint64 h, uint64 x, uint64 y, uint64 data) {
    uint64 texture_id = data >> 8;
    uint64 shadows = data & 0b11111111;
    uint64 cs0 = (shadows << 59) & 0x1800000000000000;
    uint64 cs1 = (shadows << 57) & 0x1800000000000000;
    uint64 cs2 = (shadows << 55) & 0x1800000000000000;
    uint64 cs3 = (shadows << 53) & 0x1800000000000000;

    const int mwx = 1;
    const int mwy = 0;
    const int mwz = 0;
    const int mhx = 0;
    const int mhy = 1;
    const int mhz = 0;

    uint64 bits = 0 | (texture_id & 0b01111'1111) << 19 | 0;
  // v0
    uint64 v0 = x | (y << 7) | (h << 14) | bits << 32 | cs0;
    // v1
    uint64 v1 = (x + mwx) | ((y + mwy) << 7) | ((h + mwz) << 14) | bits << 32 | cs1 | merge_bits_width;
    // v2
    uint64 v2 = (x + mwx + mhx) | ((y + mwy + mhy) << 7) | ((h + mwz + mhz) << 14) | bits << 32 | cs2  | merge_bits_width | merge_bits_height;
    // v0 
    uint64 v3 = (x + mhx) | ((y + mhy) << 7) | ((h + mhz) << 14) | bits << 32 | cs3  | merge_bits_height;

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

void encode_face_front(uint64*& out, uint64 h, uint64 x, uint64 y, uint64 data) {
    uint64 texture_id = data >> 8;
    uint64 shadows = data & 0b11111111;
    uint64 cs0 = (shadows << 59) & 0x1800000000000000;
    uint64 cs1 = (shadows << 57) & 0x1800000000000000;
    uint64 cs2 = (shadows << 55) & 0x1800000000000000;
    uint64 cs3 = (shadows << 53) & 0x1800000000000000;

    const int mwx = 1;
    const int mwy = 0;
    const int mwz = 0;
    const int mhx = 0;
    const int mhy = 0;
    const int mhz = 1;

    uint64 bits = 0 | (texture_id & 0b01111'1111) << 19 | 65536;
  // v0
    uint64 v0 = x | (y << 7) | (h << 14) | bits << 32 | cs0;
    // v1
    uint64 v1 = (x + mwx) | ((y + mwy) << 7) | ((h + mwz) << 14) | bits << 32 | cs1 | merge_bits_width;
    // v2
    uint64 v2 = (x + mwx + mhx) | ((y + mwy + mhy) << 7) | ((h + mwz + mhz) << 14) | bits << 32 | cs2  | merge_bits_width | merge_bits_height;
    // v0 
    uint64 v3 = (x + mhx) | ((y + mhy) << 7) | ((h + mhz) << 14) | bits << 32 | cs3  | merge_bits_height;

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

void encode_face_left(uint64*& out, uint64 h, uint64 x, uint64 y, uint64 data) {
    uint64 texture_id = data >> 8;
    uint64 shadows = data & 0b11111111;
    uint64 cs0 = (shadows << 59) & 0x1800000000000000;
    uint64 cs1 = (shadows << 57) & 0x1800000000000000;
    uint64 cs2 = (shadows << 55) & 0x1800000000000000;
    uint64 cs3 = (shadows << 53) & 0x1800000000000000;

    const int mwx = 0;
    const int mwy = -1;
    const int mwz = 0;
    const int mhx = 0;
    const int mhy = 0;
    const int mhz = 1;

    uint64 bits = 0 | (texture_id & 0b01111'1111) << 19 | 131072;
  // v0
    uint64 v0 = x | (y << 7) | (h << 14) | bits << 32 | cs0;
    // v1
    uint64 v1 = (x + mwx) | ((y + mwy) << 7) | ((h + mwz) << 14) | bits << 32 | cs1 | merge_bits_width;
    // v2
    uint64 v2 = (x + mwx + mhx) | ((y + mwy + mhy) << 7) | ((h + mwz + mhz) << 14) | bits << 32 | cs2  | merge_bits_width | merge_bits_height;
    // v0 
    uint64 v3 = (x + mhx) | ((y + mhy) << 7) | ((h + mhz) << 14) | bits << 32 | cs3  | merge_bits_height;

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

void encode_face_back(uint64*& out, uint64 h, uint64 x, uint64 y, uint64 data) {
    uint64 texture_id = data >> 8;
    uint64 shadows = data & 0b11111111;
    uint64 cs0 = (shadows << 59) & 0x1800000000000000;
    uint64 cs1 = (shadows << 57) & 0x1800000000000000;
    uint64 cs2 = (shadows << 55) & 0x1800000000000000;
    uint64 cs3 = (shadows << 53) & 0x1800000000000000;

    const int mwx = -1;
    const int mwy = 0;
    const int mwz = 0;
    const int mhx = 0;
    const int mhy = 0;
    const int mhz = 1;

    uint64 bits = 0 | (texture_id & 0b01111'1111) << 19 | 196608;
  // v0
    uint64 v0 = x | (y << 7) | (h << 14) | bits << 32 | cs0;
    // v1
    uint64 v1 = (x + mwx) | ((y + mwy) << 7) | ((h + mwz) << 14) | bits << 32 | cs1 | merge_bits_width;
    // v2
    uint64 v2 = (x + mwx + mhx) | ((y + mwy + mhy) << 7) | ((h + mwz + mhz) << 14) | bits << 32 | cs2  | merge_bits_width | merge_bits_height;
    // v0 
    uint64 v3 = (x + mhx) | ((y + mhy) << 7) | ((h + mhz) << 14) | bits << 32 | cs3  | merge_bits_height;

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

void encode_face_right(uint64*& out, uint64 h, uint64 x, uint64 y, uint64 data) {
    uint64 texture_id = data >> 8;
    uint64 shadows = data & 0b11111111;
    uint64 cs0 = (shadows << 59) & 0x1800000000000000;
    uint64 cs1 = (shadows << 57) & 0x1800000000000000;
    uint64 cs2 = (shadows << 55) & 0x1800000000000000;
    uint64 cs3 = (shadows << 53) & 0x1800000000000000;

    const int mwx = 0;
    const int mwy = 1;
    const int mwz = 0;
    const int mhx = 0;
    const int mhy = 0;
    const int mhz = 1;

    uint64 bits = 0 | (texture_id & 0b01111'1111) << 19 | 262144;
  // v0
    uint64 v0 = x | (y << 7) | (h << 14) | bits << 32 | cs0;
    // v1
    uint64 v1 = (x + mwx) | ((y + mwy) << 7) | ((h + mwz) << 14) | bits << 32 | cs1 | merge_bits_width;
    // v2
    uint64 v2 = (x + mwx + mhx) | ((y + mwy + mhy) << 7) | ((h + mwz + mhz) << 14) | bits << 32 | cs2  | merge_bits_width | merge_bits_height;
    // v0 
    uint64 v3 = (x + mhx) | ((y + mhy) << 7) | ((h + mhz) << 14) | bits << 32 | cs3  | merge_bits_height;

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

void encode_face_down(uint64*& out, uint64 h, uint64 x, uint64 y, uint64 data) {
    uint64 texture_id = data >> 8;
    uint64 shadows = data & 0b11111111;
    uint64 cs0 = (shadows << 59) & 0x1800000000000000;
    uint64 cs1 = (shadows << 57) & 0x1800000000000000;
    uint64 cs2 = (shadows << 55) & 0x1800000000000000;
    uint64 cs3 = (shadows << 53) & 0x1800000000000000;

    const int mwx = 1;
    const int mwy = 0;
    const int mwz = 0;
    const int mhx = 0;
    const int mhy = -1;
    const int mhz = 0;

    uint64 bits = 0 | (texture_id & 0b01111'1111) << 19 | 327680;
  // v0
    uint64 v0 = x | (y << 7) | (h << 14) | bits << 32 | cs0;
    // v1
    uint64 v1 = (x + mwx) | ((y + mwy) << 7) | ((h + mwz) << 14) | bits << 32 | cs1 | merge_bits_width;
    // v2
    uint64 v2 = (x + mwx + mhx) | ((y + mwy + mhy) << 7) | ((h + mwz + mhz) << 14) | bits << 32 | cs2  | merge_bits_width | merge_bits_height;
    // v0 
    uint64 v3 = (x + mhx) | ((y + mhy) << 7) | ((h + mhz) << 14) | bits << 32 | cs3  | merge_bits_height;

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

void encode_face_diagonal0(uint64*& out, uint64 h, uint64 x, uint64 y, uint64 data) {
    uint64 texture_id = data >> 8;
    uint64 shadows = data & 0b11111111;
    uint64 cs0 = (shadows << 59) & 0x1800000000000000;
    uint64 cs1 = (shadows << 57) & 0x1800000000000000;
    uint64 cs2 = (shadows << 55) & 0x1800000000000000;
    uint64 cs3 = (shadows << 53) & 0x1800000000000000;

    const int mwx = 1;
    const int mwy = 1;
    const int mwz = 0;
    const int mhx = 0;
    const int mhy = 0;
    const int mhz = 1;

    uint64 bits = 0 | (texture_id & 0b01111'1111) << 19 | 393216;
  // v0
    uint64 v0 = x | (y << 7) | (h << 14) | bits << 32 | cs0;
    // v1
    uint64 v1 = (x + mwx) | ((y + mwy) << 7) | ((h + mwz) << 14) | bits << 32 | cs1 | merge_bits_width;
    // v2
    uint64 v2 = (x + mwx + mhx) | ((y + mwy + mhy) << 7) | ((h + mwz + mhz) << 14) | bits << 32 | cs2  | merge_bits_width | merge_bits_height;
    // v0 
    uint64 v3 = (x + mhx) | ((y + mhy) << 7) | ((h + mhz) << 14) | bits << 32 | cs3  | merge_bits_height;

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

void encode_face_diagonal1(uint64*& out, uint64 h, uint64 x, uint64 y, uint64 data) {
    uint64 texture_id = data >> 8;
    uint64 shadows = data & 0b11111111;
    uint64 cs0 = (shadows << 59) & 0x1800000000000000;
    uint64 cs1 = (shadows << 57) & 0x1800000000000000;
    uint64 cs2 = (shadows << 55) & 0x1800000000000000;
    uint64 cs3 = (shadows << 53) & 0x1800000000000000;

    const int mwx = 1;
    const int mwy = -1;
    const int mwz = 0;
    const int mhx = 0;
    const int mhy = 0;
    const int mhz = 1;

    uint64 bits = 0 | (texture_id & 0b01111'1111) << 19 | 458752;
  // v0
    uint64 v0 = x | (y << 7) | (h << 14) | bits << 32 | cs0;
    // v1
    uint64 v1 = (x + mwx) | ((y + mwy) << 7) | ((h + mwz) << 14) | bits << 32 | cs1 | merge_bits_width;
    // v2
    uint64 v2 = (x + mwx + mhx) | ((y + mwy + mhy) << 7) | ((h + mwz + mhz) << 14) | bits << 32 | cs2  | merge_bits_width | merge_bits_height;
    // v0 
    uint64 v3 = (x + mhx) | ((y + mhy) << 7) | ((h + mhz) << 14) | bits << 32 | cs3  | merge_bits_height;

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
    uint dirMWV[8] = {0x1456, 0x2256, 0x2251, 0x2254, 0x2259, 0x1056, 0x225a, 0x2252};
    dir_xy side_dir0;
    dir_xy side_dir1;
    dir_xy corner_dir;
    // out_mesh_ptr = (uint64*)__builtin_assume_aligned(out_mesh_ptr, 16);
    // in_chunk_data_ptr = (uint*)__builtin_assume_aligned(in_chunk_data_ptr, 4);

    uint64* mesh_solid_ptr = out_mesh_ptr;
    uint64* mesh_water_ptr = out_mesh_ptr + MAX_OUTPUT_UINTS64;

    array_3d data(in_chunk_data_ptr, CHUNK_SIZE_E, CHUNK_SIZE_E, CHUNK_SIZE_E);

    for (uint h = 1; h < CHUNK_SIZE + 1; h++) {
        uint64 real_h = h - 1;
        for (uint y = 1; y < CHUNK_SIZE + 1; y++) {
            uint64 real_y = y - 1;
            for (uint x = 1; x < CHUNK_SIZE + 1; x++) {
                uint64 real_x = x - 1;
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
                    side_dir0.set(-1, 0);
                    side_dir1.set(0, -1);
                    corner_dir.set(-1, -1);
                    uint shadows = 0;
                    if (!is_water) {
                        for (uint v = 0; v < 4; v++) {
                            uint s0 = is_solid_int(data.get_hxy((h + 1), (x + side_dir0.x), (y + side_dir0.y)));
                            uint s1 = is_solid_int(data.get_hxy((h + 1), (x + side_dir1.x), (y + side_dir1.y)));
                            uint c = is_solid_int(data.get_hxy((h + 1), (x + corner_dir.x), (y + corner_dir.y)));
                            shadows |= ((s0 + s1 == 2) ? 3 : (s0 + s1 + c)) << (v * 2);
                            side_dir0.rotate_ccw();
                            side_dir1.rotate_ccw();
                            corner_dir.rotate_ccw();
                        }
                    }

                    encode_face_up(face_buffer,
                                   real_h + 1,
                                   real_x,
                                   real_y,
                                   (block_textures[0] << 8) | (shadows));
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
                        uint s0 = is_solid_int(data.get_hxy((h - 1), (x + side_dir0.x), (y - side_dir0.y)));
                        uint s1 = is_solid_int(data.get_hxy((h - 1), (x + side_dir1.x), (y - side_dir1.y)));
                        uint c = is_solid_int(data.get_hxy((h - 1), (x + corner_dir.x), (y - corner_dir.y)));
                        shadows |= ((s0 + s1 == 2) ? 3 : (s0 + s1 + c)) << (v * 2);
                        side_dir0.rotate_ccw();
                        side_dir1.rotate_ccw();
                        corner_dir.rotate_ccw();
                    }

                    encode_face_down(face_buffer,
                                     real_h,
                                     real_x,
                                     real_y + 1,
                                     (block_textures[5] << 8) | (shadows));
                }

                if (!is_solid(data.get_hxy(h, x, y - 1))) {
                    side_dir0.set(-1, 0);
                    side_dir1.set(0, -1);
                    corner_dir.set(-1, -1);
                    uint shadows = 0;
                    for (uint v = 0; v < 4; v++) {
                        uint s0 = is_solid_int(data.get_hxy((h + side_dir0.y), (x + side_dir0.x), (y - 1)));
                        uint s1 = is_solid_int(data.get_hxy((h + side_dir1.y), (x + side_dir1.x), (y - 1)));
                        uint c = is_solid_int(data.get_hxy((h + corner_dir.y), (x + corner_dir.x), (y - 1)));
                        shadows |= ((s0 + s1 == 2) ? 3 : (s0 + s1 + c)) << (v * 2);
                        side_dir0.rotate_ccw();
                        side_dir1.rotate_ccw();
                        corner_dir.rotate_ccw();
                    }
                    encode_face_front(face_buffer,
                                      real_h,
                                      real_x,
                                      real_y,
                                      (block_textures[1] << 8) | shadows);
                }

                if (!is_solid(data.get_hxy(h, x - 1, y))) {
                    side_dir0.set(-1, 0);
                    side_dir1.set(0, -1);
                    corner_dir.set(-1, -1);
                    uint shadows = 0;
                    for (uint v = 0; v < 4; v++) {
                        uint s0 = is_solid_int(data.get_hxy((h + side_dir0.y), (x - 1), (y - side_dir0.x)));
                        uint s1 = is_solid_int(data.get_hxy((h + side_dir1.y), (x - 1), (y - side_dir1.x)));
                        uint c = is_solid_int(data.get_hxy((h + corner_dir.y), (x - 1), (y - corner_dir.x)));
                        shadows |= ((s0 + s1 == 2) ? 3 : (s0 + s1 + c)) << (v * 2);
                        side_dir0.rotate_ccw();
                        side_dir1.rotate_ccw();
                        corner_dir.rotate_ccw();
                    }
                    encode_face_left(face_buffer,
                                     real_h,
                                     real_x,
                                     real_y + 1,
                                     (block_textures[2] << 8) | shadows);
                }

                if (!is_solid(data.get_hxy(h, x, y + 1))) {
                    side_dir0.set(-1, 0);
                    side_dir1.set(0, -1);
                    corner_dir.set(-1, -1);
                    uint shadows = 0;
                    for (uint v = 0; v < 4; v++) {
                        uint s0 = is_solid_int(data.get_hxy((h + side_dir0.y), (x - side_dir0.x), (y + 1)));
                        uint s1 = is_solid_int(data.get_hxy((h + side_dir1.y), (x - side_dir1.x), (y + 1)));
                        uint c = is_solid_int(data.get_hxy((h + corner_dir.y), (x - corner_dir.x), (y + 1)));
                        shadows |= ((s0 + s1 == 2) ? 3 : (s0 + s1 + c)) << (v * 2);
                        side_dir0.rotate_ccw();
                        side_dir1.rotate_ccw();
                        corner_dir.rotate_ccw();
                    }
                    encode_face_back(face_buffer,
                                     real_h,
                                     real_x + 1,
                                     real_y + 1,
                                     (block_textures[3] << 8) | shadows);
                }

                if (!is_solid(data.get_hxy(h, x + 1, y))) {
                    side_dir0.set(-1, 0);
                    side_dir1.set(0, -1);
                    corner_dir.set(-1, -1);
                    uint shadows = 0;
                    for (uint v = 0; v < 4; v++) {
                        uint s0 = is_solid_int(data.get_hxy((h + side_dir0.y), (x + 1), (y + side_dir0.x)));
                        uint s1 = is_solid_int(data.get_hxy((h + side_dir1.y), (x + 1), (y + side_dir1.x)));
                        uint c = is_solid_int(data.get_hxy((h + corner_dir.y), (x + 1), (y + corner_dir.x)));
                        shadows |= ((s0 + s1 == 2) ? 3 : (s0 + s1 + c)) << (v * 2);
                        side_dir0.rotate_ccw();
                        side_dir1.rotate_ccw();
                        corner_dir.rotate_ccw();
                    }
                    encode_face_right(face_buffer,
                                      real_h,
                                      real_x + 1,
                                      real_y,
                                      (block_textures[4] << 8) | shadows);
                }
            }
        }
    }

    return complete(out_mesh_ptr, out_mesh_ptr + MAX_OUTPUT_UINTS64, mesh_solid_ptr, mesh_water_ptr);
}
