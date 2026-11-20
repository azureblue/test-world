import { ChunkGeneratorFactory } from "../registry.js";
import { CurveNode } from "../node.js";
import { renderTerrain } from "../test/terrainRenderer.js";
import { CurvePlot } from "./curvePlot.js";
import { renderLayers } from "./layerView.js";

/**
 * The inspector page (index.html) of a generator of the registry (?gen=): the plots of its curve nodes, every layer of
 * its graph over the same area, the values of all of them under the mouse, a legend of the categories layers, the
 * height in 3D. The generator has to be inspectable (README.md). The settings are kept in the URL
 * (?gen=&seed=&x=&y=&scale=&size=).
 */

const $ = (id) => document.getElementById(id);
const FIELDS = ["gen", "seed", "x", "y", "scale", "size"];

/** @type {{layers: import("./layerView.js").Layer[], evaluate: (x: number, y: number) => number, seaLevel?: number}} */
let generator = null;
let generatorKey = null;
/** @type {CurvePlot[]} */
let curvePlots = [];

function settings() {
    return Object.fromEntries(FIELDS.map(f => [f, f === "gen" ? $(f).value : Number($(f).value)]));
}

async function render() {
    const { gen, seed, x, y, scale, size } = settings();
    history.replaceState(null, "", "?" + FIELDS.map(f => `${f}=${encodeURIComponent($(f).value)}`).join("&"));
    if (generatorKey !== gen + "/" + seed) {
        generator = await ChunkGeneratorFactory.createForName(gen, seed);
        generatorKey = gen + "/" + seed;
        if (!Array.isArray(generator.layers) || typeof generator.evaluate !== "function") {
            $("probe").textContent = `"${gen}" isn't inspectable: it has no layers and evaluate() (see README.md)`;
            return;
        }
        legend();
    }
    const t0 = performance.now();
    const images = renderLayers(generator, x, y, size, scale);
    const ms = performance.now() - t0;

    const container = $("layers");
    container.replaceChildren();
    generator.layers.forEach((layer, i) => {
        const figure = document.createElement("figure");
        const caption = document.createElement("figcaption");
        caption.innerHTML = `<b>${layer.node.name}</b><br><small>${layer.about}</small>`;
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = size;
        canvas.style.width = canvas.style.height = `${Math.max(size, 256)}px`;
        const image = new ImageData(new Uint8ClampedArray(images[i].buffer), size, size);
        canvas.getContext("2d").putImageData(image, 0, 0);
        canvas.addEventListener("mousemove", (e) => probe(e, canvas));
        canvas.addEventListener("click", (e) => {
            const [wx, wy] = worldAt(e, canvas);
            $("x").value = Math.round(wx);
            $("y").value = Math.round(wy);
            render();
        });
        figure.append(caption, canvas);
        container.appendChild(figure);
    });
    renderCurves();
    $("probe").textContent = `${generator.layers.length} layers, ${size}×${size} columns in ${ms.toFixed(0)} ms ` +
        `(${(size * scale).toFixed(0)} blocks across, centre ${x}, ${y})`;
}

/** the world column under the mouse */
function worldAt(e, canvas) {
    const { x, y, scale, size } = settings();
    const rect = canvas.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width * size, py = (e.clientY - rect.top) / rect.height * size;
    return [x + (px - size / 2) * scale, y + (py - size / 2) * scale];
}

function probe(e, canvas) {
    const [wx, wy] = worldAt(e, canvas).map(Math.floor);
    const it = generator.evaluate(wx, wy);
    const values = generator.layers.map(layer => {
        const v = layer.node.gen(wx, wy, it);
        return `${layer.node.name} ${layer.view === "categories" ? layer.names[v] : v.toFixed(2)}`;
    });
    $("probe").textContent = `x ${wx} y ${wy}   ` + values.join("   ");
    for (const plot of curvePlots)
        plot.mark(plot.source.gen(wx, wy, it));
}

/** the plots of the curve nodes' curves, with the histogram of their inputs over the view */
function renderCurves() {
    const { x, y, scale, size } = settings();
    const curveLayers = generator.layers.filter(l => l.node instanceof CurveNode);
    // the inputs over the view, on a grid
    const samples = curveLayers.map(() => []);
    const n = 96;
    for (let j = 0; j < n; j++)
        for (let i = 0; i < n; i++) {
            const wx = x + ((i + 0.5) / n - 0.5) * size * scale, wy = y + ((j + 0.5) / n - 0.5) * size * scale;
            const it = generator.evaluate(wx, wy);
            curveLayers.forEach((layer, k) => samples[k].push(layer.node.srcNodes[0].gen(wx, wy, it)));
        }
    curvePlots = curveLayers.map((layer, k) => new CurvePlot(layer.node, samples[k]));
    $("curves").replaceChildren(...curvePlots.map(p => p.figure));
}

/** the legends of the categories layers */
function legend() {
    $("legend").replaceChildren(...generator.layers.filter(l => l.view === "categories").map(layer => {
        const div = document.createElement("div");
        div.append(`${layer.node.name}: `, ...layer.names.map((name, i) => {
            const span = document.createElement("span");
            const swatch = document.createElement("i");
            swatch.style.background = `rgb(${layer.colors[i].join(",")})`;
            span.append(swatch, name);
            return span;
        }));
        return div;
    }));
}

/** the last height layer in 3D (terrainRenderer.js: heights -1..1, the water at the sea level) */
function render3d() {
    const { x, y, scale, size } = settings();
    const height = generator.layers.findLast(l => l.view === "height");
    if (height === undefined)
        return;
    const old = $("terrain");
    // a new canvas: the renderer keeps its GL state and handlers on the canvas
    const canvas = old.cloneNode(false);
    canvas.hidden = false;
    old.replaceWith(canvas);
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    const span = size * scale, sea = generator.seaLevel ?? 0;
    const toUnit = (h) => Math.max(-1, Math.min(1, (h - sea - 30) / 80));
    renderTerrain(canvas, x - span / 2, y - span / 2, span, span, (wx, wy) => {
        const it = generator.evaluate(wx, wy);
        return toUnit(height.node.gen(wx, wy, it));
    }, { heightMapResolution: 1 / scale, gridN: 400, water: { level: toUnit(sea) } });
}

export function start() {
    const params = new URLSearchParams(location.search);
    for (const f of FIELDS)
        if (params.has(f))
            $(f).value = params.get(f);
    $("render").addEventListener("click", render);
    $("render3d").addEventListener("click", render3d);
    for (const f of FIELDS)
        $(f).addEventListener("keydown", (e) => e.key === "Enter" && render());
    render();
}
