import { BLOCK_IDS } from "../src/blocks.js";
import { overrideSettings, Settings } from "../src/settings.js";

/** settings every test game starts with, before the scenario's own: a small world, cheap to load and draw */
const TEST_SETTINGS = {
    "world.renderDistance": 3,
    "world.retainDistanceFactor": 1.5
};

/**
 * The game started for a test scenario (scenarios/index.html), and what a scenario does with it. Positions are the
 * game's: x, y on the ground, z up.
 *
 * The scene itself (the blocks) comes from the scenario's generator (src/gen/sceneGenerator.js), so it's there before
 * the chunks load; {@link set} and {@link fill} change blocks while the game runs, like the player does (the world
 * worker's water flow reacts to them).
 */
export class TestGame {
    /** @type {import("../src/game.js").Game} */
    game;

    /** use {@link TestGame.start} */
    constructor(game) {
        this.game = game;
    }

    /**
     * Starts the game in the page.
     * @param {{[path: string]: any}} settings setting path -> value (see overrideSettings in src/settings.js), over
     *   {@link TEST_SETTINGS}; e.g. "world.generator" (a generator name or a scenario module's path), "world.renderDistance",
     *   "water.flow.enabled", "camera.startPosition"
     * @returns {Promise<TestGame>}
     */
    static async start(settings = {}) {
        overrideSettings({ ...TEST_SETTINGS, ...settings });
        // imported after the overrides: some modules read settings when they're loaded
        const { Game } = await import("../src/game.js");
        return new TestGame(await Game.start(document.body));
    }

    get world() {
        return this.game.world;
    }

    get player() {
        return this.game.player;
    }

    get camera() {
        return this.game.camera;
    }

    /** Puts the player's feet at a position (moved up out of blocks if it's inside them). */
    setPosition(x, y, z) {
        this.player.setEyePosition(x, y, z + Settings.player.eyeHeight);
    }

    /** Turns the camera to look at a point (from where the eye is now). */
    lookAt(x, y, z) {
        const p = this.player;
        this.camera.setDirection({ x: x - p.eyeX, y: y - p.eyeY, z: z - p.eyeZ });
    }

    /**
     * Flying (no gravity), so the player stays where it's put.
     * @param {boolean} noclip through blocks too
     */
    fly(noclip = false) {
        if (this.player.mode !== "fly")
            this.player.toggleFly();
        if (this.player.noclip !== noclip)
            this.player.toggleNoclip();
    }

    /** Walking: gravity, collisions. */
    walk() {
        if (this.player.mode !== "walk")
            this.player.toggleFly();
    }

    /** @returns {number} the block at a position (unsigned) */
    block(x, y, z) {
        return this.world.blockAt(x, y, z) >>> 0;
    }

    /**
     * Changes a block while the game runs, like the player does (its chunk must be loaded, see {@link ready}).
     * @param {number | string} block a block value or a key of BLOCK_IDS
     */
    set(x, y, z, block) {
        this.world.setBlock(x, y, z, blockValue(block));
    }

    /**
     * Changes every block in a box while the game runs, one edit per block (for small boxes; a scene's blocks come
     * from its generator).
     * @param {number | string} block a block value or a key of BLOCK_IDS
     */
    fill(x0, y0, z0, x1, y1, z1, block) {
        const value = blockValue(block);
        for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++)
            for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
                for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++)
                    this.world.setBlock(x, y, z, value);
    }

    /**
     * Waits until the chunks in range are loaded and the world worker has sent nothing for a moment.
     * @param {number} timeout seconds
     * @returns {Promise<boolean>} false if it didn't happen in time
     */
    async ready(timeout = 60) {
        const end = performance.now() + timeout * 1000;
        while (this.world.chunksLoaded < this.world.chunksInView) {
            if (performance.now() > end)
                return false;
            await sleep(100);
        }
        let messages = -1;
        while (messages !== this.world.chunkMessages) {
            if (performance.now() > end)
                return false;
            messages = this.world.chunkMessages;
            await sleep(500);
        }
        return true;
    }

    /** @param {number} seconds */
    wait(seconds) {
        return sleep(seconds * 1000);
    }
}

function blockValue(block) {
    if (typeof block === "number")
        return block >>> 0;
    if (!(block in BLOCK_IDS))
        throw new Error(`no block "${block}"`);
    return BLOCK_IDS[block] >>> 0;
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}
