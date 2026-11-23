#version 300 es

// a_in.x: position x, y, z, the light: b block light, d sky darkness (7 - sky light), each the sum of the 4 cells
//   around the vertex (solid ones add 0); a_in.y: texture coordinates x, y (the merged face's size), n normal,
//   t texture, s shadow (AO)
//bbbbb dddddzzzzzzzyyyyyyyxxxxxxx
//   ssttttttttnnn  yyyyyyyxxxxxxx
//10987654321098765432109876543210
layout (location = 0) in uvec2 a_in;
// Camera block: identical in every vertex shader, see README.md
layout (std140) uniform Camera {
    highp mat4 cam_projection_view;
    highp vec3 cam_pos;
};
uniform vec3 m_translation;

const float[4] shadow_values = float[4](0.0f, 0.3f, 0.4f, 0.5f);

out highp vec3 v_tex_coord;
flat out uint o_norm;
// vertex to camera; linear across a triangle, so the fragment shader gets the exact distance for the fog
smooth out highp vec3 v_to_cam;
smooth out float v_shadow;
// the light: x the sky light's brightness, y the block light's, z how direct the sky light is (sky light / 7: the
// faces' sun shading fades with it, the light deep in a cave comes from everywhere)
smooth out vec3 v_light;

// LIGHT_FALLOFF, LIGHT_SUN: Settings.light (WorldRenderer)
vec3 light_brightness(uint sky_darkness_sum, uint block_light_sum, uint shadow) {
    // the open cells of the 4: AO 0..2 is the number of solid ones; 3 is two solid sides, the mesher then takes the
    // front cell alone (the diagonal is behind a wall corner)
    float open_cells = shadow == 3u ? 1.0f : 4.0f - float(shadow);
    float sky = 7.0f - min(float(sky_darkness_sum) / open_cells, 7.0f);
    float block = min(float(block_light_sum) / open_cells, 7.0f);
    return vec3(pow(LIGHT_FALLOFF, 7.0f - sky * LIGHT_SUN), pow(LIGHT_FALLOFF, 7.0f - block), sky / 7.0f);
}

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
    vec3 pos = vec3(float(x), float(y), float(z)) + m_translation;

    gl_Position = cam_projection_view * vec4(pos, 1.0f);

    v_to_cam = cam_pos - pos;
    v_shadow = shadow_values[shadow];
    v_light = light_brightness((a_in_bits >> 21) & 0x1Fu, a_in_bits >> 27, shadow);
    v_tex_coord = vec3(m_x, m_y, float(tex_idx));
    o_norm = normal_idx;
}
