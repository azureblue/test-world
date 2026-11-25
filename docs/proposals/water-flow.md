# Water flow

Status: done: water levels, source and flowing water like Minecraft's (`src/world/waterFlow.js`, run by the world
worker `src/worker/worldWorker.js`, `Settings.water.flow`). Further ideas under Next.

## Done: water levels in the block data

- The block value has a height field, bits 24..26, in 1/8 of a block (0 meaning full), for water levels and later
  slabs (`blockHeight` / `withHeight` in `src/blocks.js`, `block_height` in `src/mesh/cpp/blocks.hpp`).
- The generator makes the sea's top cell 7/8 (`WATER_SURFACE_LEVEL`) and the water below it full.
- The mesher draws water from the level: the top face at the level (hidden only for full water under water or a
  solid block), the bottom face unless below is solid or full water, side faces from the height the neighbour covers
  up to the level (a strip next to lower water, nothing next to a solid block or water at least as high). The face
  data keeps the level and the side face's bottom, so only matching faces merge.
- `World.isInWater` and the player's swimming read the level of the cell.
- Plants can be in water: the plant's block value with the liquid bit and the water level (`flooded` in
  `src/blocks.js`). Everything that checks the liquid bit treats it as water (flow, swimming, the mesher's water
  faces, which are drawn around it like around water, with the plant inside). The generator keeps plants below the
  sea level in the water; flowing water floods plant cells and keeps the plant. Removing a plant in water leaves its
  water (`removed`).

## Done: flow with levels (like Minecraft's)

- **Source and flowing water.** Generated and placed water is a source: it never drains. Its level depends only on
  what's above it: 7/8 under air or a plant (an open surface), full under anything else (water, a block), so water
  under a ceiling or a block placed on a lake touches it. (Minecraft leaves a gap under a block; here the rules that
  made sources used to disagree: 7/8 or full under the same ceiling, depending on how the water got there.) Flowing
  water has the flowing bit (block bit 27).
- **Flowing water is computed from the neighbours**, again whenever they change (`#flowingState`):
  - under water (falling): full;
  - beside water that spreads sideways: the highest level they give. A source or a falling column gives 6/8,
    flowing water one less than its own, so water reaches 6 blocks from a source. Flowing water spreads sideways only
    resting on solid ground: a falling column doesn't spread before it lands, nor over a lake it falls into;
  - nothing feeding it: it drains step by step (a plant in it stays).
- **New sources:** a cell between two or more sources, on solid ground or a source, becomes a source (Minecraft's
  rule), so a hole dug in a lake fills up for good. A hole dug next to a lake gets a curtain of falling water along
  the lake and flowing water on its floor, as in Minecraft. (A rule making water seek its level, filling such holes
  up to the surface, was tried and dropped: it only worked next to deep water, not at beaches, which made it hard to
  predict.)
- **Pressure** (not in Minecraft): a covered cell (a block or a source above it) next to a full source (one under
  the surface), resting on solid ground, a source or water lying on solid ground, becomes a full source, so a tunnel
  dug under a lake fills up all the way instead of staying dry beyond 6 blocks. It spreads cell by cell; it can't
  rise above the surface (surface sources are 7/8, not full) nor fill anything open to the sky, so the curtain
  above stays. The water stays when the tunnel is sealed later. Resting matters for caves: a tunnel coming out in
  a cave's wall level with its ceiling used to spread pressure along the ceiling over the air, a hanging layer of
  sources, and flood the whole cave; now it pours in as a waterfall with flowing water on the floor. (Resting on
  water lying on solid ground, not on any water: a tunnel's bottom row, flowing water on the floor, holds up its
  top row; water spreading from a source into the air under a cave's ceiling doesn't.)
  Pressure also comes from above: a cell under a full source becomes a full source, so a shaft dug down through a
  lake's floor fills with sources and tunnels from it fill as well. (With falling water there, a cell beside the
  shaft stayed dry and tunnels from its bottom got flowing 6/8 water under the rock.) Under a lake only the 7/8
  surface deep, a shaft keeps falling water, as in Minecraft.
- **Waking:** a change wakes the cell, the cells above, below and beside it, and beside the cell above (whether water
  there spreads depends on what it rests on). Woken cells are updated `interval` seconds later (rounded to ticks); at
  most `maxUpdatesPerTick` per tick, the rest in order in the next tick.
- **Chunks:** the simulated range is the client's load range. A block outside reads as solid, and the cell reading it
  waits; when the range moves there (`resumeWaiting`), the cell and its neighbours are updated again.
- Changed chunks are sent with their optimized mesh at most every `Settings.world.chunkUpdateInterval` per chunk.

### Ready for multiplayer

- Runs on simulation ticks with the tick number, not on frames or wall time.
- Deterministic: cells are updated in the order they were woken, no randomness.
- Reads and writes the world only through `BlockAccess` (`blockAt`, `setBlock`, `isLoaded`, chunk space), which a
  server's world can implement.
- Its output is ordinary block edits, sent as chunk updates. The client doesn't run the flow.

## Next

1. **Looks of flowing water:** sloped surfaces (corner heights from the neighbours' levels) and a moving texture in
   the flow direction, so flowing sheets and falling curtains read as water running, not as blocks. Faster flowing
   downhill.
2. **Cost of chunk updates:** each update rebuilds the chunk's extended data and greedy mesh (a few ms); a large flood
   front keeps the worker busy. Per-step budgets, or meshing in mesher workers (worker pipeline step 4).
3. **Persisting the flow state** (scheduled and waiting cells) with the world, once the world is saved.
4. **Server:** the world worker's role; its client protocol (requests, edits with seq, chunk snapshots with
   editAck) is what a network server would speak.
