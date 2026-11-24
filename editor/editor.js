// The texture editor (editor/index.html): images edited pixel by pixel (some with a mask: their pixels over another
// image), blocks (a cube's faces) and plants made of them, shown on dirt-grass in a 3D view of its own (preview.js).
// Its document is one JSON file (Load, Save): the images as PNG data URLs, the blocks and plants by the images'
// names. It starts from the game's textures and blocks (src/blocks.json), each texture an image as the game composes
// it, one made by a mask kept masked. Nothing reaches the game by itself.
import definitions from "../src/blocks.json" with { type: "json" };
import { loadBlockTextures, TEXTURE_SIZE } from "../src/blockTextures.js";
import { Preview } from "./preview.js";

const FORMAT = "texture-editor";
const ZOOM = 24;
const UNDO_LIMIT = 100;
/** the cube faces in the preview's order (up, front, left, back, right, down), as a block's top, sides, bottom */
const FACE_PARTS = ["top", "sides", "sides", "sides", "sides", "bottom"];

/**
 * The document. An image's own pixels; a masked one also has its mask and a base image: it shows its pixels where
 * the mask is white, the base's where it's black, blended between (the mask's red, as the game's mask op). A block's
 * textures: one image for every face, or {top, sides, bottom}, its model: a cube (none given) or a liquid; a plant's:
 * its image.
 * @typedef {{mask: ImageData, base: string}} Mask
 * @type {{images: Map<string, ImageData>, masks: Map<string, Mask>, blocks: {name: string, model?: "liquid",
 *   textures: string | {top: string, sides: string, bottom: string}}[], plants: {name: string, image: string}[]}}
 */
let doc = { images: new Map(), masks: new Map(), blocks: [], plants: [] };
/** what every image looks like: a masked one composed (composeAll), the others their own pixels */
let composed = new Map();
/**
 * what's selected: an image, a block (and the face part edited) or a plant; and of the image edited, whether its
 * pixels or its mask are painted
 * @type {{kind: "image" | "block" | "plant", name: string, part: "top" | "sides" | "bottom", layer: "image" | "mask"}}
 */
let selection = { kind: "image", name: "", part: "sides", layer: "image" };
/** by what's edited (target().key) */
/** @type {Map<string, {undo: Uint8ClampedArray[], redo: Uint8ClampedArray[]}>} */
const history = new Map();
let tool = "pencil";
let grid = true;
let color = [0x5a, 0x8a, 0x3c];
/** the main colour: the variations are around it (choosing one of them doesn't move them) */
let mainColor = color;
let dirty = false;

const $ = (id) => document.getElementById(id);
const pixels = /** @type {HTMLCanvasElement} */ ($("pixels"));
const preview = new Preview(/** @type {HTMLCanvasElement} */ ($("preview")));

// ---- the document

/**
 * the game's textures (each an image, as composed; one made by a mask alone stays masked: the mask's first image its
 * pixels, its last the mask, its second the base) and its cube blocks and plants
 */
async function fromGame() {
    const layers = await loadBlockTextures();
    const byName = new Map(definitions.textures.map((t, i) => [t.name, layers[i]]));
    const pixelsOf = async (src) => copyOf(src.startsWith("t:") ? byName.get(src.slice(2)) : await loadSourceImage(src));
    const images = new Map(), masks = new Map();
    for (const [i, t] of definitions.textures.entries()) {
        const srcs = Array.isArray(t.src) ? t.src : [t.src];
        if (srcs.length === 3 && t.ops?.length === 1 && t.ops[0].name === "mask" && srcs[1].startsWith("t:") &&
            srcs.every(src => !src.includes(","))) {
            images.set(t.name, await pixelsOf(srcs[0]));
            masks.set(t.name, { mask: await pixelsOf(srcs[2]), base: srcs[1].slice(2) });
        } else {
            images.set(t.name, copyOf(layers[i]));
        }
    }
    const blocks = definitions.blocks.filter(b => b.model === "cube" || b.model === "liquid").map(b =>
        b.model === "liquid" ? { name: b.name, model: "liquid", textures: structuredClone(b.textures) } : { name: b.name, textures: structuredClone(b.textures) });
    const plants = definitions.blocks.filter(b => b.model === "x_quads").map(b => ({ name: b.name, image: b.textures }));
    return { images, masks, blocks, plants };
}

