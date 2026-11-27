import { BLOCK_HEIGHT_FULL, blockHeight, blockOctants, isLiquid } from "./blocks.js";
import { Settings } from "./settings.js";

/** @typedef {import("./world/world.js").World} World */

/**
 * What the player wants to do this tick: movement keys as -1..1 axes (relative to where the camera looks) and the
 * held keys.
 */
export class PlayerInput {
    forward = 0;
    right = 0;
    jump = false;
    down = false;
    sprint = false;
}

/**
 * The player body: a box (width x width x height) with the feet at the bottom centre, moved by simple physics and
 * collided with solid blocks and the octants of shaped ones (slabs; plants and water don't block): the collisions are
 * with half-block cells, each filled or not. Walking on the ground into a ledge up to walk.stepHeight high (a slab) it
 * hops onto it. Positions are world coordinates: x, y on the ground, z
 * up (the blocks' coordinates).
 *
 * Modes: "walk" with gravity and jumping, swimming when in water; "fly" moves freely, colliding with blocks unless
 * noclip is on. The physics runs per simulation tick (see ticker.js), split into substeps no longer than
 * 1 / Settings.player.physicsRate, so it behaves the same at any tick rate. The position of the previous tick is kept
 * for drawing the camera between ticks.
 *
 * Collisions are resolved one axis at a time: a move along an axis checks only the half-block layers the box enters, so a
 * box that ends up inside blocks (noclip, a block placed into it) can always move out. The box stays Settings.player.skin
 * away from the blocks it touches. Chunks that aren't loaded yet are solid (except with noclip).
 */
export class Player {
    /** feet position */
    x = 0; y = 0; z = 0;
    /** feet position at the previous tick */
    prevX = 0; prevY = 0; prevZ = 0;
    /** camera offset while floating at the surface, now and at the previous tick (see #updateBob) */
    bob = 0;
    prevBob = 0;
    #bobWeight = 0;
    #bobTime = 0;
    /** whether the last tick floated at the surface (the floating point near it) */
    #floating = false;
    vx = 0; vy = 0; vz = 0;
    onGround = false;
    inWater = false;
    /** @type {"walk" | "fly"} */
    mode;
    noclip;

    #world;
    #settings = Settings.player;
    #halfWidth;
    /** set when the box may be inside blocks (start, leaving noclip); it's moved up once its chunk is loaded */
    #needsFreeSpot = true;

    /**
     * @param {World} world
     * @param {number[]} eyePosition
     */
    constructor(world, eyePosition) {
        this.#world = world;
        this.#halfWidth = this.#settings.width / 2;
        this.mode = this.#settings.mode;
        this.noclip = !this.#settings.fly.collide;
        this.setEyePosition(eyePosition[0], eyePosition[1], eyePosition[2]);
    }

