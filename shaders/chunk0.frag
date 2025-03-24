#version 300 es
precision mediump float;
uniform sampler2D u_sampler;
in highp vec2 v_tex_coord;
flat in uint o_norm;
out vec4 color_out;
const float norm_to_light_map[6] = float[6](0.8, 0.6, 0.6, 0.7, 1.0, 0.5);
void main() {
    
    vec4 tex = texture(u_sampler, v_tex_coord);
    color_out = vec4(tex.xyz * norm_to_light_map[o_norm], 1.0);
}
