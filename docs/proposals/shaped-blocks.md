# Shaped blocks: slabs and stairs

## Problem

Every block fills its whole cell (cubes), or isn't solid at all (water, plants). Slabs (half blocks) and stairs need
blocks that fill part of a cell: drawn, collided with, targeted and placed by their shape.

## Design

A stair isn't an entity: it's a block in one cell like any other, with a shape. Slabs and stairs are one feature,
**shaped blocks**.

### Octants

A shape is the cell's 8 octants (half-size cubes) it fills, a mask of 8 bits, octant `ox | oy << 1 | oz << 2`:

| Shape | Octants |
|---|---|
| bottom slab | `0b0000_1111` |
| top slab | `0b1111_0000` |
| stairs | 6 octants (inner corner 7, outer corner 5) |
| vertical slabs, upside-down stairs | follow from the same |

The mesher, collision and the ray cast work with octants, not with each shape. The octants of the full block (`0xFF`)
are its cube: two matching slabs make the full block (`PLANKS_SLAB` + `PLANKS_SLAB` → `PLANKS`).

### Bits

The block value has no 8 free bits: ids take bits 0..9, the mesher's input puts the cells' light into bits 10..22
(apart from the cutout bit 16), water uses bits 24..27. So a cell keeps a shape **index**, not the mask, and the
masks are a table (`SHAPE_OCTANTS` in `src/blocks.js`, written into the meshers' block table):

- bit 28: shaped (the model's bit, like solid, liquid, x-quads);
- bits 23..27: the shape index's low 5 bits, bit 16 its 6th: 64 shapes. Shaped blocks have no water (no
  waterlogging) and no cutout textures, so they share the water's level and flowing bits and the cutout bit.

46 shapes: slabs (2), vertical slabs (4), stairs (8: 4 directions, upright or upside down), corner stairs (32: each
stair's direction kept with its corner, outer or inner towards one of the 2 directions across, so a corner goes back
to straight when its neighbour goes). The shape is part of the block's saved state (`blockState`), so no save format
change: older saves have no shaped blocks.

### What it touches

- **blocks.json**: model `"slab"` or `"stairs"`, the material's textures; a slab's `"full"`: the block two make.
- **Mesher**: shaped blocks aren't solid cubes: the greedy mesher and the face culling stay as they are, the faces
  next to a shaped block are drawn. A shaped block's faces are drawn by quarters of a block face (an octant's face),
  merged within their plane (a slab's top is one quad), into the solid output: the same shader. The solid vertex gets
  a half-block bit per axis (bits 61..63) and texture coordinates in half blocks, taken from where the face is in the
  cell, so a half face shows its half of the texture. Faces between octants, and against full solid neighbours or
  neighbours' octants, are left out.
- **Light** (`mesh/cpp/light.cpp`): a shaped block's cell is lit, and light crosses a face between two cells where a
  quarter of it is open on both sides (`shape_open`, by shape and face): a slab roof shades what's under it, light
  passes over a bottom slab and under a top one, a ceiling of bottom and top slabs staggered is closed (their open
  halves don't meet). The steps to edge neighbours only go between cells without shapes. The sky light falls straight down through a shaped block only with its top and bottom open (a
  vertical slab); a bottom slab's own cell sees the sky. Exact for shapes whose empty octants are connected (all of
  slabs and stairs).
- **AO**: a slab shades the blocks around it by its octants touching their faces' corners: near a slab a block's
  face has its AO and light by half-block cells at its corners (`face_ao`), elsewhere by cells (the same values). A
  top slab set into a floor shades the walls over it like a block; a bottom slab beside a wall doesn't shade the
  wall's corners above it. A block's face next to a slab is drawn by the quarters the slab leaves open
  (`shaped::encode_cube_faces`; its corners behind the slab would bring light from beyond it, the sky over a slab
  ceiling): its AO blended from its whole face's corners (the shadow of two AO levels half way along an edge, the
  vertex's second one in bits 46..47), its light by half-block cells. A slab's own faces have AO and light by
  half-block cells (`shade_vertex` in `mesh/cpp/common.hpp`). Quarters merge into the largest rectangles: a corner in
  the middle of a whole face's edge (a T-junction) would show as a seam, so a wall's strip under a slab spans its
  block, and a corner still there (a slab's side beside a block) gets that face's blend of the edge's two corners.
- **Collision** (`player.js`): the player's box against half-block cells; walking on the ground, a ledge ahead up to
  `walk.stepHeight` high over the ground at its foot (a step, not a wall beyond a gap) is a 45° ramp up to its top:
  the feet at least its top less the distance to it, lifted at most twice the move (room to make up for gravity's
  pull; pressed against the ledge, up at twice the walking speed). Down the same: off an edge, ground at most
  `walk.stepHeight` under the feet, they follow it down at most as much as the move (deeper: a fall). Stairs, a step
  of 0.5 every 0.5, are one slope either way. A wall stops the move, not the walking speed.
- **Ray cast**: a shaped cell stops the ray where it hits one of its octants (the face hit, its normal).
- **Placement** (`interaction.js`):
  - slab: a half of the cell by where the face it's placed on is aimed at (`slabShapeAt`): the middle, the half
    against the face (on a top face the bottom half, on a bottom face the top one, on a side a vertical slab against
    it); within a quarter block of an edge, the half towards the nearest edge (a side's lower band: a bottom slab).
    Onto a slab of the same kind (its inner face, or in the cell the new one goes to), its missing half (the full
    block);
  - stairs (`stairsShapeAt`): rising away from the player, along the horizontal axis it looks along the most;
    upside down placed on a bottom face or a side's upper half. Corners from the neighbouring stairs
    (`stairsCorner`, Minecraft's rules): behind a stair stairs the same way up rising across make it an outer corner
    (the upper step's quarter towards both), in front of it an inner one (the three quarters towards either), unless a
    stair like it goes on on that side. With every block placed or broken the stairs there and next to it are
    recomputed.
- **Smaller**: the block outline (the shape's box), particles collide with octants, the inventory icon draws the shape
  by octants (stairs rising to the back), water treats shaped blocks as walls.

Vertical slabs (`SLAB_X0`, `SLAB_X1`, `SLAB_Y0`, `SLAB_Y1`) and stairs (`STAIRS_X0` .. `STAIRS_Y1_DOWN`) needed only
their octants and the placement: the meshers, collision, light and the ray cast take any shape. A stair's side is an L
of quarters, a row and a quarter: the quarter's inner corner, in the middle of the row's edge, gets the row's blend
there. A seam can still show where partial faces of two cells meet, a merged rectangle spanning an edge the other has
a corner in the middle of (odd mixes of the shapes; not in walls, floors, ceilings or staircases of them): the edge
blend across cells only knows whole faces.

## Order of work

1. Slabs: the bits, the meshers, collision with step up, the ray cast, placement and merging, outline, icon; vertical
   slabs.
2. Stairs: the shapes, placement by facing; the meshers, collision and the ray cast need nothing new. Done.
3. Corner stairs. Done; a staircase's turn can show a small AO seam where its corner meets the stairs beside it.

AO and light with shaped blocks are done (after step 1).
