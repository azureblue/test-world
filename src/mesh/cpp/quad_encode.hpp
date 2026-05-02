#pragma once
#include "common.hpp"

namespace quad_encoding {
constexpr int VERTEX_OFFSETS[8][3] = {{0, 0, 1}, {0, 0, 0}, {0, 1, 0}, {1, 1, 0}, {1, 0, 0}, {0, 1, 0}, {0, 0, 0}, {0, 1, 0}};
constexpr int MERGE_VECTOR_W[8][3] = {{1, 0, 0}, {1, 0, 0}, {0, -1, 0}, {-1, 0, 0}, {0, 1, 0}, {1, 0, 0}, {1, 1, 0}, {1, -1, 0}};
constexpr int MERGE_VECTOR_H[8][3] = {{0, 1, 0}, {0, 0, 1}, {0, 0, 1}, {0, 0, 1}, {0, 0, 1}, {0, -1, 0}, {0, 0, 1}, {0, 0, 1}};
constexpr uint WINDING[4][6] = {{0, 1, 2, 0, 2, 3}, {3, 2, 0, 2, 1, 0}, {1, 2, 3, 1, 3, 0}, {0, 3, 1, 3, 2, 1}};

}  // namespace quad_encoding

namespace {
template <typename T, int shift, typename V>
constexpr static T encode_value(V value) {
    return static_cast<T>(value) << shift;
}
}  // namespace

class quad_encoder {
   public:
    template <Direction DIR>
    inline_always static inline void encode_face(uint64* __restrict& out, uint vx_x, uint vx_y, uint vx_z, uint w, uint h, uint tex, uint ao_shadows) {
        uint64 v0, v1, v2, v3;

        bool reverse_winding = encode_quad<DIR>(v0, v1, v2, v3, vx_x, vx_y, vx_z, w, h, tex, ao_shadows);
        encode(out, v0, v1, v2, v3, reverse_winding);
    }

    template <Direction DIR>
    inline_always static inline void encode_face(uint64* __restrict& out, uint vx_x, uint vx_y, uint vx_z, uint w, uint h, uint tex) {
        uint64 v0, v1, v2, v3;

        bool reverse_winding = encode_quad<DIR>(v0, v1, v2, v3, vx_x, vx_y, vx_z, w, h, tex);
        encode(out, v0, v1, v2, v3, reverse_winding);
    }

    template <Direction DIR>
    inline_always static inline void encode_face_q(uint64* __restrict& out, uint64 pos_bits, uint tex, uint shadows) {
        uint64 v0, v1, v2, v3;
        bool reverse_winding = quad_encoder::encode_quad_form_vx_pos_bits<DIR>(v0, v1, v2, v3, pos_bits, tex, shadows);
        encode(out, v0, v1, v2, v3, reverse_winding);
    }

    template <Direction DIR>
    inline_always static inline bool encode_quad(uint64& v0, uint64& v1, uint64& v2, uint64& v3, uint vx_x, uint vx_y, uint vx_z, uint w, uint h, uint tex_id, uint ao_shadow) {
        uint ao0 = (ao_shadow >> 0) & 0b11;
        uint ao1 = (ao_shadow >> 2) & 0b11;
        uint ao2 = (ao_shadow >> 4) & 0b11;
        uint ao3 = (ao_shadow >> 6) & 0b11;

        uint64 base_bits = encode_base_bits<DIR>(vx_x, vx_y, vx_z, tex_id);

        v0 = base_bits | encode_ao_bits(ao0);
        v1 = base_bits + POS_OFFSET_W<DIR> * w | MERGE_BIT_W * w | encode_ao_bits(ao1);
        v2 = base_bits + POS_OFFSET_W<DIR> * w + POS_OFFSET_H<DIR> * h | MERGE_BIT_W * w | MERGE_BIT_H * h | encode_ao_bits(ao2);
        v3 = base_bits + POS_OFFSET_H<DIR> * h | MERGE_BIT_H * h | encode_ao_bits(ao3);

        return (ao0 + ao2) > (ao1 + ao3);
    }

