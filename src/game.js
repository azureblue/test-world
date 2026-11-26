import { loadBlockTextures, TEXTURE_SIZE } from "./blockTextures.js";
import { Camera } from "./camera.js";
import { FVec3 } from "./geom.js";
import { KeyboardInput, MouseInput } from "./input.js";
import { BlockInteraction } from "./interaction.js";
import { ItemBar } from "./itemBar.js";
import { GameMenu } from "./menu/gameMenu.js";
import { FPSCounter } from "./perf.js";
import { Player, PlayerInput } from "./player.js";
import { WorldRenderer } from "./render/worldRenderer.js";
import { WorldInfo } from "./save/worldInfo.js";
import { WorldStore } from "./save/worldStore.js";
import { Settings } from "./settings.js";
import { StatsOverlay } from "./statsOverlay.js";
import { Ticker } from "./ticker.js";
import { Particles } from "./world/particles.js";
import { World } from "./world/world.js";

/**
 * A saved world being played: what it is, where it's stored.
 * @typedef {{info: WorldInfo, store: WorldStore}} OpenWorld
 */

/**
 * The game in a page: the world, the player and the camera, the input, and the frame loop (simulation ticks, then
 * the world update and a render per animation frame). A saved world (OpenWorld) starts where the player left it and
 * is saved from the menu (Esc): the world worker saves its chunks, the game its record (the player); with
 * Settings.world.saveInterval also that often and when the page is hidden.
 */
export class Game {
    /** @type {World} */
    world;
    /** @type {Player} */
    player;
    /** @type {Camera} */
    camera;
    /** @type {WorldRenderer} */
    renderer;
    /** @type {Ticker} */
    ticker;
    /** @type {ItemBar} */
    itemBar;
    /** @type {BlockInteraction} */
    interaction;
    /** fragments of broken blocks */
    particles = new Particles();
    #paused = false;
    /** @type {OpenWorld | null} null: the world isn't saved */
    #openWorld = null;
    /** @type {GameMenu} */
    #menu;

    #keyboard;
    #mouse;
    #playerInput = new PlayerInput();
    #stats;
    #fpsCounter = new FPSCounter();
    #lastFrameTime = performance.now();
    #lastFrame = null;

    /**
     * Starts the game in the page: a canvas filling the window in the container, the item bar, the stats overlay
     * (an element with id "stats", see index.html).
     * @param {HTMLElement} container
     * @param {OpenWorld | null} [openWorld] the saved world to play (the world worker opens the same,
     *   Settings.world.id); null: a world that isn't saved
     * @returns {Promise<Game>}
     */
    static async start(container = document.body, openWorld = null) {
        const game = new Game();
        game.#openWorld = openWorld;
        await game.#init(container);
        game.#fpsCounter.start();
        game.#frame();
        return game;
    }

    async #init(container) {
        container.style.margin = "0";
        container.style.overflow = "hidden";
        const textures = await loadBlockTextures();

        const canvas = document.createElement("canvas");
        container.appendChild(canvas);
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        const gl = canvas.getContext("webgl2", {
            powerPreference: "high-performance",
            desynchronized: false,
            alpha: false,
            // no multisampling of its own (WebGL's default is on, the browser's sample count): the renderer draws into
            // its own multisampled framebuffer (Settings.render.antialias samples), and then the canvas needs no depth;
            // Settings.render.browserMsaa (temporary) compares with the browser's
            antialias: Settings.render.browserMsaa,
            depth: !WorldRenderer.multisampled
        });

