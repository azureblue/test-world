export class MouseInput {
    #movement = { x: 0, y: 0 };
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
            element.addEventListener("mousedown", async () => element.requestPointerLock());
        }
    }

    get pause() {
        return this.#pause;
    }

    set pause(value) {
        this.#pause = value;
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
            this.#keys[key].handler = handler;
        }

        targetElement.addEventListener("keydown", (ev) => {
            if (ev.key in this.#keys) {
                this.#keys[ev.key].pressed = true;
                if (this.#keys[ev.key].handler) {
                    this.#keys[ev.key].handler(true);
                }
                ev.preventDefault();
            }            
        }, true);

        targetElement.addEventListener("keyup", (ev) => {
            if (ev.key in this.#keys) {
                this.#keys[ev.key].pressed = false;
                if (this.#keys[ev.key].handler) {
                    this.#keys[ev.key].handler(false);
                }
                ev.preventDefault();
            }
        }, true);
    }

    isKeyPressed(key) {
        return this.#keys[key].pressed || false;
    }
}
