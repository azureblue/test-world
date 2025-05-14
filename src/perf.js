export class FPSCounter {
    #secondStart = performance.now();
    #frames = 0;
    #fps = 0;
    
    start() {
        this.#secondStart = performance.now();
        this.#frames = 0;
    }

    frame() {
        const now = performance.now();
        const diff = now - this.#secondStart;
        if (diff >= 1000) {            
            this.#fps = this.#frames;
            this.#secondStart += 1000;
            if (diff > 5000)
                this.#secondStart = now;
            this.#frames = 0;
        } 

        this.#frames++;
        return this.#frames;      
    }

    getCurrentFrame() {
        return this.#frames;
    }

    fps() {
        return this.#fps;
    }
}

/*
export class FPSCounter {
    #frames = 0;
    #fps = 0;
    #handler = null;
    start() {
        if (this.#handler == null)
            this.#handler = window.setInterval(() => this.#updateFPS(), 1000);
    }
    frame() {
        this.#frames++;
    }

    #updateFPS() {
        this.#fps = this.#frames;
        this.#frames = 0;
    }

    fps() {
        return this.#fps;
    }
}
*/