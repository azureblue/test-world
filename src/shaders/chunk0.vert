#version 300 es
#define VIEW_DISTANCE_SQ 409600.0 /* @viewDistanceSq */
#define EDGE_SHADOW_DISTANCE_SQ 800.0 /* @edgeShadowDistanceSq */
#define b_0000_0001 1u
#define b_0000_0011 3u
#define b_0000_0111 7u
#define b_0000_1111 15u
#define b_0001_1111 31u
#define b_1111_1111 255u
#define b_11_1111_1111 1023u

// consider calculating uvs in js
// loshttttTTTTnnnzzzzzzzzyyyyxxxx
//                        yyyyxxxx
//01234567890123456789012345678901
layout (location = 0) in uvec2 a_in;
layout (std140) uniform Camera {
    mat4 cam_proj;
    mat4 cam_view;
    vec3 cam_pos;
};
const float pixh = 1.0f / 16.0f;

const float merge_vectors[] = float[](
/* 0 */ +1.0f, +0.0f, +0.0f, -1.0f,
/* 1 */ +1.0f, +0.0f, +1.0f, +0.0f,
/* 2 */ +0.0f, +1.0f, +1.0f, +0.0f,
/* 3 */ -1.0f, +0.0f, +1.0f, +0.0f,
/* 4 */ +0.0f, -1.0f, +1.0f, +0.0f,
/* 5 */ +1.0f, +0.0f, +0.0f, +1.0f,
/* 6 */ +1.0f, -1.0f, +1.0f, +0.0f,
/* 7 */ +1.0f, +1.0f, +1.0f, +0.0f);

const uint vertex_offset_bits = 1069606u;

const float[4] shadow_values = float[4](0.0f, 0.3f, 0.4f, 0.5f);

uniform vec3 m_translation;

out highp vec3 v_tex_coord;
flat out uint o_norm;
smooth out float fading;
smooth out float v_shadow;

void main() {
    uint a_in_bits = a_in.x;
    uint a_in_aux_bits = a_in.y;

    uint x = (a_in_bits >> 0) & b_0000_1111;
    uint z = (a_in_bits >> 4) & b_0000_1111;
    uint y = (a_in_bits >> 8) & b_1111_1111;

    uint normal_idx = (a_in_bits >> 16) & b_0000_0111;
    uint tex_idx = (a_in_bits >> 19) & b_1111_1111;
    uint shadow = (a_in_bits >> 27) & b_0000_0011;
    uint lowered = (a_in_bits >> 29) & b_0000_0011;

    uint merge_bits = a_in_aux_bits & b_11_1111_1111;
    float m_x = float(merge_bits & b_0001_1111);
    float m_y = float(merge_bits >> 5);
    uint merge_vector_idx = normal_idx << 2;
    vec3 merge_vector_w = vec3(merge_vectors[merge_vector_idx], 0.0f, merge_vectors[merge_vector_idx + 1u]);
    vec3 merge_vector_h = vec3(0.0f, merge_vectors[merge_vector_idx + 2u], merge_vectors[merge_vector_idx + 3u]);
    uint vertex_offset_bits_shifted = vertex_offset_bits >> (normal_idx * 3u);
    vec3 vertex_offset = vec3(-0.5 + float(vertex_offset_bits_shifted & 1u), -0.5 + float(vertex_offset_bits_shifted >> 1 & 1u), -0.5 + float(vertex_offset_bits_shifted >> 2 & 1u));
    vec3 pos = vec3(float(x), float(y) - float(lowered) * pixh, -float(z)) + m_translation + vertex_offset + merge_vector_w * m_x + merge_vector_h * m_y;

    gl_Position = cam_proj * cam_view * vec4(pos, 1.0f);
    vec3 pos_to_cam_diff = cam_pos - pos;

    float cam_to_pos_dist_sq = dot(pos_to_cam_diff, pos_to_cam_diff);

    fading = clamp(cam_to_pos_dist_sq / VIEW_DISTANCE_SQ, 0.0f, 1.0f);
    v_shadow = shadow_values[shadow];
    v_tex_coord = vec3(m_x, m_y, float(tex_idx));
    o_norm = normal_idx;
}
