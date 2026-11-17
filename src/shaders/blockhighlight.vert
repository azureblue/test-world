#version 300 es
in vec3 a_in;
out vec3 v_color;

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


void main() {
    gl_Position = cam_projection_view * vec4(a_in, 1.0);
    v_color = vec3(0, 0, 0);
}
