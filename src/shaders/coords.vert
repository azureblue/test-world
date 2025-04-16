#version 300 es
in vec3 a_position;
in vec3 a_color;
out vec3 v_color;

layout (std140) uniform Camera
{
    mat4 cam_proj;
    mat4 cam_view;
    vec3 cam_pos;
};

void main() {
    gl_Position = cam_proj * cam_view * vec4(a_position + vec3(0.0, 2.0, 0.0), 1.0);
    v_color = a_color;
}
