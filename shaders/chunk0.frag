#version 300 es
const mediump vec4 sky_color = vec4(0.54f, 0.72f, 0.79f, 1.0f);

precision mediump float;
uniform mediump sampler2DArray u_array_sampler;
in highp vec3 v_tex_coord;
flat in uint o_norm;
smooth in float fading;
out vec4 color_out;
const float norm_to_light_map[6] = float[6](0.8f, 0.6f, 0.6f, 0.7f, 1.0f, 0.5f);
void main() {

    vec4 tex = texture(u_array_sampler, v_tex_coord);

    const float edge0 = 0.60f;
    const float edge1 = 1.0f;
    vec4 tex_lighted = vec4(tex.xyz * norm_to_light_map[o_norm], 1.0f); 
    color_out = mix(tex_lighted, sky_color, smoothstep(edge0, edge1, fading));
}
