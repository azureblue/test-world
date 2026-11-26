# World saving and multiple worlds

Status: steps 1..4 done (chunks saved whole with a block palette, IndexedDB, the world record, format versions, the
world menu and the game's menu); the water flow state and the generator snapshot next. See "Done" at the end.

## Goal

Save a world and come back to it, and keep several worlds. The game changes all the time meanwhile: the generators,
the blocks in `blocks.json`, the block value's bits, the water rules. A saved world must still load and look the
same where it was played, without keeping old versions of the code in the repository.

## How Minecraft does it

- **Generated chunks are saved whole**, edited or not. The generator only runs for chunks that never existed, so
  changing it doesn't touch what was played; new ground next to old shows a seam (since 1.18 the new terrain is
  blended into the old chunks' heights at the border). Old generator code is never run.
- **Every saved thing has a `DataVersion`**, and data older than the game goes through a chain of conversions
  (DataFixerUpper), one per format change. The largest was 1.13's Flattening: numeric ids and 4-bit variants
  became names with properties (`minecraft:birch_log[axis=y]`).
- **No global block ids in the save**: each 16³ section stores a palette of block states by name and an index per
  block, so adding, removing or renumbering blocks doesn't affect saves.
- **Game logic isn't versioned**: the state that matters is in the blocks (water level, waterlogged, a door open),
  and new rules continue from it. Downgrading isn't supported.

## Where things are now

- The world worker owns the world (`src/worker/worldWorker.js`): `ChunkDataLoader` (`src/chunk/chunk.js`) generates
  chunks on demand, keeps a cache of the last ~800, and keeps every edit (`#edits`, chunk key → cell → block value),
  applied again on top of each new generation of the chunk. The flowing water's changes are edits too.
- The generator is chosen by name and seed (`Settings.world.generator`, `Settings.world.seed`, from the URL), made
  by `ChunkGeneratorFactory.createForName` (`src/gen/registry.js`), which also takes the path of a module whose
  `world(seed)` returns a generator (the test scenes).
- A block value (`src/blocks.js`): bits 0..15 the id (from `blocks.json`), bit 16 cutout, bits 24..26 the height
  (water levels), bit 27 flowing, bit 29 x-quads, bit 30 liquid, bit 31 solid cube. The id and the water bits are
  state; the model and cutout bits follow from the id's definition.
- Not saved state: the light (computed from the blocks), the sky tops (likewise), the meshes. The water flow's
  scheduled cells are state (`docs/proposals/water-flow.md`, next step 3).

So edits are a diff over a generator that must produce the same blocks forever. Any change to the generator moves
the ground under the edits: a dug tunnel opens into the air, placed blocks float.

## Design

### 1. Chunks saved whole

A chunk that differs from what was generated (an edit, flowing water) is saved whole, not as a list of edits; a
chunk that doesn't is generated again on load. Whatever the generator does later, edited places stay exactly as
they were; at worst a seam shows at the border of the edited area (none with the generator snapshot, below).

A chunk on disk: a palette and indices.

- **Palette:** the distinct block states in the chunk, each a block name (`"ROCK"`, `"WATER"`) and its state bits
  (height, flowing, liquid for a plant in water). Not the model or cutout bits: those come from the current
  definition when loading.
- **Indices:** 32³ cells, one byte each (two when the palette has more than 256 entries, which a 32³ chunk could),
  compressed with the browser's `CompressionStream("deflate")`. Mostly air, rock or water: a few KB per chunk.

Loading maps each palette name to the current id; a name that no longer exists becomes a fallback block (rock, or
empty for a plant) and is reported once. Renaming a block is a conversion step (4).

This replaces `ChunkDataLoader`'s edit list as the record of what changed: a chunk with edits is marked dirty and
written whole; a saved chunk is loaded instead of generated, and the generator isn't run for it.

### 2. Storage: IndexedDB in the world worker

The world worker owns the blocks, so it writes them (IndexedDB works in workers, and nothing has to cross to the
main thread). One database, three stores:

- `worlds`: per world its id, name, seed, generator (name and parameters, or a snapshot hash, 5), format version,
  created and last played, the player (position, direction, flying), the item bar.
- `chunks`: key `[worldId, cx, cy, cz]`, the chunk (1).
- `generators`: key the snapshot's content hash, the snapshot (5); shared by the worlds made with it.

Saving: dirty chunks written in the background, a few per tick (the same budget idea as the water's updates), the
player every few seconds, everything left on `pagehide`. Writes are transactions, so a crash leaves the last
complete state.

Deleting a world deletes its record and its chunks, and a generator snapshot no world uses any more.

### 3. Several worlds

A world list before the game starts: create (name, seed, generator), open, rename, delete. `?world.id=...` opens a
world directly, as the URL settings do now; without it the game starts a throwaway world, as now, unsaved (tests,
benchmarks and the scenes keep working).

### 4. Format version and conversions

The world record holds `formatVersion`. Each change to what's saved (a block renamed, a state bit moved, a new field)
gets a number and a conversion function from the version before; loading older data runs the chain, a chunk at a
time when it's read (or all at once, "optimize world"). Newer data than the game refuses to load, as Minecraft.

Most changes need no conversion: new blocks, new rules, a different generator. Conversions are for the saved form
only, and there are few of them.

### 5. The generator in the save (beyond Minecraft)

Saving whole chunks keeps what was played. Ground not yet visited is still made by the current generator, so it
doesn't match the old ground at the border. Because the generators here change often, a world could keep its own
generator instead:

- **Snapshot:** when a world is created, the generator module and everything it imports, as files (path → source),
  and the WebAssembly modules they load (`opensimplex2.js`). The climate generator is 23 files, about 190 KB of
  source (with `blocks.json`, the noise, the curves, the tree builder). Stored by content hash, so worlds made with
  the same code share it.
- **Loading:** in the generator worker, each file becomes a blob URL with its relative imports rewritten to the
  other files' blob URLs (a blob URL has no folder to resolve them against), in dependency order; then `world(seed)`
  through the module hook `createForName` already has. About 50 lines, no build step.
- **The boundary:** the snapshot also imports engine code (`chunk.js`, `blocks.js`): the chunk data class, the
  chunk size, the block value's bits as they were. What it returns is converted at one place: block values to
  (name, state) through the snapshot's own `blocks.json`, then to the current ids and bits as in (1). This boundary
  (a chunk of block values of the snapshot's `blocks.js` layout, 32³) is what must stay stable; if the chunk size
  ever changes, snapshots made before can't be used, and those worlds go on with the current generator (seams).
- **Choice per world:** "keep the generator" (default) or "update to the current generator" (seams at the border,
  like Minecraft). A newly created world always takes the current one.

Problems:

- **Code from a save file runs** in the generator worker: no access to the page, but to the network. Fine for the
  player's own saves; a world from someone else asks before running its generator (or uses the current one).
- **Browsers differ in the last bit of `Math.sin`, `Math.exp`, `Math.pow`**, which the generators use (basic
  arithmetic is exact everywhere). The same snapshot can give terrain one block different at a threshold in another
  browser. Saved chunks (1) don't depend on it; only the border to new ground might show a seam.
- **Fixes to a generator don't reach old worlds** (that's the point; "update to the current generator" is there for
  when they should).

### 6. Water flow state

The water's scheduled and waiting cells (`WaterFlow`) saved with the world, so water flowing when the game was left
goes on flowing. Without it, it stops where it is until something next to it changes. A list of cells with their
tick; small.

## Order of work

1. Chunk serialization (palette and indices, compressed) and its round trip test against the block values.
2. IndexedDB stores and the world record; the world worker saves dirty chunks and loads saved ones instead of
   generating them; the player. One world, opened with `?world.id=`.
3. The format version, with an empty conversion chain and a test conversion.
4. The world list (create, open, rename, delete).
5. Water flow state.
6. The generator snapshot: collecting the module graph, loading it from blob URLs, the boundary conversion, the
   per-world choice.

Steps 1..4 make saving work and survive changes to blocks and generators (with seams); 6 removes the seams.

## Open questions

- Save chunks that were only generated (visited, never edited), as Minecraft does? Without the generator snapshot it
  moves the seams to the edge of what was seen instead of the edge of what was edited, for more storage (a few KB
  per chunk, the render range alone is ~2100 chunks). With the snapshot it isn't needed.
- Where the world list lives: a page of its own before the game (simplest), or an overlay in the game.
- Export and import of a world as a file (a zip of the records), to back up or share; sharing is where running a
  saved generator needs asking first.

## Done (steps 1..4)

- **The world record** (`src/save/worldInfo.js`, `WorldInfo`): id, name, seed, generator, format version, created,
  last played, the player (feet position, yaw and pitch, walk or fly, noclip, the item bar's slot; null until the
  first save, then the game starts at `Settings.camera.startPosition`).
- **Chunks** (`src/save/chunkCodec.js`): a palette of block name and state (`blockState` in `src/blocks.js`: the
  water bits) and runs of palette indices (run-length encoded, not deflated: `ChunkDataLoader` works synchronously,
  and the browser's `DecompressionStream` doesn't), the chunk's highest solid block. About 1.4 KB per chunk of the
  climate world. A name that isn't a block any more becomes rock, or water with its state if it had water, and is
  logged once.
- **In memory** (`src/save/savedChunks.js`): a world's saved chunks are read when it's opened and kept in their saved
  form; `ChunkDataLoader` takes a chunk from there instead of generating it (`ChunkStore`), and its changed chunks
  go back there whole (`saveChanged`), their edit lists dropped. The sky light's scan of a saved chunk's columns
  starts at its highest solid block (`SkyTops.onBlockChanged` when the world is opened), not only at the generator's
  surface.
- **Storage** (`src/save/worldStore.js`): IndexedDB `test-world`, stores `worlds` (records) and `chunks`
  (`[world id, cx, cy, cz]`). The world worker writes the chunks when the page asks (`WorldSave`, answered by
  `WorldSaved`), the page the record, both from the menu (save, save and quit). With `Settings.world.saveInterval`
  above 0 (seconds; the default 0 is off) also that often and on `pagehide`, the worker only the chunks that
  changed; without it, leaving the page without the menu loses what wasn't saved.
- **Format version** (`src/save/format.js`): `FORMAT_VERSION` 1 in the record and in every chunk, `CONVERSIONS` empty;
  data from a newer version isn't read (the world list leaves such a world out, a chunk throws).
- **Opening a world** loads the page with `?world.id=...` (`worldUrl` in `src/menu/worldMenu.js`): the settings, the
  workers and the world worker's world all start from the URL. The world worker reads the record for the generator
  and the seed (`Settings.world.generator` and `seed` are only for worlds that aren't saved).
- **The world menu** (`src/menu/worldMenu.js`), before the game when there's no `world.id`: a new world (name,
  generator, seed: "Create and play", or "Play without saving" with that generator and seed), the saved worlds
  (play, rename, delete). `?world.menu=false` skips it (the browser tests do); a `world.id` that doesn't exist shows
  the menu with a message.
- **The game's menu** (`src/menu/gameMenu.js`): Esc releases the mouse and shows it, the game paused: back to the
  game, save, save and quit to the worlds.
- Tests: `test/unit/worldSave.test.mjs` (round trip over generated chunks, states, unknown names, newer versions, a
  world saved and opened again through `ChunkDataLoader`). IndexedDB and the menus run only in the browser.
