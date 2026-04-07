#version 300 es
// const mediump vec4 sky_color = vec4(0.53f, 0.7f, 0.77f, 1.0);
const mediump vec4 sky_color = vec4(0.522, 0.855, 1, 1);
precision mediump float;
uniform mediump sampler2DArray u_array_sampler;
in highp vec3 v_tex_coord;
smooth in float fading;
out vec4 color_out;

void main() {

    vec4 tex = texture(u_array_sampler, v_tex_coord);
    if (tex.a < 0.7) {
        discard;
    }
    const float edge0 = 0.60f;
    const float edge1 = 1.0f;
    color_out = mix(tex, sky_color, smoothstep(edge0, edge1, fading));
    // color_out.a = alpha;
}