    template <Direction DIR>
    inline_always static inline bool encode_quad_form_vx_pos_bits(uint64& v0, uint64& v1, uint64& v2, uint64& v3, uint64 pos_bits, uint tex_id, uint ao_shadow) {
        uint ao0 = (ao_shadow >> 0) & 0b11;
        uint ao1 = (ao_shadow >> 2) & 0b11;
        uint ao2 = (ao_shadow >> 4) & 0b11;
        uint ao3 = (ao_shadow >> 6) & 0b11;

        uint64 base_bits = (pos_bits + pos_offset_bits<DIR>) | encode_tex_bits(tex_id) | encode_dir_bits(DIR);

        v0 = base_bits | encode_ao_bits(ao0);
        v1 = base_bits + POS_OFFSET_W<DIR> | MERGE_BIT_W | encode_ao_bits(ao1);
        v2 = base_bits + POS_OFFSET_W<DIR> + POS_OFFSET_H<DIR> | MERGE_BIT_W | MERGE_BIT_H | encode_ao_bits(ao2);
        v3 = base_bits + POS_OFFSET_H<DIR> | MERGE_BIT_H | encode_ao_bits(ao3);

        return (ao0 + ao2) > (ao1 + ao3);
    }

    static inline uint64 encode_pos_bits(uint x, uint y, uint z) {
        return encode_value<uint64, 0>(x) | encode_value<uint64, 7>(y) | encode_value<uint64, 14>(z);
    }

    template <Direction DIR>
    inline_always static inline uint64 encode_base_bits(uint vx_x, uint vx_y, uint vx_z, uint tex_id) {
        // int x = vx_x + quad_encoding::VERTEX_OFFSETS[DIR][X];
        // int y = vx_y + quad_encoding::VERTEX_OFFSETS[DIR][Y];
        // int z = vx_z + quad_encoding::VERTEX_OFFSETS[DIR][Z];

        return encode_pos_bits(vx_x, vx_y, vx_z) + pos_offset_bits<DIR> | encode_tex_bits(tex_id) | encode_dir_bits(DIR);
    }

    template <Direction DIR>
    constexpr static inline uint64 pos_offset_bits =
        encode_value<uint64, 0>(quad_encoding::VERTEX_OFFSETS[DIR][X]) | encode_value<uint64, 7>(quad_encoding::VERTEX_OFFSETS[DIR][Y]) | encode_value<uint64, 14>(quad_encoding::VERTEX_OFFSETS[DIR][Z]);

   private:
    constexpr static uint64 MERGE_BIT_W = 1ull << 32;
    constexpr static uint64 MERGE_BIT_H = 1ull << 39;

    template <Direction DIR>
    inline constexpr static uint64 POS_OFFSET_W = encode_value<uint64, 0>(quad_encoding::MERGE_VECTOR_W[DIR][0]) + encode_value<uint64, 7>(quad_encoding::MERGE_VECTOR_W[DIR][1]) + encode_value<uint64, 14>(quad_encoding::MERGE_VECTOR_W[DIR][2]);

    template <Direction DIR>
    inline constexpr static uint64 POS_OFFSET_H = encode_value<uint64, 0>(quad_encoding::MERGE_VECTOR_H[DIR][0]) + encode_value<uint64, 7>(quad_encoding::MERGE_VECTOR_H[DIR][1]) + encode_value<uint64, 14>(quad_encoding::MERGE_VECTOR_H[DIR][2]);

    static inline uint64 encode_ao_bits(uint ao) {
        return encode_value<uint64, 59>(ao);
    }

    static inline uint64 encode_tex_bits(uint tex_id) {
        return encode_value<uint64, 51>(tex_id);
    }

    static inline uint64 encode_dir_bits(Direction dir) {
        return encode_value<uint64, 48>(dir);
    }

