/**
 * The simulation clock: everything that changes the world over time (player physics, flowing water, later block updates)
 * runs in ticks of a fixed length (Settings.simulation.tickRate per second), independent of the frame rate. Rendering
 * runs per frame and can interpolate between the last two ticks with `alpha`.
 */
export class Ticker {
    /** ticks run so far; the number of the tick being run while in a tick */
    tick = 0;
    /** seconds per tick */
    tickTime;
    /** how far the current moment is between the last tick and the next one, 0..1 */
    alpha = 0;

    #maxTicksPerFrame;
    #accumulator = 0;
    /** @type {Map<number, Array<() => void>>} tick -> tasks to run in it */
    #scheduled = new Map();

    /**
     * @param {number} tickRate ticks per second
     * @param {number} maxTicksPerFrame more ticks than this in one frame (after a stall, a hidden tab) are dropped:
     *   the simulation slows down instead of running a burst of catch-up ticks
     */
    constructor(tickRate, maxTicksPerFrame) {
        this.tickTime = 1 / tickRate;
        this.#maxTicksPerFrame = maxTicksPerFrame;
    }

    /**
     * Runs the ticks that are due after a frame of `frameTime` seconds.
     * @param {number} frameTime
     * @param {() => void} onTick runs once per tick, before the tasks scheduled for that tick
     * @returns {number} the number of ticks run
     */
    advance(frameTime, onTick) {
        this.#accumulator += frameTime;
        let ticks = 0;
        while (this.#accumulator >= this.tickTime) {
            if (ticks === this.#maxTicksPerFrame) {
                this.#accumulator %= this.tickTime;
                break;
            }
            this.#accumulator -= this.tickTime;
            this.tick++;
            onTick();
            this.#runScheduled();
            ticks++;
        }
        this.alpha = this.#accumulator / this.tickTime;
        return ticks;
    }

    /**
     * Runs a task in a later tick.
     * @param {number} inTicks 1 is the next tick
     * @param {() => void} task
     */
    schedule(inTicks, task) {
        const at = this.tick + Math.max(1, Math.floor(inTicks));
        let tasks = this.#scheduled.get(at);
        if (tasks === undefined) {
            tasks = [];
            this.#scheduled.set(at, tasks);
        }
        tasks.push(task);
    }

    #runScheduled() {
        const tasks = this.#scheduled.get(this.tick);
        if (tasks === undefined)
            return;
        this.#scheduled.delete(this.tick);
        for (const task of tasks)
            task();
    }
}