function copyOf(image) {
    return new ImageData(new Uint8ClampedArray(image.data), image.width, image.height);
}

async function loadSourceImage(name) {
    return imageDataOf(await (await fetch(`../src/${definitions.imageDir}/${name}.png`)).blob());
}

async function imageDataOf(blob) {
    const bitmap = await createImageBitmap(blob);
    const ctx = new OffscreenCanvas(bitmap.width, bitmap.height).getContext("2d");
    ctx.drawImage(bitmap, 0, 0);
    return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
}

async function toFile() {
    const url = async (image) => {
        const canvas = new OffscreenCanvas(image.width, image.height);
        canvas.getContext("2d").putImageData(image, 0, 0);
        return blobToDataUrl(await canvas.convertToBlob({ type: "image/png" }));
    };
    const images = {};
    for (const [name, image] of doc.images) {
        const m = doc.masks.get(name);
        images[name] = m === undefined ? await url(image) : { image: await url(image), mask: await url(m.mask), base: m.base };
    }
    return JSON.stringify({ format: FORMAT, version: 1, tileSize: TEXTURE_SIZE, images, blocks: doc.blocks, plants: doc.plants }, null, 2);
}

async function fromFile(text) {
    const file = JSON.parse(text);
    if (file.format !== FORMAT)
        throw new Error("not a texture editor file");
    const images = new Map(), masks = new Map();
    const pixelsOf = async (url) => imageDataOf(await (await fetch(url)).blob());
    for (const [name, entry] of Object.entries(file.images)) {
        if (typeof entry === "object") {
            images.set(name, await pixelsOf(entry.image));
            masks.set(name, { mask: await pixelsOf(entry.mask), base: entry.base });
        } else {
            images.set(name, await pixelsOf(entry));
        }
    }
    return { images, masks, blocks: file.blocks ?? [], plants: file.plants ?? [] };
}

function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}

function setDocument(d) {
    doc = d;
    composeAll();
    history.clear();
    dirty = false;
    const first = doc.blocks[0];
    if (first !== undefined)
        select("block", first.name);
    else
        select("image", doc.images.keys().next().value);
}

/** a block's image for each part */
function parts(block) {
    const t = block.textures;
    return typeof t === "string" ? { top: t, sides: t, bottom: t } : t;
}

/** whether image depends on other: is it, or masked over it, also through other masked images */
function dependsOn(image, other) {
    if (image === other)
        return true;
    const m = doc.masks.get(image);
    return m !== undefined && dependsOn(m.base, other);
}

/** what every image looks like: a masked one after its base */
function composeAll() {
    composed = new Map();
    const compose = (name) => {
        if (composed.has(name))
            return composed.get(name);
        const own = doc.images.get(name), m = doc.masks.get(name);
        if (m === undefined) {
            composed.set(name, own);
            return own;
        }
        // a placeholder first: a base that comes back to it (not offered, see dependsOn) gets it as it is
        composed.set(name, own);
        const base = doc.images.has(m.base) ? compose(m.base) : undefined;
        if (base === undefined || base.width !== own.width || base.height !== own.height || m.mask.width !== own.width) {
            status(`${name}: its base ${m.base} is missing or of another size`, true);
            return own;
        }
        const out = new ImageData(own.width, own.height);
        for (let i = 0; i < out.data.length; i += 4) {
            const w = m.mask.data[i] / 255;
            for (let c = 0; c < 4; c++)
                out.data[i + c] = Math.round(own.data[i + c] * w + base.data[i + c] * (1 - w));
        }
        composed.set(name, out);
        return out;
    };
    for (const name of doc.images.keys())
        compose(name);
}

const findItem = (kind, name) => (kind === "block" ? doc.blocks : doc.plants).find(i => i.name === name);

/** the image being edited: the selected one, or the selected block's part's, or the plant's */
function editedImage() {
    if (selection.kind === "image")
        return selection.name;
    const item = findItem(selection.kind, selection.name);
    return selection.kind === "block" ? parts(item)[selection.part] : item.image;
}

