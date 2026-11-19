# Water Fresnel: real face normals

Status: proposed. Now the side faces follow the top (below); this is the next step if waterfalls should look right.

## Now

The water shader's Fresnel (`Settings.water.fresnel`, `fresnelStrength`, see `src/shaders/README.md`) makes water more
opaque the flatter it's seen: `alpha = 1 - (1 - opacity)^(1 + strength * (1 / cos - 1))`. The angle is to the vertical
on every face, as if all water were a horizontal sheet: the side faces follow the top. Off under water (the strength
uniform is 0 there). The shader needs nothing from the mesher.

It looks right on lakes and flowing sheets: the thin steps between levels and the rims of flowing water on the ground
get the same opacity as the surface around them. Its flaw: a waterfall or a lake's wall seen from the side gets nearly
opaque (the angle to the vertical is close to 90°), whatever the angle to the face itself.

## The problem with real normals

With each face's own normal, a waterfall is clear seen head on and opaque at a grazing angle, as it should be. But the
steps and rims of a flowing sheet are seen about head on from above, so they stay at the plain opacity while the
surface around them, seen at a slant, gets nearly opaque: the grass shows through them as light stripes.

## Proposal: real normals, steps and rims as surface

The mesher decides per side face which normal it gets, and encodes it as the face direction in bits 61..63 of the water
quad (the bits are free; the vertex shader turns the direction into a `flat` normal, the fragment shader uses
`|dot(view, normal)|`).

**The rule:** a side face counts as surface (direction Up) when its water is lower than a block **and the block below
that water isn't water**; every other face keeps its real direction.

| Face | Lower than a block | Water below | Normal |
|---|---|---|---|
| step or rim of flowing water on the ground | yes | no | up: matches the surface |
| top block of a waterfall (6/8 on the falling column) | yes | yes | real: like the rest of the waterfall |
| rest of the waterfall | no | yes | real |
| a lake wall's 7/8 top row | yes | yes | real: like the rows below |
| a lake wall's lower rows | no | yes | real |

A rule on the level alone (lower than a block: surface) isn't enough: it makes the top block of a waterfall and the
top row of a lake's wall differ from the faces under them (tried and dropped). The walls of a pool one block deep sit on
the ground, so they count as surface, like a rim.

### Implementation (tried, works, reverted for simplicity)

- `blocks.hpp`: `water_side_surface(level, below)` = `level < BLOCK_HEIGHT_FULL && !is_water(below)`.
- Fast mesher (`uIntWasmMesherQ.cpp`): reads the block below anyway; passes the flag to the encoder.
- Main mesher (`uIntWasmMesher.cpp`): water faces go through the face layers with a byte of face data (level bits
  0..3, bottom 4..6); the flag goes in bit 7 (`water_face_data(level, bottom, surface)`), decoded where the faces are
  encoded. Faces with a different flag don't merge (only where a sheet meets a waterfall).
- `water_encoder`: direction Up for flagged side faces, the real one otherwise, `encode_dir_bits` at bit 61.
- `water.vert`: `normals[6]` by direction (Up, Front (0, 0, 1), Left (-1, 0, 0), Back (0, 0, -1), Right (1, 0, 0),
  Down), `flat out vec3 v_normal` under `#ifdef FRESNEL`; `water.frag`: `slant = max(abs(dot(normalize(v_to_cam),
  v_normal)), 0.05)`.
- A Node test meshing a small chunk with both meshers and checking the direction bits: a flowing cell on rock (sides
  Up), a waterfall's top block and a lake's 7/8 top row (real directions).

Cost: one varying and a dot product per pixel instead of a `.y`; the mesher reads the block below, which it does anyway.

## Alternatives

- **Sloped flowing water (Minecraft):** the corners of a flowing cell's top averaged from the neighbouring levels, no
  step faces in sheets at all, water sloping smoothly into a waterfall. Looks best; a bigger mesher change (the
  neighbours' levels per corner, precision finer than eighths or rounding), flowing cells no longer merge (they hardly
  do now: equal levels form diagonal rings). Rims next to air still need the rule above.
- **Opacity from the path length through the water:** the opaque scene's depth as a texture, the opacity from how far
  the view goes through water to the floor. Fixes every case, but needs an offscreen framebuffer and a texture read per
  water pixel: too costly on integrated GPUs.
