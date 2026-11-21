# Lighting: sky and block light, 8 levels

Status: step 1 (plumbing) done for both meshers' cube faces; the light pass next.

## Goal

Two kinds of light, each 8 levels (0..7, 3 bits). Caves and anything under an overhang go dark. Blocks like a lamp
can emit light.

- **Sky light:** 7 in every cell open to the sky straight up. Elsewhere it is the neighbours' light minus 1.
- **Block light:** a light block's own level, spreading out the same way, minus 1 per block.

A face's brightness is `max(sky * sun, block)`. `sun` is a uniform, which leaves room for day and night later.

8 levels means light reaches at most 7 blocks. That is what keeps the design below small: a chunk's light depends only
on the blocks within 7 of it.

## Where the light comes from: computed per chunk, not stored

There is no persistent light storage and there are no incremental updates across chunks. When the world worker builds a
chunk's mesh, it first computes that chunk's light from scratch:

1. **Region.** Take the blocks of the chunk plus a 7-block margin: 46³. The loader already caches the 27 neighbours, so
   it can supply them. Only opacity and emission are needed (1 byte per cell), not the full block values.
2. **Seeds.**
   - Sky 7 in every cell above its column's sky top (below).
   - Angled sky light under overhangs (see Shadows under overhangs).
   - Block light at the emitters' levels (`light` in `blocks.json`).
3. **Spread.** A spread over the region, highest light first, minus 1 per step (2 sideways under a block, for sky
   light). Opaque cells stop it.
