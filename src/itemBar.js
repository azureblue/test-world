import { BLOCK_IDS, blockOctants, getBlockById, isLiquid, isShaped, isXQuads, octantsBox } from "./blocks.js";

const ICON_SIZE = 48;
/** a drag this close to the bar (pixels) drops onto its nearest slot */
const DROP_DISTANCE = 64;
/** the bar's slots: keys 1..9 and 0 */
export const ITEM_BAR_SLOTS = 10;

/**
 * The bar of blocks at the bottom of the screen: one slot is selected (mouse wheel, number keys) and its block is the
 * one placed; a slot can be empty. Icons are drawn from the block textures: a small isometric cube from the top and
 * side textures (as high as the block: a slab's half), a flat tile for plants.
 *
 * While editable (the inventory open) a slot is selected by a click, and the slots take blocks dragged onto them or
 * near (the nearest slot, lit): from the inventory, or another slot (the two swap); a slot dragged away from the bar
 * is emptied. The inventory passes on the drags over it ({@link ItemBar#dragOver}, {@link ItemBar#drop}).
 */
export class ItemBar {
    /** @type {number[]} by slot, EMPTY for an empty one */
    #blocks = new Array(ITEM_BAR_SLOTS).fill(BLOCK_IDS.EMPTY);
    /** @type {HTMLElement[]} */
    #slots = [];
    #bar;
    #label;
    #selected = 0;
    #textures;
    #tileSize;
    /** what's being dragged: a block, and the slot it's dragged from (-1: from the inventory) */
    #dragged = null;
    /** the slot a drag would drop onto (lit), -1: none */
    #target = -1;

