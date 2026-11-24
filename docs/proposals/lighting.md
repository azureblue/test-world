# Lighting: sky light and block light, 16 levels each

Status: steps 1 (plumbing) and 2 (the light pass, with edits) done for the cubes' faces, plants and particles; water next.

## Goal

Two kinds of light, 16 levels each (0..15, 4 bits). Caves and anything under an overhang go dark. Blocks like a lamp
can emit light. As in Minecraft, with as few rules as possible:

- **Sky light:** 15 in every cell open to the sky straight up, however deep. Elsewhere it spreads from there, 1 level
  less per block (it reaches 15 blocks), a sideways step into a cell under a block twice that.
- **Block light:** a light block's own level in the open cells next to it (a lamp is solid; its faces are as bright as
  it), spreading out 1 level less per block. A level 15 lamp: 15 next to it, then 14, 13, ... 1 fifteen blocks away.

A face's brightness is the brighter of the sky light's (times `sun`) and the block light's, with the sun's face
shading only for direct sky light. `sun` is a uniform, which leaves room for day and night later.

Light reaches at most 15 blocks. That is what keeps the design below small: a chunk's light depends only on the blocks
that close to it.

**How far light reaches is what it costs.** Here light is computed per chunk from the blocks around it, so how far
light travels is how far around each chunk the pass reads:
- Block light reaching 15 blocks costs only near emitters, which are rare: its pass runs only when a chunk or a
  neighbour has one. With 8 levels a lamp lit too small a room, and two lamps 6 apart left a dark band between them
  (light takes the brighter level, it doesn't add).
- Sky light reaching 15 blocks (a 62³ region) instead of 7 (46³, the sky light losing 2 levels a block): the light
  pass went from 0.44 to 1.14 ms per chunk on climate terrain, against about 21 ms to generate one, so loading costs
  about 3% more. An edit that changes the light resends the chunks within 15 blocks, so most edits reach the
  neighbours (about 1.7 ms each, light and mesh, spread over frames). The meshers don't change: the light they read is
  the same size. Caves get light twice as deep, shadows under beams are softer.
Minecraft stores light and updates it incrementally, so its reach costs nothing when meshing; that's a bigger change.

## Where the light comes from: computed per chunk, not stored

There is no persistent light storage and there are no incremental updates across chunks. When the world worker builds a
chunk's mesh, it first computes that chunk's light from scratch:

1. **Region.** Take the blocks of the chunk plus a 15-block margin: 62³ (`LIGHT_MARGIN`). Near emitters, the block
   light's too (`BLOCK_LIGHT_MARGIN`, the same size, gathered again). The loader already caches the 27 neighbours, so it
   can supply them. Only opacity and emission are needed (1 byte per cell), not the full block values.
2. **Seeds.**
   - Sky 15 in every cell above its column's sky top (below).
   - Block light at the emitters' levels (`light` in `blocks.json`, 0..15), in the open cells next to them.
3. **Spread.** A spread over the region, highest light first, 1 level less per block for block light, 2 for sky light
   (twice that sideways under a block), rounded out (below). Opaque cells stop it.
4. **Write.** Put the inner 34³ result (the mesher's input, border included) into the mesher's input block values,
   in WASM memory, in the bits Meshing describes. Solid cells stay 0.

Shortcuts for the common cases:

- A chunk entirely above every sky top in its region, with no emitters: all sky 15, nothing to write (0 is full sky
  light).
- A chunk entirely below every sky top, with no emitters within 15 blocks: all 0, no BFS.

Only surface chunks and lit caves pay for the spread.

Lighting is its own WASM pass, run before meshing. The fast mesher only reads the result (see Meshing).

**As built** (`world/lighting.js`, `mesh/cpp/light.cpp`):

- **Gathering in JS.** The region's cells come from the loader's 27 chunks, one byte each: bit 0 solid, bits 1..4 the
  light given. The sky tops become, per region column, the lowest height that sees the sky straight up.
- **The pass in WASM.** `compute` seeds the sky light and spreads it highest first with a list
  per level. `compute_block`, only near emitters, spreads the block light over its own 62³ region a level at a time
  (each cell is set once: its light is final when set) and adds it. The output is a byte per cell of the mesher's
  input: bits 0..2 the sky darkness, 3..6 the block light. The mesher wrapper ORs it into its input bits.
- **Emitters.** Whether a chunk has a block giving light is looked up once (a scan of its data) and kept per chunk;
  edits update it. The block light pass runs when the chunk or one of its 26 neighbours has one (15 blocks fit in a
  neighbour).
- **Measured** (block light): in a rock world with a tunnel, 0.78 ms per chunk without a lamp, 1.44 ms in the chunks
  around one (mostly gathering 62³ cells in JS).
- **Open sky cells don't spread** unless a column beside them is covered at their height (a diagonal neighbour is
  reached from the face neighbours between too). Without
  this, an air chunk queued 100,000 cells.
- **Shortcuts.** Every region column sees the sky from the region's bottom: there's no solid block, so no sky light to
  compute (checked from the sky tops alone, before gathering); with no emitter near either, nothing at all. And when
  the chunk with its border is all solid, there's nothing to light.
- **Measured** on climate terrain, per chunk: surface 1.07 ms, underground 0.85 ms, air 0.02 ms (meshing is about
  0.55 ms, generating about 20 ms). In a surface chunk about 0.58 ms is the JS gathering and the rest the pass.
- **The client gets the light** with each chunk (`ChunkResponse.light`, 39 KB transferred). The quick meshes of its
  own edits use it until the world worker's update, so an edit in a dark place doesn't flash lit. An edited cell gets
  a guess (`ChunkEditor`): 0 for a solid block; for an open one, its brightest open neighbour's light less a block's spread. A chunk
  sent without light (null: open sky, or all solid) gets its own array on its first edit. Without the guess, a cell
  just dug read as full sky light, and digging into an all-solid chunk lit the whole hole until the update.

### Round spread

Steps to the 6 face neighbours only make light fall off with |dx| + |dy| + |dz|: equal light on diamonds, plain to see
on a floor around a lamp or a doorway. So light also steps to the 12 edge neighbours (diagonals in a plane), and is
spread in thirds of a level: a face step costs 3, an edge step 4 (about √2 × 3), a sideways step under a block twice
that for sky light. That's within 6% of the real distance in
a plane, so light spreads in near circles.

- An edge step needs both cells beside the way open: no light between two blocks that touch at an edge.
- Corner (3 axis) steps are left out: a vertical diagonal plus a face step gets there, a little long (about 2.3
  against 1.7).
- The output is the level rounded up. A lamp's light 4, 4, 2 blocks away went from 6 (9 face steps) to 9.
- The light lists are a ring of slots (more than the dearest step) instead of one per value, since there are 46.
  Seeds are sorted by light first and added as their value comes up.
- **Cost:** 0.44 → 0.55 ms per chunk on climate terrain (light pass alone).

### Sky rules tried and dropped

Plain Minecraft rules (full sky light straight down, spread) make a roof's height not matter, a 1 block hole send a
column of full light to the floor, and a window fade into a room. Each special rule added for these broke something
else, so they were dropped for the plain ones, with 16 sky levels for the finer steps:

- **Angled sky light** (a cell seeing the sky at 45° got light by its gap to the block above: 5 under a block, 6 for 2..5,
  7 from 6, passed on straight down, at most 4 diagonal steps): high beams cast no shadow. But in a tall room it took
  the light of a 1 block hole or a window and made full light of it, passed down to the floor: a sheet of light down
  the wall under a window.
- **Narrow openings** (full sky only where at most 2 of a cell's 4 sides were solid or under a roof): a 1 block roof
  hole gave a little light, but at 3 × 3 the light suddenly streamed to the floor, and a double window (2 high) still
  lit the floor while a double roof hole didn't.
- **A window rule** (a cell with blocks on 2 sides gets angled light but doesn't pass it on): one more special case.
- **Sky view** (each cell's light the average of the cells above it, 5 or 3 × 3): one rule for all of it, smooth in a
  hole's size, but everything tall darkened the ground at its foot, and with 8 levels a 1 and a 2 block gap came out
  the same.
- **Sky visibility** (each cell checked 25 directions toward the sky and took the share it sees): an object blocked
  only the directions pointing at it, so a pillar's shadow had lobes; directions along an axis hit a long beam at any
  height; directions running far made blotches and need far more data around a chunk.

Under a long strip, the sky light under its middle (of 15):

| Width | Gap 1 | Gap 2 | Gap 7 |
|---|---|---|---|
| 1 | 13 | 14 | 14 |
| 3 | 11 | 13 | 13 |

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

Changing a block can change the light of anything within 15 blocks (`LIGHT_MARGIN`). An edit always resends the
chunks whose bordered data includes the block. When it changes the light (solid or not, or the light given), it
resends the chunks within 15 blocks of it (`Lighting.marginAt`): still at most the 27 neighbours, just more of them in practice. Water flow never changes it, so it
causes no extra resends.

If the edit moves the column's sky top, the chunks in the columns within 15 blocks are resent too, between the old and
new sky top (the shaft that opened or closed), only those in the simulated range.

Resends already go through `sendChanged`, with its per-chunk interval, so a burst of edits stays bounded.

## Multiplayer: an edit far away opens or closes a shaft

Light is never stored, so it can't go stale:

- **The sky tops and water surfaces live on the server.** The world worker updates them on every edit, wherever it
  is. The client that made the edit has that chunk loaded, so the server has it too.
- **The server resends only chunks some client keeps.** The affected chunks are those within 15 blocks of the column,
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
| 10..13 | Sky darkness: 15 − sky light. |
| 17..20 | Block light. |

- Data without light (all 0) is full sky light, so chunks in the open sky need no writes, and the main mesher (no light
  yet) draws as before.
- Block ids are below `MAX_BLOCK_ID` (1024), so bits 10..15 are 0 in block values (16 is the cutout bit).
  `decode_block_id` masks with `MAX_BLOCK_ID - 1`.
- Each field has 2 zero bits above it, so the lights of 4 cells add up with one AND per cell and no unpacking: the
  sums in 10..15 and 17..22 (up to 60 each).
- The light pass's output byte: bits 0..3 the sky darkness, 4..7 the block light.

**Smooth light per vertex** (`corner_light`):

- A vertex's light is the sum of the face's front cell and the 3 cells around the vertex: the cells AO already reads.
- Solid cells add 0. The shader divides by the open cells, which the vertex's AO value gives: AO 0..2 is the number of
  solid cells, and AO 3 means two solid sides (1 open cell).
- With two solid sides the diagonal cell is behind a wall corner, so its light is left out and the vertex has the
  front cell's alone. Counting it leaked light around corners, a lamp's or the sky's from the other side (seen in a
  dug tunnel). It's a mask in `corner_light`, no branch: no measurable cost.

**Vertex bits.** For solid faces, the position word is x, y, z in 6 bits each (0..32; they were 7), then the sums:
bits 18..23 sky darkness, 24..29 block light (30, 31 free).

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
  - **The light**, 64 bits: 12 bits per vertex, corner_light's sums whole (the same values as the fast mesher). It's
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
float sky = 15.0 - min(float(sky_darkness_sum) / open_cells, 15.0);
float block = min(float(block_light_sum) / open_cells, 15.0);
v_light = vec3(pow(LIGHT_FALLOFF, (15.0 - sky * LIGHT_SUN) * (7.0 / 15.0)), block_brightness(block), sky / 15.0);
```

Sky light goes from `LIGHT_FALLOFF`⁷ at level 0 (as dark as block light 0) to 1 at 15, by the same factor a level. Block light follows Minecraft's lightmap curve, bright near the source
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
- Sky light moves from the sun shading at level 15 to the flat shading at level 0, linearly. Daylight looks the same
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
2. **Light pass (done).** Region gather, seeds, spread, shortcuts; sky tops from the
   height limit; a lamp; measured above.
3. **Edits (done).** Resend the chunks within 15 blocks and under a moved sky top; the client's quick meshes use the
   last light.
4. **The rest of the scene.** Particles, plants (done). Water.
5. **Later.** `u_sun` driven by a day and night cycle.

## Open questions

- **Leaves.** They stop sky light now, like any solid block: a darker forest floor, light spreading in from the edges.
  Taking 1 from it or letting it through are the alternatives.
- **Large high roofs.** Sky light only spreads 15 blocks in from a roof's edge, so the ground under a roof much wider
  than that is dark however high the roof is, like a cave.
- **Flat or smooth.** See the measurements above. Smooth costs up to +10% on real terrain; flat is 3..8% faster than
  before lighting.
