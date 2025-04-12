#version 300 es
const mediump vec4 sky_color = vec4(0.54f, 0.72f, 0.79f, 1.0f);

precision mediump float;
uniform mediump sampler2DArray u_array_sampler;
in highp vec3 v_tex_coord;
in vec3 v_tex_ids;
in vec3 v_bary;
flat in uint o_norm;
flat in int o_block_shadow;
smooth in float fading;
out vec4 color_out;
const float norm_to_light_map[6] = float[6](0.8f, 0.6f, 0.6f, 0.7f, 1.0f, 0.5f);
void main() {

    vec4 tex = texture(u_array_sampler, v_tex_coord);

    const float edge0 = 0.60f;
    const float edge1 = 1.0f;
    vec4 tex_lighted = vec4(tex.xyz * norm_to_light_map[o_norm], 1.0f); 
    vec4 shadow_color = vec4(0.0, 0.0, 0.0, 0.0);
    if (o_block_shadow == 1) {
        vec3 ids = v_tex_ids / v_bary;
        bvec2 yz = greaterThan(vec2(v_bary.y, v_bary.z), vec2(v_bary.x, max(v_bary.x, v_bary.y)));
        int idx = int(yz.x) + int(yz.y) * 2;
        float t_shadow_idx = ids[idx];
        shadow_color = texture(u_array_sampler, vec3(v_tex_coord.xy, t_shadow_idx));
    }
    vec4 shadow_mix = vec4(mix(tex_lighted.xyz, shadow_color.xyz, shadow_color.a * 0.5f), 1.0f);
    color_out = mix(shadow_mix, sky_color, smoothstep(edge0, edge1, fading));

}
