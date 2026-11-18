# Scenarios

Scenes to look at in a normal browser tab, to check something by eye or try it out: open
`scenarios/index.html?name=pool` from the local server (the same one as for `index.html`). A scenario starts the game
small (render distance 3 by default), so it loads in seconds and costs little CPU. Automated tests are in `test/`.

A scenario module (`scenarios/<name>.js`) exports:

- `world()`: the scene, built in the world worker as the world's generator: a `SceneGenerator`
  (`src/gen/sceneGenerator.js`) with `fill(x0, y0, z0, x1, y1, z1, block)` and `set(x, y, z, block)` in world
  coordinates (y up), blocks as values or `BLOCK_IDS` names. `new SceneGenerator()` starts from an empty world,
  `await SceneGenerator.over("flat")` from a generator of the registry. The scene is there before the chunks load,
  and like any generator it's the same every time.
- `settings` (optional): setting paths and values for this scenario, e.g. `{ "world.renderDistance": 4,
  "water.flow.enabled": false }`.
- `run(game)` (optional): what happens once the game runs, with a `TestGame` (`testGame.js`): `setPosition(x, y, z)`
  (feet), `lookAt(x, y, z)`, `fly(noclip)`, `walk()`, `set` and `fill` (changes while it runs, like the player's;
  they wake the water flow), `block(x, y, z)`, `await ready()` (chunks loaded, the world worker quiet),
  `await wait(seconds)`, and `world`, `player`, `camera`.

The page keeps the `TestGame` in `window.testGame`, for the console.

| Scenario | What |
|---|---|
| `pool` | a pool dug in flat ground, a rock slab over one end, plants in the water |
| `waterfall` | a rock pillar on flat ground, a water source placed on top once loaded |
| `landscape` | the default terrain from above, towards the horizon (fog, sky) |
