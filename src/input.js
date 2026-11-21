export class MouseInput {
    #movement = { x: 0, y: 0 };
    #mouseDownHandler = null;
    #wheelHandler = null;
    #pause = false;
    constructor(element, pointerLocking = false) {
        this.#movement = { x: 0, y: 0 };

        element.addEventListener("mousemove", (me) => {
            if (this.pause)
                return;
            this.#movement.x += me.movementX;
            this.#movement.y += me.movementY;
        });

        if (pointerLocking) {
            element.addEventListener("mousedown", async (me) => {
                element.requestPointerLock();
                if (this.#mouseDownHandler) {
                    this.#mouseDownHandler(me.button);
                }
            });
        }
        // right button is used in the game
        element.addEventListener("contextmenu", (e) => e.preventDefault());
        element.addEventListener("wheel", (e) => {
            e.preventDefault();
            if (this.#wheelHandler && e.deltaY !== 0)
                this.#wheelHandler(Math.sign(e.deltaY));
        }, { passive: false });
    }

    /**
     * @param {(direction: number) => void} handler - 1 for scrolling down, -1 for up
     */
    onWheel(handler) {
        this.#wheelHandler = handler;
    }

    /**
     * @param {(button: number) => void} handler - button as in MouseEvent.button (0 left, 1 middle, 2 right)
     */
    onMouseDown(handler) {
        this.#mouseDownHandler = handler;
    }

    get pause() {
        return this.#pause;
    }

    /** while paused the mouse movement is ignored (and what was gathered dropped) */
    set pause(value) {
        this.#pause = value;
        this.getDeltaAndReset();
    }

    getDeltaAndReset() {
        const delta = { x: this.#movement.x, y: this.#movement.y };
        this.#movement.x = 0;
        this.#movement.y = 0;
        return delta;
    }
}

export class KeyHandler {
    #key
    #handler
    constructor(key, handler) {
        this.#key = key;
        this.#handler = handler;
    }
}

export const KeyboardKeys = {
    space: " ",
    ctrl: "Control",
    shift: "Shift",
    alt: "Alt",
    up: "ArrowUp",
    down: "ArrowDown",
    left: "ArrowLeft",
    right: "ArrowRight"
}

export class KeyboardInput {
    /**
     * @type {{ [key: string]: { pressed: boolean, handler: (pressed: boolean) => void } }}
     */
    #keys = {};
    #pause = false;
    /** the key that still works while paused (the one that unpauses) */
    pauseKey = null;

    /**
     * Creates an instance of KeyboardInput.
     * 
     * @param {HTMLElement} targetElement - The HTML element to attach the keyboard event listeners to.
     * @param {string[]} [keysToTrack=[]] - An array of keys to track. Each key will be monitored for press and release events.
     * @param {{ [key: string]: (pressed: boolean) => void }} [customHandler={}] - An object where keys are the names of the keys to handle, 
     * and values are functions that take a boolean parameter indicating whether the key is pressed (true) or released (false).
     */
    constructor(targetElement, keysToTrack = [], customHandlers = {}) {
        this.#keys = {};
        keysToTrack.forEach(key => {
            this.#keys[key] = {
                pressed: false,
                handler: null
            }
        });

        for (const [key, handler] of Object.entries(customHandlers)) {
            this.#keys[key] ??= { pressed: false, handler: null };
            this.#keys[key].handler = handler;
        }

        // letters are tracked lower case: with Shift held "w" arrives as "W", and its keyup would otherwise be missed
        const keyOf = (ev) => ev.key.length === 1 ? ev.key.toLowerCase() : ev.key;

        targetElement.addEventListener("keydown", (ev) => {
            const key = keyOf(ev);
            if (this.#pause && key !== this.pauseKey)
                return;
            if (key in this.#keys) {
                if (this.#keys[key].handler && !ev.repeat) {
                    this.#keys[key].handler(true);
                }
                this.#keys[key].pressed = true;
                ev.preventDefault();
            }
        }, true);

        targetElement.addEventListener("keyup", (ev) => {
            const key = keyOf(ev);
            if (this.#pause && key !== this.pauseKey)
                return;
            if (key in this.#keys) {
                this.#keys[key].pressed = false;
                if (this.#keys[key].handler) {
                    this.#keys[key].handler(false);
                }
                ev.preventDefault();
            }
        }, true);
    }

    get pause() {
        return this.#pause;
    }

    /** while paused the keys are ignored, except {@link pauseKey}; pausing releases the held ones */
    set pause(value) {
        this.#pause = value;
        if (value)
            for (const key of Object.values(this.#keys))
                key.pressed = false;
    }

    isKeyPressed(key) {
        return this.#keys[key].pressed || false;
    }
}
