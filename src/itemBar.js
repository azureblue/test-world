import { BLOCK_IDS, getBlockById, isLiquid, isXQuads } from "./blocks.js";

const ICON_SIZE = 48;

/**
 * The bar of blocks at the bottom of the screen: one is selected (mouse wheel, number keys) and is the one placed.
 * Icons are drawn from the block textures: a small isometric cube from the top and side textures, a flat tile for
 * plants.
 */
export class ItemBar {
    /** @type {number[]} */
    #blocks;
    /** @type {HTMLElement[]} */
    #slots = [];
    /** @type {string[]} */
    #labels;
    #label;
    #selected = 0;

    /**
     * @param {HTMLElement} container
     * @param {string[]} blockNames keys of BLOCK_IDS, one per slot
     * @param {import("./blockTextures.js").Pixels[]} textures the block textures by layer (loadBlockTextures)
     * @param {number} tileSize texture size, in pixels
     */
    constructor(container, blockNames, textures, tileSize) {
        const known = blockNames.filter(name => name in BLOCK_IDS && name !== "EMPTY");
        this.#blocks = known.map(name => BLOCK_IDS[name] >>> 0);

        const bar = document.createElement("div");
        bar.className = "item-bar";
        this.#label = document.createElement("div");
        this.#label.className = "item-bar-label";
        known.forEach((name, i) => {
            const slot = document.createElement("div");
            slot.className = "item-bar-slot";
            slot.title = blockLabel(name);
            slot.appendChild(drawIcon(this.#blocks[i], textures, tileSize));
            const key = document.createElement("span");
            key.className = "item-bar-key";
            key.textContent = i < 9 ? String(i + 1) : "";
            slot.appendChild(key);
            bar.appendChild(slot);
            this.#slots.push(slot);
        });
        this.#labels = known.map(blockLabel);
        container.append(this.#label, bar);
        this.select(0);
    }

    /** the selected block, as placed (unsigned) */
    get block() {
        return this.#blocks[this.#selected];
    }

    get size() {
        return this.#blocks.length;
    }

    /** @param {number} index */
    select(index) {
        if (index < 0 || index >= this.#blocks.length)
            return;
        this.#slots[this.#selected].classList.remove("selected");
        this.#selected = index;
        this.#slots[index].classList.add("selected");
        this.#label.textContent = this.#labels[index];
    }

    /**
     * Moves the selection, wrapping around.
     * @param {number} steps
     */
    scroll(steps) {
        const n = this.#blocks.length;
        this.select(((this.#selected + steps) % n + n) % n);
    }
}

/** "DIRT_GRASS" -> "Dirt grass" */
function blockLabel(name) {
    const words = name.toLowerCase().replace(/_\d+$/, "").split("_");
    words[0] = words[0][0].toUpperCase() + words[0].slice(1);
    return words.join(" ");
}

/**
 * @param {number} block
 * @param {import("./blockTextures.js").Pixels[]} layers
 * @param {number} tileSize
 * @returns {HTMLCanvasElement}
 */
function drawIcon(block, layers, tileSize) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = ICON_SIZE;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    const textures = getBlockById(block).textureIds;
    // a texture as something drawImage takes
    const image = (texId) => {
        const layer = layers[texId];
        const canvas = new OffscreenCanvas(tileSize, tileSize);
        canvas.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(layer.data), tileSize, tileSize), 0, 0);
        return canvas;
    };
    const face = (texId, a, b, c, d, e, f, shade) => {
        ctx.setTransform(a / tileSize, b / tileSize, c / tileSize, d / tileSize, e, f);
        ctx.drawImage(image(texId), 0, 0);
        if (shade > 0) {
            ctx.fillStyle = `rgba(0, 0, 0, ${shade})`;
            ctx.fillRect(0, 0, tileSize, tileSize);
        }
    };

    if (isXQuads(block)) {
        // plants: the flat sprite
        const pad = ICON_SIZE * 0.1;
        face(textures[1], ICON_SIZE - 2 * pad, 0, 0, ICON_SIZE - 2 * pad, pad, pad, 0);
        return canvas;
    }
    // an isometric cube: half width h, the top a rhombus h/2 high, the sides h high
    const h = ICON_SIZE * 0.45, q = h / 2, cx = ICON_SIZE / 2, top = (ICON_SIZE - 2 * q - h) / 2;
    if (isLiquid(block))
        ctx.globalAlpha = 0.85;
    // top: from the left corner, u towards the back corner, v towards the front corner
    face(textures[0], h, -q, h, q, cx - h, top + q, 0);
    // left side: from the left corner, u towards the front corner, v down
    face(textures[1], h, q, 0, h, cx - h, top + q, 0.25);
    // right side: from the front corner, u towards the right corner, v down
    face(textures[4], h, -q, 0, h, cx, top + 2 * q, 0.45);
    return canvas;
}
