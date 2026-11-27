#pragma once
#include "common.hpp"


template <typename T, int shift, typename V>
inline_always constexpr static T encode_value(V value) {
    return static_cast<T>(value) << shift;
}

class quad_encoder {
   public:
    // a vertex's position: x, y, z in 6 bits each (0..32), from bit 0; half a block more per axis in bits 61..63 (the
    // faces of shaped blocks)
    constexpr static uint POS_Y_SHIFT = 6;
    constexpr static uint POS_Z_SHIFT = 12;
    constexpr static uint POS_HALF_SHIFT = 61;

    // a merged face (the main mesher): ao_shadows 2 bits per vertex, light 12 bits per vertex (encode_layer_light_bits)
    template <Direction DIR>
    inline_always static void encode_face(uint64* __restrict& out, uint vx_x, uint vx_y, uint vx_z, uint w, uint h, uint tex, uint ao_shadows, uint64 light) {
        uint64 v0, v1, v2, v3;

        bool reverse_winding = encode_quad<DIR>(v0, v1, v2, v3, vx_x, vx_y, vx_z, w, h, tex, ao_shadows, light);
        encode(out, v0, v1, v2, v3, reverse_winding);
    }

    template <Direction DIR>
    inline_always static void encode_face(uint64* __restrict& out, uint vx_x, uint vx_y, uint vx_z, uint w, uint h, uint tex) {
        uint64 v0, v1, v2, v3;

        bool reverse_winding = encode_quad<DIR>(v0, v1, v2, v3, vx_x, vx_y, vx_z, w, h, tex);
        encode(out, v0, v1, v2, v3, reverse_winding);
    }

    template <Direction DIR>
    inline_always static bool encode_quad(uint64& v0, uint64& v1, uint64& v2, uint64& v3, uint vx_x, uint vx_y, uint vx_z, uint w, uint h, uint tex_id, uint ao_shadow, uint64 light) {
        uint ao0 = (ao_shadow >> 0) & 0b11;
        uint ao1 = (ao_shadow >> 2) & 0b11;
        uint ao2 = (ao_shadow >> 4) & 0b11;
        uint ao3 = (ao_shadow >> 6) & 0b11;

        uint64 base_bits = encode_base_bits<DIR>(vx_x, vx_y, vx_z, tex_id);

        v0 = base_bits | encode_ao_bits(ao0) | encode_layer_light_bits(light);
        v1 = base_bits + POS_OFFSET_W<DIR> * w | MERGE_BIT_W * w | encode_ao_bits(ao1) | encode_layer_light_bits(light >> 12);
        v2 = base_bits + POS_OFFSET_W<DIR> * w + POS_OFFSET_H<DIR> * h | MERGE_BIT_W * w | MERGE_BIT_H * h | encode_ao_bits(ao2) | encode_layer_light_bits(light >> 24);
        v3 = base_bits + POS_OFFSET_H<DIR> * h | MERGE_BIT_H * h | encode_ao_bits(ao3) | encode_layer_light_bits(light >> 36);

        return (ao0 + ao2) > (ao1 + ao3);
    }

    inline_always static uint64 encode_pos_bits(uint x, uint y, uint z) {
        return encode_value<uint64, 0>(x) | encode_value<uint64, POS_Y_SHIFT>(y) | encode_value<uint64, POS_Z_SHIFT>(z);
    }