    get eyeX() { return this.x; }
    get eyeY() { return this.y; }
    get eyeZ() { return this.z + this.#settings.eyeHeight + this.bob; }

    setEyePosition(x, y, z) {
        this.x = x;
        this.y = y;
        this.z = z - this.#settings.eyeHeight;
        // a jump, not a move: nothing to interpolate
        this.prevX = this.x;
        this.prevY = this.y;
        this.prevZ = this.z;
        this.vx = this.vy = this.vz = 0;
        this.#needsFreeSpot = true;
    }

    toggleFly() {
        this.mode = this.mode === "fly" ? "walk" : "fly";
        this.vz = 0;
        this.#needsFreeSpot = true;
    }

    toggleNoclip() {
        this.noclip = !this.noclip;
        this.#needsFreeSpot = true;
    }

    /**
     * Whether a block cell intersects the body (for not placing blocks into the player).
     * @param {number[]} [box] the part of the cell (x0, y0, z0, x1, y1, z1, 0..1: octantsBox), the whole by default
     */
    intersectsBlock(ix, iy, iz, box = [0, 0, 0, 1, 1, 1]) {
        const hw = this.#halfWidth;
        return ix + box[0] < this.x + hw && ix + box[3] > this.x - hw &&
            iy + box[1] < this.y + hw && iy + box[4] > this.y - hw &&
            iz + box[2] < this.z + this.#settings.height && iz + box[5] > this.z;
    }

    /**
     * Whether a block can be placed into the body (see {@link intersectsBlock}) at height iz, the physics then pushing
     * the player up onto it: walking, the block is in the lowest layer the body is in, the lift is at most
     * Settings.player.placeLiftMax (near the top of a jump, floating in water; not standing on the ground, and once per
     * jump: at the top of it the next block would need most of a block; a slab even standing), and the body fits on top.
     * @param {number} [top] the block's top in its cell (a bottom slab's 0.5)
     */
    canStepOnto(iz, top = 1) {
        const lift = iz + top + this.#settings.skin - this.z;
        if (this.mode !== "walk" || iz !== Math.floor(this.z) || lift > this.#settings.placeLiftMax + LIFT_TOLERANCE)
            return false;
        const z = this.z;
        this.z = iz + top + this.#settings.skin;
        const fits = !this.#overlapsBlocks();
        this.z = z;
        return fits;
    }

    /**
     * Advances the physics by one tick.
     * @param {number} tickTime seconds per tick
     * @param {PlayerInput} input
     * @param {{x: number, y: number}} lookXY horizontal look direction, unit length (camera.directionXY)
     * @param {{x: number, y: number, z: number}} look look direction, unit length
     * @param {{x: number, y: number, z: number}} right horizontal right vector, unit length
     */
    tick(tickTime, input, lookXY, look, right) {
        this.prevX = this.x;
        this.prevY = this.y;
        this.prevZ = this.z;
        this.prevBob = this.bob;
        this.#floating = false;
        const substeps = Math.ceil(tickTime * this.#settings.physicsRate - 1e-9);
        const dt = tickTime / substeps;
        for (let i = 0; i < substeps; i++)
            this.#step(dt, input, lookXY, look, right);
        this.#updateBob(tickTime);
    }

    /**
     * The gentle up and down of the view while floating at the surface (only the camera, not the body). It fades in
     * and out over swim.bobFade, so starting or stopping to float doesn't jump.
     */
    #updateBob(tickTime) {
        const s = this.#settings.swim;
        const target = this.mode === "walk" && this.#floating ? 1 : 0;
        this.#bobWeight += clampAbs(target - this.#bobWeight, tickTime / s.bobFade);
        if (this.#bobWeight === 0) {
            this.#bobTime = 0;
            this.bob = 0;
            return;
        }
        this.#bobTime = (this.#bobTime + tickTime) % s.bobPeriod;
        this.bob = this.#bobWeight * s.bobHeight * Math.sin(2 * Math.PI * this.#bobTime / s.bobPeriod);
    }

    /**
     * The eye position between the previous and the current tick.
     * @param {number} alpha 0 = previous tick, 1 = current tick
     * @param {{x: number, y: number, z: number}} out
     */
    interpolatedEye(alpha, out) {
        out.x = this.prevX + (this.x - this.prevX) * alpha;
        out.y = this.prevY + (this.y - this.prevY) * alpha;
        out.z = this.prevZ + (this.z - this.prevZ) * alpha + this.#settings.eyeHeight +
            this.prevBob + (this.bob - this.prevBob) * alpha;
    }

    #step(dt, input, lookXY, look, right) {
        const s = this.#settings;
        const collide = this.mode === "walk" || !this.noclip;
        if (collide && this.#needsFreeSpot && !this.#moveToFreeSpot())
            return; // the chunk here isn't loaded yet: wait

        if (this.mode === "fly") {
            this.#fly(input, look, right);
        } else {
            this.inWater = this.#world.isInWater(this.x, this.y, this.z + s.swim.enterHeight);
            if (this.inWater)
                this.#swim(dt, input, lookXY, right);
            else
                this.#walk(dt, input, lookXY, right);
        }

        if (!collide) {
            this.x += this.vx * dt;
            this.y += this.vy * dt;
            this.z += this.vz * dt;
            this.onGround = false;
            return;
        }
        // a block placed into the feet (see canStepOnto) pushes the player up onto it at placeLiftSpeed: no jump in
        // position, a jump going up faster isn't changed, falling into it stops
        const lift = this.#feetLift();
        if (lift > 0) {
            if (this.vz < 0)
                this.vz = 0;
            this.z += Math.max(0, Math.min(lift, s.placeLiftSpeed * dt) - this.vz * dt);
        }
        // vertical first: standing on a block edge doesn't catch the horizontal move
        const hitZ = this.#moveAxis(2, this.vz * dt);
        this.onGround = hitZ && this.vz < 0;
        if (hitZ)
            this.vz = 0;
        if (hitZ || this.mode !== "walk" || this.inWater)
            this.#climbing = false;
        const hitX = this.#moveHorizontal(0, this.vx * dt);
        this.#wallX = hitX ? Math.sign(this.vx) : 0;
        if (hitX)
            this.vx = 0;
        const hitY = this.#moveHorizontal(1, this.vy * dt);
        this.#wallY = hitY ? Math.sign(this.vy) : 0;
        if (hitY)
            this.vy = 0;
    }

    /** the side (-1, 0, 1 on x and y) of the walls the last step ran into */
    #wallX = 0;
    #wallY = 0;

    #fly(input, look, right) {
        const s = this.#settings.fly;
        const speed = s.speed * (input.sprint ? s.sprintMultiplier : 1);
        const up = (input.jump ? 1 : 0) - (input.down ? 1 : 0);
        let dx = look.x * input.forward + right.x * input.right;
        let dy = look.y * input.forward + right.y * input.right;
        let dz = look.z * input.forward + up;
        const len = Math.hypot(dx, dy, dz);
        const scale = len > 0 ? speed / len : 0;
        this.vx = dx * scale;
        this.vy = dy * scale;
        this.vz = dz * scale;
    }

    #walk(dt, input, lookXY, right) {
        const s = this.#settings.walk;
        const speed = s.speed * (input.sprint ? s.sprintMultiplier : 1);
        this.#accelerateHorizontal(dt, input, lookXY, right, speed, this.onGround ? s.groundAcceleration : s.airAcceleration);
        // with jump held, the next jump waits for the cooldown (landing on a step mid-jump would jump again at once);
        // a new press jumps right away
        this.#sinceJump = input.jump ? this.#sinceJump + dt : Infinity;
        if (input.jump && this.onGround && this.#sinceJump >= s.jumpCooldown) {
            this.vz = s.jumpSpeed;
            this.onGround = false;
            this.#sinceJump = 0;
        }
        this.vz = Math.max(this.vz - s.gravity * dt, -s.maxFallSpeed);
    }

