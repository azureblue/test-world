# Rendering performance

Status: partly done. Goal: run well on integrated graphics, at least as well as Minecraft compiled for
WebAssembly in the browser at the same view distance.

## Comparing fairly

The view distance is `CHUNK_RENDER_DIST = 8` chunks of 32³ = 256 blocks, which is Minecraft render distance 16.
The render range is a sphere, so it also contains chunks far below and above the ground (about 2100 chunks),
while Minecraft worlds are only 256 blocks tall.

## Done

- Blending only for the water pass; the canvas is created with `alpha: false`.
- MSAA setting (`Settings.render.antialias`, samples per pixel, default 4 like the browser's). With 4 samples a dense
  forest of cutout leaves ran at about 45 fps on the integrated GPU, without MSAA at 60. The renderer draws into its
  own multisampled framebuffer (`render/multisampleTarget.js`, resolved to the canvas with `blitFramebuffer`), so the
  count is ours: `?render.antialias=2` halves the samples, `0` turns it off. The canvas then has no depth buffer.
- Far leaves opaque (`Settings.render.cutoutDistance`): chunks farther than this draw their cutout faces with the
  opaque textures and no discard, so hidden leaf layers fail the early depth test. They're drawn before the opaque
  blocks: drawn after them, the ground and trunks under the canopy were shaded and then covered (drawing them first
  raised fps noticeably over a forest). Off by default (`Infinity`: no extra program switch);
  `?render.cutoutDistance=48` turns it on.
- Empty passes are skipped per chunk (no VAO bind, uniform or draw call for empty solid, water or x-quad parts).
- Fixed a GPU memory leak: water buffers and VAOs were not deleted when a chunk was unloaded.
- Draw call and triangle counters per pass in the stats line.
- Overdraw view, `?debug.overdraw=true`: additive count of fragment shader runs per pixel, `avg`/`max` in the stats line.
- Cheaper stats updates (text node updated in place, CSS containment on the stats box).
- Greedy mesher writes solid faces grouped by direction and sorted front to back within each direction
  (Up top to bottom, Down bottom to top, sides along their normal). Same faces as before, only reordered;
  meshing about 8% slower on terrain, 30% on the worst case (checkerboard).

Measured in a typical hilly view: about 110–200 draw calls, 200–240k triangles, overdraw `avg` 1.18 → 1.05
after sorting, `max` 11 → 3. The remaining overdraw comes from different direction groups overlapping
(an Up face drawn before a side face in front of it) and cannot be removed by a fixed face order.
That scene runs at the 60 fps vsync cap, so it doesn't show where the limit is.

## Next steps

1. **Frame timing in the stats line.** CPU ms per frame, GPU ms via `EXT_disjoint_timer_query_webgl2`
   (Chrome; Firefox usually hides it), and the worst frame in the last second. Needed to find the real
   bottleneck, because fps is capped at 60.
2. **Find the scene where Minecraft (WebAssembly) is better.** Same distance in blocks, ideally on the integrated GPU
   machine. Check whether the difference is average frame time or stutter while moving.
3. **Stutter while moving (suspected).** Crossing a chunk border runs `#updateChunksInRange` over all ~2100
   positions; up to 10 chunk uploads per frame create 3 buffers and 3 VAOs each. Spread this work over frames
   if `worst` ms jumps at chunk borders.
4. **Cave / occlusion culling (Minecraft's "VisGraph").** While meshing, flood fill the chunk's air and store
   which of its 6 faces can see each other (a 6×6 bitmask, cheap in the WASM mesher). At render time, walk
   breadth first from the camera chunk only through open faces. Removes most chunks underground and behind
   mountains.
5. **Batch draw calls.** Put all chunk meshes into a few big buffers (slot or arena allocator) and draw them
   with `WEBGL_multi_draw`; get each chunk's translation by `gl_DrawID`.
6. **Skip faces pointing away from the camera.** The mesher output is already grouped by direction; store the
   six group ranges and skip groups whose faces all point away from the camera (for example `-Y` faces
   when the camera is above the chunk). With batching (5) each group is one sub-draw, so this costs no extra
   draw calls. Roughly halves the vertices sent to the GPU.
7. **Fewer vertices per face.** Currently 6 vertices × 8 bytes per quad. A shared index buffer gives
   4 vertices per quad (the ambient occlusion diagonal flip becomes a vertex rotation in the mesher);
   vertex pulling from `gl_VertexID` gives one `uvec2` per quad.
8. **Level of detail for far chunks.** Half or quarter resolution meshes for distant chunks
   (like the Distant Horizons mod), to go beyond Minecraft's view distance.

## Notes

- `?world.fastMesher=true` uses the other mesher (`uIntWasmMesherQ`), which is not sorted.
- Building the WASM: the custom `wasm-ld` in `/media/ext0/apps/clang` needed `libxml2.so.2`, which Ubuntu 26.04
  no longer ships. It was patched to `libxml2.so.16` (harmless "no version information" warnings). Clean fix:
  `sudo apt install lld-21` and link `/usr/lib/llvm-21/bin/wasm-ld` instead.