/** the pixels painted: the edited image's own, or its mask; key: its undo history's */
function target() {
    const name = editedImage();
    if (selection.layer === "mask" && doc.masks.has(name))
        return { key: name + "#mask", image: doc.masks.get(name).mask };
    return { key: name, image: doc.images.get(name) };
}

/** a name not taken yet: name_copy, name_copy2, ... (_COPY for upper case names) */
function copyName(name, taken) {
    const suffix = name === name.toUpperCase() ? "_COPY" : "_copy";
    for (let n = 1; ; n++) {
        const candidate = name + suffix + (n > 1 ? n : "");
        if (!taken(candidate))
            return candidate;
    }
}

function copyImage(name) {
    const copy = copyName(name, n => doc.images.has(n));
    doc.images.set(copy, copyOf(doc.images.get(name)));
    const m = doc.masks.get(name);
    if (m !== undefined)
        doc.masks.set(copy, { mask: copyOf(m.mask), base: m.base });
    composeAll();
    return copy;
}

/** a copy of the selected item of a list; a block's or plant's images are copied too, so the copy is edited apart */
function copySelected(kind) {
    if (kind === "image") {
        select("image", copyImage(editedImage()));
    } else {
        const list = kind === "block" ? doc.blocks : doc.plants;
        const item = selection.kind === kind ? findItem(kind, selection.name) : list[0];
        if (item === undefined)
            return;
        const name = copyName(item.name, n => list.some(i => i.name === n));
        if (kind === "block") {
            const p = parts(item);
            const copies = new Map([...new Set(Object.values(p))].map(image => [image, copyImage(image)]));
            const textures = typeof item.textures === "string" ? copies.get(item.textures)
                : { top: copies.get(p.top), sides: copies.get(p.sides), bottom: copies.get(p.bottom) };
            list.push(item.model === "liquid" ? { name, model: "liquid", textures } : { name, textures });
        } else {
            list.push({ name, image: copyImage(item.image) });
        }
        select(kind, name);
    }
    changed();
}

function deleteSelected() {
    const { kind, name } = selection;
    if (kind === "image") {
        const users = [...doc.blocks.filter(b => Object.values(parts(b)).includes(name)), ...doc.plants.filter(p => p.image === name),
            ...[...doc.masks].filter(([, m]) => m.base === name).map(([n]) => ({ name: n }))];
        if (users.length > 0) {
            status(`${name} is used by ${users.map(u => u.name).join(", ")}`, true);
            return;
        }
        doc.images.delete(name);
        doc.masks.delete(name);
        history.delete(name);
        history.delete(name + "#mask");
        composeAll();
        select("image", doc.images.keys().next().value);
    } else {
        const list = kind === "block" ? doc.blocks : doc.plants;
        const image = editedImage();
        list.splice(list.findIndex(i => i.name === name), 1);
        select("image", image);
    }
    changed();
}

function rename(newName) {
    const { kind, name } = selection;
    if (newName === name)
        return;
    if (!/^\w+$/.test(newName)) {
        status("names: letters, digits and _", true);
        return renderDetails();
    }
    if (kind === "image") {
        if (doc.images.has(newName)) {
            status(`${newName} is taken`, true);
            return renderDetails();
        }
        // in the document's order, under the new name
        doc.images = new Map([...doc.images].map(([n, image]) => [n === name ? newName : n, image]));
        for (const suffix of ["", "#mask"])
            if (history.has(name + suffix)) {
                history.set(newName + suffix, history.get(name + suffix));
                history.delete(name + suffix);
            }
        for (const b of doc.blocks) {
            if (typeof b.textures === "string")
                b.textures = b.textures === name ? newName : b.textures;
            else
                for (const part of ["top", "sides", "bottom"])
                    if (b.textures[part] === name)
                        b.textures[part] = newName;
        }
        for (const p of doc.plants)
            if (p.image === name)
                p.image = newName;
        doc.masks = new Map([...doc.masks].map(([n, m]) => [n === name ? newName : n,
            { mask: m.mask, base: m.base === name ? newName : m.base }]));
        composeAll();
    } else {
        const list = kind === "block" ? doc.blocks : doc.plants;
        if (list.some(i => i.name === newName)) {
            status(`${newName} is taken`, true);
            return renderDetails();
        }
        findItem(kind, name).name = newName;
    }
    selection.name = newName;
    changed();
    renderAll();
}

