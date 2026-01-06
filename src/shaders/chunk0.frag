#version 300 es
// const mediump vec4 sky_color = vec4(0.53f, 0.7f, 0.77f, 1.0);
const mediump vec4 sky_color = vec4(0.522, 0.855, 1, 1);
precision mediump float;
uniform mediump sampler2DArray u_array_sampler;
in highp vec3 v_tex_coord;
flat in uint o_norm;
smooth in float fading;
smooth in float v_shadow;
out vec4 color_out;
const float norm_to_light_map[8] = float[8](1.0f, 0.8f, 0.6f, 0.6f, 0.7f, 0.5f, 0.8f, 0.8f);

void main() {

    vec4 tex = texture(u_array_sampler, v_tex_coord);
    if (tex.a < 0.8)
        discard;

    const float edge0 = 0.60f;
    const float edge1 = 1.0f;
    vec4 tex_lighted = vec4(tex.xyz * norm_to_light_map[o_norm], tex.a);
    vec4 tex_shadowed = mix(tex_lighted, vec4(0.0, 0.0, 0.0, 1.0), smoothstep(0.0, 1.0, v_shadow));
    color_out = mix(tex_shadowed, sky_color, smoothstep(edge0, edge1, fading));
    // color_out.a = alpha;
}
