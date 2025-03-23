#version 300 es
precision mediump float;
uniform sampler2D u_sampler;
in highp vec2 v_tex_coord;
flat in uint o_norm;
out vec4 color_out;
void main() {
    
    vec4 tex = texture(u_sampler, v_tex_coord);
    if (o_norm == 4u)
        tex = vec4(tex.xyz * 1.0, 1.0);
    else if (o_norm == 3u)
        tex = vec4(tex.xyz * 0.9, 1.0);
    else if (o_norm == 0u)
        tex = vec4(tex.xyz * 0.55, 1.0);
    else
        tex = vec4(tex.xyz * 0.68, 1.0);

    color_out = tex;    
}