// ---- selection and the views

function select(kind, name, part = "sides") {
    selection = { kind, name, part, layer: "image" };
    status("");
    renderAll();
}

function renderAll() {
    renderLists();
    renderDetails();
    renderPixels();
    renderColors();
    updatePreview();
}

function thumbnail(imageName) {
    const canvas = document.createElement("canvas");
    const image = composed.get(imageName);
    if (image !== undefined) {
        canvas.width = image.width;
        canvas.height = image.height;
        canvas.getContext("2d").putImageData(image, 0, 0);
    }
    return canvas;
}

function renderLists() {
    const edited = editedImage();
    const item = (kind, name, imageName, note = "") => {
        const li = document.createElement("li");
        const label = document.createElement("span");
        label.textContent = (kind === "image" && doc.masks.has(name) ? `${name} (mask)` : name) + note;
        li.append(thumbnail(imageName), label);
        // a block's or plant's image is marked in the images too
        li.classList.toggle("selected", selection.kind === kind ? selection.name === name : kind === "image" && name === edited);
        li.onclick = () => select(kind, name);
        return li;
    };
    $("images").replaceChildren(...[...doc.images.keys()].map(n => item("image", n, n)));
    $("blocks").replaceChildren(...doc.blocks.map(b => item("block", b.name, parts(b).sides, b.model === "liquid" ? " (liquid)" : "")));
    $("plants").replaceChildren(...doc.plants.map(p => item("plant", p.name, p.image)));
}

function imageSelect(value, onChange) {
    const s = document.createElement("select");
    s.append(...[...doc.images.keys()].map(n => new Option(n, n)));
    s.value = value;
    s.onchange = () => onChange(s.value);
    return s;
}

/** the selected item: its name, and a block's faces or a plant's image */
function renderDetails() {
    const { kind, name } = selection;
    const nameInput = Object.assign(document.createElement("input"), { type: "text", value: name, size: 18 });
    nameInput.onchange = () => rename(nameInput.value.trim());
    const del = Object.assign(document.createElement("button"), { textContent: "Delete" });
    del.onclick = deleteSelected;
    const rows = [row(Object.assign(document.createElement("b"), { textContent: kind }), nameInput, del)];
    if (kind === "block") {
        const block = findItem(kind, name);
        const same = typeof block.textures === "string";
        const sameBox = Object.assign(document.createElement("input"), { type: "checkbox", checked: same });
        sameBox.onchange = () => {
            const p = parts(block);
            // all faces take the one edited
            block.textures = sameBox.checked ? p[selection.part] : { top: p.top, sides: p.sides, bottom: p.bottom };
            selection.part = "sides";
            changed();
            renderAll();
        };
        const sameLabel = document.createElement("label");
        sameLabel.append(sameBox, " same on all faces");
        const model = document.createElement("select");
        model.title = "A solid cube, or a liquid (7/8 high, see-through: water)";
        model.append(new Option("cube", "cube"), new Option("liquid", "liquid"));
        model.value = block.model ?? "cube";
        model.onchange = () => {
            if (model.value === "liquid")
                block.model = "liquid";
            else
                delete block.model;
            changed();
            renderAll();
        };
        rows.push(row(sameLabel, " model ", model));
        // the face edited, and its image
        const faces = row();
        if (!same) {
            const group = document.createElement("span");
            group.className = "segmented";
            for (const part of ["top", "sides", "bottom"]) {
                const b = Object.assign(document.createElement("button"), { textContent: part, title: "Edit this face" });
                b.classList.toggle("active", selection.part === part);
                b.onclick = () => { selection.part = part; selection.layer = "image"; renderAll(); };
                group.append(b);
            }
            faces.append(group);
        }
        const choose = imageSelect(parts(block)[selection.part], (image) => {
            if (same)
                block.textures = image;
            else
                block.textures[selection.part] = image;
            changed();
            renderAll();
        });
        choose.title = same ? "The image on every face" : `The image on the ${selection.part}`;
        faces.append(same ? "image " : "", choose);
        rows.push(faces);
        rows.push(...maskDetails(editedImage()));
    } else if (kind === "image") {
        rows.push(...maskDetails(name));
    } else if (kind === "plant") {
        const plant = findItem(kind, name);
        rows.push(row("image ", imageSelect(plant.image, (image) => { plant.image = image; changed(); renderAll(); })));
        rows.push(...maskDetails(plant.image));
    }
    $("details").replaceChildren(...rows);
}

