#version 300 es
precision mediump float;
out vec4 color_out;

// colour writes are off in the depth-only pass; nothing to compute
void main() {
    color_out = vec4(0.0);
}
