#version 300 es
#define VIEW_DISTANCE_SQ 409600.0 /* @viewDistanceSq */

// consider calculating uvs in js
//xxxxxxxxxyyyyyyyyyzzzzzzzzz   
//xxxxxxxxxyyyyyyyyynnntttttttttsh
//01234567890123456789012345678901
layout (location = 0) in uvec2 a_in;
layout (std140) uniform Camera {
    mat4 cam_projection_view;
    vec3 cam_pos;
};
uniform vec3 m_translation;

const float UNIT = 1.0f / 8.0f;
const float INV_VIEW_DISTANCE_SQ = 1.0f / VIEW_DISTANCE_SQ;

const float[4] shadow_values = float[4](0.0f, 0.3f, 0.4f, 0.5f);

out highp vec3 v_tex_coord;
flat out uint o_norm;
smooth out float fading;
smooth out float v_shadow;

void main() {
    uint a_in_bits = a_in.x;
    uint a_in_aux_bits = a_in.y;

    float x = float((a_in_bits >> 0) & 0x1FFu);
    float y = float((a_in_bits >> 9) & 0x1FFu);
    float z = float((a_in_bits >> 18) & 0x1FFu);

    float m_x = float(a_in_aux_bits & 0x1FFu);
    float m_y = float((a_in_aux_bits >> 9) & 0x1FFu);
    uint normal_idx = (a_in_aux_bits >> 18) & 0x7u;
    uint tex_idx = (a_in_aux_bits >> 21) & 0xFFu;
    uint shadow = (a_in_aux_bits >> 29) & 0x3u;    

    vec3 pos = vec3(x, z, -y) * UNIT + m_translation;

    gl_Position = cam_projection_view * vec4(pos, 1.0f);

    vec3 pos_to_cam_diff = cam_pos - pos;
    float cam_to_pos_dist_sq = dot(pos_to_cam_diff, pos_to_cam_diff);

    fading = clamp(cam_to_pos_dist_sq * INV_VIEW_DISTANCE_SQ, 0.0f, 1.0f);
    v_shadow = shadow_values[shadow];
    v_tex_coord = vec3(m_x * UNIT, m_y * UNIT, float(tex_idx));
    o_norm = normal_idx;
}