    /** seconds since the last jump while jump is held; Infinity once it's released */
    #sinceJump = Infinity;

    #swim(dt, input, lookXY, right) {
        const s = this.#settings.swim;
        const speed = s.speed * (input.sprint ? s.sprintMultiplier : 1);
        this.#accelerateHorizontal(dt, input, lookXY, right, speed, s.acceleration);
        if (input.jump && (this.#wallX !== 0 || this.#wallY !== 0) && this.#nearSurface()) {
            // climbing out onto a low bank: a hop just high enough to get the feet over its edge; swimming up alone
            // stops at the surface (above it the walk physics takes over)
            const rise = this.#bankRise();
            if (rise !== null) {
                // the speed that reaches the peak from here; once hopping, falling under gravity reaches the same peak
                const gravity = this.#settings.walk.gravity;
                const hop = Math.sqrt(2 * gravity * (rise + s.exitClearance));
                this.vz = Math.max(this.vz - gravity * dt, hop);
                return;
            }
        }
        // with jump held the player rises towards the floating point (the waist) at the surface, slower the closer it
        // gets, and floats there, still swimming, instead of popping out into the walk physics
        const floatZ = this.z + this.#settings.height * s.depthFraction;
        const surface = this.#waterSurface(floatZ);
        const depth = surface === null ? 0 : surface - floatZ;
        if (surface !== null && Math.abs(depth) < s.bobRange)
            this.#floating = true;
        let targetVz;
        if (input.down)
            targetVz = -s.downSpeed;
        else if (input.jump)
            targetVz = Math.min(Math.max(depth * s.floatStiffness, -s.floatSinkSpeed), s.upSpeed);
        else if (depth < 0)
            targetVz = -s.floatSinkSpeed;
        else
            targetVz = Math.max(this.vz - s.gravity * dt, -s.maxSinkSpeed);
        this.vz += clampAbs(targetVz - this.vz, s.acceleration * dt * 2);
    }