/** a row of the details */
function row(...children) {
    const r = document.createElement("div");
    r.className = "row";
    r.append(...children);
    return r;
}

/** an image's mask: on or off; on, which is painted (its pixels or its mask) and the base under it */
function maskDetails(name) {
    const m = doc.masks.get(name);
    const box = Object.assign(document.createElement("input"), { type: "checkbox", checked: m !== undefined });
    box.onchange = () => {
        if (box.checked) {
            const base = [...doc.images.keys()].find(n => !dependsOn(n, name));
            if (base === undefined) {
                box.checked = false;
                return status("no other image to put it over", true);
            }
            // all white: its pixels everywhere, until the mask is painted
            const own = doc.images.get(name);
            const mask = new ImageData(own.width, own.height);
            mask.data.fill(255);
            doc.masks.set(name, { mask, base });
            selection.layer = "mask";
        } else {
            // it keeps how it looks, as its pixels
            doc.images.set(name, copyOf(composed.get(name)));
            doc.masks.delete(name);
            selection.layer = "image";
        }
        composeAll();
        changed();
        renderAll();
    };
    const label = document.createElement("label");
    label.append(box, ` ${name} has a mask`);
    const maskRow = row(label);
    if (m !== undefined) {
        const group = document.createElement("span");
        group.className = "segmented";
        for (const [layer, title] of [["image", "Paint its pixels (where the mask is white)"], ["mask", "Paint the mask: white its pixels, black (or erased) the base"]]) {
            const b = Object.assign(document.createElement("button"), { textContent: layer, title });
            b.classList.toggle("active", selection.layer === layer);
            b.onclick = () => { selection.layer = layer; renderAll(); };
            group.append(b);
        }
        maskRow.append(group);
        const base = document.createElement("select");
        base.title = "The image under it, where the mask is black";
        base.append(...[...doc.images.keys()].filter(n => !dependsOn(n, name)).map(n => new Option(n, n)));
        base.value = m.base;
        base.onchange = () => {
            m.base = base.value;
            composeAll();
            changed();
            renderAll();
        };
        maskRow.append(" over ", base);
    }
    return [maskRow];
}

function renderPixels() {
    const { image } = target();
    pixels.width = image.width * ZOOM;
    pixels.height = image.height * ZOOM;
    const ctx = pixels.getContext("2d");
    // a checkerboard under the erased pixels
    for (let y = 0; y < image.height * 2; y++)
        for (let x = 0; x < image.width * 2; x++) {
            ctx.fillStyle = (x + y) % 2 ? "#3a3a3a" : "#2a2a2a";
            ctx.fillRect(x * ZOOM / 2, y * ZOOM / 2, ZOOM / 2, ZOOM / 2);
        }
    const d = image.data;
    for (let y = 0; y < image.height; y++)
        for (let x = 0; x < image.width; x++) {
            const i = (y * image.width + x) * 4;
            if (d[i + 3] === 0)
                continue;
            ctx.fillStyle = `rgb(${d[i]},${d[i + 1]},${d[i + 2]})`;
            ctx.fillRect(x * ZOOM, y * ZOOM, ZOOM, ZOOM);
        }
    if (grid) {
        ctx.strokeStyle = "rgba(0,0,0,0.25)";
        ctx.beginPath();
        for (let x = 1; x < image.width; x++) {
            ctx.moveTo(x * ZOOM + 0.5, 0);
            ctx.lineTo(x * ZOOM + 0.5, pixels.height);
        }
        for (let y = 1; y < image.height; y++) {
            ctx.moveTo(0, y * ZOOM + 0.5);
            ctx.lineTo(pixels.width, y * ZOOM + 0.5);
        }
        ctx.stroke();
    }
}

