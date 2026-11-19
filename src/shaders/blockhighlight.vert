#version 300 es
in vec3 a_in;
out vec3 v_color;

// Camera block: identical in every vertex shader, see README.md
layout (std140) uniform Camera {
    highp mat4 cam_projection_view;
    highp vec3 cam_pos;
};


void main() {
    gl_Position = cam_projection_view * vec4(a_in, 1.0);
    v_color = vec3(0, 0, 0);
}
