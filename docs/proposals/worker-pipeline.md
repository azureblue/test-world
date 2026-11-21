# Worker pipeline: world worker as coordinator

Status: proposed, partly done. Done so far:

- the connection protocol (`src/worker/worker.js`, `src/worker/common.js`) with the fixes listed below;
- the generator and mesher workers (`src/worker/generatorWorker.js`, `mesherWorker.js`) ported to it
  (not used yet, ready for the coordinator);
- scheduling: request ids, nearest chunk first, out-of-range requests dropped
  (see [Chunk loading scheduler](#chunk-loading-scheduler-done));
- the world worker (`src/worker/worldWorker.js`, formerly the chunk loader) owns the world: block data with all
  edits, the simulation (flowing water), chunk updates after changes; the main thread predicts its own edits
  (see [Block edits](#block-edits-done)). Still single threaded inside.

The coordinator from design B was never ported to the current protocol; its code was removed and is in git
history (commit `96ca241`).

## Goals

- **A world worker owns the world state.** The main thread only renders: it sends the camera position and gets
  back chunk meshes (and chunk data where it needs it, for example for the raycast).
- **Multiplayer:** the world worker sends and receives network events (block edits, players, server chunks)
  asynchronously, without blocking rendering. Workers can open a `WebSocket` directly.
- **Parallel chunk loading** on several cores, each chunk generated only once.
- **Nearest chunks first**, also while moving, and no work wasted on chunks that left the range.
- **Remeshing after edits** (from the player or the network) in the same pipeline.

## History

All three designs touch commit `96ca241 new worker system` (2026-03-31).

**A: before (January to March 2026).** Four independent `chunkLoader` workers, requests sent to them in turn.
Each worker generated its chunk plus up to 26 neighbours (for the border data) and meshed it, with its own
block cache, so neighbour chunks were generated again and again by different workers.

**B: coordinator (started, never finished).** `worldWorker.js` with a shared block cache, asking
`generatorWorker.js` for missing chunks and `mesherWorker.js` for meshes. This is the intended architecture,
but it was written against an older handshake (`WorkerReadyResponse`, `ConnectionPortRequest`,
`ConnectionPortResponse`). Those classes were replaced by the current protocol and the three workers were never
ported, so they failed to load (missing named imports). `mesherWorker.js` also used the old `UIntWasmMesher`
name and meshed every chunk twice (a stray `new UIntWasmMesher().createMesh(...)` before the timed call).

**C: current.** The general connection protocol below, and one `chunkLoader` worker that generates, collects
neighbours and meshes. It originally handled requests one at a time in arrival order, which fell behind when
flying fast; it now has the scheduler described below. Chunk loading still uses only one CPU core.

### Lessons from B

1. **Unlimited requests in progress.** `World` requests all ~2100 chunks in range at once. The world worker
   started an `async` handler for every request immediately, and each waited for up to 27 neighbours, one after
   another. That queued thousands of generate requests in one generator worker in arrival order. A mesh was
   only built when all its neighbours had arrived, so for a long time nothing appeared, and then chunks
   appeared in nearly random order instead of nearest first.
2. **Little parallelism.** One generator worker and one mesher worker use at most about 2 cores.
3. **One copy.** Messages use transfer lists, so they are zero-copy. The one real copy was explicit: the border
   data was copied (`dataCopy`) before transferring it to the mesher, because it also had to be sent to the main
   thread afterwards and a transferred buffer is detached. Avoid it by having the mesher send the border data
   back with the mesh, or by sending the main thread only what it needs.

## Proposed design

```
main thread                      world worker (coordinator)                    workers
-----------                      --------------------------                    -------
camera position  ---------->     chunks in range, priorities
                                 shared block cache (+ column height cache)
                                 scheduler: priority queue,       -- generate -->  generator 1..N
                                 limited requests in progress     <-- blocks ----
                                 border data assembly             -- mesh ------>  mesher 1..M
meshes, chunk data <--------     edits, remesh queue              <-- mesh ------
                                 network (WebSocket)  <-------->  server
```

- **Main thread to world worker:** camera position (or chunk position changes) and player actions.
  World worker to main thread: chunk meshes, chunk data where needed, unload notices.
- **Scheduler in the world worker:**
  - a priority queue ordered by distance to the camera, updated when the camera moves to another chunk;
  - chunks that left the range are removed from the queue, and their results are dropped when they arrive;
  - a limit on requests in progress per worker (for example 2), so the nearest-first order survives and
    workers never sit idle.
- **A chunk becomes ready for meshing** when it and the neighbours it needs (the existing bounds check that
  skips neighbours of empty sides) are in the block cache. The scheduler requests missing neighbours with the
  priority of the chunk that needs them.
- **Generator workers** don't keep any data between requests: chunk position in, block data out. They can run
  in parallel, and there can be as many as `navigator.hardwareConcurrency` allows (minus main and world
  worker). The column height cache from the tree placement proposal either moves into each generator, or
  the world worker sends height tiles along with the request.
- **Mesher workers:** border data in, mesh out (plus the border data back if the main thread needs it).
  The WASM mesher already reuses its memory, so a mesher worker keeps one instance.
- **Edits** (local or from the network) change the block cache in the world worker and put the chunk, plus
  neighbours whose border data changed, into a remesh queue with high priority.
- **Connections:** the world worker creates the other workers and connects to them with `WorkerClient`.
  The main thread connects to the world worker the same way. All data moves with transfer lists.
- **Later, optional:** `SharedArrayBuffer` for the block cache, so meshers read neighbours directly instead of
  receiving assembled border data. Needs COOP/COEP headers on the server.

## The connection protocol (current, keep it)

A worker runs a `WorkerServer` with named endpoints and announces them with `worker_ready`.
`WorkerClient.connect(name)` creates a `MessageChannel`, sends one port in `worker_connect_request`
(with a connection id) and resolves with the other port on `worker_connect_ack` (or rejects on
`worker_connect_reject`). After that, each connection is a private `MessagePort`.

Good parts: named endpoints with a ready announcement, a separate port per connection, and ports can be
handed on, so worker-to-worker connections are possible without going through the main thread. Message classes
carry their transfer lists, so payloads are not copied. This is a good base for the design above.

Fixed (verified in Node with the worker modules connected through `MessageChannel`s):

- **Reject messages.** `WorkerServer` created `WorkerConnectReject(endpointName, connectionId, reason)` while the
  constructor took `(connectionId, reason)`, so the client logged "Unexpected connect reject" and `connect()`
  never settled. The reject message now carries the endpoint name, and `connect()` rejects with the server's reason.
- **Async handler errors.** `chunkLoader`'s handler is `async`, so its failures were unhandled promise rejections the
  server never logged. The server now catches the returned promise, and awaits an async `onConnect` before the ack.
- **`WorkerClient` logging.** The default logger was `{}`, and the client passed strings while `Logger` expects
  functions, so its warnings threw in both cases.
- **`checkType` error message** read `message.data.type` instead of `message.type`.
- **One message class style.** All messages extend `WorkerMessage` with `static toMessage(obj)` (builds the message
  with its transfer list) and `static from(message)` (parses). `ChunkResponse.from(...)` used to build a message
  and `fromMessage` parsed it; now it's `toMessage` / `from` like everywhere else. Positions arrive as `Vec3`.
- `WorkerMessage` had a `static type()` method next to the subclasses' `static get type`; removed.

Still open:

- **No disconnect detection.** `removeConnection` only runs on an explicit `close()`. Matters once the
  world worker restarts workers or handles network reconnects.

## Chunk loading scheduler (done)

In the current `chunkLoader`; the coordinator's scheduler should work the same way.

Problem: flying fast, the single loader worked through a long first-in first-out queue of chunks already left
behind, while the chunks around the camera stayed empty. Also, a chunk that left the range and came back was
requested twice while the first request was still queued; both responses arrived, causing the
"got chunk data, but not dirty" warning and leaking the first mesh.

- **Request ids.** `ChunkRequest`/`ChunkResponse` carry a request id. `World` keeps only the response to the
  newest request per chunk; when a chunk's data is replaced, its old mesh is disposed.
- **Load center and range.** `World` sends `ChunkLoadCenter` (camera chunk and squared render range) when the
  camera enters another chunk, before any new requests. It deletes its entries that are not loaded yet and out of
  range; the loader drops the same requests by the same rule, so no cancel message is needed for them.
  `ChunkCancel` (a batch of request ids) stays for explicit cancels (edits, multiplayer).
- **Nearest first.** The loader keeps requests in a pending map and loads one chunk per step, nearest to the
  latest center first, dropping out-of-range requests in the same scan.
- **Yielding.** Messages are not processed when they arrive, otherwise a new center or a cancel would only be
  read after everything queued before it. The loader yields between steps through a `MessageChannel`
  (a nested `setTimeout(0)` would add at least 4 ms per chunk).
- **Cost.** The scan is brute force: measured 17 µs per step for 2109 pending chunks (render distance 8),
  against 1–3 ms per loaded chunk; 152 µs at distance 16 (17077 chunks). When the render distance grows or the
  coordinator schedules several workers, use a binary heap by distance, rebuilt (and filtered by range) on each
  center change, which happens once per chunk crossed; picks are O(log n), cancels are lazy deletions.

Verified in Node: the real `chunkLoader.js` answers shuffled requests strictly nearest first, a cancel right after
105 requests stopped all 93 cancelled ones, a new center with a range dropped all 198 out-of-range requests;
the real `World` with a fake loader drops exactly the chunks the loader drops by the same rule (1717 of 1717),
re-requests them on return, ignores late responses and leaks no meshes.

## Block edits (done)

`World.setBlock(ix, iy, iz, value)` (the raycast's coordinates too: the game uses the blocks' coordinates everywhere). Left click removes
the block under the crosshair, right click places rock on the face the ray hit (`raycasti` returns the face normal:
the opposite of its last step; none when the camera is inside the block; no block is placed in the camera's cell).
The ray stops at any non-empty block except water (solid blocks, plants as full cubes); the starting cell stops it only
if it's solid. Water can't be selected, placing on a face under water replaces the water cell. Per-block boxes (smaller ones for plants) are still to do.

The world worker owns the world; the main thread is a client that predicts its own edits (the same model a
multiplayer client would use with a server). The messages and rules are described in [World protocol](../world-protocol.md).

- **Main thread (`ChunkEditor`), right away:** update the chunk's data; copy the cells around the block that lie in
  the chunk's border from the loaded neighbours (a chunk only loads a neighbour's border if it has blocks next to
  that side, and a placed block may be the first one there; without this the block gets wrong faces and shading
  towards that side); grow the bounds and culling box for a placed block; update the border copy in every loaded
  neighbour whose extended data contains the block. Each changed chunk gets a quick (non-greedy) mesh once per frame,
  however many edits it got. The edit goes to the worker as a `BlockEdit` with a seq number and stays in a pending
  list.
- **World worker:** applies the edit (`ChunkDataLoader` keeps edits per chunk and applies them to its cached data and
  to every later generation; the cache drops the least recently used chunks, and the generators are deterministic,
  so a regenerated chunk is the same), wakes the water around it, and marks every chunk whose extended data contains
  the block as changed. Changed chunks are sent again, built from the current state, at most every
  `Settings.world.chunkUpdateInterval` (0.1 s) per chunk.
- **Chunk messages** (responses to requests and updates after changes) are snapshots with a `version` (increasing)
  and an `editAck` (the last edit seq the worker had applied). The main thread applies the newest version of each
  chunk, drops the acknowledged pending edits, and applies the others on top of the new data again (with a quick
  mesh), so a prediction doesn't flicker back while its edit is on the way. Nothing is dropped for being outdated by
  an edit, so edits faster than the round trip are fine; request ids are only used to cancel.
- **Water** (and later anything simulated) changes blocks only in the worker; the main thread sees it through chunk
  updates, one round trip later.

Measured in the browser (SwiftShader): 20 edits of one block 30 ms apart end with the last value; a flood keeps
growing on the worker with the main thread only uploading the updated meshes.

Not done yet:

- The pending edits applied again after a snapshot lack the border sync of the first prediction (a placed block can
  shade wrongly towards a neighbour's side for one round trip).
- Multiple clients: the worker keeps an `editAck` per connection and sends updates to all of them, but the simulated
  range is the last client's load range only.
- Main thread memory: every loaded chunk keeps its full 34³ extended data (157 KB), about 330 MB for the 2109
  chunks in range, more within the retain range.

## Concurrency notes

- Workers run in parallel but share no objects: messages are copied or transferred (a transferred buffer is
  detached on the sending side). Only `SharedArrayBuffer` would give real shared memory (needs `Atomics` or
  clear ownership, and COOP/COEP headers).
- Everything on one thread (main thread, or later the world worker) runs one task at a time, each to completion.
  A message handler (`onChunk`) can never run in the middle of a frame (`update()` / `#updateChunksInRange`) or
  the other way around, so no locks are needed.
- What does happen is interleaving between tasks: any number of responses between frames, frames between
  responses, and other tasks at every `await`. The code must be correct in every order; chunk message versions are
  what make a message safe to apply in any order (only a newer snapshot replaces an older one).

## Suggested order

1. ~~Fix the protocol issues; port the generator and mesher workers.~~ Done.
2. ~~Scheduler: request ids, nearest first, drop out-of-range requests.~~ Done.
3. ~~Move the chunk loader logic and its scheduler into a world worker that keeps the main thread API the same
   (camera position in, meshes out), still single threaded inside.~~ Done: `worldWorker.js`, which also owns edits
   and the simulation.
4. Use generator workers (N) and mesher workers (M) behind the scheduler, with a limit on requests in progress per
   worker; switch the pending scan to the binary heap. Measure chunk loading time and order compared with step 3.
5. ~~Edits and the remesh queue.~~ Done: edits applied in the world worker, changed chunks sent as updates, the main
   thread predicts its own edits.
6. Network endpoint for multiplayer; disconnect detection.
