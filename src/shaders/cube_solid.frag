#version 300 es
precision mediump float;
// Fog block: identical in every fragment shader, see README.md
layout (std140) uniform Fog {
    highp vec3 fog_color;
    highp float fog_inv_dist_sq;
    highp float fog_scale;
    highp float fog_bias;
    highp float fog_min;
    highp float fog_range;
};
uniform mediump sampler2DArray u_array_sampler;
in highp vec3 v_tex_coord;
flat in uint o_norm;
smooth in highp vec3 v_to_cam;
smooth in float v_shadow;
out vec4 color_out;
const float norm_to_light_map[8] = float[8](1.0f, 0.8f, 0.6f, 0.6f, 0.7f, 0.5f, 0.8f, 0.8f);

void main() {

    vec4 tex = texture(u_array_sampler, v_tex_coord);
    vec4 tex_lighted = vec4(tex.xyz * norm_to_light_map[o_norm], tex.a);
    vec4 tex_shadowed = mix(tex_lighted, vec4(0.0, 0.0, 0.0, 1.0), smoothstep(0.0, 1.0, v_shadow));
    // highp: distances squared go far beyond the mediump range
    highp float fading = min(dot(v_to_cam, v_to_cam) * fog_inv_dist_sq, 1.0);
    float fog_t = clamp(fading * fog_scale + fog_bias, 0.0, 1.0);
    float fog = fog_min + fog_range * fog_t * fog_t * (3.0 - 2.0 * fog_t);
    color_out = mix(tex_shadowed, vec4(fog_color, 1.0), fog);
    // color_out.a = alpha;
}