        const cameraSettings = Settings.camera;
        this.camera = new Camera(new FVec3(...cameraSettings.startPosition));
        this.camera.changeYaw(cameraSettings.startYaw);
        this.camera.changePitch(cameraSettings.startPitch);
        this.renderer = await WorldRenderer.create(gl, textures, this.camera);
        this.world = new World(this.renderer.meshHandler);
        this.player = new Player(this.world, cameraSettings.startPosition);
        this.ticker = new Ticker(Settings.simulation.tickRate, Settings.simulation.maxTicksPerFrame);
        this.itemBar = new ItemBar(container, Settings.interaction.itemBar, textures, TEXTURE_SIZE);
        this.interaction = new BlockInteraction(this.world, this.player, this.itemBar, this.particles);
        this.#stats = new StatsOverlay(document.getElementById("stats"));
        this.#menu = new GameMenu(container, this.#openWorld?.info.name ?? null, {
            resume: () => {
                this.paused = false;
                canvas.requestPointerLock();
            },
            save: () => this.save(),
        });
        this.#initInput(canvas);
        this.#restorePlayer();
        // Esc releases the mouse (the browser does): the menu, the game paused
        document.addEventListener("pointerlockchange", () => {
            if (document.pointerLockElement === null && !this.#menu.visible) {
                this.paused = true;
                this.#menu.show();
            }
        });
        if (this.#openWorld !== null && Settings.world.saveInterval > 0) {
            setInterval(() => this.#saveRecord().catch(err => console.error(`saving the world failed: ${err}`)),
                Settings.world.saveInterval * 1000);
            // leaving the page: what can be written before it's gone
            window.addEventListener("pagehide", () => this.save());
        }
    }

    /** a saved world: the player where it was left */
    #restorePlayer() {
        const state = this.#openWorld?.info.player;
        if (state == null)
            return;
        const player = this.player, camera = this.camera;
        player.setEyePosition(state.x, state.y, state.z + Settings.player.eyeHeight);
        player.mode = state.mode;
        player.noclip = state.noclip;
        camera.setAngles(state.yaw, state.pitch);
        camera.update();
        if (state.slot < this.itemBar.size)
            this.itemBar.select(state.slot);
    }

    /**
     * Saves a saved world now: its changed chunks, then its record (the player). Nothing for a world that isn't saved.
     * @returns {Promise<void>}
     */
    async save() {
        if (this.#openWorld === null)
            return;
        await this.world.save();
        await this.#saveRecord();
    }

    async #saveRecord() {
        const { info, store } = this.#openWorld;
        const player = this.player, camera = this.camera;
        info.player = {
            x: player.x, y: player.y, z: player.z, yaw: camera.yaw, pitch: camera.pitch,
            mode: player.mode, noclip: player.noclip, slot: this.itemBar.selected
        };
        info.lastPlayed = Date.now();
        await store.putWorld(info);
    }

    #initInput(canvas) {
        const controls = Settings.controls;
        this.#mouse = new MouseInput(canvas, true);
        this.#keyboard = new KeyboardInput(document.body,
            [controls.forward, controls.back, controls.left, controls.right, controls.jump, controls.down, controls.sprint], {
            // not while the menu is open: it unpauses with its own button
            [controls.pause]: (pressed) => pressed && !this.#menu.visible && (this.paused = !this.paused),
            [controls.toggleFly]: (pressed) => pressed && this.player.toggleFly(),
            [controls.toggleNoclip]: (pressed) => pressed && this.player.toggleNoclip(),
            // 1..9 select a slot of the bar
            ...Object.fromEntries(Array.from({ length: 9 }, (_, i) => [String(i + 1), (pressed) => pressed && this.itemBar.select(i)]))
        });
        this.#keyboard.pauseKey = controls.pause;
        this.#mouse.onWheel((direction) => this.paused || this.itemBar.scroll(direction));
        this.#mouse.onMouseDown((button) => {
            if (this.paused)
                return;
            if (button === 0)
                this.interaction.breakBlock();
            else if (button === 2)
                this.interaction.placeBlock();
        });
    }

    /** frames and simulation ticks stop while paused, the mouse and the keys (but the pause key) are ignored */
    get paused() {
        return this.#paused;
    }

    set paused(value) {
        this.#paused = value;
        this.#mouse.pause = value;
        this.#keyboard.pause = value;
    }

    /** what the last frame drew */
    get lastFrame() {
        return this.#lastFrame;
    }

    /** one simulation tick: the keys held now, the direction the camera looks now */
    #tick() {
        const controls = Settings.controls;
        const pressed = (key) => this.#keyboard.isKeyPressed(key);
        const input = this.#playerInput;
        input.forward = (pressed(controls.forward) ? 1 : 0) - (pressed(controls.back) ? 1 : 0);
        input.right = (pressed(controls.right) ? 1 : 0) - (pressed(controls.left) ? 1 : 0);
        input.jump = pressed(controls.jump);
        input.down = pressed(controls.down);
        input.sprint = pressed(controls.sprint);
        const camera = this.camera;
        this.player.tick(this.ticker.tickTime, input, camera.directionXY, camera.direction, camera.right);
    }

    #frame() {
        const now = performance.now();
        const frameTime = (now - this.#lastFrameTime) / 1000;
        this.#lastFrameTime = now;
        requestAnimationFrame(() => this.#frame());
        if (this.paused)
            return;

        const camera = this.camera, player = this.player, world = this.world;
        const mouseDelta = this.#mouse.getDeltaAndReset();
        camera.changeYaw(mouseDelta.x * Settings.camera.mouseSensitivity);
        camera.changePitch(-mouseDelta.y * Settings.camera.mouseSensitivity);
        camera.update();

        this.ticker.advance(frameTime, () => this.#tick());
        if (Settings.simulation.interpolate) {
            player.interpolatedEye(this.ticker.alpha, camera.position);
        } else {
            camera.position.x = player.eyeX;
            camera.position.y = player.eyeY;
            camera.position.z = player.eyeZ;
        }

        const camPos = camera.position;
        world.moveTo(camPos.x, camPos.y, camPos.z);
        world.update();
        this.interaction.update(camPos, camera.direction);
        this.particles.update(frameTime, world);

        const frameNumber = this.#fpsCounter.getCurrentFrame();
        this.#lastFrame = this.renderer.render(world, this.interaction.target,
            frameNumber % Settings.debug.overdrawSampleInterval === 0, this.particles);
        this.#stats.update(frameNumber, {
            camera, player, world, renderer: this.renderer, frame: this.#lastFrame,
            fps: this.#fpsCounter.fps(), target: this.interaction.target
        });
        this.#fpsCounter.frame();
    }
}