/** the current colour, the main one's variations, the image's colours; none while a mask is painted (black, white) */
function renderColors() {
    const mask = target().key.endsWith("#mask");
    $("colors").hidden = mask;
    $("maskHint").hidden = !mask;
    $("paintHint").hidden = mask;
    $("current").style.background = hex(color);
    $("color").value = hex(color);
    const variations = $("variations");
    variations.style.gridTemplateColumns = `repeat(${variationSize().cols}, 22px)`;
    variations.replaceChildren(...variationColors().map(c => {
        const cell = document.createElement("div");
        cell.style.background = hex(c);
        cell.classList.toggle("current", hex(c) === hex(color));
        cell.title = hex(c);
        cell.onclick = () => setColor(c, false);
        return cell;
    }));
    const d = target().image.data;
    const counts = new Map();
    for (let i = 0; i < d.length; i += 4)
        if (d[i + 3] !== 0) {
            const key = d[i] << 16 | d[i + 1] << 8 | d[i + 2];
            counts.set(key, (counts.get(key) ?? 0) + 1);
        }
    $("palette").replaceChildren(...[...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 96).map(([key]) => {
        const c = [key >> 16, key >> 8 & 255, key & 255];
        const swatch = document.createElement("div");
        swatch.style.background = hex(c);
        swatch.title = hex(c);
        swatch.onclick = () => setColor(c);
        return swatch;
    }));
}

function variationSize() {
    const clamp = (v, max) => Math.min(max, Math.max(1, Math.round(Number(v)) || 1));
    return { rows: clamp($("rows").value, 9), cols: clamp($("cols").value, 11) };
}

/**
 * the main colour's variations, by rows (lighter at the top) and columns (the hue turned): the controls' steps around
 * it, in the middle (or just past it, for an even count)
 */
function variationColors() {
    const { rows, cols } = variationSize();
    const hueStep = Number($("hueStep").value), lightStep = Number($("lightStep").value) / 100;
    const [h, s, l] = rgbToHsl(mainColor);
    const colors = [];
    for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) {
            const dl = ((rows - 1) / 2 - r) * lightStep, dh = (c - (cols - 1) / 2) * hueStep;
            colors.push(hslToRgb(h + dh / 360, s, Math.min(1, Math.max(0, l + dl))));
        }
    return colors;
}

/** the colour a pixel is painted: the current one, or with random on one of the variations */
function paintColor() {
    if (!$("random").checked)
        return color;
    const colors = variationColors();
    return colors[Math.floor(Math.random() * colors.length)];
}

/** main: the variations move around it */
function setColor(c, main = true) {
    color = c.map(v => Math.round(v));
    if (main)
        mainColor = color;
    renderColors();
}

/** the preview: the selected block or plant; an image upright on its own */
function updatePreview() {
    const names = [...doc.images.keys()];
    preview.setTextures(names.map(n => composed.get(n)));
    const layer = (image) => Math.max(0, names.indexOf(image));
    const ground = findItem("block", "DIRT_GRASS");
    const g = ground !== undefined ? parts(ground) : null;
    const groundLayers = g !== null ? [layer(g.top), layer(g.sides), layer(g.bottom)] : [0, 0, 0];
    let object;
    if (selection.kind === "block") {
        const block = findItem("block", selection.name);
        const p = parts(block);
        object = { model: block.model ?? "cube", layers: FACE_PARTS.map(part => layer(p[part])) };
    } else if (selection.kind === "plant") {
        object = { model: "x_quads", layers: [0, layer(findItem("plant", selection.name).image)] };
    } else {
        object = { model: "panel", layers: [0, layer(selection.name)] };
    }
    object.patch = $("patch").checked;
    $("shown").textContent = selection.name;
    preview.setScene(groundLayers, object);
}

function status(text, error = false) {
    $("status").textContent = text;
    $("status").classList.toggle("error", error);
}

function changed() {
    dirty = true;
}

// ---- painting

