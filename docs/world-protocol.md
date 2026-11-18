# World protocol

How the client (the main thread) and the world worker (`src/worker/worldWorker.js`) talk. The world worker owns
the world: block data with every edit, the simulation (flowing water) and the meshes. The client keeps a copy of the
chunks around the camera for drawing, raycasts and physics, and predicts its own edits until the worker confirms
them. The worker plays the role a server would have in multiplayer; over a network, the same messages would travel
over a socket.

Code: `src/worker/common.js` (messages), `src/world/worldClient.js` (client side), `src/world/chunkManager.js` and
`src/world/chunkEditor.js` (what the client does with the messages), `src/worker/worldWorker.js` (worker side).

## Connection

`WorldClient` starts `worker/worldWorker.js` with the page's URL parameters (so `Settings` overrides apply on both
sides) and connects to the `"world"` endpoint with the handshake in `src/worker/worker.js`. Each client gets its own
`MessagePort`. Messages are `{type, data}`; chunk data and mesh buffers are transferred, not copied.

## Messages

Client to worker:

| Message | Fields | Sent when |
|---|---|---|
| `ChunkLoadCenter` | `chunkPos`, `rangeSq` | the camera enters another chunk: pending requests load nearest to it first, the ones out of range are dropped, and the range is where the worker simulates |
| `ChunkRequest` | `chunkPos`, `requestId` | a chunk comes into the render range |
| `ChunkCancel` | `requestIds` | supported, not sent at the moment (out-of-range requests are dropped by the center rule) |
| `BlockEdit` | `blockPos`, `value`, `seq` | the player changes a block; `seq` increases with every edit |

Worker to client:

| Message | Fields |
|---|---|
| `ChunkResponse` | `chunkPos`, `chunkData` (34³ block values: the chunk plus a 1 block border from its neighbours), `chunkMesh` (the optimized mesh), `requestId` (0 for an update), `version`, `editAck` |

A `ChunkResponse` is the answer to a request or an update after the chunk changed; either way a complete snapshot of
the chunk as the worker had it.

Positions are chunk space: x, y, and z as the height (world coordinates are y up, see `World`). A block value is a
32 bit number: bit 31 solid cube, bit 30 liquid, bit 29 x-quads (plants), bit 27 flowing (water that isn't a
source), bits 24..26 the height in 1/8 of a block
(0 meaning full; water levels), bits 0..23 the block id (`src/blocks.js`, `src/mesh/cpp/blocks.hpp`). A plant in
water has both the x-quads and the liquid bit.

## Worker rules

1. Messages are handled in the order they arrive: an edit sent before a request is in that request's response.
2. An edit is applied to the block data right away (`ChunkDataLoader` keeps it for every later generation of the
   chunk). The chunk, and every neighbour whose border contains the block, is marked changed; the water around it is
   woken.
3. Requests wait in a pending set; one chunk is built per step, nearest to the center first, out-of-range ones are
   dropped. The worker yields between steps, so edits and the simulation don't wait behind a queue of loads.
4. Every simulation tick (`Settings.simulation.tickRate`) runs the water flow, then sends the changed chunks: each at
   most every `Settings.world.chunkUpdateInterval`, built fresh from the current state.
5. Every chunk message gets the next `version`. `editAck` is the last `seq` of that client applied before the
   snapshot was built.

## Client rules

1. Newest version wins: per chunk only the newest message is queued, and it's applied only if it's newer than the
   chunk's. At most 10 messages are applied per frame. Messages for chunks the client doesn't keep are ignored. Every
   message is a whole snapshot, so order and gaps don't matter.
2. Prediction: an edit changes the client's data right away; the chunks containing the block get a quick mesh in the
   same frame, and the edit goes into a pending list.
3. Reconciliation: on every message, the pending edits with `seq <= editAck` are dropped; the others are written onto
   the new data again (with a quick mesh), so a predicted block doesn't flicker back while its edit is on the way.

## Example: removing a block next to water

```
client: data[b] = EMPTY, quick mesh, pending [#7]          -> BlockEdit(b, EMPTY, seq 7)
worker: applies it, marks the chunk changed, wakes the water
worker: next tick, ChunkResponse(version 1042, editAck 7)  -> client: replaces data and mesh, drops #7
worker: the water flows in, the chunk changes again
worker: 0.1 s later, ChunkResponse(version 1057, editAck 7) -> client: the water shows up
```

## Not done yet

- Several clients: the worker keeps an `editAck` per connection and sends updates to all of them, but the simulated
  range is the last client's load range.
- Disconnect detection.
- Small changes are sent as whole chunk snapshots (data and mesh); a smaller update format would matter over a
  network.
