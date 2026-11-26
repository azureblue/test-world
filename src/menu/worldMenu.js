import { GENERATOR_NAMES } from "../gen/generatorNames.js";
import { WorldInfo } from "../save/worldInfo.js";
import { WorldStore } from "../save/worldStore.js";
import { overrideSettings, Settings } from "../settings.js";
import { button, element, input, label } from "./dom.js";

/**
 * The page's URL opening a saved world (Settings.world.id), or the world menu (null), the other parameters kept.
 * Worlds are opened by loading the page again: the settings, the workers and the world worker's world all start
 * from the URL.
 * @param {string | null} id
 * @returns {string}
 */
export function worldUrl(id) {
    const url = new URL(location.href);
    url.searchParams.delete("world.id");
    if (id !== null)
        url.searchParams.set("world.id", id);
    return url.href;
}

/**
 * The menu before the game: create a world, open, rename or delete a saved one, or play one that isn't saved.
 * Opening a world loads the page with its id; playing without saving goes on in this page.
 */
export class WorldMenu {
    #root;
    /** @type {WorldStore | null} */
    #store;
    #list;
    #message;
    #resolve;

    /**
     * Shows the menu until a world is chosen.
     * @param {HTMLElement} container
     * @param {WorldStore | null} store null: the browser's storage isn't available (only playing without saving)
     * @param {string | null} [error] shown on top (a world that couldn't be opened)
     * @returns {Promise<null>} resolves (null) to play a world that isn't saved; opening a saved one leaves the page
     */
    static show(container, store, error = null) {
        return new Promise(resolve => new WorldMenu(container, store, error, resolve));
    }

