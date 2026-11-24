# Texture editor

Images edited pixel by pixel, blocks and plants made of them, shown on dirt-grass in a 3D view of its own (not the
game). Open `editor/index.html` from the local server (the same one as for `index.html`). Nothing reaches the game by
itself.

- **Start:** the game's textures, each one an image as the game composes it (`src/blockTextures.js`: a texture made
  from another one with ops is an image of its own here, but one made by a mask stays masked: `dirt_grass_side` is
  `grass_side`'s pixels with `grass_side_mask` over `dirt`), its cube and liquid blocks (water) and its plants
  (x_quads). From game
  starts again from them.
- **Masks:** an image can have a mask, part of it (not in the list): it shows its pixels where the mask is white and
  its base image (another one) where it's black, blended between (the mask's red, as the game's `mask` op). Its image
  and mask buttons choose which is painted; on the mask the left button paints white, the right one black (no
  colours). A new mask is all white; turned off,
  the image keeps how it looks, as its pixels.
- **Lists:** images, blocks, plants. Copy copies the selected one as `name_copy` (`NAME_COPY`); a block's or plant's
  images are copied with it, so the copy is edited apart.
- **The selected one:** its name (editable: an image's users follow), Delete (an image only when nothing uses it). An
  image: its mask, on or off, and the base under it. A block: one image on all faces, or top, sides and bottom apart, its model
  (cube or liquid); the face edited and its image. A plant: its image. The edited image's mask (a block's face's, a plant's) is under them.
- **Tools** (left strip): pencil (B), fill (G, the connected pixels of one colour), fill all (A, the whole image), pick a colour (I, or Ctrl+click with any tool); the left button paints, the right one erases (the tip under the image says so)
  (transparent). Undo and redo (Ctrl+Z, Ctrl+Y), a stroke at a time, per image; the grid.
- **Colours:** the current one (click it for the system picker); the main colour's variations, lighter and darker
  (rows) with the hue a little turned (columns); under them the image's own colours, most used first. Choosing a
  variation keeps them where they are; the system picker, the image's colours and the picker choose a main colour,
  and the variations move around it. Under them: how many rows and columns (5 × 5), how far the hue turns a column (2°)
  and the lightness changes a row (2%), each changed by the wheel over it too; and random: every new pixel the pencil
  touches (or a fill reaches) takes one of them at random.
- **View:** the selected block or plant on 11 × 11 dirt-grass, or 3 × 3 of it; a selected image upright on its own,
  through the middle (like one of a plant's quads, facing you), its holes see-through. Drag to turn around it, the wheel to zoom; it circles slowly when left
  alone. The faces have the game's shading by the sun's direction, plants none; a liquid is 7/8 high and see-through (the
  game's water opacity), drawn last.
- **Load, Save:** the whole document, one JSON file (`textures.json`):

  ```json
  { "format": "texture-editor", "version": 1, "tileSize": 16,
    "images": { "grass": "data:image/png;base64,…",
                "dirt_grass_side": { "image": "data:image/png;base64,…", "mask": "data:image/png;base64,…", "base": "dirt" } },
    "blocks": [{ "name": "DIRT_GRASS", "textures": { "top": "grass", "sides": "dirt_grass_side", "bottom": "dirt" } }],
    "plants": [{ "name": "GRASS_SHORT_0", "image": "grass_short_0" }] }
  ```

  A block's `textures` is one image's name or `{top, sides, bottom}`, as in `src/blocks.json`; a liquid one has
  `"model": "liquid"`.