function snapshot({ key, image }) {
    if (!history.has(key))
        history.set(key, { undo: [], redo: [] });
    const h = history.get(key);
    h.undo.push(image.data.slice());
    if (h.undo.length > UNDO_LIMIT)
        h.undo.shift();
    h.redo.length = 0;
}

function undoRedo(from, to) {
    const { key, image } = target();
    const h = history.get(key);
    const data = h?.[from].pop();
    if (data === undefined)
        return;
    h[to].push(image.data.slice());
    image.data.set(data);
    afterPaint();
}

function afterPaint() {
    composeAll();
    changed();
    renderPixels();
    renderColors();
    renderLists();
    updatePreview();
}

/** a tool on a pixel, painting (or erasing: transparent); whether the image changed */
function apply(x, y, toolName, erase) {
    const { image } = target();
    if (x < 0 || y < 0 || x >= image.width || y >= image.height)
        return false;
    const d = image.data, i = (y * image.width + x) * 4;
    if (toolName === "picker") {
        if (d[i + 3] !== 0)
            setColor([d[i], d[i + 1], d[i + 2]]);
        return false;
    }
    // a mask: white (the image) or black (the base); an image: the colour (with random, one for each pixel) or erased
    const mask = target().key.endsWith("#mask");
    const randomize = !mask && !erase && $("random").checked;
    const paint = mask ? (erase ? [0, 0, 0, 255] : [255, 255, 255, 255]) : erase ? [0, 0, 0, 0] : [...paintColor(), 255];
    // erased pixels are one colour whatever their rgb
    const same = (j, c) => c[3] === 0 ? d[j + 3] === 0 : d[j] === c[0] && d[j + 1] === c[1] && d[j + 2] === c[2] && d[j + 3] === c[3];
    if (same(i, paint) && !(toolName === "fillAll" && (randomize || !d.every((v, k) => v === paint[k % 4]))))
        return false;
    if (toolName === "fillAll") {
        // the whole image
        for (let j = 0; j < d.length; j += 4)
            d.set(randomize ? [...paintColor(), 255] : paint, j);
    } else if (toolName === "fill") {
        // the pixels of this one's colour connected to it (4 ways)
        const target = [d[i], d[i + 1], d[i + 2], d[i + 3]];
        const stack = [[x, y]];
        while (stack.length > 0) {
            const [px, py] = stack.pop();
            if (px < 0 || py < 0 || px >= image.width || py >= image.height)
                continue;
            const j = (py * image.width + px) * 4;
            if (!same(j, target) || same(j, paint))
                continue;
            // random: a colour for each pixel, but never the target's (the fill would come back to it); paint isn't
            const p = randomize ? [...paintColor(), 255] : paint;
            d.set(same(j, target) && p.every((v, k) => v === d[j + k]) ? paint : p, j);
            stack.push([px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]);
        }
    } else {
        d.set(paint, i);
    }
    return true;
}

function initPixelInput() {
    /** the pencil's stroke: erasing or painting, one undo step; the pixel it's on (a new one is painted, once) */
    let stroke = null;
    const at = (e) => [Math.floor(e.offsetX / ZOOM), Math.floor(e.offsetY / ZOOM)];
    pixels.addEventListener("contextmenu", (e) => e.preventDefault());
    pixels.addEventListener("pointerdown", (e) => {
        const erase = e.button === 2;
        const [x, y] = at(e);
        const painted = target();
        // Ctrl: the picker, whatever the tool
        const used = e.ctrlKey ? "picker" : tool;
        if (used !== "picker")
            snapshot(painted);
        if (apply(x, y, used, erase))
            afterPaint();
        else if (used !== "picker")
            history.get(painted.key).undo.pop();
        stroke = used === "pencil" ? { erase, x, y } : null;
        pixels.setPointerCapture(e.pointerId);
    });
    pixels.addEventListener("pointermove", (e) => {
        if (stroke === null)
            return;
        const [x, y] = at(e);
        if (x === stroke.x && y === stroke.y)
            return;
        stroke.x = x;
        stroke.y = y;
        if (apply(x, y, "pencil", stroke.erase))
            afterPaint();
    });
    pixels.addEventListener("pointerup", () => stroke = null);
}

// ---- colours