    // A face of a shaped block's box (shaped.hpp), in half blocks: the box's corner and size (pos, size: x, y, z), the
    // texture coordinates of the face's first corner (u, v), its vertices' AO and light (shade_vertex).
    static void encode_shaped_face(uint64* __restrict& out, Direction dir, const uint pos[3], const uint size[3], uint u, uint v, uint tex_id, const uint ao[4], const uint light[4]) {
        using namespace quad_encoding;
        uint corner[3], w[3], h[3];
        uint w_len = 0, h_len = 0;
        for (uint a = 0; a < 3; a++) {
            corner[a] = pos[a] + VERTEX_OFFSETS[dir][a] * size[a];
            w[a] = MERGE_VECTOR_W[dir][a] * static_cast<int>(size[a]);
            h[a] = MERGE_VECTOR_H[dir][a] * static_cast<int>(size[a]);
            w_len += size[a] * (MERGE_VECTOR_W[dir][a] != 0);
            h_len += size[a] * (MERGE_VECTOR_H[dir][a] != 0);
        }
        const uint64 base_bits = encode_tex_bits(tex_id) | encode_dir_bits(dir);
        const auto vertex = [&](uint dw, uint dh) {
            const uint k = dh ? 3 - dw : dw;
            uint64 bits = base_bits | encode_ao_bits(ao[k]) | encode_light_bits(light[k]) |
                          (static_cast<uint64>(u + dw * w_len) << 32) | (static_cast<uint64>(v + dh * h_len) << 39);
            for (uint a = 0; a < 3; a++) {
                const uint p = corner[a] + dw * w[a] + dh * h[a];
                bits |= static_cast<uint64>(p >> 1) << (a * POS_Y_SHIFT) | static_cast<uint64>(p & 1) << (POS_HALF_SHIFT + a);
            }
            return bits;
        };
        encode(out, vertex(0, 0), vertex(1, 0), vertex(1, 1), vertex(0, 1), ao[0] + ao[2] > ao[1] + ao[3]);
    }

    template <Direction DIR>
    inline_always static uint64 encode_base_bits(uint vx_x, uint vx_y, uint vx_z, uint tex_id) {
        return encode_pos_bits(vx_x, vx_y, vx_z) + pos_offset_bits<DIR> | encode_tex_bits(tex_id) | encode_dir_bits(DIR);
    }

    template <Direction DIR>
    constexpr static uint64 pos_offset_bits =
        encode_value<uint64, 0>(quad_encoding::VERTEX_OFFSETS[DIR][X]) | encode_value<uint64, POS_Y_SHIFT>(quad_encoding::VERTEX_OFFSETS[DIR][Y]) | encode_value<uint64, POS_Z_SHIFT>(quad_encoding::VERTEX_OFFSETS[DIR][Z]);

    template <Direction DIR>
    inline_always static void encode_face_q(uint64* __restrict& out, const array_3d<CHUNK_SIZE_E>& data, uint e_x, uint e_y, uint e_z, uint tex) {
        uint64 pos_bits = quad_encoder::encode_pos_bits(e_x - 1, e_y - 1, e_z - 1);
        const ao_shadows::vertex_data& aos = face_ao<DIR>(data, e_z, e_x, e_y);

        uint64 base_bits = (pos_bits + pos_offset_bits<DIR>) | encode_tex_bits(tex) | encode_dir_bits(DIR);

        uint64 v0 = base_bits | encode_ao_bits(aos.v0) | encode_light_bits(aos.l0);
        uint64 v1 = base_bits + POS_OFFSET_W<DIR> | MERGE_BIT_W | encode_ao_bits(aos.v1) | encode_light_bits(aos.l1);
        uint64 v2 = base_bits + POS_OFFSET_W<DIR> + POS_OFFSET_H<DIR> | MERGE_BIT_W | MERGE_BIT_H | encode_ao_bits(aos.v2) | encode_light_bits(aos.l2);
        uint64 v3 = base_bits + POS_OFFSET_H<DIR> | MERGE_BIT_H | encode_ao_bits(aos.v3) | encode_light_bits(aos.l3);

        bool reverse_winding = (aos.v0 + aos.v2) > (aos.v1 + aos.v3);
        encode(out, v0, v1, v2, v3, reverse_winding);
    }

   private:
    // texture coordinates are in half blocks (a shaped block's faces), 7 bits each from bit 32 and 39
    constexpr static uint64 MERGE_BIT_W = 2ull << 32;
    constexpr static uint64 MERGE_BIT_H = 2ull << 39;

    template <Direction DIR>
    inline constexpr static uint64 POS_OFFSET_W = encode_value<uint64, 0>(quad_encoding::MERGE_VECTOR_W[DIR][0]) + encode_value<uint64, POS_Y_SHIFT>(quad_encoding::MERGE_VECTOR_W[DIR][1]) + encode_value<uint64, POS_Z_SHIFT>(quad_encoding::MERGE_VECTOR_W[DIR][2]);

