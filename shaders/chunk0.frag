#version 300 es
const mediump vec4 sky_color = vec4(0.54f, 0.72f, 0.79f, 1.0f);

precision mediump float;
uniform mediump sampler2DArray u_array_sampler;
in highp vec3 v_tex_coord;
in vec3 v_tex_ids;
in vec3 v_bary;
flat in uint o_norm;
smooth in float fading;
out vec4 color_out;
const float norm_to_light_map[6] = float[6](0.8, 0.6, 0.6, 0.7, 1.0, 0.5);
void main() {
    
    vec4 tex = texture(u_array_sampler, v_tex_coord);
    vec4 shadow = texture(u_array_sampler, vec3(v_tex_coord.xy, 33.0));
    
    const float edge0 = 0.60;
    const float edge1 = 1.0;    
    vec4 tex_lighted = vec4(tex.xyz * norm_to_light_map[o_norm], 1.0); 
    if (o_norm == 4u) {

        float id0 = v_tex_ids.x / v_bary.x;
        float id1 = v_tex_ids.y / v_bary.y;
        float id2 = v_tex_ids.z / v_bary.z;

        vec4 c0 = texture(u_array_sampler, vec3(v_tex_coord.xy, id0));
        vec4 c1 = texture(u_array_sampler, vec3(v_tex_coord.xy, id1));
        vec4 c2 = texture(u_array_sampler, vec3(v_tex_coord.xy, id2));
        vec4 shadow = c0 * v_bary.x + c1 * v_bary.y + c2 * v_bary.z;
        vec4 shadow_mix = vec4(mix(tex_lighted.xyz, shadow.xyz, shadow.a), 1.0);
        color_out = mix(shadow_mix, sky_color, smoothstep(edge0, edge1, fading));
    } else {
    // vec4 shadow_mix = vec4(mix(tex_lighted, shadow.xyz, shadow.a), 1.0);
    color_out = mix(tex_lighted, sky_color, smoothstep(edge0, edge1, fading));
    }
}
