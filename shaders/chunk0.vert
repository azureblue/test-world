#version 300 es
#define VIEW_DISTANCE_SQ 409600.0
#define b_0000_0011 3u
#define b_0000_0111 7u
#define b_0000_1111 15u
#define b_1111_1111 255u
// consider calculating uvs in js
//     ttttTTTTnnnzzzzzzzzxxxxyyyy
//01234567890123456789012345678901
layout (location = 0) in uint a_in;
layout (std140) uniform Camera {
    mat4 cam_proj;
    mat4 cam_view;
    vec3 cam_pos;
};
const uint idx_to_face_point_idx[] = uint[](0u, 1u, 2u, 0u, 2u, 3u);
//                                                  00                          01                           10                              11    
// const vec2 tex_coord_map[4] = vec2[4](vec2(0.0f, 0.0f), vec2(1.0f, 0.0f), vec2(1.0f, 1.0f), vec2(0.0f, 1.0f));
const vec3 vertex_offest_map[24] = vec3[24](
/* 000 */ vec3(-0.5f, -0.5f, +0.5f), vec3(+0.5f, -0.5f, +0.5f), vec3(+0.5f, +0.5f, +0.5f), vec3(-0.5f, +0.5f, +0.5f),
/* 001 */ vec3(-0.5f, -0.5f, -0.5f), vec3(-0.5f, -0.5f, +0.5f), vec3(-0.5f, +0.5f, +0.5f), vec3(-0.5f, +0.5f, -0.5f),
/* 010 */ vec3(+0.5f, -0.5f, -0.5f), vec3(-0.5f, -0.5f, -0.5f), vec3(-0.5f, +0.5f, -0.5f), vec3(+0.5f, +0.5f, -0.5f),
/* 011 */ vec3(+0.5f, -0.5f, +0.5f), vec3(+0.5f, -0.5f, -0.5f), vec3(+0.5f, +0.5f, -0.5f), vec3(+0.5f, +0.5f, +0.5f),
/* 100 */ vec3(-0.5f, +0.5f, +0.5f), vec3(+0.5f, +0.5f, +0.5f), vec3(+0.5f, +0.5f, -0.5f), vec3(-0.5f, +0.5f, -0.5f),
/* 101 */ vec3(-0.5f, -0.5f, -0.5f), vec3(+0.5f, -0.5f, -0.5f), vec3(+0.5f, -0.5f, +0.5f), vec3(-0.5f, -0.5f, +0.5f));

const vec3 normal_0 = vec3(-1, 0, 0);
const vec3 normal_0_up = vec3(-1, 0, 0);


uniform vec3 m_translation;

out highp vec3 v_tex_coord;
flat out uint o_norm;
out float fading;
void main() {
    uint z = (a_in >> 0) & b_0000_1111;
    uint x = (a_in >> 4) & b_0000_1111;
    uint y = (a_in >> 8) & b_1111_1111;
    uint n = (a_in >> 16) & b_0000_0111;
    uint p = idx_to_face_point_idx[gl_VertexID % 6]; // (a_in >> 19) & b_0000_0011;
    uint t = (a_in >> 19) & b_1111_1111;

    vec3 pos = vec3(x, y, -float(z)) + m_translation + vertex_offest_map[n * 4u + p];
    vec3 pos_to_cam_diff = cam_pos - pos;
    float cam_to_pos_dist_sq = dot(pos_to_cam_diff, pos_to_cam_diff);

    uint p_0 = p & 1u;
    uint p_1 = (p >> 1) & 1u;

    fading = clamp(cam_to_pos_dist_sq / VIEW_DISTANCE_SQ, 0.0f, 1.0f);
    v_tex_coord = vec3(float(p_0 ^ p_1), float(p_1), float(t));
    // v_tex_coord = vec3(tex_coord_map[p], float(t));
    o_norm = n;
    gl_Position = cam_proj * cam_view * vec4(pos, 1.0f);
}
