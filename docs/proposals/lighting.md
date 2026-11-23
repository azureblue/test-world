# Lighting: sky light (8 levels) and block light (16 levels)

Status: steps 1 (plumbing) and 2 (the light pass, with edits) done for the cubes' faces, plants and particles; water next.

## Goal

Two kinds of light: sky light, 8 levels (0..7, 3 bits), and block light, 16 levels (0..15, 4 bits). Caves and anything
under an overhang go dark. Blocks like a lamp can emit light.

- **Sky light:** 7 in every cell open to the sky straight up. Elsewhere it is the neighbours' light minus 1.
- **Block light:** a light block's own level in the open cells next to it (a lamp is solid; its faces are as bright as
  it), spreading out the same way, minus 1 per block. A level 15 lamp: 15 next to it, then 14, 13, ... 1 fifteen
  blocks away.

A face's brightness is the brighter of the sky light's (times `sun`) and the block light's, with the sun's face
shading only for direct sky light. `sun` is a uniform, which leaves room for day and night later.

Light reaches at most 7 blocks (sky) or 15 (block light). That is what keeps the design below small: a chunk's light
depends only on the blocks that close to it.

**Why block light has 16 levels and sky light 8.** With 8 levels a lamp lit too small a room: 7 next to it, under half
as bright 3 blocks out, and two lamps 6 apart left a dark band between them (light takes the brighter level, it doesn't
add). Minecraft has 16 levels for both (−1 per block). Here light is computed per chunk from the blocks around it, so
how far light travels is how far around each chunk the pass reads:
- Block light at 15 costs only near emitters, which are rare: its pass runs only when a chunk or a neighbour has one.
- Sky light at 15 would cost on almost every chunk (a 62³ region instead of 46³, about 2× the pass), wouldn't fit the
  vertex (11 free bits for two 6-bit sums), and would light caves twice as deep, retuning the overhang rules.
Minecraft stores light and updates it incrementally, so its reach costs nothing when meshing; that's a bigger change.

## Where the light comes from: computed per chunk, not stored

There is no persistent light storage and there are no incremental updates across chunks. When the world worker builds a
chunk's mesh, it first computes that chunk's light from scratch:

1. **Region.** Take the blocks of the chunk plus a 7-block margin: 46³ (`LIGHT_MARGIN`). Near emitters, also a
   15-block margin for the block light: 62³ (`BLOCK_LIGHT_MARGIN`). The loader already caches the 27 neighbours, so it
   can supply them. Only opacity and emission are needed (1 byte per cell), not the full block values.
2. **Seeds.**
   - Sky 7 in every cell above its column's sky top (below).
   - Angled sky light under overhangs (see Shadows under overhangs).
   - Block light at the emitters' levels (`light` in `blocks.json`, 0..15), in the open cells next to them.
3. **Spread.** A spread over the region, highest light first, minus 1 per step (2 sideways under a block, for sky
   light). Opaque cells stop it.
