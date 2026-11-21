#version 300 es
// Block fragments (world/particles.js): a square per instance facing the camera (its right and up), the corners from
// gl_VertexID (a triangle strip of 4, no vertex buffer), showing a patch of a block texture.
// a_pos: position, size (the square's side); a_tex: the patch's corner u, v, its size, the layer; a_light: brightness
layout (location = 0) in vec4 a_pos;
layout (location = 1) in vec4 a_tex;
layout (location = 2) in float a_light;
// Camera block: identical in every vertex shader, see README.md
layout (std140) uniform Camera {
    highp mat4 cam_projection_view;
    highp vec3 cam_pos;
};
// the camera's right and up, unit length
uniform vec3 u_right;
uniform vec3 u_up;

out highp vec3 v_tex_coord;
out float v_light;
smooth out highp vec3 v_to_cam;

void main() {
    vec2 corner = vec2(gl_VertexID & 1, gl_VertexID >> 1);
    vec3 pos = a_pos.xyz + (u_right * (corner.x - 0.5) + u_up * (corner.y - 0.5)) * a_pos.w;
    gl_Position = cam_projection_view * vec4(pos, 1.0f);
    v_tex_coord = vec3(a_tex.xy + corner * a_tex.z, a_tex.w);
    v_light = a_light;
    v_to_cam = cam_pos - pos;
}
