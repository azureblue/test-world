#version 300 es
// consider calculating uvs in js
//   ttttTTTTppnnnzzzzzzzzxxxxyyyy
//01234567890123456789012345678901
layout(location = 0) in uint a_in;
layout(std140) uniform Camera {
    mat4 proj;
    mat4 view;
};


const vec2 tex_coord_map[4] = vec2[4](vec2(0.0f, 0.0f), vec2(1.0f, 0.0f), vec2(1.0f, 1.0f), vec2(0.0f, 1.0f));
const vec3 vertex_offest_map[24] = vec3[24](
/* 000 */ vec3(-0.5f, -0.5f, 0.5f), vec3(0.5f, -0.5f, 0.5f), vec3(0.5f, 0.5f, 0.5f), vec3(-0.5f, 0.5f, 0.5f),
/* 001 */ vec3(-0.5f, -0.5f, -0.5f), vec3(-0.5f, -0.5f, 0.5f), vec3(-0.5f, 0.5f, 0.5f), vec3(-0.5f, 0.5f, -0.5f),
/* 010 */ vec3(0.5f, -0.5f, -0.5f), vec3(-0.5f, -0.5f, -0.5f), vec3(-0.5f, 0.5f, -0.5f), vec3(0.5f, 0.5f, -0.5f),
/* 011 */ vec3(0.5f, -0.5f, 0.5f), vec3(0.5f, -0.5f, -0.5f), vec3(0.5f, 0.5f, -0.5f), vec3(0.5f, 0.5f, 0.5f),
/* 100 */ vec3(-0.5f, 0.5f, 0.5f), vec3(0.5f, 0.5f, 0.5f), vec3(0.5f, 0.5f, -0.5f), vec3(-0.5f, 0.5f, -0.5f),
/* 101 */ vec3(-0.5f, -0.5f, -0.5f), vec3(0.5f, -0.5f, -0.5f), vec3(0.5f, -0.5f, 0.5f), vec3(-0.5f, -0.5f, 0.5f));

// uniform mat4 m_matrix;
uniform vec3 m_translation;

out highp vec3 v_tex_coord;
flat out uint o_norm;
void main() {
    uint z = (a_in) & 15u;
    uint x = (a_in >> 4) & 15u;
    uint y = (a_in >> 8) & 255u;
    uint n = (a_in >> 16) & 7u;
    uint p = (a_in >> 19) & 3u;
    uint t = (a_in >> 21) & 255u;
    v_tex_coord = vec3(tex_coord_map[p], float(t));
    vec3 pos = vec3(x, y, -float(z)) + vertex_offest_map[n * 4u + p];
    gl_Position = proj * view * vec4(pos + m_translation, 1.0f);
    o_norm = n;
}