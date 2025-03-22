#version 300 es
precision mediump float;
in vec3 v_color;
out vec4 color_out;

void main() {
    color_out = vec4(v_color, 1.0);
}
