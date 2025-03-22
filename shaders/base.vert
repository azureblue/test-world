#version 300 es
layout (location = 0) in vec3 a_position;
layout (location = 1) in vec3 a_normal;
layout (location = 2) in vec2 a_tex_coord;

layout (std140) uniform Camera
{
    mat4 proj;
    mat4 view;
};

// uniform mat4 m_matrix;
uniform vec3 m_translation;

out highp vec2 v_tex_coord;
out vec3 o_norm;
void main() {
    gl_Position = proj * view * vec4(a_position + m_translation, 1.0);
    v_tex_coord = a_tex_coord;
    o_norm = a_normal;
}