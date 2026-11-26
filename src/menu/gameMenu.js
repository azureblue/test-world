import { button, element } from "./dom.js";
import { worldUrl } from "./worldMenu.js";

/**
 * The menu in the game (shown when the mouse is released, Esc): back to the game, save, leave to the world menu.
 */
export class GameMenu {
    #root;
    #status;
    #saveButton;
    #quitButton;
    /** @type {string | null} */
    #worldName;
    #save;

    /**
     * @param {HTMLElement} container
     * @param {string | null} worldName the saved world's name, null: the world isn't saved
     * @param {{resume: () => void, save: () => Promise<void>}} actions resume: back to the game (the menu is hidden
     *   first); save: saves the world
     */
    constructor(container, worldName, actions) {
        this.#worldName = worldName;
        this.#save = actions.save;
        const resume = button("Back to the game", () => {
            this.hide();
            actions.resume();
        });
        this.#saveButton = button("Save", () => this.#saveNow());
        this.#saveButton.hidden = worldName === null;
        this.#quitButton = button(worldName === null ? "Quit to the worlds" : "Save and quit to the worlds", () => this.#quit());
        this.#status = element("p", "menu-status");
        this.#root = element("div", "menu-screen menu-overlay",
            element("div", "menu-panel menu-small",
                element("h1", "", worldName ?? "World not saved"),
                this.#status,
                element("div", "menu-column", resume, this.#saveButton, this.#quitButton)));
        this.#root.hidden = true;
        container.append(this.#root);
    }

    get visible() {
        return !this.#root.hidden;
    }

    show() {
        this.#status.textContent = this.#worldName === null ? "Changes to this world are lost when you leave it." : "";
        this.#root.hidden = false;
    }

    hide() {
        this.#root.hidden = true;
    }

    async #saveNow() {
        this.#busy(true, "Saving…");
        try {
            await this.#save();
            this.#status.textContent = `Saved at ${new Date().toLocaleTimeString()}.`;
        } catch (err) {
            this.#status.textContent = `Saving failed: ${err.message}`;
        }
        this.#busy(false);
    }

    async #quit() {
        if (this.#worldName === null) {
            if (confirm("This world isn't saved: leave it?"))
                location.href = worldUrl(null);
            return;
        }
        this.#busy(true, "Saving…");
        try {
            await this.#save();
        } catch (err) {
            this.#status.textContent = `Saving failed: ${err.message}`;
            this.#busy(false);
            return;
        }
        location.href = worldUrl(null);
    }

    #busy(busy, text = null) {
        this.#saveButton.disabled = this.#quitButton.disabled = busy;
        if (text !== null)
            this.#status.textContent = text;
    }
}