    template <Direction DIR>
    inline constexpr static uint64 POS_OFFSET_H = encode_value<uint64, 0>(quad_encoding::MERGE_VECTOR_H[DIR][0]) + encode_value<uint64, POS_Y_SHIFT>(quad_encoding::MERGE_VECTOR_H[DIR][1]) + encode_value<uint64, POS_Z_SHIFT>(quad_encoding::MERGE_VECTOR_H[DIR][2]);

    inline_always static uint64 encode_ao_bits(uint ao) {
        return encode_value<uint64, 59>(ao);
    }

    inline_always static uint64 encode_tex_bits(uint tex_id) {
        return encode_value<uint64, 51>(tex_id);
    }

    // a vertex's light (corner_light in common.hpp: the sums of 4 cells, the sky darkness in bits 10..15, the block
    // light in 17..22) to bits 18..23 and 24..29; without it (the main mesher) 0: full sky light
    inline_always static uint64 encode_light_bits(uint light) {
        return static_cast<uint64>((light & SKY_DARKNESS_SUM_BITS) << (18 - SKY_DARKNESS_SHIFT) |
                                   (light & BLOCK_LIGHT_SUM_BITS) << (24 - BLOCK_LIGHT_SHIFT));
    }

    // a vertex's light from the main mesher's layers (the low 12 bits: corner_light's sums, the sky darkness in bits
    // 0..5, the block light in 6..11) to the same vertex bits as encode_light_bits
    inline_always static uint64 encode_layer_light_bits(uint64 light) {
        return (light & 0x3f) << 18 | (light >> 6 & 0x3f) << 24;
    }

    inline_always static uint64 encode_dir_bits(Direction dir) {
        return encode_value<uint64, 48>(dir);
    }