4. **Write.** Put the inner 34³ result (the mesher's input, border included) into the mesher's input block values,
   in WASM memory, in the bits Meshing describes. Solid cells stay 0.

Shortcuts for the common cases:

- A chunk entirely above every sky top in its region, with no emitters: all sky 7, nothing to write (0 is full sky
  light).
- A chunk entirely below every sky top, with no emitters within 15 blocks: all 0, no BFS.

Only surface chunks and lit caves pay for the spread.

Lighting is its own WASM pass, run before meshing. The fast mesher only reads the result (see Meshing).

**As built** (`world/lighting.js`, `mesh/cpp/light.cpp`):

- **Gathering in JS.** The region's cells come from the loader's 27 chunks, one byte each: bit 0 solid, bits 1..4 the
  light given. The sky tops become, per region column, the lowest height that sees the sky straight up.
- **The pass in WASM.** `compute` seeds the sky light (with the angled light) and spreads it highest first with a list
  per level. `compute_block`, only near emitters, spreads the block light over its own 62³ region a level at a time
  (each cell is set once: its light is final when set) and adds it. The output is a byte per cell of the mesher's
  input: bits 0..2 the sky darkness, 3..6 the block light. The mesher wrapper ORs it into its input bits.
- **Emitters.** Whether a chunk has a block giving light is looked up once (a scan of its data) and kept per chunk;
  edits update it. The block light pass runs when the chunk or one of its 26 neighbours has one (15 blocks fit in a
  neighbour).
- **Measured** (block light): in a rock world with a tunnel, 0.78 ms per chunk without a lamp, 1.44 ms in the chunks
  around one (mostly gathering 62³ cells in JS).
- **Open sky cells don't spread** unless a column beside them is covered at their height: all their other neighbours
  are open sky (or solid). Without this, an air chunk queued 100,000 cells.
- **Shortcuts.** Every region column sees the sky from the region's bottom: there's no solid block, so no sky light to
  compute (checked from the sky tops alone, before gathering); with no emitter near either, nothing at all. And when
  the chunk with its border is all solid, there's nothing to light.
- **Measured** on climate terrain, per chunk: surface 1.07 ms, underground 0.85 ms, air 0.02 ms (meshing is about
  0.55 ms, generating about 20 ms). In a surface chunk about 0.58 ms is the JS gathering and the rest the pass.
- **The client gets the light** with each chunk (`ChunkResponse.light`, 39 KB transferred). The quick meshes of its
  own edits use it until the world worker's update, so an edit in a dark place doesn't flash lit. An edited cell gets
  a guess (`ChunkEditor`): 0 for a solid block; for an open one, its brightest open neighbour's light minus 1. A chunk
  sent without light (null: open sky, or all solid) gets its own array on its first edit. Without the guess, a cell
  just dug read as full sky light, and digging into an all-solid chunk lit the whole hole until the update.

### Shadows under overhangs

With sky light only straight down and a plain spread, a roof's height doesn't matter: the light walks in along the
floor from the open column beside it, so a beam 1 block up and one 10 blocks up cast the same shadow. The rules that
fix it, tried with a test light before the light pass, which now has them (`light.cpp`):

- **Angled sky light.** A cell that sees the sky at 45° (lit diagonally from above, one block to a side, past the
  cell beside it or the one above it, at most 4 diagonal steps from the open sky: without a limit a 45° staircase
  carried it down forever) gets sky light by its gap, the open cells from it up to the block above:
  - 5 directly under a block (a 1 block gap);
  - 6 for gaps of 2..5;
  - 7 from 6 up: a high roof casts no shadow.

  It's passed on straight down. Under a roof it reaches as far in as the roof is high, so a wide low roof is dark in
  the middle and a high one only shaded at the centre. So it can come from a roof edge more than 7 blocks away (under
  a wide, high roof); the light pass with a 7 block margin misses that, which only matters under large overhangs.
- **Low gaps darken faster.** A sideways step into a cell with a block directly above costs 2 levels.

Centre darkness under a long strip (7 - level, averaged per face as the shader sees it):

| Width | Gap 1 | Gap 2 | Gap 4 | Gap 5 | Gap 6+ |
|---|---|---|---|---|---|
| 1 | 1.0 | 0.5 | 0.5 | 0.5 | 0 |
| 3 | 3.0 | 1.0 | 1.0 | 1.0 | 0 |
| 9 | 7.0 | 3.5 | 1.5 | 1.0 | 0 |

The steps are as fine as 8 levels allow. A gradual fade over the height would need 16 sky levels. The bits allow it:
sky darkness in bits 10..13 (ids use 0..9), the vertex sums in 6 + 5 bits.

**Tried and dropped: sky visibility.** Each cell checked 25 directions toward the sky (straight up, 8 around at 3
steepnesses) and took the share it sees. Height and width mattered as they should, but:
- With 8 directions around, an object blocks only the ones that point at it, so a pillar's shadow had lobes and was
  lopsided.
- Directions along an axis hit a long beam at any height.
- Directions running far made blotches between trees and need far more data around a chunk.

### Sky top: a per-column heightmap

Chunks are cubic and the world has no top, so "open to the sky" can't be found by scanning up. The world worker keeps
a **sky top** per block column: the highest solid block, which stops sky light (`world/skyTops.js`).

- **Scanned from the generator's tops.** `ChunkGenerator.solidTops(cx, cy)` gives, per block column, a height with no
  generated solid block above it (`NO_TOP`: none in the column):
  - flat: 0;
  - climate: the ground's top block, or the highest a tree that can reach the column can grow;
  - a scene: its base's, raised by its boxes of solid blocks;
  - the default (the others): `maxHeight`, 256.
- Each column is scanned down from its own start, or from the chunk column's highest solid edit if that's higher, and
  stops at its first solid block.
- Chunks no column needs aren't generated. On the climate generator, 100 chunk columns generated 295 chunks instead of
  1331 from 256, and the tops were identical. Time saved is small (about 1.3 ms per chunk column next to the
  generator's 18): the gain is the chunk cache (810 chunks) not filling with air. Depth never mattered: the scan
  stops once every column has its top.
- A single block placed very high only makes its own chunk column scan from there, never the whole world.
- **Kept per chunk column,** scanned only as deep as asked for, with a count of the columns that have no top yet.
- **From edits.** Placing a solid block above the sky top raises it. Removing the sky-top block scans down to the next
  solid block, as far as the column was scanned.

### Water: dimmed by depth, not per block

If every water block took 1 from the light, water would be dark 7 blocks down. Instead, water doesn't stop sky light.
Each column also keeps its **water surface**: the highest water cell above the sky top, if there is one. Below it the
seeds are:

```
sky = 7 - floor(depth below the water surface / N)
```

`N` is a setting, `Settings.light.waterDepthPerLevel`. With N = 4, the light reaches level 0 at 28 blocks deep.

- The cost is the same as without water: these are only the seeds, set before the spread.
- The spread itself doesn't change: sideways, and under an overhang in water, light drops 1 per block.
- Generators already know their water levels (the climate generator's sea and lakes), so the water surface comes from
  the generator like `skyTop`. Edits update it the same way.
- The deep look (colour, haze) stays in the water depth pass and the fog. The light only sets the brightness.

## Edits

Changing a block can change the light of anything within 7 blocks (`LIGHT_MARGIN`), or 15 near emitters. An edit
always resends the chunks whose bordered data includes the block. When it changes the light (solid or not, or the
light given), it resends the chunks within 7 blocks of it, or 15 when it places or removes an emitter or one is in its
chunk or a neighbour (`Lighting.marginAt`): still at most the 27 neighbours, just more of them in practice. Water flow never changes it, so it
causes no extra resends.

If the edit moves the column's sky top, the chunks in the columns within 7 blocks are resent too, between the old and
new sky top (the shaft that opened or closed), only those in the simulated range.

Resends already go through `sendChanged`, with its per-chunk interval, so a burst of edits stays bounded.

## Multiplayer: an edit far away opens or closes a shaft

Light is never stored, so it can't go stale:

- **The sky tops and water surfaces live on the server.** The world worker updates them on every edit, wherever it
  is. The client that made the edit has that chunk loaded, so the server has it too.
- **The server resends only chunks some client keeps.** The affected chunks are those within 7 blocks of the column,
  between its old and new top. They go to every client that keeps them, by the load ranges the clients already report.
  A roof built far above someone's area darkens their chunks below.
- **Chunks nobody keeps are skipped.** Their light is computed fresh when they're next requested.
- **Removing a column's top block** needs the next blocking block below it. That comes from the column's edits and the
  generator, which may generate a chunk (deterministic).
- **Large roofs.** A 100×100 platform changes many chunks at once. The existing per-chunk resend interval
  (`sendChanged`) spreads that over a few frames.

## Meshing

**Bits in the mesher's input** (`LIGHT_BITS` in `common.hpp`):

| Bits | Holds |
|---|---|
| 11..13 | Sky darkness: 7 − sky light. |
| 17..20 | Block light (0..15). |

- Data without light (all 0) is full sky light, so chunks in the open sky need no writes, and the main mesher (no light
  yet) draws as before.
- Block ids are below `MAX_BLOCK_ID` (1024), so bits 11..15 are 0 in block values. `decode_block_id` masks with
  `MAX_BLOCK_ID - 1`.
- Each field has 2 zero bits above it, so the lights of 4 cells add up with one AND per cell and no unpacking: the
  sums in 11..15 (up to 28) and 17..22 (up to 60).

**Smooth light per vertex** (`corner_light`):

- A vertex's light is the sum of the face's front cell and the 3 cells around the vertex: the cells AO already reads.
- Solid cells add 0. The shader divides by the open cells, which the vertex's AO value gives: AO 0..2 is the number of
  solid cells, and AO 3 means two solid sides (1 open cell).
- With two solid sides the diagonal cell is behind a wall corner, so its light is left out and the vertex has the
  front cell's alone. Counting it leaked light around corners, a lamp's or the sky's from the other side (seen in a
  dug tunnel). It's a mask in `corner_light`, no branch: no measurable cost.

**Vertex bits.** For solid faces, the sums go to bits 21..25 (sky darkness) and 26..31 (block light) of the position
word, which were free (all of them now).

- **Water:** has free bits too (step 4).
- **X-quads (32-bit vertices):** have only bit 31 free. They would move to `uvec2` vertices and take their own cell's
  light. They are few.

**Fast mesher: the `cubes` mask.** Lit air isn't 0, so `blocks != 0` no longer finds blocks. Now `cubes = solid &
~specials`, per row on the 32-bit masks: every cube is solid (the `cube` model). That's cheaper than the comparison
was. The one difference is the unused `CHUNK_EDGE` (model `none`), which was drawn as a cube and now isn't drawn.

**Measured** (fast mesher, against the commit before, 10 shuffled runs; percentages are time, + is slower):

| Set | Smooth | Flat (front cell only) |
|---|---|---|
| Forest (cutout, no cutout), region2 | +10%, 0%, +3% | −3%, −8%, −5% |
| Face-heavy patterns | +6..+22% | 0..+7% |
| Air, solid without faces | −20% | −20% |

- The cost of smooth light is about 30 more operations per face: 9 ANDs, about 10 adds and 4 shifts into the vertex.
  The generated code is already tight.
- An earlier attempt was +50..80%: it unpacked the 3-bit fields and replaced solid cells with the front cell's light.
- Flat light would be one AND per face, shared by its 4 vertices.

**Greedy mesher (the main one).** Faces merge only when all 4 vertex lights match, the same rule as for AO.

- **Layers.** The 32-bit layer words had no room. A single 64-bit layer (96 KB) made even air chunks 20% slower: the
  scans over empty layers no longer fit the L1 cache. Instead there are two arrays at the same indices:
  - **The face** (`LAYER_*` in `uIntWasmMesher.cpp`), 32 bits: AO 0..7, texture + 1 at 8..19 (12 bits, room for more
    textures), then the merge counters, width 20..25 and height 26..31 (1..32 each).
  - **The light**, 64 bits: 11 bits per vertex, corner_light's sums whole (the same values as the fast mesher). It's
    written with every face and read only where there is one, so empty layers never touch it and it's never cleared.
- **Whole sums, not halved.** At first the light was 8 bits per vertex, the sums halved. That lost the half-steps:
  in a tunnel two vertices with darkness 1.0 and 1.5 both came out 1.0. A flat stretch in a gradient reads as a dark
  band across the floor (a steep drop, a plateau, then the fall goes on).
- **Checked.** On climate terrain with the light pass, the area per (texture, direction, corner lights) is equal in
  both meshers: 1397 groups, 1284 of them lit, none differing. Faces merge only with the same light, and none are
  lost.
- **Measured.** With the 32-bit light array (halved sums): +3..6% on terrain against before lighting, empty layers
  unchanged. The 64-bit array costs another +2.5..12%, air chunks included (about 0.06 ms per chunk). That's not
  memory: a 32-bit array of the same size is as fast as before. It's the 64-bit values in `create_mesh`, where all is
  inlined. Moving the per-face light work into a function that isn't inlined didn't help. A 32-bit array plus an
  8-bit one for the rest would avoid 64-bit values, if it ever matters. SIMD (`-msimd128`) gave nothing measurable
  here, so it stays off.

## Shaders

The vertex shader (`cube_solid.vert`) works out the sky and block brightness per vertex, and how direct the sky light
is:

```glsl
float open_cells = shadow == 3u ? 1.0 : 4.0 - float(shadow);
float sky = 7.0 - min(float(sky_darkness_sum) / open_cells, 7.0);
float block = min(float(block_light_sum) / open_cells, 15.0);
v_light = vec3(pow(LIGHT_FALLOFF, 7.0 - sky * LIGHT_SUN), block_brightness(block), sky / 7.0);
```

Sky light falls by `LIGHT_FALLOFF` per level. Block light follows Minecraft's lightmap curve, bright near the source
and falling late, scaled so that level 0 is as dark as sky light 0 (no edge where a lamp's light ends):

```glsl
float r = 1.0 - block / 15.0;
float dark = pow(LIGHT_FALLOFF, 7.0);
return dark + (1.0 - dark) * (1.0 - r) / (r * 3.0 + 1.0);
```

| blocks from a lamp | 1 | 2 | 3 | 4 | 6 | 8 | 10 | 12 | 15 |
|---|---|---|---|---|---|---|---|---|---|
| level | 15 | 14 | 13 | 12 | 10 | 8 | 6 | 4 | 1 |
| brightness | 1.0 | 0.81 | 0.67 | 0.57 | 0.42 | 0.33 | 0.26 | 0.21 | 0.15 |

The same is in `x_quads.vert` and `World.brightnessAt` (particles).

The fragment shader adds the face shading:
- The faces' fixed shading by the sun's direction (top 1.0, sides 0.6–0.8, bottom 0.5) is for sunlight only.
- Light from no particular direction keeps 30% of that contrast (`AMBIENT_FACE_CONTRAST`): the bottom is 0.85. That
  covers lamps, whose ceiling would otherwise get half their light, and the scattered light deep in a cave.
- Sky light moves from the sun shading at level 7 to the flat shading at level 0, linearly. Daylight looks the same
  as without light.

```glsl
float ambient_face = 1.0 - AMBIENT_FACE_CONTRAST * (1.0 - sun_face);
float light = max(v_light.x * mix(ambient_face, sun_face, v_light.z), v_light.y * ambient_face);
```

`Settings.light`:

- `falloff` (0.75): level 0, a cave, is 0.13 of full light.
- `sun` (1).
- `enabled` (true): off, no light is computed, and everything has full sky light.
- The lamp (`LAMP`, `"light": 15` in `blocks.json`) is in the item bar.

These are `#define`s for now. `sun` becomes a uniform with day and night.

## The client

Particles, and later the player's view and held items, need light at a point.

- The chunk response carries the chunk's light (the 34³ bytes the mesher took, null for none) beside the block data;
  `ChunkEntry.light` keeps it.
- On the client, the light never gets into the block values: `blockAt` results are compared with `EMPTY` and with
  each other.
- `World.brightnessAt(ix, iy, iz)` gives a cell's brightness as the shader works it out, without face shading: 1 in
  chunks without light or not loaded.
- Particles (done): each frame, a particle's light is its cell's brightness times its own shade (0.7..1, which stood
  in for its light before). Light from no direction, so no face shading.

## Plants (x-quads)

- A plant's vertex is 2 uint32, like a solid face's: the position and texture as before, then the light of the
  plant's own cell (its value's `LIGHT_BITS` in the mesher's input, the same for the 4 vertices: a plant is in one
  cell, so no smoothing).
- `x_quads.vert`: the brighter of the sky light's and the block light's brightness (as `cube_solid.vert`), light from no
  direction (no face shading).
- A plant's quad is 96 bytes instead of 48; the meshers' speed didn't change.

## Order of work

1. **Plumbing (done).** Vertex bits, shader, both meshers reading the light bits, measured above. The test light that
   came with it was replaced by the light pass.
2. **Light pass (done).** Region gather, seeds (with the angled sky light), spread, shortcuts; sky tops from the
   height limit; a lamp; measured above.
3. **Edits (done).** Resend the chunks within 7 blocks and under a moved sky top; the client's quick meshes use the
   last light.
4. **The rest of the scene.** Particles, plants (done). Water.
5. **Later.** `u_sun` driven by a day and night cycle.

## Open questions

- **Leaves.** They stop sky light now, like any solid block: a darker forest floor, light spreading in from the edges.
  Taking 1 from it or letting it through are the alternatives.
- **Large high roofs.** Angled light only comes from roof edges within the region (7 blocks), so the ground under a
  roof much wider than that is dark however high the roof is, like a cave.
- **Flat or smooth.** See the measurements above. Smooth costs up to +10% on real terrain; flat is 3..8% faster than
  before lighting.