    inline_always static inline void encode(uint64* __restrict& out, uint64& v0, uint64& v1, uint64& v2, uint64& v3, bool reverse_winding) {
        if (reverse_winding) {
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
};

class water_encoder {
   public:
    template <Direction DIR>
    inline_always static inline void encode_face(uint64* __restrict& out, uint vx_x, uint vx_y, uint vx_z, uint w, uint h, uint tex) {
        uint64 v0, v1, v2, v3;
        encode_water_quad<DIR>(v0, v1, v2, v3, vx_x, vx_y, vx_z, w, h, 7, tex);
        out[0] = v0;
        out[1] = v1;
        out[2] = v2;
        out[3] = v0;
        out[4] = v2;
        out[5] = v3;
        out += 6;
    }

    template <Direction DIR>
    inline_always static inline void encode_water_quad(uint64& v0, uint64& v1, uint64& v2, uint64& v3, uint vx_x, uint vx_y, uint vx_z, uint w, uint h, uint level, uint tex_id) {
        uint64 base_bits = encode_base_bits<DIR>(vx_x, vx_y, vx_z, level, tex_id);
        // TODO: handle merge bits for non top faces
        v0 = base_bits;
        v1 = base_bits + pos_offset_w<DIR>(level) * w | MERGE_BIT_W * w;
        v2 = base_bits + pos_offset_w<DIR>(level) * w + pos_offset_h<DIR>(level) * h | MERGE_BIT_W * w | MERGE_BIT_H * h;
        v3 = base_bits + pos_offset_h<DIR>(level) * h | MERGE_BIT_H * h;
    }

   private:
    template <Direction DIR>
    inline_always static inline uint64 encode_base_bits(uint vx_x, uint vx_y, uint vx_z, uint level, uint tex_id) {
        int x = vx_x + quad_encoding::VERTEX_OFFSETS[DIR][X];
        int y = vx_y + quad_encoding::VERTEX_OFFSETS[DIR][Y];
        int z = vx_z * 8 + quad_encoding::VERTEX_OFFSETS[DIR][Z] * level;
        return encode_pos_bits(x, y, z) | encode_tex_bits(tex_id);
    }

    static inline uint64 encode_pos_bits(uint x, uint y, uint z) {
        return encode_value<uint64, 0>(x) | encode_value<uint64, 7>(y) | encode_value<uint64, 14>(z);
    }

    static inline uint64 encode_tex_bits(uint tex_id) {
        return encode_value<uint64, 57>(6);
    }

    static inline uint64 encode_dir_bits(Direction dir) {
        return encode_value<uint64, 61>(dir);
    }

    constexpr static uint64 MERGE_BIT_W = 8ull << 32;
    constexpr static uint64 MERGE_BIT_H = 8ull << 41;

    template <Direction DIR>
    inline_always constexpr static inline uint64 pos_offset_w(uint level) {
        return encode_value<uint64, 0>(quad_encoding::MERGE_VECTOR_W[DIR][0]) + encode_value<uint64, 7>(quad_encoding::MERGE_VECTOR_W[DIR][1]) + encode_value<uint64, 14>(quad_encoding::MERGE_VECTOR_W[DIR][Z] * level);
    }

    template <Direction DIR>
    inline_always constexpr static inline uint64 pos_offset_h(uint level) {
        return encode_value<uint64, 0>(quad_encoding::MERGE_VECTOR_H[DIR][0]) + encode_value<uint64, 7>(quad_encoding::MERGE_VECTOR_H[DIR][1]) + encode_value<uint64, 14>(quad_encoding::MERGE_VECTOR_H[DIR][Z] * level);
    }
};

class x_quads_encoder {
   public:
    template <Direction DIR>
    inline_always static inline void encode_x_quad(uint& v0, uint& v1, uint& v2, uint& v3, uint vx_x, uint vx_y, uint vx_z, uint tex_id) {
        uint base_bits = encode_base_bits<DIR>(vx_x, vx_y, vx_z, tex_id);

        v1 = base_bits + POS_OFFSET_W<DIR> | MERGE_BIT_W;
        v2 = base_bits + POS_OFFSET_W<DIR> + POS_OFFSET_H<DIR> | MERGE_BIT_W | MERGE_BIT_H;
        v3 = base_bits + POS_OFFSET_H<DIR> | MERGE_BIT_H;
    }

   private:
    constexpr static uint MERGE_BIT_W = 1u << 21;
    constexpr static uint MERGE_BIT_H = 1u << 22;

    template <Direction DIR>
    inline constexpr static uint POS_OFFSET_W = encode_value<uint, 0>(quad_encoding::MERGE_VECTOR_W[DIR][0]) + encode_value<uint, 7>(quad_encoding::MERGE_VECTOR_W[DIR][1]) + encode_value<uint, 14>(quad_encoding::MERGE_VECTOR_W[DIR][2]);

    template <Direction DIR>
    inline constexpr static uint POS_OFFSET_H = encode_value<uint, 0>(quad_encoding::MERGE_VECTOR_H[DIR][0]) + encode_value<uint, 7>(quad_encoding::MERGE_VECTOR_H[DIR][1]) + encode_value<uint, 14>(quad_encoding::MERGE_VECTOR_H[DIR][2]);

    static inline uint encode_pos_bits(uint x, uint y, uint z) {
        return encode_value<uint, 0>(x) | encode_value<uint, 7>(y) | encode_value<uint, 14>(z);
    }

    static inline uint encode_tex_bits(uint tex_id) {
        return encode_value<uint, 23>(tex_id);
    }

    template <Direction DIR>
    inline_always static inline uint encode_base_bits(uint vx_x, uint vx_y, uint vx_z, uint tex_id) {
        int x = vx_x + quad_encoding::VERTEX_OFFSETS[DIR][X];
        int y = vx_y + quad_encoding::VERTEX_OFFSETS[DIR][Y];
        int z = vx_z + quad_encoding::VERTEX_OFFSETS[DIR][Z];

        return encode_pos_bits(x, y, z) | encode_tex_bits(tex_id);
    }
};

constexpr uint64 POS_BITS_PLUS_1X = 1;
constexpr uint64 POS_BITS_PLUS_1Y = (1 << 7);
constexpr uint64 POS_BITS_PLUS_1Z = (1 << 14);

constexpr uint64 MERGE_BITS_WIDTH = 1ull << 32;
constexpr uint64 MERGE_BITS_HEIGHT = 1ull << 39;
constexpr uint64 MERGE_BITS_WIDTH_HEIGHT = MERGE_BITS_WIDTH | MERGE_BITS_HEIGHT;

consteval uint64 merge_vector_w_bits(Direction dir) {
    return (static_cast<uint64>(quad_encoding::MERGE_VECTOR_W[dir][0]) << 0) + (static_cast<uint64>(quad_encoding::MERGE_VECTOR_W[dir][1]) << 7) + (static_cast<uint64>(quad_encoding::MERGE_VECTOR_W[dir][2]) << 14);
};

consteval uint64 merge_vector_h_bits(Direction dir) {
    return (static_cast<uint64>(quad_encoding::MERGE_VECTOR_H[dir][0]) << 0) + (static_cast<uint64>(quad_encoding::MERGE_VECTOR_H[dir][1]) << 7) + (static_cast<uint64>(quad_encoding::MERGE_VECTOR_H[dir][2]) << 14);
};

consteval uint64 merge_vector_wh_bits(Direction dir) {
    return merge_vector_w_bits(dir) + merge_vector_h_bits(dir);
};

consteval uint64 vertex_offset_bits(Direction dir) {
    return (static_cast<uint64>(quad_encoding::VERTEX_OFFSETS[dir][0]) << 0) + (static_cast<uint64>(quad_encoding::VERTEX_OFFSETS[dir][1]) << 7) + (static_cast<uint64>(quad_encoding::VERTEX_OFFSETS[dir][2]) << 14);
};