4. **Write.** Put the inner 34³ result (the mesher's input, border included) into the mesher's input block values,
   in WASM memory, in the bits Meshing describes. Solid cells stay 0.

Shortcuts for the common cases:

- A chunk entirely above every sky top in its region, with no emitters: all sky 7, nothing to write (0 is full sky
  light).
- A chunk entirely below every sky top, with no emitters within 7 blocks: all 0, no BFS.

Only surface chunks and lit caves pay for the BFS.

Lighting is its own WASM pass, run before meshing. The fast mesher only reads the result (see Meshing).

### Shadows under overhangs

With sky light only straight down and a plain spread, a roof's height doesn't matter: the light walks in along the
floor from the open column beside it, so a beam 1 block up and one 10 blocks up cast the same shadow. The rules that
fix it, tried with the test light (`fakeSkyLight` in `uIntWasmMesher.js`):

- **Angled sky light.** A cell that sees the sky at 45° (lit diagonally from above, one block to a side, past the
  cell beside it or the one above it) gets sky light by its gap, the open cells from it up to the block above:
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
a **sky top** per block column: the highest block that blocks sky light.

- **From the generator.** Generators are heightmap based and already keep column data (the climate generator's column
  cache: heights, surfaces, trees). Each generator provides `skyTop(x, y)`: the surface, or the top of a tree over it.
  This means chunks above a column never have to be generated just to light it.
- **From edits.** Placing a blocking block above the sky top raises it. Removing the sky-top block scans down to the
  next blocking block, through cached chunks only.

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

Changing a block can change the light of anything within 7 blocks. Today an edit resends the chunks whose bordered data
includes the block. With lighting it resends the chunks within 7 blocks of it: still at most the 27 neighbours, just
more of them in practice.

If the edit moves the column's sky top, the chunks in the columns within 7 blocks are resent too, between the old and
new sky top: the shaft that opened or closed.

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
| 17..19 | Block light. |

- Data without light (all 0) is full sky light, so chunks in the open sky need no writes, and the main mesher (no light
  yet) draws as before.
- Block ids are below `MAX_BLOCK_ID` (1024), so bits 11..15 are 0 in block values. `decode_block_id` masks with
  `MAX_BLOCK_ID - 1`.
- Each field has 2 zero bits above it, so the lights of 4 cells add up with one AND per cell and no unpacking.

**Smooth light per vertex** (`corner_light`):

- A vertex's light is the sum of the face's front cell and the 3 cells around the vertex: the cells AO already reads.
- Solid cells add 0. The shader divides by the open cells, which the vertex's AO value gives: AO 0..2 is the number of
  solid cells, and AO 3 means two solid sides (1 open cell). With two solid sides and an open diagonal, the diagonal's
  light still counts, which makes such a corner a little brighter or darker, clamped. That's a vertex AO already draws
  darkest.

**Vertex bits.** For solid faces, the sums go to bits 21..25 (sky darkness) and 27..31 (block light) of the position
word, which were free.

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
  scans over empty layers no longer fit the L1 cache. Instead there are two 32-bit arrays at the same indices:
  - **The face** (`LAYER_*` in `uIntWasmMesher.cpp`): AO 0..7, texture + 1 at 8..19 (12 bits, room for more
    textures), then the merge counters, width 20..25 and height 26..31 (1..32 each).
  - **The light:** 8 bits per vertex, corner_light's sums halved to 4 bits each. It's written with every face and
    read only where there is one, so empty layers never touch it and it's never cleared.
- **Precision.** The halved sums lose their lowest bit: half-level steps of the average instead of quarter-level.
- **Checked.** With test light on forest chunks, the area per (texture, direction, corner lights) is equal in both
  meshers: 810 groups, 716 of them lit, none differing. Faces merge only with the same light, and none are lost.
- **Measured** (against the commit before):

  | Set | Change |
  |---|---|
  | Air, solid without faces | −2..+1% |
  | Forest (cutout, no cutout), region2 | +6%, +3%, +4% |
  | Face-heavy patterns | +12..+30% |

  The greedy mesher runs in the world worker, not on the main thread. SIMD (`-msimd128`) gave nothing measurable here,
  so it stays off.

## Shaders

The vertex shader (`cube_solid.vert`) works out the brightness per vertex, and the fragment shader multiplies the
texture by it:

```glsl
float open_cells = shadow == 3u ? 1.0 : 4.0 - float(shadow);
float sky = 7.0 - min(float(sky_darkness_sum) / open_cells, 7.0);
float block = min(float(block_light_sum) / open_cells, 7.0);
float brightness = pow(LIGHT_FALLOFF, 7.0 - max(sky * LIGHT_SUN, block));
```

`Settings.light`:

- `falloff` (0.75): level 0, a cave, is 0.13 of full light.
- `sun` (1).
- `debugFake`: test light until step 2, `?light.debugFake=true`. The mesher wrapper (`fakeSkyLight`) lights each
  chunk's data by the rules above, in JS, from the chunk alone: shadows of blocks in other chunks are missing (seams
  at chunk borders).

These are `#define`s for now. `sun` becomes a uniform with day and night.

## The client

Particles, and later the player's view and held items, need light at a point.

- The chunk response can carry the chunk's 32³ light bytes (32 KB) beside the block data.
- On the client, the light must never get into the block values: `blockAt` results are compared with `EMPTY` and with
  each other.

## Order of work

1. **Plumbing (done).** Vertex bits, shader, both meshers reading the light bits, test light (`light.debugFake`),
   measured above.
2. **Light pass.**
   - Light pass in WASM: region gather, seeds (with the angled sky light), spread, shortcuts.
   - `skyTop` for the generators.
   - A lamp block with `light: 7`.
   - Measure the chunk build time.
3. **Edits.** Resend the chunks within 7 blocks; handle sky-top changes.
4. **The rest of the scene.** Water, x-quads, particles (light in the chunk response).
5. **Later.** `u_sun` driven by a day and night cycle.

## Open questions

- **Leaves.** Do they stop sky light (a darker forest floor, light spreading in from the edges) or take 1 from it, or
  let it through?
- **Flat or smooth.** See the measurements above. Smooth costs up to +10% on real terrain; flat is 3..8% faster than
  before lighting.
