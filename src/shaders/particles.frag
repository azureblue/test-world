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
in float v_light;
smooth in highp vec3 v_to_cam;
out vec4 color_out;

void main() {
    vec4 tex = texture(u_array_sampler, v_tex_coord);
    // fragments of leaves with holes (cutout textures) keep the holes
    if (tex.a < 0.5)
        discard;
    // highp: distances squared go far beyond the mediump range
    highp float fading = min(dot(v_to_cam, v_to_cam) * fog_inv_dist_sq, 1.0);
    float fog_t = clamp(fading * fog_scale + fog_bias, 0.0, 1.0);
    float fog = fog_min + fog_range * fog_t * fog_t * (3.0 - 2.0 * fog_t);
    color_out = mix(vec4(tex.rgb * v_light, 1.0), vec4(fog_color, 1.0), fog);
}
