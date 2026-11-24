// The texture editor (editor/index.html): images edited pixel by pixel, blocks (a cube's faces) and plants made of
// them, shown on dirt-grass in a 3D view of its own (preview.js). Its document is one JSON file (Load, Save): the
// images as PNG data URLs, the blocks and plants by the images' names. It starts from the game's textures and blocks
// (src/blocks.json), each texture an image as the game composes it. Nothing reaches the game by itself.
import definitions from "../src/blocks.json" with { type: "json" };
import { loadBlockTextures, TEXTURE_SIZE } from "../src/blockTextures.js";
import { Preview } from "./preview.js";

const FORMAT = "texture-editor";
const ZOOM = 24;
const UNDO_LIMIT = 100;
/** the cube faces in the preview's order (up, front, left, back, right, down), as a block's top, sides, bottom */
const FACE_PARTS = ["top", "sides", "sides", "sides", "sides", "bottom"];
/** the colour variations: lightness steps (rows) and hue turns in degrees (columns) */
const LIGHTNESS_STEPS = [0.16, 0.08, 0, -0.08, -0.16];
const HUE_STEPS = [-18, -12, -6, 0, 6, 12, 18];

/**
 * The document. A block's textures: one image for every face, or {top, sides, bottom}; a plant's: its image.
 * @type {{images: Map<string, ImageData>, blocks: {name: string, textures: string | {top: string, sides: string,
 *   bottom: string}}[], plants: {name: string, image: string}[]}}
 */
let doc = { images: new Map(), blocks: [], plants: [] };
/** what's selected: an image, or a block (and the face part edited) or a plant
 * @type {{kind: "image" | "block" | "plant", name: string, part: "top" | "sides" | "bottom"}} */
let selection = { kind: "image", name: "", part: "sides" };
/** the last block or plant selected: the preview shows it while an image is selected (if it uses the image) */
let shown = null;
/** @type {Map<string, {undo: Uint8ClampedArray[], redo: Uint8ClampedArray[]}>} */
const history = new Map();
let tool = "pencil";
let grid = true;
let color = [0x5a, 0x8a, 0x3c];
let dirty = false;

const $ = (id) => document.getElementById(id);
const pixels = /** @type {HTMLCanvasElement} */ ($("pixels"));
const preview = new Preview(/** @type {HTMLCanvasElement} */ ($("preview")));

// ---- the document

/** the game's textures (each an image, as composed) and its cube blocks and plants */
async function fromGame() {
    const layers = await loadBlockTextures();
    const images = new Map(definitions.textures.map((t, i) =>
        [t.name, new ImageData(new Uint8ClampedArray(layers[i].data), layers[i].width, layers[i].height)]));
    const blocks = definitions.blocks.filter(b => b.model === "cube").map(b => ({ name: b.name, textures: structuredClone(b.textures) }));
    const plants = definitions.blocks.filter(b => b.model === "x_quads").map(b => ({ name: b.name, image: b.textures }));
    return { images, blocks, plants };
}

async function toFile() {
    const images = {};
    for (const [name, image] of doc.images) {
        const canvas = new OffscreenCanvas(image.width, image.height);
        canvas.getContext("2d").putImageData(image, 0, 0);
        images[name] = await blobToDataUrl(await canvas.convertToBlob({ type: "image/png" }));
    }
    return JSON.stringify({ format: FORMAT, version: 1, tileSize: TEXTURE_SIZE, images, blocks: doc.blocks, plants: doc.plants }, null, 2);
}

