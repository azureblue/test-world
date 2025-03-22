#version 300 es
in vec3 a_position;
in vec3 a_color;
out vec3 v_color;

layout (std140) uniform Camera
{
    mat4 proj;
    mat4 view;
};

void main() {
    gl_Position = proj * view * vec4(a_position, 1.0);
    v_color = a_color;
}
