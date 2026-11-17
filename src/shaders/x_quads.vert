#version 300 es
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
// Camera block: identical in every shader, see README.md
layout (std140) uniform Camera {
    highp mat4 cam_projection_view;
    highp vec3 cam_pos;
    highp float fog_inv_dist_sq;
    highp vec3 fog_color;
    highp float fog_scale;
    highp float fog_bias;
    highp float fog_min;
    highp float fog_range;
};
uniform vec3 m_translation;


out highp vec3 v_tex_coord;
// vertex to camera; linear across a triangle, so the fragment shader gets the exact distance for the fog
smooth out highp vec3 v_to_cam;

void main() {
    uint x = (a_in >> 0) & b111_1111;
    uint y = (a_in >> 7) & b111_1111;
    uint z = (a_in >> 14) & b111_1111;

    float m_x = float(a_in >> 21 & 1u);
    float m_y = float(a_in >> 22 & 1u);
    uint tex_idx = (a_in >> 23) & b_1111_1111;

    vec3 pos = vec3(float(x), float(z), -float(y)) + m_translation;

    gl_Position = cam_projection_view * vec4(pos, 1.0f);

    v_to_cam = cam_pos - pos;
    v_tex_coord = vec3(m_x, m_y, float(tex_idx));
}
