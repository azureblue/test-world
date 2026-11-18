# Water flow

Status: flowing water with fixed levels done (`src/world/waterFlow.js`, run by the world worker
`src/worker/worldWorker.js`, `Settings.water.flow`); levels that drop with distance still to do.

## Done: water levels in the block data

- The block value has a height field, bits 24..26, in 1/8 of a block (0 meaning full), for water levels and later
  slabs (`blockHeight` / `withHeight` in `src/blocks.js`, `block_height` in `src/mesh/cpp/blocks.hpp`).
- The generator makes the sea's top cell 7/8 (`WATER_SURFACE_LEVEL`) and the water below it full. So water under a
  block placed at the surface stays 7/8 with its surface visible, and water under a block deep down stays full.
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

## Done: flow

- Runs in the world worker, which owns the world (see [worker pipeline](worker-pipeline.md), block edits). Its
  edits are applied there like the client's, and the client sees them in chunk updates.
- A block change wakes the changed cell and the water above and beside it (`WorldState.setBlock` →
  `WaterFlow.onBlockChanged`). Generated water stays still until then.
- Woken water flows one step `interval` seconds later (rounded to simulation ticks): into the empty cell below as
  full water, or, if the cell below isn't empty, into the empty cells beside it at its own level (full water spreads
  full, surface water 7/8). Water with a lower level fills up to full when water is above it. New water cells are
  block changes too, so the flow goes on from them; a change wakes the water above, below and beside it.
- At most `maxUpdatesPerTick` cells per tick; the rest move to the next tick, in order.
- The simulated range is the client's load range; water in a chunk outside it, or flowing into one, waits until the
  range moves there (`resumeWaiting`).
- Changed chunks are sent with their optimized mesh at most every `Settings.world.chunkUpdateInterval` per chunk.

Levels don't drop with distance yet, so water fills everything connected to it at or below its height, and spreads
without end over open ground. Placed water is full, so water placed on the sea's surface spreads a full layer over
it.

### Ready for multiplayer

- Runs on simulation ticks with the tick number, not on frames or wall time.
- Deterministic: cells are updated in the order they were woken, no randomness.
- Reads and writes the world only through `BlockAccess` (`blockAt`, `setBlock`, `isLoaded`, chunk space), which a
  server's world can implement.
- Its output is ordinary block edits, sent as chunk updates. The client doesn't run the flow.

## Next

1. **Levels that drop.** Spreading sideways lowers the level, source blocks keep theirs, water without a source
   drains. This bounds the spread. The block height field and the mesher already handle any level 1..8.
2. **Falling water** as its own state, so a falling column doesn't spread sideways at every height.
3. **Cost of chunk updates:** each update rebuilds the chunk's extended data and greedy mesh (a few ms); a large flood
   front keeps the worker busy. Per-step budgets, or meshing in mesher workers (worker pipeline step 4).
4. **Persisting the flow state** (scheduled and waiting cells) with the world, once the world is saved.
5. **Server:** the world worker's role; its client protocol (requests, edits with seq, chunk snapshots with
   editAck) is what a network server would speak.
