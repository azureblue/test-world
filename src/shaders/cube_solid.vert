#version 300 es
#define VIEW_DISTANCE_SQ 409600.0 /* @viewDistanceSq */

// 
//           zzzzzzzyyyyyyyxxxxxxx
//                  yyyyyyyxxxxxxx
//10987654321098765432109876543210
layout (location = 0) in uvec2 a_in;
layout (std140) uniform Camera {
    mat4 cam_projection_view;
    vec3 cam_pos;
};
uniform vec3 m_translation;

const float INV_VIEW_DISTANCE_SQ = 1.0f / VIEW_DISTANCE_SQ;
const float[4] shadow_values = float[4](0.0f, 0.3f, 0.4f, 0.5f);

out highp vec3 v_tex_coord;
flat out uint o_norm;
smooth out float fading;
smooth out float v_shadow;

void main() {
    uint a_in_bits = a_in.x;
    uint a_in_aux_bits = a_in.y;

    uint x = (a_in_bits >> 0) & 0x7Fu;
    uint y = (a_in_bits >> 7) & 0x7Fu;
    uint z = (a_in_bits >> 14) & 0x7Fu;
    uint normal_idx = (a_in_aux_bits >> 16) & 0x7u;
    uint tex_idx = (a_in_aux_bits >> 19) & 0xFFu;
    uint shadow = (a_in_aux_bits >> 27) & 0x3u;

    float m_x = float(a_in_aux_bits & 0x7Fu);
    float m_y = float(a_in_aux_bits >> 7 & 0x7Fu);
    vec3 pos = vec3(float(x), float(z), -float(y)) + m_translation;

    gl_Position = cam_projection_view * vec4(pos, 1.0f);

    vec3 pos_to_cam_diff = cam_pos - pos;
    float cam_to_pos_dist_sq = dot(pos_to_cam_diff, pos_to_cam_diff);

    fading = clamp(cam_to_pos_dist_sq * INV_VIEW_DISTANCE_SQ, 0.0f, 1.0f);
    v_shadow = shadow_values[shadow];
    v_tex_coord = vec3(m_x, m_y, float(tex_idx));
    o_norm = normal_idx;
}
