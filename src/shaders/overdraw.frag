#version 300 es
// overdraw debug view, drawn with additive blending (ONE, ONE) and depth test on.
// Every fragment that survives early-z adds one step, so the result counts shader invocations per pixel:
//   g - visualization, saturates at ~5 shades
//   r - exact counter, 1/255 per shade
precision mediump float;
out vec4 color_out;

void main() {
    color_out = vec4(1.0 / 255.0, 48.0 / 255.0, 0.0, 0.0);
}
