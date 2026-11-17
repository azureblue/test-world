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

The values are written by `main.js` each frame. The matrix and the camera position are written separately; the fog
part (`fog_inv_dist_sq` .. `fog_range`) is one `bufferSubData` from `Fog` in `fog.js`. In std140, `fog_inv_dist_sq`
fills the slot after the `vec3 cam_pos` and the rest follows without padding, so the fog part is 8 consecutive floats.
Above and under water the values differ; see `Settings.sky` and `Settings.water` in `settings.js`.
