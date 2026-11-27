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
- bits 23..27: the shape index, 32 shapes. Shaped blocks have no water (no waterlogging), so they share the water's
  level and flowing bits.

32 shapes cover slabs (2), vertical slabs (4), stairs (8), inner and outer corners (16). The shape is part of the
block's saved state (`blockState`), so no save format change: older saves have no shaped blocks.

### What it touches

- **blocks.json**: model `"slab"` (later `"stairs"`), the material's textures, `"full"`: the block two slabs make.
- **Mesher**: shaped blocks aren't solid cubes: the greedy mesher and the face culling stay as they are, the faces
  next to a shaped block are drawn. A shaped block's faces are drawn by quarters of a block face (an octant's face),
  merged within their plane (a slab's top is one quad), into the solid output: the same shader. The solid vertex gets
  a half-block bit per axis (bits 61..63) and texture coordinates in half blocks, taken from where the face is in the
  cell, so a half face shows its half of the texture. Faces between octants, and against full solid neighbours or
  neighbours' octants, are left out.
- **Light, AO**: shaped blocks let light through (the light pass sees only solid cubes). AO is by half-block cells
  (`shade_vertex` in `mesh/cpp/common.hpp`): a half cell is filled in a solid block or a shaped block's octant. A
  block face uses it when a shaped block is in the 3 x 3 cells in front of it (only in chunks with one), otherwise the
  usual AO by cells, which it matches exactly; a shaped block's faces always. Their quarters merge only where the AO
  and light are the same all over.
- **Collision** (`player.js`): the player's box against half-block cells; walking into a ledge up to half a block
  high (or falling into a gap before one), a hop just high enough onto it, the speed kept.
- **Ray cast**: a shaped cell stops the ray where it hits one of its octants (the face hit, its normal).
- **Placement** (`interaction.js`):
  - slab: on a top face the bottom half, on a bottom face the top half, on a side the half clicked; onto a slab of the
    same kind, its missing half (the full block);
  - stairs: facing from the player's yaw, upside down when the upper half is clicked; corner stairs from the
    neighbouring stairs.
- **Smaller**: the block outline (the shape's box), particles collide with octants, the inventory icon draws the shape,
  water treats shaped blocks as walls.

## Order of work

1. Slabs: the bits, the meshers, collision with step up, the ray cast, placement and merging, outline, icon.
2. Stairs: the shapes, placement by facing; the meshers, collision and the ray cast need nothing new.
3. Corner stairs, then shaped blocks blocking light (the light pass by octants or by faces).

AO with shaped blocks is done (after step 1).