    inline_always static void encode(uint64* __restrict& out, uint64 v0, uint64 v1, uint64 v2, uint64 v3, bool reverse_winding) {
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
    // level: water height in the cell in 1/8 of a block, where the top face is; bottom: where side faces start
    // (above 0 next to lower water); a side face spans (level - bottom) * h, so merged side faces must share both
    // (the mesher keeps them in the face data, faces that differ don't merge)
    template <Direction DIR>
    inline_always static void encode_face(uint64* __restrict& out, uint vx_x, uint vx_y, uint vx_z, uint w, uint h, uint level, uint bottom, uint tex) {
        uint64 v0, v1, v2, v3;
        encode_water_quad<DIR>(v0, v1, v2, v3, vx_x, vx_y, vx_z, w, h, level, bottom, tex);
        out[0] = v0;
        out[1] = v1;
        out[2] = v2;
        out[3] = v0;
        out[4] = v2;
        out[5] = v3;
        out += 6;
    }

    template <Direction DIR>
    inline_always static void encode_face_q(uint64* __restrict& out, uint vx_x, uint vx_y, uint vx_z, uint level, uint bottom, uint tex) {
        encode_face<DIR>(out, vx_x, vx_y, vx_z, 1, 1, level, bottom, tex);
    }

    template <Direction DIR>
    inline_always static void encode_water_quad(uint64& v0, uint64& v1, uint64& v2, uint64& v3, uint vx_x, uint vx_y, uint vx_z, uint w, uint h, uint level, uint bottom, uint tex_id) {
        uint64 base_bits = encode_base_bits<DIR>(vx_x, vx_y, vx_z, level, bottom, tex_id);
        // texture coordinates follow the face size, a side face is (level - bottom)/8 of a block high
        uint span = level - bottom;
        uint64 merge_w = MERGE_BIT_W * 8 * w;
        uint64 merge_h = MERGE_BIT_H * (quad_encoding::MERGE_VECTOR_H[DIR][Z] != 0 ? span : 8) * h;
        v0 = base_bits;
        v1 = base_bits + pos_offset_w<DIR>(span) * w | merge_w;
        v2 = base_bits + pos_offset_w<DIR>(span) * w + pos_offset_h<DIR>(span) * h | merge_w | merge_h;
        v3 = base_bits + pos_offset_h<DIR>(span) * h | merge_h;
    }

   private:
    template <Direction DIR>
    inline_always static uint64 encode_base_bits(uint vx_x, uint vx_y, uint vx_z, uint level, uint bottom, uint tex_id) {
        int x = vx_x + quad_encoding::VERTEX_OFFSETS[DIR][X];
        int y = vx_y + quad_encoding::VERTEX_OFFSETS[DIR][Y];
        // the top face at the level, side faces from their bottom (0 for the bottom face)
        int z = vx_z * 8 + (quad_encoding::VERTEX_OFFSETS[DIR][Z] != 0 ? level : bottom);
        return encode_pos_bits(x, y, z) | encode_tex_bits(tex_id);
    }

    inline_always static uint64 encode_pos_bits(uint x, uint y, uint z) {
        return encode_value<uint64, 0>(x) | encode_value<uint64, 7>(y) | encode_value<uint64, 14>(z);
    }

    inline_always static uint64 encode_tex_bits(uint tex_id) {
        return encode_value<uint64, 57>(tex_id);
    }

    inline_always static uint64 encode_dir_bits(Direction dir) {
        return encode_value<uint64, 61>(dir);
    }

    // texture coordinates are in 1/8 of a block
    constexpr static uint64 MERGE_BIT_W = 1ull << 32;
    constexpr static uint64 MERGE_BIT_H = 1ull << 41;

    template <Direction DIR>
    inline_always constexpr static uint64 pos_offset_w(uint level) {
        return encode_value<uint64, 0>(quad_encoding::MERGE_VECTOR_W[DIR][0]) + encode_value<uint64, 7>(quad_encoding::MERGE_VECTOR_W[DIR][1]) + encode_value<uint64, 14>(quad_encoding::MERGE_VECTOR_W[DIR][Z] * level);
    }

    template <Direction DIR>
    inline_always constexpr static uint64 pos_offset_h(uint level) {
        return encode_value<uint64, 0>(quad_encoding::MERGE_VECTOR_H[DIR][0]) + encode_value<uint64, 7>(quad_encoding::MERGE_VECTOR_H[DIR][1]) + encode_value<uint64, 14>(quad_encoding::MERGE_VECTOR_H[DIR][Z] * level);
    }
};

class x_quads_encoder {
   public:
    // a vertex is 2 uint32: the position and texture, then the light of the plant's cell (its block value's
    // LIGHT_BITS, the same for the 4 vertices)
    template <Direction DIR>
    inline_always static void encode_quad(uint64* __restrict& out, uint x, uint y, uint z, uint tex, uint block_data) {
        uint v0, v1, v2, v3;
        encode_x_quad<DIR>(v0, v1, v2, v3, x, y, z, tex);
        const uint64 light = static_cast<uint64>(block_data & LIGHT_BITS) << 32;

        out[0] = v0 | light;
        out[1] = v1 | light;
        out[2] = v2 | light;
        out[3] = v0 | light;
        out[4] = v2 | light;
        out[5] = v3 | light;
        out += 6;
    }

    template <Direction DIR>
    inline_always static void encode_x_quad(uint& v0, uint& v1, uint& v2, uint& v3, uint vx_x, uint vx_y, uint vx_z, uint tex_id) {
        uint base_bits = encode_base_bits<DIR>(vx_x, vx_y, vx_z, tex_id);
        v0 = base_bits;
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

    inline_always static uint encode_pos_bits(uint x, uint y, uint z) {
        return encode_value<uint, 0>(x) | encode_value<uint, 7>(y) | encode_value<uint, 14>(z);
    }

    inline_always static uint encode_tex_bits(uint tex_id) {
        return encode_value<uint, 23>(tex_id);
    }

    template <Direction DIR>
    inline_always static uint encode_base_bits(uint vx_x, uint vx_y, uint vx_z, uint tex_id) {
        int x = vx_x + quad_encoding::VERTEX_OFFSETS[DIR][X];
        int y = vx_y + quad_encoding::VERTEX_OFFSETS[DIR][Y];
        int z = vx_z + quad_encoding::VERTEX_OFFSETS[DIR][Z];

        return encode_pos_bits(x, y, z) | encode_tex_bits(tex_id);
    }
};