    constructor(container, store, error, resolve) {
        this.#store = store;
        this.#resolve = resolve;
        this.#root = element("div", "menu-screen");
        const panel = element("div", "menu-panel");
        panel.append(element("h1", "", "Test World"));
        this.#message = element("p", "menu-error", error ?? "");
        this.#message.hidden = error === null;
        panel.append(this.#message);
        panel.append(this.#createForm());
        if (store !== null) {
            panel.append(element("h2", "", "Worlds"));
            this.#list = element("ul", "world-list");
            panel.append(this.#list);
        } else {
            this.#showError("Saved worlds aren't available: the browser's storage (IndexedDB) can't be opened.");
        }
        this.#root.append(panel);
        container.append(this.#root);
        this.#render();
    }

    /** the form for a new world: name, generator, seed; created and saved, or played without saving */
    #createForm() {
        const form = element("form", "menu-form");
        const name = input("text", "New world");
        name.maxLength = 60;
        const generator = element("select");
        for (const g of GENERATOR_NAMES)
            generator.append(new Option(g, g, false, g === Settings.world.generator));
        const seed = input("number", String(randomSeed()));
        seed.step = "1";
        const reroll = button("🎲", () => seed.value = String(randomSeed()));
        reroll.title = "Another seed";
        const create = button("Create and play");
        create.type = "submit";
        create.disabled = this.#store === null;
        // the generator and seed chosen, as the settings of a world that isn't saved (the world worker gets them)
        const unsaved = button("Play without saving", () => {
            const seedValue = this.#seed(seed);
            if (seedValue === null)
                return;
            overrideSettings({ "world.generator": generator.value, "world.seed": seedValue });
            this.#root.remove();
            this.#resolve(null);
        });
        unsaved.title = "This generator and seed, nothing saved";
        form.append(element("h2", "", "New world"),
            element("div", "menu-row", label("Name", name)),
            element("div", "menu-row", label("Generator", generator), label("Seed", seed), reroll),
            element("div", "menu-row", create, unsaved));
        form.addEventListener("submit", async (e) => {
            e.preventDefault();
            const seedValue = this.#seed(seed);
            if (seedValue === null)
                return;
            const info = WorldInfo.create(name.value.trim() || "New world", seedValue, generator.value);
            try {
                await this.#store.putWorld(info);
            } catch (err) {
                return this.#showError(`Creating the world failed: ${err.message}`);
            }
            location.href = worldUrl(info.id);
        });
        return form;
    }

    /** @returns {number | null} the seed field's value, null (and a message) if it isn't a whole number */
    #seed(field) {
        const value = Number(field.value);
        if (field.value.trim() !== "" && Number.isInteger(value))
            return value;
        this.#showError("The seed must be a whole number.");
        return null;
    }

    async #render() {
        if (this.#store === null)
            return;
        let worlds;
        try {
            worlds = await this.#store.listWorlds();
        } catch (err) {
            return this.#showError(`Reading the saved worlds failed: ${err.message}`);
        }
        this.#list.replaceChildren(...worlds.map(info => this.#row(info)));
        if (worlds.length === 0)
            this.#list.append(element("li", "world-empty", "No saved worlds yet."));
    }

    /** @param {WorldInfo} info */
    #row(info) {
        const name = element("div", "world-name", info.name);
        const played = info.player === null ? "not played yet" : `played ${new Date(info.lastPlayed).toLocaleString()}`;
        const meta = element("div", "world-meta", `${info.generator} · seed ${info.seed} · ${played}`);
        const text = element("div", "world-text", name, meta);
        const play = button("Play", () => location.href = worldUrl(info.id));
        const rename = button("Rename", () => this.#rename(info, name));
        const remove = button("Delete", async () => {
            if (!confirm(`Delete the world "${info.name}"? It can't be undone.`))
                return;
            try {
                await this.#store.deleteWorld(info.id);
            } catch (err) {
                this.#showError(`Deleting failed: ${err.message}`);
            }
            this.#render();
        });
        remove.className = "menu-danger";
        text.addEventListener("dblclick", () => play.click());
        return element("li", "world-row", text, element("div", "menu-row", play, rename, remove));
    }

    /**
     * The world's name becomes a field: Enter or leaving it keeps the new name, Esc doesn't.
     * @param {WorldInfo} info
     * @param {HTMLElement} name the name's element in the world's row
     */
    #rename(info, name) {
        const field = input("text", info.name);
        field.maxLength = 60;
        name.replaceWith(field);
        field.focus();
        field.select();
        let done = false;
        const finish = async (keep) => {
            if (done)
                return;
            done = true;
            const value = field.value.trim();
            if (keep && value !== "" && value !== info.name) {
                info.name = value;
                try {
                    await this.#store.putWorld(info);
                } catch (err) {
                    this.#showError(`Renaming failed: ${err.message}`);
                }
            }
            this.#render();
        };
        field.addEventListener("keydown", e => {
            if (e.key === "Enter")
                finish(true);
            else if (e.key === "Escape")
                finish(false);
        });
        field.addEventListener("blur", () => finish(true));
    }

    #showError(text) {
        this.#message.textContent = text;
        this.#message.hidden = false;
    }
}

/**
 * Chooses the world to play when the page starts: the one in the URL (Settings.world.id), or the one chosen in the
 * world menu (Settings.world.menu), or a world that isn't saved.
 * @param {HTMLElement} container
 * @returns {Promise<{info: WorldInfo, store: WorldStore} | null>} the saved world to play (Game's OpenWorld); null: a
 *   world that isn't saved
 */
export async function chooseWorld(container) {
    let store = null;
    let error = null;
    try {
        store = await WorldStore.open();
    } catch (err) {
        console.warn(`saved worlds aren't available: ${err}`);
    }
    if (Settings.world.id !== "") {
        try {
            const info = await store?.getWorld(Settings.world.id);
            if (info != null)
                return { info, store };
            error = store === null ? "Saved worlds aren't available in this browser." : "That world doesn't exist (any more).";
        } catch (err) {
            error = `That world can't be opened: ${err.message}`;
        }
        // the menu, with the world's id gone from the URL (a reload doesn't try again) and from the settings (the
        // world worker would open it for "Play without saving")
        history.replaceState(null, "", worldUrl(null));
        overrideSettings({ "world.id": "" });
    } else if (!Settings.world.menu) {
        return null;
    }
    await WorldMenu.show(container, store, error);
    return null;
}

/** a seed for a new world: a positive 31-bit integer */
function randomSeed() {
    return Math.floor(Math.random() * 0x7FFFFFFF);
}