    /**
     * The height of the water surface over the player at height z: the top of the water column in the cell at z or,
     * if z is just above the water, in the cell below; the top cell is filled up to its level (as the mesher draws
     * it). Null if there's no water there.
     */
    #waterSurface(z) {
        const world = this.#world;
        const ix = Math.floor(this.x), iy = Math.floor(this.y);
        let iz = Math.floor(z);
        if (!isLiquid(world.blockAt(ix, iy, iz))) {
            iz--;
            if (!isLiquid(world.blockAt(ix, iy, iz)))
                return null;
        }
        for (let i = 0; i < 16 && isLiquid(world.blockAt(ix, iy, iz + 1)); i++)
            iz++;
        return iz + blockHeight(world.blockAt(ix, iy, iz)) / BLOCK_HEIGHT_FULL;
    }

    /**
     * How far the top of the wall the player swims against is above the feet, if the player can climb onto it: the top
     * at most swim.exitMaxRise above the feet, with room for the body above it. Otherwise null.
     */
    #bankRise() {
        const s = this.#settings;
        const maxRise = s.swim.exitMaxRise;
        const reach = this.#halfWidth + 0.05;
        let best = null;
        for (const [dx, dy] of [[this.#wallX, 0], [0, this.#wallY]]) {
            if (dx === 0 && dy === 0)
                continue;
            // in half blocks
            const hx = Math.floor((this.x + dx * reach) * 2), hy = Math.floor((this.y + dy * reach) * 2);
            // the first free half cell above the wall, from the feet up
            let top = Math.floor(this.z * 2);
            while (top <= (this.z + maxRise) * 2 && this.#blocks(hx, hy, top))
                top++;
            const rise = top / 2 - this.z;
            if (rise <= 0 || rise > maxRise)
                continue;
            let room = true;
            for (let hz = top; hz < top + s.height * 2; hz++)
                room &&= !this.#blocks(hx, hy, hz);
            if (room && (best === null || rise < best))
                best = rise;
        }
        return best;
    }

    /** whether the point swim.exitDepth above the swimming point is out of the water */
    #nearSurface() {
        const s = this.#settings;
        return !this.#world.isInWater(this.x, this.y, this.z + s.height * s.swim.depthFraction + s.swim.exitDepth);
    }

    /**
     * Changes the horizontal velocity towards the wished one (movement keys relative to the look direction) by at
     * most acceleration * dt.
     */
    #accelerateHorizontal(dt, input, lookXY, right, speed, acceleration) {
        let wx = lookXY.x * input.forward + right.x * input.right;
        let wy = lookXY.y * input.forward + right.y * input.right;
        const len = Math.hypot(wx, wy);
        if (len > 0) {
            wx *= speed / len;
            wy *= speed / len;
        }
        let dvx = wx - this.vx, dvy = wy - this.vy;
        const dv = Math.hypot(dvx, dvy);
        const maxDv = acceleration * dt;
        if (dv > maxDv) {
            dvx *= maxDv / dv;
            dvy *= maxDv / dv;
        }
        this.vx += dvx;
        this.vy += dvy;
    }

    #boxMin(axis) {
        return axis === 2 ? this.z : (axis === 0 ? this.x : this.y) - this.#halfWidth;
    }

    #boxMax(axis) {
        return axis === 2 ? this.z + this.#settings.height : (axis === 0 ? this.x : this.y) + this.#halfWidth;
    }

    #shift(axis, delta) {
        if (axis === 0) this.x += delta;
        else if (axis === 1) this.y += delta;
        else this.z += delta;
    }

    /**
     * Whether a half-block cell is filled: a solid block's, or a shaped block's octant (half cells hx, hy, hz: the
     * coordinates times 2, floored).
     */
    #fills(hx, hy, hz) {
        const block = this.#world.blockAt(hx >> 1, hy >> 1, hz >> 1);
        return (blockOctants(block) >> ((hx & 1) | (hy & 1) << 1 | (hz & 1) << 2) & 1) !== 0;
    }

    /**
     * Whether a half-block cell blocks the body. Blocks of chunks that aren't loaded yet count as solid, so the player
     * doesn't fall or fly into terrain that isn't there yet.
     */
    #blocks(hx, hy, hz) {
        return !this.#world.isLoaded(hx >> 1, hy >> 1, hz >> 1) || this.#fills(hx, hy, hz);
    }

    /**
     * Whether any half cell of one layer (half cells with coordinate `layer` on `axis`) that the box's cross-section
     * covers blocks the body.
     */
    #layerBlocks(axis, layer) {
        const a1 = axis === 0 ? 1 : 0;
        const a2 = axis === 2 ? 1 : 2;
        const lo1 = Math.floor(this.#boxMin(a1) * 2), hi1 = Math.ceil(this.#boxMax(a1) * 2) - 1;
        const lo2 = Math.floor(this.#boxMin(a2) * 2), hi2 = Math.ceil(this.#boxMax(a2) * 2) - 1;
        const cell = [0, 0, 0];
        cell[axis] = layer;
        for (let i = lo1; i <= hi1; i++) {
            cell[a1] = i;
            for (let j = lo2; j <= hi2; j++) {
                cell[a2] = j;
                if (this.#blocks(cell[0], cell[1], cell[2]))
                    return true;
            }
        }
        return false;
    }

    /**
     * Moves the box along an axis, stopping skin before the first blocking layer it would enter.
     * @returns {boolean} whether it was stopped
     */
    #moveAxis(axis, delta) {
        if (delta === 0)
            return false;
        const skin = this.#settings.skin;
        // layers (half blocks) the move gets closer than skin to count as entered, so the box never ends up nearer
        // than skin
        if (delta > 0) {
            const max = this.#boxMax(axis);
            // layers the box overlaps end at ceil(2 max) - 1, the ones entered are up to ceil(2 (max + delta + skin)) - 1
            for (let layer = Math.ceil(max * 2), last = Math.ceil((max + delta + skin) * 2) - 1; layer <= last; layer++) {
                if (this.#layerBlocks(axis, layer)) {
                    this.#shift(axis, Math.min(delta, layer / 2 - skin - max));
                    return true;
                }
            }
        } else {
            const min = this.#boxMin(axis);
            for (let layer = Math.floor(min * 2) - 1, last = Math.floor((min + delta - skin) * 2); layer >= last; layer--) {
                if (this.#layerBlocks(axis, layer)) {
                    this.#shift(axis, Math.max(delta, (layer + 1) / 2 + skin - min));
                    return true;
                }
            }
        }
        this.#shift(axis, delta);
        return false;
    }

    /**
     * Moves the box along x or y (see #moveAxis). Stopped while walking on the ground (or falling: into a gap before
     * the next slab), it looks for a ledge in front:
     * walk.stepHeight higher it gets further, and down from there it lands on something with room for the body (2 skins
     * ahead: stopped skin before the ledge, the box isn't over it yet). Then it hops just high enough to get onto it,
     * the horizontal speed kept while it rises along the ledge (see #climbing); the box stays where it was stopped.
     * @returns {boolean} whether it was stopped (not when it hops)
     */
    #moveHorizontal(axis, delta) {
        const x = this.x, y = this.y, z = this.z;
        if (!this.#moveAxis(axis, delta))
            return false;
        if (this.#climbing)
            return false;
        if (this.mode !== "walk" || !(this.onGround || this.vz <= 0) || this.inWater)
            return true;
        const stoppedX = this.x, stoppedY = this.y;
        this.x = x;
        this.y = y;
        const walk = this.#settings.walk;
        this.#moveAxis(2, walk.stepHeight);
        const up = this.z - z;
        this.#moveAxis(axis, delta);
        // along the move (the stopped one may go back: the box was nearer than skin)
        const further = Math.sign(delta) * (axis === 0 ? this.x - stoppedX : this.y - stoppedY) >= 0;
        const ahead = Math.sign(delta) * 2 * this.#settings.skin;
        this.#shift(axis, ahead);
        this.#moveAxis(2, -up);
        // on the ledge there's room for the body (not a wall)
        const room = !this.#overlapsBlocks();
        const rise = this.z - z;
        this.x = stoppedX;
        this.y = stoppedY;
        this.z = z;
        if (!room || !further || rise <= 1e-9)
            return true;
        this.vz = Math.max(this.vz, Math.sqrt(2 * walk.gravity * (rise + walk.stepClearance)));
        this.onGround = false;
        this.#climbing = true;
        return false;
    }

    /** hopping onto a ledge (#moveHorizontal): pressed against it, the horizontal speed isn't lost; until it lands */
    #climbing = false;

    #overlapsBlocks() {
        const lo = [0, 1, 2].map(a => Math.floor(this.#boxMin(a) * 2));
        const hi = [0, 1, 2].map(a => Math.ceil(this.#boxMax(a) * 2) - 1);
        for (let hx = lo[0]; hx <= hi[0]; hx++)
            for (let hy = lo[1]; hy <= hi[1]; hy++)
                for (let hz = lo[2]; hz <= hi[2]; hz++)
                    if (this.#fills(hx, hy, hz))
                        return true;
        return false;
    }

    /**
     * How far the box has to go up to get out of blocks in its lowest layer (a block placed into the feet), if that's at
     * most placeLiftMax and it fits there (on the next half-block level above the feet, or the one above that); 0
     * otherwise (not in a block, or too deep: see #moveToFreeSpot).
     */
    #feetLift() {
        if (!this.#overlapsBlocks())
            return 0;
        const s = this.#settings;
        const z = this.z;
        for (let top = (Math.floor(z * 2) + 1) / 2 + s.skin; top - z <= s.placeLiftMax + LIFT_TOLERANCE; top += 0.5) {
            this.z = top;
            const fits = !this.#overlapsBlocks();
            this.z = z;
            if (fits)
                return top - z;
        }
        return 0;
    }

    /**
     * If the box is inside blocks, moves it up to the first free spot. Waits (returns false) until the chunk is loaded.
     */
    #moveToFreeSpot() {
        const ix = Math.floor(this.x), iy = Math.floor(this.y), iz = Math.floor(this.z);
        if (!this.#world.isLoaded(ix, iy, iz) || !this.#world.isLoaded(ix, iy, iz + 2))
            return false;
        for (let i = 0; i < 512 && this.#overlapsBlocks(); i++)
            this.z = (Math.floor(this.z * 2) + 1) / 2 + this.#settings.skin;
        this.#needsFreeSpot = false;
        return true;
    }
}

/** lifts compare with placeLiftMax with this much to spare: a slab's lift is exactly 0.5, give or take the floats */
const LIFT_TOLERANCE = 1e-6;

function clampAbs(value, max) {
    return value > max ? max : value < -max ? -max : value;
}
