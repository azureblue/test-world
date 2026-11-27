# Block definitions and climate tints

Status: steps 1 and 2 done (`src/blocks.json`, the tables in `src/blocks.js` built from it, the meshers' run-time
face table; textures composed at load from one image per texture, colour ops for derived textures,
`src/blockTextures.js`); step 3 (climate tints) and the texture layer budget proposed. Builds on the branch
`refactoring-block-definitions` (its last two commits: `src/blocks.json`, `src/image.js`, `TextureLoader` in
`src/textures.js`).

## Done: step 1

- `src/blocks.json`: textures by name (for now each one a tile of the atlas `images/textures.png`, `"tile"`: its
  layer) and blocks with stable ids, names, a `model` (`none`, `cube`, `liquid`, `x_quads`, `slab`: see
  [shaped blocks](shaped-blocks.md)) and face textures (one name, or `top` / `sides` / `bottom`).
- `src/blocks.js` imports it as a JSON module and builds `BLOCK_IDS` (the id with the model's kind bits, the same
  values as before) and the blocks (`getBlockById`); a missing texture, an unknown model or an invalid or repeated id
  is an error when the module loads. Block ids are below `MAX_BLOCK_ID` (1024).
- The meshers' face table is `block_table` in `mesh/cpp/blocks.hpp` (the water texture, then `MAX_BLOCK_ID` × 6
  layers), written by `UIntExtWasmMesher` after instantiation from `meshTextureTable()`; the wasm exports
  `block_table()` (its address) and `max_block_id()` (checked against `blocks.js`). `BLOCKS_TEXTURES`, `BLOCK_WATER`
  and `WATER_TEXTURE` are gone: adding a block or changing its textures is an edit of `blocks.json`, no wasm rebuild.
- Both meshers give the same output as before on generated chunks (compared over 75 chunks of the default world).

## Done: step 2

- **Source images:** one PNG per texture in `src/images/blocks/` (`"imageDir"`), named after it, `"tileSize"` pixels
  square; a bigger image can be used by tile (`"image,row,col"`, from the top left). Extracted from the old atlas and
  the source images, so the look didn't change (`textures.png`, `dirt.png`, `grass.png`, `mask.png`, `rock.png`,
  `water.png`, `snow.png` in `src/images/` aren't used any more; the grass, dirt and snow variants there may come back
  as climate variants).
- **Textures** in `blocks.json`: sources `"image"`, `"image,row,col"` or `"t:name"` (an earlier texture), and `"ops"`
  applied in order, each `{ "name": ..., params }` taking the first images of the list and putting its result in
  their place:
  - `mask`: [a, b, mask] → a where the mask is white, b where it's black (the grass side over dirt);
  - `multiply`: every channel × `color` (`"#rrggbb"`) × `factor` (default 1, above 1 lightens), alpha kept;
  - `hsl`: hue turned by `hue` degrees, saturation and lightness × `saturation`, `lightness`: another colour with
    the same pattern of light and dark, alpha kept.