    /**
     * @param {HTMLElement} container
     * @param {string[]} blockNames keys of BLOCK_IDS, one per slot from the first (unknown ones and "": empty slots)
     * @param {import("./blockTextures.js").Pixels[]} textures the block textures by layer (loadBlockTextures)
     * @param {number} tileSize texture size, in pixels
     */
    constructor(container, blockNames, textures, tileSize) {
        this.#textures = textures;
        this.#tileSize = tileSize;
        this.#bar = document.createElement("div");
        this.#bar.className = "item-bar";
        this.#label = document.createElement("div");
        this.#label.className = "item-bar-label";
        for (let i = 0; i < ITEM_BAR_SLOTS; i++) {
            const slot = document.createElement("div");
            slot.className = "item-bar-slot";
            slot.addEventListener("dragstart", (e) => {
                if (this.#blocks[i] === BLOCK_IDS.EMPTY)
                    return e.preventDefault();
                this.startDrag(e, this.#blocks[i], i);
            });
            slot.addEventListener("dragend", () => this.endDrag());
            slot.addEventListener("click", () => this.select(i));
            slot.addEventListener("mouseenter", () => this.hint(slot.title || null));
            slot.addEventListener("mouseleave", () => this.hint(null));
            this.#bar.appendChild(slot);
            this.#slots.push(slot);
        }
        this.#bar.addEventListener("dragover", (e) => this.dragOver(e));
        this.#bar.addEventListener("drop", (e) => this.drop(e));
        container.append(this.#label, this.#bar);
        this.names = blockNames;
        this.select(0);
    }

    /** the selected slot's block, as placed (unsigned); EMPTY for an empty slot */
    get block() {
        return this.#blocks[this.#selected];
    }

    get size() {
        return ITEM_BAR_SLOTS;
    }

    /** the selected slot's index */
    get selected() {
        return this.#selected;
    }

    /** the blocks' names by slot, "" for an empty one */
    get names() {
        return this.#blocks.map(b => b === BLOCK_IDS.EMPTY ? "" : getBlockById(b).name);
    }

    /** @param {string[]} blockNames keys of BLOCK_IDS by slot; unknown ones, "" and the slots after them empty */
    set names(blockNames) {
        for (let i = 0; i < ITEM_BAR_SLOTS; i++) {
            const name = blockNames[i];
            this.set(i, name in BLOCK_IDS ? BLOCK_IDS[name] >>> 0 : BLOCK_IDS.EMPTY);
        }
    }

    /** @param {number} index */
    select(index) {
        if (index < 0 || index >= ITEM_BAR_SLOTS)
            return;
        this.#slots[this.#selected].classList.remove("selected");
        this.#selected = index;
        this.#slots[index].classList.add("selected");
        this.#label.textContent = this.#slots[index].title;
    }

    /**
     * Moves the selection, wrapping around.
     * @param {number} steps
     */
    scroll(steps) {
        const n = ITEM_BAR_SLOTS;
        this.select(((this.#selected + steps) % n + n) % n);
    }

    /**
     * Puts a block into a slot.
     * @param {number} index
     * @param {number} block as placed (unsigned), EMPTY to empty the slot
     */
    set(index, block) {
        this.#blocks[index] = block;
        const slot = this.#slots[index];
        const key = document.createElement("span");
        key.className = "item-bar-key";
        key.textContent = String((index + 1) % 10);
        const empty = block === BLOCK_IDS.EMPTY;
        slot.replaceChildren(...(empty ? [] : [drawIcon(block, this.#textures, this.#tileSize)]), key);
        slot.title = empty ? "" : blockLabel(getBlockById(block).name);
        slot.draggable = !empty;
        if (index === this.#selected)
            this.#label.textContent = slot.title;
    }

    /** whether blocks can be dragged onto and off its slots (the inventory open) */
    set editable(value) {
        this.#bar.classList.toggle("editable", value);
        this.#label.classList.toggle("editable", value);
        this.hint(null);
    }

    /**
     * Shows a name over the bar (a block hovered), or again the selected slot's.
     * @param {string | null} text
     */
    hint(text) {
        this.#label.textContent = text ?? this.#slots[this.#selected].title;
    }

    /**
     * A drag of a block starts (dragstart): onto a slot it's put there.
     * @param {DragEvent} e
     * @param {number} block
     * @param {number} [fromSlot] the slot it's dragged from, -1: not from the bar
     */
    startDrag(e, block, fromSlot = -1) {
        this.#dragged = { block, fromSlot };
        // some browsers start a drag only with data
        e.dataTransfer.setData("text/plain", getBlockById(block).name);
        e.dataTransfer.effectAllowed = "move";
    }

    /** a drag ended (dragend): nothing lit */
    endDrag() {
        this.#dragged = null;
        this.#light(-1);
    }

    /**
     * A drag over the bar or the inventory (dragover): the slot nearest to it lit, if it's near the bar.
     * @param {DragEvent} e
     */
    dragOver(e) {
        if (this.#dragged === null)
            return;
        e.preventDefault();
        this.#light(this.#slotNear(e.clientX, e.clientY));
    }

    /**
     * A drag dropped over the bar or the inventory (drop): near the bar the block put into the nearest slot (from
     * another slot the two swap); away from it, a slot dragged off is emptied.
     * @param {DragEvent} e
     */
    drop(e) {
        if (this.#dragged === null)
            return;
        e.preventDefault();
        const { block, fromSlot } = this.#dragged;
        const index = this.#slotNear(e.clientX, e.clientY);
        if (index >= 0) {
            if (fromSlot >= 0)
                this.set(fromSlot, this.#blocks[index]);
            this.set(index, block);
        } else if (fromSlot >= 0) {
            this.set(fromSlot, BLOCK_IDS.EMPTY);
        }
        this.endDrag();
    }

    /** the slot nearest to a point (along the bar) if the point is within DROP_DISTANCE of the bar, else -1 */
    #slotNear(x, y) {
        const r = this.#bar.getBoundingClientRect();
        if (x < r.left - DROP_DISTANCE || x > r.right + DROP_DISTANCE || y < r.top - DROP_DISTANCE || y > r.bottom + DROP_DISTANCE)
            return -1;
        let best = -1, bestDistance = Infinity;
        for (const [i, slot] of this.#slots.entries()) {
            const s = slot.getBoundingClientRect(), d = Math.abs(x - (s.left + s.right) / 2);
            if (d < bestDistance)
                best = i, bestDistance = d;
        }
        return best;
    }

    #light(index) {
        if (index === this.#target)
            return;
        this.#slots[this.#target]?.classList.remove("drop-target");
        this.#target = index;
        this.#slots[index]?.classList.add("drop-target");
    }
}

/** "DIRT_GRASS" -> "Dirt grass" */
export function blockLabel(name) {
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
export function drawIcon(block, layers, tileSize) {
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
    // part: the texture's lower part drawn, that much of the face's height (a slab's side)
    const face = (texId, a, b, c, d, e, f, shade, part = 1) => {
        const height = tileSize * part;
        ctx.setTransform(a / tileSize, b / tileSize, c / tileSize, d / tileSize, e, f);
        ctx.drawImage(image(texId), 0, tileSize - height, tileSize, height, 0, 0, tileSize, height);
        if (shade > 0) {
            ctx.fillStyle = `rgba(0, 0, 0, ${shade})`;
            ctx.fillRect(0, 0, tileSize, height);
        }
    };

    if (isXQuads(block)) {
        // plants: the flat sprite
        const pad = ICON_SIZE * 0.1;
        face(textures[1], ICON_SIZE - 2 * pad, 0, 0, ICON_SIZE - 2 * pad, pad, pad, 0);
        return canvas;
    }
    // an isometric cube: half width h, the top a rhombus h/2 high, the sides h high; a shaped block's is as high as its
    // box, the top lowered by the rest
    const h = ICON_SIZE * 0.45, q = h / 2, cx = ICON_SIZE / 2;
    const part = isShaped(block) ? octantsBox(blockOctants(block))[5] : 1;
    const top = (ICON_SIZE - 2 * q - h) / 2 + h * (1 - part);
    if (isLiquid(block))
        ctx.globalAlpha = 0.85;
    // top: from the left corner, u towards the back corner, v towards the front corner
    face(textures[0], h, -q, h, q, cx - h, top + q, 0);
    // left side: from the left corner, u towards the front corner, v down
    face(textures[1], h, q, 0, h, cx - h, top + q, 0.25, part);
    // right side: from the front corner, u towards the right corner, v down
    face(textures[4], h, -q, 0, h, cx, top + 2 * q, 0.45, part);
    return canvas;
}
