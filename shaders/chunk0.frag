#version 300 es
const mediump vec4 sky_color = vec4(0.54f, 0.72f, 0.79f, 1.0f);

precision mediump float;
uniform mediump sampler2DArray u_array_sampler;
in highp vec3 v_tex_coord;
flat in uint o_norm;
smooth in float fading;
smooth in float shadow;
out vec4 color_out;
const float norm_to_light_map[6] = float[6](0.8, 0.6, 0.6, 0.7, 1.0, 0.5);
void main() {
    
    vec4 tex = texture(u_array_sampler, v_tex_coord);
    const float edge0 = 0.60;
    const float edge1 = 1.0;    
    vec4 tex_lighted = vec4(tex.xyz * norm_to_light_map[o_norm], 1.0); 
    vec4 tex_half_black = mix(tex_lighted, vec4(0.0, 0.0, 0.0, 1.0), 0.5);
    vec4 shadow_mix = mix(tex_lighted, tex_half_black, smoothstep(0.4, 1.0, shadow / 1.3));
    color_out = mix(shadow_mix, sky_color, smoothstep(edge0, edge1, fading));
}
