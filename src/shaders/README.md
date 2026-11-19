# Shaders

## Camera block

All programs share one uniform buffer, bound to binding 0, declared in every shader that uses it as:

```glsl
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
```

The declaration is copied into each shader and every copy must be identical: members, order, types and precision.
A block declared in both stages of a program must match exactly, and the members are `highp` explicitly because
fragment shaders default to `mediump`. When the block changes, change it in all of them:
`cube_solid`, `x_quads` and `water` (vertex and fragment), `water_depth.vert`, `blockhighlight.vert`.

| member | meaning |
|---|---|
| `cam_projection_view` | projection × view matrix |
| `cam_pos` | camera position in world space |
| `fog_inv_dist_sq` | 1 / fog distance²; `fading = distance² * fog_inv_dist_sq`, clamped to 0..1 |
| `fog_color` | colour things fade to: the sky above water, dark water under water |
| `fog_scale`, `fog_bias` | `t = clamp(fading * fog_scale + fog_bias, 0, 1)`; the fog starts at `fading = -fog_bias / fog_scale` |
| `fog_min` | fog amount at the camera (under water: the base water tint) |
| `fog_range` | fog amount at the fog distance and beyond, minus `fog_min` |

Fog amount: `fog = fog_min + fog_range * t * t * (3 - 2 * t)` (smoothstep), then `mix(color, fog_color, fog)`.
Scale and bias are precomputed so the shaders don't divide.

The values are written by `WorldRenderer` (`render/worldRenderer.js`) each frame. The matrix and the camera position are written separately; the fog
part (`fog_inv_dist_sq` .. `fog_range`) is one `bufferSubData` from `Fog` in `fog.js`. In std140, `fog_inv_dist_sq`
fills the slot after the `vec3 cam_pos` and the rest follows without padding, so the fog part is 8 consecutive floats.
Above and under water the values differ; see `Settings.sky` and `Settings.water` in `settings.js`.

## Sky

`sky.vert` / `sky.frag` draw the sky after the opaque blocks: one triangle covering the screen (no vertex buffer, from
`gl_VertexID`), on the far plane, with depth test `LEQUAL` and no depth writes, so only the pixels the blocks left
empty run the fragment shader. The colour goes from `sky_horizon` to `sky_zenith` with the view direction's height
(`smoothstep(0, sky_height, up)`); the horizon colour is the fog's, so the far terrain fades into it. The view direction per pixel
comes from three vectors set per frame (`sky_forward`, and `sky_right`, `sky_up` scaled to the screen's edges), not a
matrix inverse. Not drawn under water (the clear colour, the water fog, stays). No Camera block.

The sun is drawn in the same shader, blocky: the view direction is projected onto a plane facing the sun and cut
into square pixels (`sun_u`, `sun_v`: two axes across the sun, scaled so one unit is one pixel); a pixel is in the
disc if its centre is within `sun_radius` pixels. The glow around it is smooth (`sun_glow`: strength, and the exponent
of the cosine of the angle to the sun). Everything is set once from `Settings.sky` (elevation and azimuth in
degrees, size, `sunPixels` across the radius). The glow fades out towards the horizon, where the sky has to stay the
fog colour so far terrain fading into the fog doesn't stand out. Being part of the sky, the sun is hidden by terrain
in front of it; nothing is lit by it. `highp`: the pixels are fractions of a degree, beyond `mediump`.

## Water opacity and shader variants

The water's opacity is the shader's (`WATER_OPACITY`, `Settings.water.opacity`), not baked into the texture. With
`FRESNEL` (`Settings.water.fresnel`) the water gets more opaque the flatter it's seen, the light going through
1 / cos as much water: `1 - (1 - WATER_OPACITY)^(1 + fresnel_strength * (1 / cos - 1))` (the uniform is
`Settings.water.fresnelStrength` 0..1 above water, 0 under water; at 1: clear looking down, solid looking across). The
angle is to the vertical on every face: the side faces follow the top, as if all water were a horizontal sheet, so the
steps and rims of flowing water match the surface around them. A waterfall seen from the side gets nearly opaque; using
each face's real normal there is in `docs/proposals/water-fresnel.md`.

Both are `#define`s (`withDefines` in `gl.js` puts them after the `#version` line; `WorldRenderer` builds the water
program's variant from the settings once): an effect that's off isn't in the program at all, constants fold.
