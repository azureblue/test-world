import { BLOCK_IDS, getBlockById } from "./blocks.js";
import { blockLabel, drawIcon, ItemBar } from "./itemBar.js";

/**
 * Every block that can be placed, over the game (Settings.controls.inventory): dragged onto the item bar's slots, or
 * clicked to put it into the selected slot; a slot dragged off the bar onto it is emptied. The name of the block
 * hovered shows over the bar.
 */
export class Inventory {
    #root;
    #itemBar;

    /**
     * @param {HTMLElement} container
     * @param {ItemBar} itemBar
     * @param {import("./blockTextures.js").Pixels[]} textures the block textures by layer (loadBlockTextures)
     * @param {number} tileSize texture size, in pixels
     */
    constructor(container, itemBar, textures, tileSize) {
        this.#itemBar = itemBar;
        const grid = document.createElement("div");
        grid.className = "inventory-grid";
        for (const block of Object.values(BLOCK_IDS)) {
            const { name, model } = getBlockById(block);
            if (model === "none")
                continue;
            const item = document.createElement("div");
            item.className = "item-bar-slot";
            item.draggable = true;
            item.append(drawIcon(block, textures, tileSize));
            item.addEventListener("dragstart", (e) => itemBar.startDrag(e, block));
            item.addEventListener("dragend", () => itemBar.endDrag());
            item.addEventListener("click", () => itemBar.set(itemBar.selected, block));
            item.addEventListener("mouseenter", () => itemBar.hint(blockLabel(name)));
            item.addEventListener("mouseleave", () => itemBar.hint(null));
            grid.append(item);
        }
        const title = document.createElement("h2");
        title.textContent = "Inventory";
        const hint = document.createElement("p");
        hint.textContent = "Drag a block onto the bar, or click it for the selected slot; drag a slot off the bar to " +
            "empty it. E or Esc: back to the game.";
        const panel = document.createElement("div");
        panel.className = "menu-panel inventory-panel";
        panel.append(title, grid, hint);
        this.#root = document.createElement("div");
        this.#root.className = "menu-screen menu-overlay inventory";
        this.#root.append(panel);
        this.#root.hidden = true;
        // drags over it: onto the bar when near it, a slot dragged off emptied
        this.#root.addEventListener("dragover", (e) => itemBar.dragOver(e));
        this.#root.addEventListener("drop", (e) => itemBar.drop(e));
        container.append(this.#root);
    }

    get visible() {
        return !this.#root.hidden;
    }

    show() {
        this.#root.hidden = false;
        this.#itemBar.editable = true;
    }

    hide() {
        this.#root.hidden = true;
        this.#itemBar.editable = false;
    }
}
