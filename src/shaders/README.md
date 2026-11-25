# Shaders

World space is the blocks' space everywhere: x, y on the ground, z up. The vertex shaders place a mesh vertex at its
(x, y, z) plus the chunk's `m_translation`, and only the camera's view matrix (`Camera`, its up vector z) turns that
into the screen's y up. Shaders that need "up" (the sky's gradient, the water's Fresnel angle) use z.

## Camera and Fog blocks

Two uniform buffers shared by all programs: the camera, bound to binding 0, used by the vertex shaders, and the fog,
bound to binding 1, used by the fragment shaders. Each is declared in every shader that uses it as:

```glsl
layout (std140) uniform Camera {
    highp mat4 cam_projection_view;
    highp vec3 cam_pos;
};

layout (std140) uniform Fog {
    highp vec3 fog_color;
    highp float fog_inv_dist_sq;
    highp float fog_scale;
    highp float fog_bias;
    highp float fog_min;
    highp float fog_range;
};
```

The declarations are copied into each shader and every copy must be identical: members, order, types and precision
(`highp` explicitly, as fragment shaders default to `mediump`). When a block changes, change it in all of them:
Camera in `cube_solid.vert`, `x_quads.vert`, `water.vert`, `water_depth.vert`, `blockhighlight.vert`; Fog in
`cube_solid.frag`, `x_quads.frag`, `water.frag`. `WorldRenderer` binds every program that declares a block to its
binding.

| member | meaning |
|---|---|
| `cam_projection_view` | projection × view matrix |
| `cam_pos` | camera position in world space |
| `fog_color` | colour things fade to: the sky above water, dark water under water |
| `fog_inv_dist_sq` | 1 / fog distance²; `fading = distance² * fog_inv_dist_sq`, clamped to 0..1 |
| `fog_scale`, `fog_bias` | `t = clamp(fading * fog_scale + fog_bias, 0, 1)`; the fog starts at `fading = -fog_bias / fog_scale` |
| `fog_min` | fog amount at the camera (under water: the base water tint) |
| `fog_range` | fog amount at the fog distance and beyond, minus `fog_min` |

Fog amount: `fog = fog_min + fog_range * t * t * (3 - 2 * t)` (smoothstep), then `mix(color, fog_color, fog)`.
Scale and bias are precomputed so the shaders don't divide. The distance comes from `v_to_cam`, the vertex-to-camera
vector the vertex shaders pass on.

`WorldRenderer` (`render/worldRenderer.js`) writes the Camera buffer each frame (the matrix and the position
separately), and the Fog buffer only when the fog changes (the camera going into or out of water): all of it in one
`bufferSubData` from `Fog` in `fog.js` (in std140 `fog_inv_dist_sq` fills the slot after the `vec3 fog_color`, the
rest follows without padding: 8 consecutive floats). Above and under water the values differ; see `Settings.sky` and
`Settings.water` in `settings.js`.

## Sky

`sky.vert` / `sky.frag` draw the sky after the opaque blocks: one triangle covering the screen (no vertex buffer, from
`gl_VertexID`), on the far plane, with depth test `LEQUAL` and no depth writes, so only the pixels the blocks left
empty run the fragment shader. The colour goes from `sky_horizon` to `sky_zenith` with the view direction's height
(`smoothstep(0, sky_height, up)`); the horizon colour is the fog's, so the far terrain fades into it. The view direction per pixel
comes from three vectors set per frame (`sky_forward`, and `sky_right`, `sky_up` scaled to the screen's edges), not a
matrix inverse. Not drawn under water (the clear colour, the water fog, stays). No Camera or Fog block.

The sun is drawn in the same shader, blocky: the view direction is projected onto a plane facing the sun and cut
into square pixels (`sun_u`, `sun_v`: two axes across the sun, scaled so one unit is one pixel); a pixel is in the
disc if its centre is within `sun_radius` pixels. The glow around it is smooth (`sun_glow`: strength, and the exponent
of the cosine of the angle to the sun). Everything is set once from `Settings.sky` (elevation and azimuth in
degrees, size, `sunPixels` across the radius). The glow fades out towards the horizon, where the sky has to stay the
fog colour so far terrain fading into the fog doesn't stand out. Being part of the sky, the sun is hidden by terrain
in front of it; nothing is lit by it. `highp`: the pixels are fractions of a degree, beyond `mediump`.

## Water opacity and shader variants

The water's opacity is the shader's, not baked into the texture: `water_color` multiplies `vec4(texture.rgb, 1)`, its
alpha the opacity (`Settings.water.opacity`); from inside water also darker and fainter
(`Settings.water.underwater.faceColorScale`, `faceAlphaScale`). `WorldRenderer` keeps the water program's values
above and under water (`water_color`, `fresnel`), apart from the fog. With
`FRESNEL` (`Settings.water.fresnel`) the water gets more opaque the flatter it's seen, the light going through
1 / cos as much water: `1 - (1 - alpha)^(1 + strength * (1 / cos - 1))` (`Settings.water.fresnelStrength` 0..1
above water, 0 under water; at 1: clear looking down, solid looking across). The shader computes it as
`1 - exp2(log2(1 - alpha) * exponent)`, the `log2` once on the CPU (alpha, `water_color.a`, is the same for
the whole draw; the `fresnel` uniform: strength, log), and 1 / cos as `distance / |height difference|`
from the distance² the fog needs anyway, so per pixel it's a `sqrt`, a division and an `exp2`. The
angle is to the vertical on every face: the side faces follow the top, as if all water were a horizontal sheet, so the
steps and rims of flowing water match the surface around them. A waterfall seen from the side gets nearly opaque; using
each face's real normal there is in `docs/proposals/water-fresnel.md`.

`FRESNEL` is a `#define` (`withDefines` in `gl.js` puts it after the `#version` line; `WorldRenderer` builds the water
program's variant from the settings once): when it's off, the effect isn't in the program at all.

## Cutout blocks

Leaves with holes (`"cutout"` textures in `blocks.json`, with `Settings.render.cutoutLeaves`): the meshers put their
faces in their own range of the mesh (after the x-quads, in the solid faces' format), and don't let them hide the faces
next to them, so what's behind a hole is there (the faces between two leaves both ways, the trunk inside). They're
drawn right after the opaque blocks with the `CUTOUT` variant of the cube program (`cube_solid.vert` /
`cube_solid.frag`), which discards texels with alpha below 0.5: only this pass discards, so the opaque blocks keep
early depth testing, and drawn after them it's mostly hidden before its fragment shader runs. The sky comes after it
and fills the holes with nothing behind them. The mipmaps average the alpha, so far away the holes close (less
shimmer); the colour under the holes is the texture's average (`TextureArray`), so far leaves don't darken.

With MSAA (`Settings.render.antialias`, when the context got it) and `Settings.render.alphaToCoverage` the cutout pass
uses alpha to coverage instead of the discard (`ALPHA_TO_COVERAGE`): the texel's alpha is the share of the pixel's
samples the leaf covers. Close up the alpha is 0 or 1 (nearest filtering), as with the discard; in the mipmaps it's
averaged, so far leaves cover part of a pixel instead of all or nothing.

Chunks farther than `Settings.render.cutoutDistance` draw their cutout faces with the `OPAQUE_CUTOUT` variant instead:
no discard, and the vertex shader swaps each cutout texture for the block's opaque one (`u_opaque_texture`,
`opaqueTextureTable` in `blocks.js`). Without the discard, the leaves behind the front ones fail the early depth test,
so a dense forest seen from above costs about one leaf layer per pixel instead of every layer seen through the holes.
