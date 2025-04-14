#version 300 es
#define VIEW_DISTANCE_SQ 409600.0
#define EDGE_SHADOW_DISTANCE_SQ 800.0
#define b_0000_0001 1u
#define b_0000_0011 3u
#define b_0000_0111 7u
#define b_0000_1111 15u
#define b_1111_1111 255u
// consider calculating uvs in js
//mmshattttTTTTnnnzzzzzzzzxxxxyyyy
//01234567890123456789012345678901
layout (location = 0) in uint a_in;
layout (std140) uniform Camera {
    mat4 cam_proj;
    mat4 cam_view;
    vec3 cam_pos;
};
const uint idx_to_face_point_idx[] = uint[](0u, 1u, 2u, 0u, 2u, 3u);
const vec3 vertex_offest_map[24] = vec3[24](
/* 000 */ vec3(-0.5f, -0.5f, +0.5f), vec3(+0.5f, -0.5f, +0.5f), vec3(+0.5f, +0.5f, +0.5f), vec3(-0.5f, +0.5f, +0.5f),
/* 001 */ vec3(-0.5f, -0.5f, -0.5f), vec3(-0.5f, -0.5f, +0.5f), vec3(-0.5f, +0.5f, +0.5f), vec3(-0.5f, +0.5f, -0.5f),
/* 010 */ vec3(+0.5f, -0.5f, -0.5f), vec3(-0.5f, -0.5f, -0.5f), vec3(-0.5f, +0.5f, -0.5f), vec3(+0.5f, +0.5f, -0.5f),
/* 011 */ vec3(+0.5f, -0.5f, +0.5f), vec3(+0.5f, -0.5f, -0.5f), vec3(+0.5f, +0.5f, -0.5f), vec3(+0.5f, +0.5f, +0.5f),
/* 100 */ vec3(-0.5f, +0.5f, +0.5f), vec3(+0.5f, +0.5f, +0.5f), vec3(+0.5f, +0.5f, -0.5f), vec3(-0.5f, +0.5f, -0.5f),
/* 101 */ vec3(-0.5f, -0.5f, -0.5f), vec3(+0.5f, -0.5f, -0.5f), vec3(+0.5f, -0.5f, +0.5f), vec3(-0.5f, -0.5f, +0.5f));

uniform vec3 m_translation;

out highp vec3 v_tex_coord;
flat out int o_block_shadow;
out vec3 v_tex_ids;
out vec3 v_bary;
flat out uint o_norm;
smooth out float fading;

void main() {
    int vertex_idx = gl_VertexID % 6;
    uint z = (a_in >> 0) & b_0000_1111;
    uint x = (a_in >> 4) & b_0000_1111;
    uint y = (a_in >> 8) & b_1111_1111;
    uint normal_idx = (a_in >> 16) & b_0000_0111;
    uint tex_idx = (a_in >> 19) & b_1111_1111;
    uint shadow_idx = 32u + (a_in >> 27) & b_0000_0111;
    uint m = (a_in >> 30) & b_0000_0011;
    uint vertex_quad_idx = idx_to_face_point_idx[vertex_idx]; 
    uint m_x = m & 1u;
    uint m_y = m >> 1;
    vec3 pos = vec3(x + m_x, y, -float(z + m_y)) + m_translation + vertex_offest_map[normal_idx * 4u + vertex_quad_idx];
    vec3 pos_to_cam_diff = cam_pos - pos;

    float cam_to_pos_dist_sq = dot(pos_to_cam_diff, pos_to_cam_diff);

    uint p_0 = vertex_quad_idx & 1u;
    uint p_1 = vertex_quad_idx >> 1;

    fading = clamp(cam_to_pos_dist_sq / VIEW_DISTANCE_SQ, 0.0f, 1.0f);
    o_block_shadow = int(cam_to_pos_dist_sq < EDGE_SHADOW_DISTANCE_SQ);
    
    v_tex_coord = vec3((p_0 ^ p_1) + m_x, p_1 + m_y, tex_idx);
    v_tex_ids = vec3(0.0, 0.0, 0.0);
    v_bary = vec3(0.0, 0.0, 0.0);
    // v_tex_ids[vertex_idx % 3] = float(32u + 20u * shadow_idx);
    v_tex_ids[vertex_idx % 3] = float(32u + vertex_quad_idx * 5u + shadow_idx);
    v_bary[vertex_idx % 3] = 1.0;
    o_norm = normal_idx;
    gl_Position = cam_proj * cam_view * vec4(pos, 1.0f);
}
