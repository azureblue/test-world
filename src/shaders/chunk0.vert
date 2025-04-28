#version 300 es
#define VIEW_DISTANCE_SQ 409600.0 /* @viewDistanceSq */
#define EDGE_SHADOW_DISTANCE_SQ 800.0 /* @edgeShadowDistanceSq */
#define b_0000_0001 1u
#define b_0000_0011 3u
#define b_0000_0111 7u
#define b_0000_1111 15u
#define b_1111_1111 255u
// consider calculating uvs in js
//  fshttttTTTTnnnzzzzzzzzyyyyxxxx
//                        yyyyxxxx
//01234567890123456789012345678901
layout (location = 0) in uvec2 a_in;
layout (std140) uniform Camera {
    mat4 cam_proj;
    mat4 cam_view;
    vec3 cam_pos;
};
const uint idx_to_face_point_idx[] = uint[](0u, 1u, 2u, 0u, 2u, 3u, 1u, 2u, 3u, 1u, 3u, 0u);

const vec3 merge_vectors_w[] = vec3[](vec3(1, 0, 0), vec3(0, 0, 1), vec3(-1, 0, 0), vec3(0, 0, -1), vec3(1, 0, 0), vec3(1, 0, 0));
const vec3 merge_vectors_h[] = vec3[](vec3(0, 1, 0), vec3(0, 1, 0), vec3(0, 1, 0), vec3(0, 1, 0), vec3(0, 0, -1), vec3(0, 0, 1));

const vec3 vertex_offest_map[24] = vec3[24](
    //TODO: optimize?
/* 000 */ vec3(-0.5f, -0.5f, +0.5f), vec3(+0.5f, -0.5f, +0.5f), vec3(+0.5f, +0.5f, +0.5f), vec3(-0.5f, +0.5f, +0.5f),
/* 001 */ vec3(-0.5f, -0.5f, -0.5f), vec3(-0.5f, -0.5f, +0.5f), vec3(-0.5f, +0.5f, +0.5f), vec3(-0.5f, +0.5f, -0.5f),
/* 010 */ vec3(+0.5f, -0.5f, -0.5f), vec3(-0.5f, -0.5f, -0.5f), vec3(-0.5f, +0.5f, -0.5f), vec3(+0.5f, +0.5f, -0.5f),
/* 011 */ vec3(+0.5f, -0.5f, +0.5f), vec3(+0.5f, -0.5f, -0.5f), vec3(+0.5f, +0.5f, -0.5f), vec3(+0.5f, +0.5f, +0.5f),
/* 100 */ vec3(-0.5f, +0.5f, +0.5f), vec3(+0.5f, +0.5f, +0.5f), vec3(+0.5f, +0.5f, -0.5f), vec3(-0.5f, +0.5f, -0.5f),
/* 101 */ vec3(-0.5f, -0.5f, -0.5f), vec3(+0.5f, -0.5f, -0.5f), vec3(+0.5f, -0.5f, +0.5f), vec3(-0.5f, -0.5f, +0.5f)
);

const float[4] shadow_values = float[4](0.0f, 0.3f, 0.4f, 0.5f);

uniform vec3 m_translation;

out highp vec3 v_tex_coord;
flat out uint o_norm;
smooth out float fading;
smooth out float v_shadow;

void main() {
    uint a_in_bits = a_in.x;
    uint a_in_aux_bits = a_in.y;

    uint x = (a_in_bits >> 0) & b_0000_1111;
    uint z = (a_in_bits >> 4) & b_0000_1111;
    uint y = (a_in_bits >> 8) & b_1111_1111;

    uint normal_idx = (a_in_bits >> 16) & b_0000_0111;
    uint tex_idx = (a_in_bits >> 19) & b_1111_1111;
    uint shadow = (a_in_bits >> 27) & b_0000_0011;
    uint flip = (a_in_bits >> 29) & b_0000_0001;

    uint merge_bits = a_in_aux_bits & b_1111_1111;
    uint vertex_idx = uint(gl_VertexID % 6);
    uint vertex_quad_idx = idx_to_face_point_idx[vertex_idx + flip * 6u];
    uint m_x = merge_bits & b_0000_1111;
    uint m_y = merge_bits >> 4;
    vec3 pos = vec3(x, y, -float(z)) + m_translation + vertex_offest_map[normal_idx * 4u + vertex_quad_idx] + merge_vectors_w[normal_idx] * float(m_x) + merge_vectors_h[normal_idx] * float(m_y);
    vec3 pos_to_cam_diff = cam_pos - pos;

    float cam_to_pos_dist_sq = dot(pos_to_cam_diff, pos_to_cam_diff);

    uint p_0 = vertex_quad_idx & 1u;
    uint p_1 = vertex_quad_idx >> 1;

    fading = clamp(cam_to_pos_dist_sq / VIEW_DISTANCE_SQ, 0.0f, 1.0f);
    v_shadow = shadow_values[shadow];
    v_tex_coord = vec3((p_0 ^ p_1) * (1u + m_x), p_1 * (1u + m_y), tex_idx);
    o_norm = normal_idx;
    gl_Position = cam_proj * cam_view * vec4(pos, 1.0f);
}
