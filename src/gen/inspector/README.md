# Generator inspector

`index.html?gen=<registry name>&seed=` shows a generator of the registry (`src/gen/registry.js`) layer by layer:

- the **curves** of its curve nodes, with a histogram of their inputs over the view and the mouse's column marked;
- every **layer** over the same area (height layers hill shaded), the values of all of them under the mouse, a
  click recentres;
- a **legend** of the categories layers (biomes);
- the last height layer in **3D**.

The settings (generator, seed, centre, blocks per pixel, size) are kept in the URL.

## Making a generator inspectable

A generator built from nodes (`src/gen/node.js`) needs two members:

```js
/** what the page shows, in order (layerView.js: Layer) */
layers = [
    { node: continentalness, view: "grey", range: [-1, 1], about: "oceans (low) and continents (high)" },
    { node: height, view: "height", about: "the surface height" },
    { node: biome, view: "categories", names: BIOME_NAMES, colors: BIOME_COLORS, about: "..." }
];

/** evaluates every layer at a column; returns the iteration under which node.gen(x, y, iteration) reads them */
evaluate(x, y) { ... }
```

and optionally `seaLevel` (the height colours and the 3D water; 0 by default). Views: `grey` (`range` from black to
white), `height`, `temperature` and `humidity` (-1..1), `categories` (`names` and `[r, g, b]` `colors` by value).
A `CurveNode` among the layers gets its curve plotted; curves with control points (`LinearCurve`, `SmoothCurve`) show
them. `src/gen/collection/climate.js` is the example.

`layerView.js` (colours, `renderLayers`) works in Node too, for scripts rendering layers to images.