async function fromFile(text) {
    const file = JSON.parse(text);
    if (file.format !== FORMAT)
        throw new Error("not a texture editor file");
    const images = new Map();
    for (const [name, url] of Object.entries(file.images)) {
        const bitmap = await createImageBitmap(await (await fetch(url)).blob());
        const ctx = new OffscreenCanvas(bitmap.width, bitmap.height).getContext("2d");
        ctx.drawImage(bitmap, 0, 0);
        images.set(name, ctx.getImageData(0, 0, bitmap.width, bitmap.height));
    }
    return { images, blocks: file.blocks ?? [], plants: file.plants ?? [] };
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
    history.clear();
    shown = null;
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

const findItem = (kind, name) => (kind === "block" ? doc.blocks : doc.plants).find(i => i.name === name);

/** the image being edited: the selected one, or the selected block's part's, or the plant's */
function editedImage() {
    if (selection.kind === "image")
        return selection.name;
    const item = findItem(selection.kind, selection.name);
    return selection.kind === "block" ? parts(item)[selection.part] : item.image;
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
    const image = doc.images.get(name);
    doc.images.set(copy, new ImageData(new Uint8ClampedArray(image.data), image.width, image.height));
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
            list.push({ name, textures });
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
        const users = [...doc.blocks.filter(b => Object.values(parts(b)).includes(name)), ...doc.plants.filter(p => p.image === name)];
        if (users.length > 0) {
            status(`${name} is used by ${users.map(u => u.name).join(", ")}`, true);
            return;
        }
        doc.images.delete(name);
        history.delete(name);
        select("image", doc.images.keys().next().value);
    } else {
        const list = kind === "block" ? doc.blocks : doc.plants;
        const image = editedImage();
        list.splice(list.findIndex(i => i.name === name), 1);
        if (shown?.name === name)
            shown = null;
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
        if (history.has(name)) {
            history.set(newName, history.get(name));
            history.delete(name);
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
    } else {
        const list = kind === "block" ? doc.blocks : doc.plants;
        if (list.some(i => i.name === newName)) {
            status(`${newName} is taken`, true);
            return renderDetails();
        }
        findItem(kind, name).name = newName;
        if (shown?.name === name)
            shown.name = newName;
    }
    selection.name = newName;
    changed();
    renderAll();
}

// ---- selection and the views

function select(kind, name, part = "sides") {
    selection = { kind, name, part };
    if (kind !== "image")
        shown = { kind, name };
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
    const image = doc.images.get(imageName);
    if (image !== undefined) {
        canvas.width = image.width;
        canvas.height = image.height;
        canvas.getContext("2d").putImageData(image, 0, 0);
    }
    return canvas;
}

function renderLists() {
    const edited = editedImage();
    const item = (kind, name, imageName) => {
        const li = document.createElement("li");
        const label = document.createElement("span");
        label.textContent = name;
        li.append(thumbnail(imageName), label);
        // a block's or plant's image is marked in the images too
        li.classList.toggle("selected", selection.kind === kind ? selection.name === name : kind === "image" && name === edited);
        li.onclick = () => select(kind, name);
        return li;
    };
    $("images").replaceChildren(...[...doc.images.keys()].map(n => item("image", n, n)));
    $("blocks").replaceChildren(...doc.blocks.map(b => item("block", b.name, parts(b).sides)));
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
    const head = document.createElement("div");
    head.className = "row";
    head.append(Object.assign(document.createElement("b"), { textContent: kind }), nameInput, del);
    const rows = [head];
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
        const faces = document.createElement("div");
        faces.className = "row";
        faces.append(sameLabel);
        for (const part of same ? ["sides"] : ["top", "sides", "bottom"]) {
            const b = Object.assign(document.createElement("button"), { textContent: same ? "all faces" : part });
            b.classList.toggle("active", selection.part === part);
            b.title = "Edit this face's image";
            b.onclick = () => { selection.part = part; renderAll(); };
            const choose = imageSelect(parts(block)[part], (image) => {
                if (same)
                    block.textures = image;
                else
                    block.textures[part] = image;
                changed();
                renderAll();
            });
            choose.title = "The image on this face";
            faces.append(b, choose);
        }
        rows.push(faces);
    } else if (kind === "plant") {
        const plant = findItem(kind, name);
        const row = document.createElement("div");
        row.className = "row";
        row.append("image ", imageSelect(plant.image, (image) => { plant.image = image; changed(); renderAll(); }));
        rows.push(row);
    }
    $("details").replaceChildren(...rows);
}

