#version 300 es
precision mediump float;
// Camera block: identical in every shader, see README.md
layout (std140) uniform Camera {
    highp mat4 cam_projection_view;
    highp vec3 cam_pos;
    highp float fog_inv_dist_sq;
    highp vec3 fog_color;
    highp float fog_scale;
    highp float fog_bias;
    highp float fog_min;
    highp float fog_range;
};
// water faces: 1 from above; from below darker and fainter (premultiplied)
uniform vec4 water_face_mul;
uniform mediump sampler2DArray u_array_sampler;
in highp vec3 v_tex_coord;
smooth in highp vec3 v_to_cam;
#ifdef FRESNEL
flat in float v_surface;
#endif
out vec4 color_out;

// WATER_OPACITY: Settings.water.opacity; FRESNEL (optional, Settings.water.fresnel): the surface gets more opaque the
// flatter it's seen, the light going through more water (1 / cos as much):
// 1 - (1 - opacity)^(1 + FRESNEL_STRENGTH * (1 / cos - 1)). Only on the surface seen from above (not from under water,
// not on side faces). Compiled in by #define, see WorldRenderer.

void main() {
    // the texture's colour, the water's opacity, not premultiplied: blended with ONE, ONE_MINUS_SRC_ALPHA, see Fog
    vec4 color = vec4(texture(u_array_sampler, v_tex_coord).rgb, WATER_OPACITY) * water_face_mul;
#ifdef FRESNEL
    // the cosine of the angle to the surface's normal (up); on side faces and from below the plain opacity
    float facing = normalize(v_to_cam).y;
    float slant = v_surface > 0.5 && facing > 0.0 ? max(facing, 0.05) : 1.0;
    color.a = 1.0 - pow(1.0 - color.a, 1.0 + FRESNEL_STRENGTH * (1.0 / slant - 1.0));
#endif

    // highp: distances squared go far beyond the mediump range
    highp float fading = min(dot(v_to_cam, v_to_cam) * fog_inv_dist_sq, 1.0);
    float fog_t = clamp(fading * fog_scale + fog_bias, 0.0, 1.0);
    float fog = fog_min + fog_range * fog_t * fog_t * (3.0 - 2.0 * fog_t);
    color_out = mix(color, vec4(fog_color, 1.0), fog);
}
