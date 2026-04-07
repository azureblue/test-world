#version 300 es
#define VIEW_DISTANCE_SQ 409600.0 /* @viewDistanceSq */
#define b1 1u
#define b11 3u
#define b111 7u
#define b1111 15u
#define b1_1111 31u
#define b11_1111 63u
#define b111_1111 127u
#define b_1111_1111 255u
#define b_1_1111_1111 511u
#define b_11_1111_1111 1023u
#define b_111_1111_1111 2047u
#define b_1111_1111_1111 4095u

// ttttTTTThwzzzzzzzyyyyyyyxxxxxxx
//10987654321098765432109876543210
layout (location = 0) in uint a_in;
layout (std140) uniform Camera {
    mat4 cam_projection_view;
    vec3 cam_pos;
};
uniform vec3 m_translation;

const float INV_VIEW_DISTANCE_SQ = 1.0f / VIEW_DISTANCE_SQ;

out highp vec3 v_tex_coord;
smooth out float fading;

void main() {
    uint x = (a_in >> 0) & b111_1111;
    uint y = (a_in >> 7) & b111_1111;
    uint z = (a_in >> 14) & b111_1111;

    float m_x = float(a_in >> 21 & 1u);
    float m_y = float(a_in >> 22 & 1u);
    uint tex_idx = (a_in >> 23) & b_1111_1111;

    vec3 pos = vec3(float(x), float(z), -float(y)) + m_translation;

    gl_Position = cam_projection_view * vec4(pos, 1.0f);

    vec3 pos_to_cam_diff = cam_pos - pos;
    float cam_to_pos_dist_sq = dot(pos_to_cam_diff, pos_to_cam_diff);

    fading = clamp(cam_to_pos_dist_sq * INV_VIEW_DISTANCE_SQ, 0.0f, 1.0f);
    v_tex_coord = vec3(m_x, m_y, float(tex_idx));
}