function hex(c) {
    return "#" + c.map(v => Math.round(v).toString(16).padStart(2, "0")).join("");
}

/** [r, g, b] 0..255 -> [h 0..1, s, l] */
function rgbToHsl([r, g, b]) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
    if (d === 0)
        return [0, 0, l];
    const s = d / (1 - Math.abs(2 * l - 1));
    const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h / 6, s, l];
}

/** h (any, wraps), s, l 0..1 -> [r, g, b] 0..255 */
function hslToRgb(h, s, l) {
    const c = (1 - Math.abs(2 * l - 1)) * s, hh = ((h % 1 + 1) % 1) * 6, x = c * (1 - Math.abs(hh % 2 - 1)), m = l - c / 2;
    const [r, g, b] = hh < 1 ? [c, x, 0] : hh < 2 ? [x, c, 0] : hh < 3 ? [0, c, x] : hh < 4 ? [0, x, c] : hh < 5 ? [x, 0, c] : [c, 0, x];
    return [r + m, g + m, b + m].map(v => Math.round(Math.min(1, Math.max(0, v)) * 255));
}

// ---- controls

function setTool(name) {
    tool = name;
    for (const b of document.querySelectorAll("#tools [data-tool]"))
        b.classList.toggle("active", b.dataset.tool === name);
}

function download(name, blob) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function initControls() {
    initPixelInput();
    setTool("pencil");
    for (const b of document.querySelectorAll("#tools [data-tool]"))
        b.onclick = () => setTool(b.dataset.tool);
    for (const b of document.querySelectorAll("[data-copy]"))
        b.onclick = () => copySelected(b.dataset.copy);
    $("undo").onclick = () => undoRedo("undo", "redo");
    $("redo").onclick = () => undoRedo("redo", "undo");
    $("grid").onclick = () => {
        grid = !grid;
        $("grid").classList.toggle("active", grid);
        renderPixels();
    };
    $("current").onclick = () => $("color").click();
    $("color").oninput = () => {
        const n = parseInt($("color").value.slice(1), 16);
        setColor([n >> 16, n >> 8 & 255, n & 255]);
    };
    $("patch").onchange = updatePreview;
    for (const id of ["rows", "cols", "hueStep", "lightStep"]) {
        const input = /** @type {HTMLInputElement} */ ($(id));
        input.oninput = renderColors;
        // the wheel over it: a step up or down
        input.addEventListener("wheel", (e) => {
            e.preventDefault();
            if (e.deltaY < 0)
                input.stepUp();
            else if (e.deltaY > 0)
                input.stepDown();
            renderColors();
        }, { passive: false });
    }
    $("save").onclick = async () => {
        download("textures.json", new Blob([await toFile()], { type: "application/json" }));
        dirty = false;
        status("saved textures.json");
    };
    $("load").onclick = () => $("file").click();
    $("file").onchange = async () => {
        const file = $("file").files[0];
        $("file").value = "";
        if (file === undefined || (dirty && !confirm("Drop the unsaved changes?")))
            return;
        try {
            setDocument(await fromFile(await file.text()));
            status(`loaded ${file.name}`);
        } catch (e) {
            status(`${file.name}: ${e.message}`, true);
        }
    };
    $("import").onclick = async () => {
        if (dirty && !confirm("Drop the unsaved changes?"))
            return;
        setDocument(await fromGame());
        status("the game's textures and blocks");
    };
    window.addEventListener("keydown", (e) => {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement)
            return;
        if ((e.ctrlKey || e.metaKey) && e.key === "z")
            undoRedo("undo", "redo");
        else if ((e.ctrlKey || e.metaKey) && (e.key === "y" || e.key === "Z"))
            undoRedo("redo", "undo");
        else if (!e.ctrlKey && !e.metaKey) {
            const keys = { b: "pencil", g: "fill", a: "fillAll", i: "picker" };
            if (keys[e.key])
                setTool(keys[e.key]);
        }
    });
    window.addEventListener("beforeunload", (e) => {
        if (dirty)
            e.preventDefault();
    });
}

// ---- start: last, after every declaration above (the consts among them aren't there before their line runs)

initControls();
setDocument(await fromGame());