- **Derived textures:** a texture made from another by colour ops is a texture like any other, with its own layer;
  blocks name it. First ones: `spruce_trunk`, `spruce_trunk_top` (oak's darker by `multiply`), `spruce_leaves`
  (`hsl`: darker, cooler green), blocks `SPRUCE_TRUNK` (18) and `SPRUCE_LEAVES` (19).
- **Layers:** a texture's layer is its index in the list; `blocks.js` numbers them the same way without loading
  images, so the workers' meshers get the face table without them. Blocks that draw nothing (`model` `none`) have no
  textures; the others must have them.
- `src/blockTextures.js`: `loadBlockTextures()` (the page: loads the images, composes, `Pixels[]` by layer);
  `composeTextures(tileOf)` and the ops (pure, tested in Node). The texture array (`TextureArray.create`, exactly as
  many layers as textures, an error above the GPU's `MAX_ARRAY_TEXTURE_LAYERS`) and the item bar's icons take the
  layers.
- Liquid textures must be among the first 16 (4 bits in the water vertices): checked when `blocks.js` loads.

## The problem

Blocks are defined by hand in three places that must agree:

- `src/blocks.js`: `BLOCK_IDS` (ids with the kind bits: solid, liquid, x-quads) and `BLOCKS` (names, the 6 face
  textures as layer numbers);
- `src/mesh/cpp/blocks.hpp`: `BLOCKS_TEXTURES`, the same face table again, and `BLOCK_WATER`, `WATER_TEXTURE`;
- `src/images/textures.png`: the atlas, whose tiles are the layer numbers both tables use.

Adding a block means editing all three and rebuilding the wasm. Textures are painted into the atlas by hand,
including combinations (the grass side over dirt) and the climate variants (the rows in `grass.png`, `dirt.png`,
`snow.png`), which aren't used yet.

## The proposal

One file, `src/blocks.json`, is the only place blocks and textures are defined. Everything else is built from it when
it's loaded, in JS: no code generators, and the wasm doesn't change when blocks change.

### `blocks.json`

```json
{
    "images": [
        { "name": "grass", "src": "images/grass.png", "tile": 16 },
        { "name": "dirt",  "src": "images/dirt.png",  "tile": 16 },
        { "name": "mask",  "src": "images/mask.png",  "tile": 16 },
        { "name": "climate", "src": "images/climate.png" }
    ],
    "textures": [
        { "name": "grass", "src": "grass,0,0", "tint": "climate" },
        { "name": "dirt", "src": "dirt,0,0" },
        { "name": "dirt.grass", "src": ["t:dirt", "t:grass", "mask,0,0"], "ops": [{ "name": "mask" }] },
        { "name": "water", "src": "water,0,0" }
    ],
    "blocks": [
        { "id": 0, "name": "EMPTY", "model": "none" },
        { "id": 1, "name": "DIRT", "model": "cube", "textures": "dirt" },
        { "id": 2, "name": "DIRT_GRASS", "model": "cube", "textures": { "top": "grass", "sides": "dirt.grass", "bottom": "dirt" } },
        { "id": 6, "name": "WATER", "model": "liquid", "textures": "water" },
        { "id": 8, "name": "GRASS_SHORT_0", "model": "x_quads", "textures": "grass_short_0" }
    ]
}
```

- **Images:** source images cut into tiles; a tile is `"name,row,col"` (or `"name,index"`), as in the branch's
  `ImageResources`.
- **Textures** are named and composed from tiles and other textures (`"t:name"`) by ops (`mask`, more when needed).
  They have **no ids**: a texture's id is its layer in the texture array, assigned while loading.
- **Blocks** have explicit, stable ids: they're stored in chunk data and sent over the world worker's protocol (later
  a server's). Their names are what code uses (`BLOCK_IDS.DIRT_GRASS`).
- **`model`** replaces loose flags: `none`, `cube` (solid), `liquid`, `x_quads` (plants). The kind bits of the block
  value (31 solid, 30 liquid, 29 x-quads) follow from it, so they aren't written by hand.
- **Face textures:** one name for all faces, or `top` / `sides` / `bottom` (and per side if ever needed).
- **`cutout`** (cubes only, done): textures with holes (alpha 0), in the same form, used instead when
  `Settings.render.cutoutLeaves` is on: the meshers draw the block's faces into their own range, alpha tested by the
  `CUTOUT` variant of the cube program, and the block doesn't hide its neighbours' faces (the faces between two
  leaves are drawn both ways). It stays solid for everything else (collisions, AO). See `shaders/README.md`.
- Not carried over from the branch: the water `alpha` op (the water shader sets the opacity now) and `alphaTest`.

### Loading in JS

`src/blocks.js` imports the file as a JSON module (`import blocks from "./blocks.json" with { type: "json" }`: Chrome,
module workers and Node support it), so the tables exist when the module loads, as now:

- `BLOCK_IDS` built from the blocks (the id with the kind bits), `getBlockById`, names for the stats and the item bar;
- the face table: block id → 6 texture layers.

The textures are composed once at startup on the main thread (`TextureLoader` from the branch, over `ImagePixels`),
and the layers go to the `TextureArray` instead of cutting `textures.png`. The item bar's icons come from the same
layers. Fixes needed in the branch's code: `ImageOps.mask` reads `images[2]` after the `splice` and doesn't return or
store its result.

### The mesher's table at run time

The meshers need only the face table: everything else (solid, liquid, x-quads, the height) is in the block value's
bits. Instead of the `constexpr BLOCKS_TEXTURES`, the table is written into wasm memory once after instantiation (an
exported `set_block_textures(ptr, count)`, or a fixed region before the input), in every place a mesher is created:
`worker/mesherWorker.js`, `worker/worldWorker.js`, `world/chunkEditor.js`. The lookup is by a run-time block id
either way, so it costs the same. `BLOCK_WATER` and `WATER_TEXTURE` in `blocks.hpp` go: water is recognised by the
liquid bit, its texture comes from the table.

**Layer limits** from the vertex formats: solid faces have 8 texture bits (256 layers), x-quads 8, water 4 (16). The
loader puts the textures used by liquid blocks first, so their layers stay below 16, and reports an error if they
don't fit.

## Climate tints

Instead of hand-painted variants, textures marked `"tint"` get **N variants generated at load**, each multiplied by
a colour from a small colormap image (`climate.png`: temperature across, humidity down, like Minecraft's grass
colormap), sampled at N points.

- **Partly tinted textures:** variants re-run the composition: a texture built from a tinted one (`t:grass` in
  `dirt_grass_side`) gets a variant per variant of it, so only the grass part of the side is tinted. No tint mask
  needed.
- **The variant is in the block value:** a few bits taken from the id, e.g. bits 20..23 (16 variants; ids keep
  bits 0..19). The mesher uses texture layer + variant for tinted textures, the layer alone for others.
- **The generator chooses it:** it gets temperature and humidity noise (it has none yet) and writes the variant into
  the blocks it places. Near biome borders it dithers the choice with noise, so the borders aren't straight lines of
  equal variants.
- **Edits keep it**, being part of the block; a block placed by the player gets the variant of the climate there (the
  world worker asks the generator for it).

**Why this way:** the shaders don't change at all, so no extra cost per pixel on integrated GPUs. Faces with
different variants don't merge, but only at climate boundaries.

**Not this way:** smooth Minecraft-style blending (a tint colour per vertex, averaged over neighbouring columns)
needs vertex bits and breaks merging wherever the climate changes; a climate map sampled in the fragment shader costs
a texture read per pixel.

**What changes for existing code:** comparisons of whole block values with a block (`block === BLOCK_IDS.GRASS`)
must compare ids (`idOf(block) === ...`), since the variant bits differ. There's one in `src`, a few in tests and
scenarios.

## Texture layer budget

The block textures are one texture array; the GPU's `MAX_ARRAY_TEXTURE_LAYERS` is at least 256 (WebGL2's minimum),
2048 on most desktop and integrated GPUs, and the vertex formats have 8 bits for the texture (solid, x-quads; 4 for
water). Block types and derived textures add layers one by one, which takes long to fill; climate variants multiply
them (tinted textures × variants), which fills it fast. Ways to grow, cheapest first:

1. **A texture array per pass:** solid, x-quads and water are drawn in separate passes, so each can bind its own array
   with its own layers: three times the room, no cost per pixel or draw (one bind per pass, as now). The face table
   keeps per-pass layer numbers; a texture used by two passes is in both arrays.
2. **Climate tints in the shader instead of layers:** a tint index per vertex (the solid vertex has 5 spare bits: 32
   tints), the vertex shader looks up the colour in a small uniform palette and passes it on (`flat`), the fragment
   shader multiplies (the tinted part masked by the texture's alpha, solid textures having it free). One layer per
   tinted texture whatever the number of variants; a multiply per pixel and 5 vertex bits. Merging is the same as with
   variant layers (different tints don't merge).
3. **Wider texture fields:** the solid vertex's spare bits make 10 bits (1024 layers) possible, on GPUs that allow
   more than 256.
4. **Not this:** packing several tiles into each layer (an atlas inside the array): merged faces repeat their texture
   (`REPEAT` wrapping), which an atlas can't do without `fract` and manual mip selection in the shader, costly and
   prone to seams.

Proposed: start with variant layers for the climate (simplest, no shader change) while the count is small; check the
count at load (done: an error above the limit); switch to 1 (per pass) and then 2 (shader tints) when variants grow.

## Order of work

1. **`blocks.json` and the loader:** `blocks.js` builds its tables from the file; the meshers get the face table at
   startup; the textures still come from `textures.png` in its current order. Same blocks, same look; `BLOCKS` and
   `BLOCKS_TEXTURES` gone.
2. **Texture composition:** textures composed from one image per texture at load (masks, colour ops for derived
   textures), replacing the hand-made atlas `textures.png`.
3. **Climate tints:** the colormap and the generated variants, the variant bits in the block value (`idOf`), the
   generator's temperature and humidity choosing variants, placed blocks getting the climate's variant.

Each step works on its own and can be committed separately.
