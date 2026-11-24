# Texture editor

Images edited pixel by pixel, blocks and plants made of them, shown on dirt-grass in a 3D view of its own (not the
game). Open `editor/index.html` from the local server (the same one as for `index.html`). Nothing reaches the game by
itself.

- **Start:** the game's textures, each one an image as the game composes it (`src/blockTextures.js`: a texture made
  from another one with ops is an image of its own here), its cube blocks and its plants (x_quads). From game starts
  again from them.
- **Lists:** images, blocks, plants. Copy copies the selected one as `name_copy` (`NAME_COPY`); a block's or plant's
  images are copied with it, so the copy is edited apart.
- **The selected one:** its name (editable: an image's users follow), Delete (an image only when nothing uses it). A
  block: one image on all faces, or top, sides and bottom apart; the face whose image is edited, and the image on each
  face. A plant: its image.
- **Tools** (left strip): pencil (B), fill (G), pick a colour (I); the left button paints, the right one erases
  (transparent). Undo and redo (Ctrl+Z, Ctrl+Y), a stroke at a time, per image; the grid.
- **Colours:** the current one (click it for the system picker); around it lighter and darker (rows) with the hue a
  little turned (columns), the middle one the current; under them the image's own colours, most used first.
- **View:** the selected block or plant (or the last one, while one of its images is selected; an image alone on a
  cube) on 11 × 11 dirt-grass, or 3 × 3 of it. Drag to turn around it, the wheel to zoom; it circles slowly when left
  alone. The faces have the game's shading by the sun's direction, plants none.
- **Load, Save:** the whole document, one JSON file (`textures.json`):

  ```json
  { "format": "texture-editor", "version": 1, "tileSize": 16,
    "images": { "grass": "data:image/png;base64,…" },
    "blocks": [{ "name": "DIRT_GRASS", "textures": { "top": "grass", "sides": "dirt_grass_side", "bottom": "dirt" } }],
    "plants": [{ "name": "GRASS_SHORT_0", "image": "grass_short_0" }] }
  ```

  A block's `textures` is one image's name or `{top, sides, bottom}`, as in `src/blocks.json`.
