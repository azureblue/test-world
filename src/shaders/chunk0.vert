#version 300 es
#define VIEW_DISTANCE_SQ 409600.0 /* @viewDistanceSq */
#define b_0000_0001 1u
#define b_0000_0011 3u
#define b_0000_0111 7u
#define b_0000_1111 15u
#define b_0001_1111 31u
#define b_0011_1111 63u
#define b_0111_1111 127u
#define b_1111_1111 255u
#define b_1_1111_1111 511u
#define b_11_1111_1111 1023u
#define b_113_1111_1111 2047u
#define b_1111_1111_1111 4095u

// consider calculating uvs in js
// loshttttTTTTnnn_zzzzzyyyyyxxxxx
//                   yyyyyyyxxxxxx
//01234567890123456789012345678901
layout (location = 0) in uvec2 a_in;
layout (std140) uniform Camera {
    mat4 cam_projection_view;
    vec3 cam_pos;
};
uniform vec3 m_translation;

const float pixh = 1.0f / 16.0f;
const float INV_VIEW_DISTANCE_SQ = 1.0f / VIEW_DISTANCE_SQ;

const float[4] shadow_values = float[4](0.0f, 0.3f, 0.4f, 0.5f);

out highp vec3 v_tex_coord;
flat out uint o_norm;
smooth out float fading;
smooth out float v_shadow;

void main() {
    uint a_in_bits = a_in.x;
    uint a_in_aux_bits = a_in.y;

    uint x = (a_in_bits >> 0) & b_0111_1111;
    uint y = (a_in_bits >> 7) & b_0111_1111;
    uint z = (a_in_bits >> 14) & b_0111_1111;
    uint normal_idx = (a_in_aux_bits >> 16) & b_0000_0111;
    uint tex_idx = (a_in_aux_bits >> 19) & b_1111_1111;
    uint shadow = (a_in_aux_bits >> 27) & b_0000_0011;
    uint lowered = (a_in_aux_bits >> 29) & b_0000_0011;

    float m_x = float(a_in_aux_bits & b_0011_1111);
    float m_y = float(a_in_aux_bits >> 7 & b_0011_1111);

    vec3 pos = vec3(float(x) - 0.5f, float(z) - 0.5f - float(lowered) * pixh, -float(y) + 0.5f) + m_translation;

    gl_Position = cam_projection_view * vec4(pos, 1.0f);

    vec3 pos_to_cam_diff = cam_pos - pos;
    float cam_to_pos_dist_sq = dot(pos_to_cam_diff, pos_to_cam_diff);

    fading = clamp(cam_to_pos_dist_sq * INV_VIEW_DISTANCE_SQ, 0.0f, 1.0f);
    v_shadow = shadow_values[shadow];
    v_tex_coord = vec3(m_x, m_y, float(tex_idx));
    o_norm = normal_idx;
}
