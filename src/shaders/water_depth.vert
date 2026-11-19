#version 300 es
// depth-only pre-pass of the water: positions exactly like water.vert, nothing else
layout (location = 0) in uvec2 a_in;
// Camera block: identical in every vertex shader, see README.md
layout (std140) uniform Camera {
    highp mat4 cam_projection_view;
    highp vec3 cam_pos;
};
uniform vec3 m_translation;

invariant gl_Position;

const float FRACT_UNIT = 1.0f / 8.0f;

void main() {
    uint a_in_bits = a_in.x;

    uint x = (a_in_bits >> 0) & 0x7Fu;
    uint y = (a_in_bits >> 7) & 0x7Fu;
    uint z = (a_in_bits >> 14) & 0x1FFu;

    vec3 pos = vec3(float(x), float(z) * FRACT_UNIT, -float(y)) + m_translation;

    gl_Position = cam_projection_view * vec4(pos, 1.0f);
}
