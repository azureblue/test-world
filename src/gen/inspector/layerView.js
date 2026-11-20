/**
 * Colours of an inspectable generator's layers (see README.md), shared by the inspector page and scripts: a layer's
 * value -> 0xAABBGGRR (little-endian RGBA, as a Uint32Array view of ImageData).
 */

/**
 * A layer of an inspectable generator: a node, how to show its values and what it means.
 * @typedef {Object} Layer
 * @property {import("../node.js").Node} node
 * @property {"grey" | "height" | "temperature" | "humidity" | "categories"} view
 * @property {number[]} [range] "grey": the values shown from black to white (default -1..1)
 * @property {string[]} [names] "categories": the names by value
 * @property {number[][]} [colors] "categories": [r, g, b] by value
 * @property {string} about
 */

export const rgba = (r, g, b) => (255 << 24 | b << 16 | g << 8 | r) >>> 0;

/** colour stops [value, r, g, b] -> a colour, linear between */
function ramp(stops, v) {
    if (v <= stops[0][0])
        return rgba(stops[0][1], stops[0][2], stops[0][3]);
    for (let i = 1; i < stops.length; i++)
        if (v <= stops[i][0]) {
            const a = stops[i - 1], b = stops[i], t = (v - a[0]) / (b[0] - a[0]);
            return rgba(Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t), Math.round(a[3] + (b[3] - a[3]) * t));
        }
    const last = stops[stops.length - 1];
    return rgba(last[1], last[2], last[3]);
}

/** heights from the sea level: sea blues, beach, greens, browns, snow */
const heightStops = (sea) => [
    [sea - 50, 10, 25, 80], [sea - 10, 30, 80, 160], [sea - 0.01, 70, 140, 200],
    [sea, 210, 200, 140], [sea + 4, 90, 160, 70], [sea + 25, 50, 120, 45],
    [sea + 55, 130, 110, 70], [sea + 85, 150, 140, 130], [sea + 110, 250, 250, 250]
];
const TEMPERATURE_STOPS = [[-1, 40, 60, 200], [-0.5, 140, 190, 255], [0, 240, 240, 240], [0.4, 255, 190, 90], [1, 200, 30, 20]];
const HUMIDITY_STOPS = [[-1, 170, 130, 70], [0, 230, 220, 160], [0.5, 80, 170, 80], [1, 20, 110, 110]];

/**
 * @param {Layer} layer
 * @param {number} [seaLevel=0] for "height"
 * @returns {(value: number) => number} the colour of a value
 */
export function layerColor(layer, seaLevel = 0) {
    switch (layer.view) {
        case "height": {
            const stops = heightStops(seaLevel);
            return v => ramp(stops, v);
        }
        case "temperature": return v => ramp(TEMPERATURE_STOPS, v);
        case "humidity": return v => ramp(HUMIDITY_STOPS, v);
        case "categories": return v => { const c = layer.colors[v] ?? [255, 0, 255]; return rgba(c[0], c[1], c[2]); };
        default: {
            const [min, max] = layer.range ?? [-1, 1];
            return v => { const c = Math.max(0, Math.min(255, Math.round((v - min) / (max - min) * 255))); return rgba(c, c, c); };
        }
    }
}

/**
 * Renders every layer of a generator over an area, evaluating the graph once per pixel; heights hill shaded.
 * @param {{layers: Layer[], evaluate: (x: number, y: number) => number, seaLevel?: number}} generator
 * @param {number} centerX world x at the middle
 * @param {number} centerY
 * @param {number} size pixels across
 * @param {number} scale blocks per pixel
 * @returns {Uint32Array[]} per layer, size * size colours, rows from the top (y growing downwards)
 */
export function renderLayers(generator, centerX, centerY, size, scale) {
    const seaLevel = generator.seaLevel ?? 0;
    const colors = generator.layers.map(l => layerColor(l, seaLevel));
    const images = generator.layers.map(() => new Uint32Array(size * size));
    // heights are kept for shading
    const heights = generator.layers.map(l => l.view === "height" ? new Float32Array(size * size) : null);
    for (let py = 0; py < size; py++)
        for (let px = 0; px < size; px++) {
            const x = centerX + (px - size / 2) * scale, y = centerY + (py - size / 2) * scale;
            const it = generator.evaluate(x, y);
            generator.layers.forEach((layer, i) => {
                const v = layer.node.gen(x, y, it);
                images[i][py * size + px] = colors[i](v);
                if (heights[i] !== null)
                    heights[i][py * size + px] = v;
            });
        }
    heights.forEach((h, i) => h !== null && shade(images[i], h, size, scale, seaLevel));
    return images;
}

/**
 * Hill shading of a height map's colours, the light from the top left: the relief's shape, smooth or rough, visible at
 * any scale. The sea (below the sea level) isn't shaded.
 * @param {Uint32Array} image the colours, changed
 * @param {Float32Array} heights
 */
function shade(image, heights, size, scale, seaLevel) {
    for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++) {
            const i = y * size + x, h = heights[i];
            if (h < seaLevel)
                continue;
            const dx = (heights[y * size + Math.min(size - 1, x + 1)] - heights[y * size + Math.max(0, x - 1)]) / (2 * scale);
            const dy = (heights[Math.min(size - 1, y + 1) * size + x] - heights[Math.max(0, y - 1) * size + x]) / (2 * scale);
            const light = Math.max(0, 1 - (dx + dy) * 0.55) / Math.hypot(dx, dy, 1);
            const k = 0.4 + 0.7 * light, c = image[i];
            const channel = (shift) => Math.min(255, Math.round((c >>> shift & 255) * k));
            image[i] = rgba(channel(0), channel(8), channel(16));
        }
}
