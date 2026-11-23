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

// a_in.x: position, texture coordinates (h, w), texture; a_in.y: the light of the plant's cell, as in the mesher's input:
//   d sky darkness (7 - sky light), b block light
//  ttttTTTThwzzzzzzzyyyyyyyxxxxxxx
//            bbbb   ddd
//10987654321098765432109876543210
layout (location = 0) in uvec2 a_in;
// Camera block: identical in every vertex shader, see README.md
layout (std140) uniform Camera {
    highp mat4 cam_projection_view;
    highp vec3 cam_pos;
};
uniform vec3 m_translation;


out highp vec3 v_tex_coord;
// vertex to camera; linear across a triangle, so the fragment shader gets the exact distance for the fog
smooth out highp vec3 v_to_cam;
// the light's brightness, 0..1: light from no direction, a plant's faces get no shading
flat out float v_light;

// as in cube_solid.vert
float block_brightness(float block) {
    float r = 1.0f - block / 15.0f;
    float dark = pow(LIGHT_FALLOFF, 7.0f);
    return dark + (1.0f - dark) * (1.0f - r) / (r * 3.0f + 1.0f);
}

void main() {
    uint x = (a_in.x >> 0) & b111_1111;
    uint y = (a_in.x >> 7) & b111_1111;
    uint z = (a_in.x >> 14) & b111_1111;

    float m_x = float(a_in.x >> 21 & 1u);
    float m_y = float(a_in.x >> 22 & 1u);
    uint tex_idx = (a_in.x >> 23) & b_1111_1111;

    // LIGHT_FALLOFF, LIGHT_SUN: Settings.light (WorldRenderer), as in cube_solid.vert
    float sky = 7.0f - float(a_in.y >> 11 & b111);
    float block = float(a_in.y >> 17 & b1111);
    v_light = max(pow(LIGHT_FALLOFF, 7.0f - sky * LIGHT_SUN), block_brightness(block));

    vec3 pos = vec3(float(x), float(y), float(z)) + m_translation;

    gl_Position = cam_projection_view * vec4(pos, 1.0f);

    v_to_cam = cam_pos - pos;
    v_tex_coord = vec3(m_x, m_y, float(tex_idx));
}