function renderPixels() {
    const image = doc.images.get(editedImage());
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

/** the current colour, its variations, the image's colours */
function renderColors() {
    $("current").style.background = hex(color);
    $("color").value = hex(color);
    const [h, s, l] = rgbToHsl(color);
    const variations = $("variations");
    variations.style.gridTemplateColumns = `repeat(${HUE_STEPS.length}, 22px)`;
    variations.replaceChildren(...LIGHTNESS_STEPS.flatMap(dl => HUE_STEPS.map(dh => {
        const c = hslToRgb(h + dh / 360, s, Math.min(1, Math.max(0, l + dl)));
        const cell = document.createElement("div");
        cell.style.background = hex(c);
        cell.classList.toggle("current", dl === 0 && dh === 0);
        cell.title = hex(c);
        cell.onclick = () => setColor(c);
        return cell;
    })));
    const d = doc.images.get(editedImage()).data;
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

function setColor(c) {
    color = c.map(v => Math.round(v));
    renderColors();
}

/** the preview: the selected block or plant, or the last one if it uses the selected image, else the image on a cube */
function updatePreview() {
    const names = [...doc.images.keys()];
    preview.setTextures(names.map(n => doc.images.get(n)));
    const layer = (image) => Math.max(0, names.indexOf(image));
    const ground = findItem("block", "DIRT_GRASS");
    const g = ground !== undefined ? parts(ground) : null;
    const groundLayers = g !== null ? [layer(g.top), layer(g.sides), layer(g.bottom)] : [0, 0, 0];
    const image = editedImage();
    let item = shown && findItem(shown.kind, shown.name);
    if (item && selection.kind === "image" && !(shown.kind === "block" ? Object.values(parts(item)) : [item.image]).includes(image))
        item = null;
    let object, label;
    if (item && shown.kind === "block") {
        const p = parts(item);
        object = { model: "cube", layers: FACE_PARTS.map(part => layer(p[part])) };
        label = item.name;
    } else if (item) {
        object = { model: "x_quads", layers: [0, layer(item.image)] };
        label = item.name;
    } else {
        object = { model: "cube", layers: FACE_PARTS.map(() => layer(image)) };
        label = `${image} on a cube`;
    }
    object.patch = $("patch").checked;
    $("shown").textContent = label;
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

function snapshot(name) {
    if (!history.has(name))
        history.set(name, { undo: [], redo: [] });
    const h = history.get(name);
    h.undo.push(doc.images.get(name).data.slice());
    if (h.undo.length > UNDO_LIMIT)
        h.undo.shift();
    h.redo.length = 0;
}

function undoRedo(from, to) {
    const name = editedImage();
    const h = history.get(name);
    const data = h?.[from].pop();
    if (data === undefined)
        return;
    const image = doc.images.get(name);
    h[to].push(image.data.slice());
    image.data.set(data);
    afterPaint();
}

function afterPaint() {
    changed();
    renderPixels();
    renderColors();
    renderLists();
    updatePreview();
}

/** a tool on a pixel, painting (or erasing: transparent); whether the image changed */
function apply(x, y, toolName, erase) {
    const image = doc.images.get(editedImage());
    if (x < 0 || y < 0 || x >= image.width || y >= image.height)
        return false;
    const d = image.data, i = (y * image.width + x) * 4;
    if (toolName === "picker") {
        if (d[i + 3] !== 0)
            setColor([d[i], d[i + 1], d[i + 2]]);
        return false;
    }
    const paint = erase ? [0, 0, 0, 0] : [...color, 255];
    // erased pixels are one colour whatever their rgb
    const same = (j, c) => c[3] === 0 ? d[j + 3] === 0 : d[j] === c[0] && d[j + 1] === c[1] && d[j + 2] === c[2] && d[j + 3] === c[3];
    if (same(i, paint))
        return false;
    if (toolName === "fill") {
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
            d.set(paint, j);
            stack.push([px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]);
        }
    } else {
        d.set(paint, i);
    }
    return true;
}

function initPixelInput() {
    /** the pencil's stroke: erasing or painting, one undo step */
    let stroke = null;
    const at = (e) => [Math.floor(e.offsetX / ZOOM), Math.floor(e.offsetY / ZOOM)];
    pixels.addEventListener("contextmenu", (e) => e.preventDefault());
    pixels.addEventListener("pointerdown", (e) => {
        const erase = e.button === 2;
        const [x, y] = at(e);
        const name = editedImage();
        if (tool !== "picker")
            snapshot(name);
        if (apply(x, y, tool, erase))
            afterPaint();
        else if (tool !== "picker")
            history.get(name).undo.pop();
        stroke = tool === "pencil" ? { erase } : null;
        pixels.setPointerCapture(e.pointerId);
    });
    pixels.addEventListener("pointermove", (e) => {
        if (stroke === null)
            return;
        const [x, y] = at(e);
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
            const keys = { b: "pencil", g: "fill", i: "picker" };
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
