#version 300 es

// 
//         zzzzzzzzzyyyyyyyxxxxxxx
//nnntttt       yyyyyyyyyxxxxxxxxx
//10987654321098765432109876543210
layout (location = 0) in uvec2 a_in;
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

// water_depth.vert computes gl_Position the same way; invariant makes both programs give bit-identical depth, which
// the colour pass after the depth-only pass relies on (depth test LEQUAL)
invariant gl_Position;

const float FRACT_UNIT = 1.0f / 8.0f;

out highp vec3 v_tex_coord;
// vertex to camera; linear across a triangle, so the fragment shader gets the exact distance for the fog
smooth out highp vec3 v_to_cam;
#ifdef FRESNEL
// 1 on the water's surface (top faces), 0 on the others: only the surface gets more opaque at a slant
flat out float v_surface;
#endif

void main() {
    uint a_in_bits = a_in.x;
    uint a_in_aux_bits = a_in.y;

    uint x = (a_in_bits >> 0) & 0x7Fu;
    uint y = (a_in_bits >> 7) & 0x7Fu;
    uint z = (a_in_bits >> 14) & 0x1FFu;
    uint dir = (a_in_aux_bits >> 29) & 0x7u;
    uint tex = (a_in_aux_bits >> 25) & 0xFu;

    float m_x = float(a_in_aux_bits & 0x1FFu) * FRACT_UNIT;
    float m_y = float(a_in_aux_bits >> 9 & 0x1FFu) * FRACT_UNIT;
    vec3 pos = vec3(float(x), float(z) * FRACT_UNIT, -float(y)) + m_translation;

    gl_Position = cam_projection_view * vec4(pos, 1.0f);

    v_to_cam = cam_pos - pos;
    v_tex_coord = vec3(m_x, m_y, float(tex));
#ifdef FRESNEL
    v_surface = dir == 0u ? 1.0 : 0.0;
#endif
}
