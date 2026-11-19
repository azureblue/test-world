#version 300 es
precision mediump float;
// Fog block: identical in every fragment shader, see README.md
layout (std140) uniform Fog {
    highp vec3 fog_color;
    highp float fog_inv_dist_sq;
    highp float fog_scale;
    highp float fog_bias;
    highp float fog_min;
    highp float fog_range;
};
// multiplies vec4(texture.rgb, 1): rgb 1 and alpha the opacity (Settings.water.opacity) above water; from inside water
// darker and fainter (Settings.water.underwater.faceColorScale, faceAlphaScale)
uniform vec4 water_color;
uniform mediump sampler2DArray u_array_sampler;
in highp vec3 v_tex_coord;
smooth in highp vec3 v_to_cam;
#ifdef FRESNEL
// x: the strength, Settings.water.fresnelStrength above water, 0 under water; y: log2(1 - water_color.a), computed once
// on the CPU
uniform vec2 fresnel;
#endif
out vec4 color_out;
// FRESNEL (optional, Settings.water.fresnel): the water gets more opaque the flatter it's seen, the light going
// through more water (1 / cos as much): 1 - (1 - alpha)^(1 + strength * (1 / cos - 1)). The angle is to the vertical on every face, as if all
// water were a horizontal sheet: the side faces follow the top, so the steps and rims of flowing water match the
// surface around them (a waterfall seen from the side gets nearly opaque; see docs/proposals/water-fresnel.md). Compiled in by #define, see WorldRenderer.

void main() {
    // the texture's colour, the water's opacity, not premultiplied: blended with ONE, ONE_MINUS_SRC_ALPHA, see Fog
    vec4 color = vec4(texture(u_array_sampler, v_tex_coord).rgb, 1.0) * water_color;
    // highp: distances squared go far beyond the mediump range
    highp float dist_sq = dot(v_to_cam, v_to_cam);
#ifdef FRESNEL
    // 1 / cos of the angle to the vertical: the cosine is |v_to_cam.y| / |v_to_cam|, so this is distance / height
    // difference; from above or below alike (no seam at eye level on a waterfall), at most 20 (a cosine of 0.05)
    highp float inv_cos = min(sqrt(dist_sq) / max(abs(v_to_cam.y), 1e-4), 20.0);
    // 1 - (1 - alpha)^exponent as 1 - exp2(log2(1 - alpha) * exponent)
    color.a = 1.0 - exp2(fresnel.y * (1.0 + fresnel.x * (inv_cos - 1.0)));
#endif

    highp float fading = min(dist_sq * fog_inv_dist_sq, 1.0);
    float fog_t = clamp(fading * fog_scale + fog_bias, 0.0, 1.0);
    float fog = fog_min + fog_range * fog_t * fog_t * (3.0 - 2.0 * fog_t);
    color_out = mix(color, vec4(fog_color, 1.0), fog);
}
