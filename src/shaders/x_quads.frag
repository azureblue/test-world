#version 300 es
precision mediump float;
// Camera block: identical in every shader, see README.md
layout (std140) uniform Camera {
    highp mat4 cam_projection_view;
    highp vec3 cam_pos;
    highp float fog_inv_dist_sq;
    highp vec3 fog_color;
    highp float fog_scale;
    highp float fog_bias;
    highp float fog_min;
    highp float fog_range;
};
uniform mediump sampler2DArray u_array_sampler;
in highp vec3 v_tex_coord;
smooth in highp vec3 v_to_cam;
out vec4 color_out;

void main() {

    vec4 tex = texture(u_array_sampler, v_tex_coord);
    if (tex.a < 0.7) {
        discard;
    }
    // highp: distances squared go far beyond the mediump range
    highp float fading = min(dot(v_to_cam, v_to_cam) * fog_inv_dist_sq, 1.0);
    float fog_t = clamp(fading * fog_scale + fog_bias, 0.0, 1.0);
    float fog = fog_min + fog_range * fog_t * fog_t * (3.0 - 2.0 * fog_t);
    color_out = mix(tex, vec4(fog_color, 1.0), fog);
    // color_out.a = alpha;
}
