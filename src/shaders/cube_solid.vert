#version 300 es

// a_in.x: position x, y, z (0..32), the light: b block light, d sky darkness (15 - sky light), each the sum of the 4
//   cells around the vertex (solid ones add 0); a_in.y: half a block more on z, y, x (Z, Y, X: shaped blocks' faces),
//   texture coordinates x, y in half blocks (the merged face's size), n normal, t texture, s shadow (AO)
//  bbbbbbddddddzzzzzzyyyyyyxxxxxx
//ZYXssttttttttnnn  yyyyyyyxxxxxxx
//10987654321098765432109876543210
layout (location = 0) in uvec2 a_in;
// Camera block: identical in every vertex shader, see README.md
layout (std140) uniform Camera {
    highp mat4 cam_projection_view;
    highp vec3 cam_pos;
};
uniform vec3 m_translation;
#ifdef OPAQUE_CUTOUT
// the far cutout faces: drawn with the opaque texture of their layer (opaqueTextureTable in blocks.js), 4 per vector
uniform uvec4 u_opaque_texture[64];
#endif

const float[4] shadow_values = float[4](0.0f, 0.3f, 0.4f, 0.5f);

out highp vec3 v_tex_coord;
flat out uint o_norm;
// vertex to camera; linear across a triangle, so the fragment shader gets the exact distance for the fog
smooth out highp vec3 v_to_cam;
smooth out float v_shadow;
// the light: x the sky light's brightness, y the block light's, z how direct the sky light is (sky light / 15: the
// faces' sun shading fades with it, the light deep in a cave comes from everywhere)
smooth out vec3 v_light;

// LIGHT_FALLOFF, LIGHT_SUN: Settings.light (WorldRenderer)

// block light 0..15 to its brightness: Minecraft's lightmap curve (bright near the source, falling late), from the
// darkness of sky light 0 (level 0 matches it) to 1
float block_brightness(float block) {
    float r = 1.0f - block / 15.0f;
    float dark = pow(LIGHT_FALLOFF, 7.0f);
    return dark + (1.0f - dark) * (1.0f - r) / (r * 3.0f + 1.0f);
}

vec3 light_brightness(uint sky_darkness_sum, uint block_light_sum, uint shadow) {
    // the open cells of the 4: AO 0..2 is the number of solid ones; 3 is two solid sides, the mesher then takes the
    // front cell alone (the diagonal is behind a wall corner)
    float open_cells = shadow == 3u ? 1.0f : 4.0f - float(shadow);
    float sky = 15.0f - min(float(sky_darkness_sum) / open_cells, 15.0f);
    float block = min(float(block_light_sum) / open_cells, 15.0f);
    // sky light: from LIGHT_FALLOFF ^ 7 (level 0, as dark as block light 0) to 1
    return vec3(pow(LIGHT_FALLOFF, (15.0f - sky * LIGHT_SUN) * (7.0f / 15.0f)), block_brightness(block), sky / 15.0f);
}

void main() {
    uint a_in_bits = a_in.x;
    uint a_in_aux_bits = a_in.y;

    uint x = (a_in_bits >> 0) & 0x3Fu;
    uint y = (a_in_bits >> 6) & 0x3Fu;
    uint z = (a_in_bits >> 12) & 0x3Fu;
    uint normal_idx = (a_in_aux_bits >> 16) & 0x7u;
    uint tex_idx = (a_in_aux_bits >> 19) & 0xFFu;
    uint shadow = (a_in_aux_bits >> 27) & 0x3u;
#ifdef OPAQUE_CUTOUT
    tex_idx = u_opaque_texture[tex_idx >> 2][tex_idx & 3u];
#endif

    float m_x = float(a_in_aux_bits & 0x7Fu) * 0.5f;
    float m_y = float(a_in_aux_bits >> 7 & 0x7Fu) * 0.5f;
    vec3 half_block = vec3(uvec3(a_in_aux_bits >> 29, a_in_aux_bits >> 30, a_in_aux_bits >> 31) & 1u) * 0.5f;
    vec3 pos = vec3(float(x), float(y), float(z)) + half_block + m_translation;

    gl_Position = cam_projection_view * vec4(pos, 1.0f);

    v_to_cam = cam_pos - pos;
    v_shadow = shadow_values[shadow];
    v_light = light_brightness((a_in_bits >> 18) & 0x3Fu, (a_in_bits >> 24) & 0x3Fu, shadow);
    v_tex_coord = vec3(m_x, m_y, float(tex_idx));
    o_norm = normal_idx;
}
