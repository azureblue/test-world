import { Camera } from "./camera.js";
import { FVec3 } from "./geom.js";
import { KeyboardInput, MouseInput } from "./input.js";
import { BlockInteraction } from "./interaction.js";
import { ItemBar } from "./itemBar.js";
import { FPSCounter } from "./perf.js";
import { Player, PlayerInput } from "./player.js";
import { WorldRenderer } from "./render/worldRenderer.js";
import { Settings } from "./settings.js";
import { StatsOverlay } from "./statsOverlay.js";
import { Ticker } from "./ticker.js";
import { Resources } from "./utils.js";
import { World } from "./world/world.js";

/**
 * The game in a page: the world, the player and the camera, the input, and the frame loop (simulation ticks, then
 * the world update and a render per animation frame).
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
    /** frames and simulation ticks stop while paused */
    paused = false;

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
     * @returns {Promise<Game>}
     */
    static async start(container = document.body) {
        const game = new Game();
        await game.#init(container);
        game.#fpsCounter.start();
        game.#frame();
        return game;
    }

    async #init(container) {
        container.style.margin = "0";
        container.style.overflow = "hidden";
        const textures = await Resources.loadImage("./images/textures.png");

        const canvas = document.createElement("canvas");
        container.appendChild(canvas);
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        const gl = canvas.getContext("webgl2", {
            powerPreference: "high-performance",
            desynchronized: false,
            alpha: false
        });

        const cameraSettings = Settings.camera;
        this.camera = new Camera(new FVec3(...cameraSettings.startPosition));
        this.camera.changeYaw(cameraSettings.startYaw);
        this.camera.changePitch(cameraSettings.startPitch);
        this.renderer = await WorldRenderer.create(gl, textures, this.camera);
        this.world = new World(this.renderer.meshHandler);
        this.player = new Player(this.world, cameraSettings.startPosition);
        this.ticker = new Ticker(Settings.simulation.tickRate, Settings.simulation.maxTicksPerFrame);
        this.itemBar = new ItemBar(container, Settings.interaction.itemBar, textures, 16);
        this.interaction = new BlockInteraction(this.world, this.player, this.itemBar);
        this.#stats = new StatsOverlay(document.getElementById("stats"));
        this.#initInput(canvas);
    }

    #initInput(canvas) {
        const controls = Settings.controls;
        this.#mouse = new MouseInput(canvas, true);
        this.#keyboard = new KeyboardInput(document.body,
            [controls.forward, controls.back, controls.left, controls.right, controls.jump, controls.down, controls.sprint], {
            [controls.pause]: (pressed) => pressed && (this.paused = !this.paused),
            [controls.toggleFly]: (pressed) => pressed && this.player.toggleFly(),
            [controls.toggleNoclip]: (pressed) => pressed && this.player.toggleNoclip(),
            // 1..9 select a slot of the bar
            ...Object.fromEntries(Array.from({ length: 9 }, (_, i) => [String(i + 1), (pressed) => pressed && this.itemBar.select(i)]))
        });
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
        this.player.tick(this.ticker.tickTime, input, camera.directionXZ, camera.direction, camera.right);
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
        world.moveToWorldPos(camPos.x, camPos.y, camPos.z);
        world.update();
        this.interaction.update(camPos, camera.direction);

        const frameNumber = this.#fpsCounter.getCurrentFrame();
        this.#lastFrame = this.renderer.render(world, this.interaction.target,
            frameNumber % Settings.debug.overdrawSampleInterval === 0);
        this.#stats.update(frameNumber, {
            camera, player, world, renderer: this.renderer, frame: this.#lastFrame,
            fps: this.#fpsCounter.fps(), target: this.interaction.target
        });
        this.#fpsCounter.frame();
    }
}
