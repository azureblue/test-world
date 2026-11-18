import { BLOCK_HEIGHT_FULL, blockHeight, isLiquid, isSolid } from "./blocks.js";
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
 * collided with solid blocks (plants and water don't block). Positions are world coordinates, y up.
 *
 * Modes: "walk" with gravity and jumping, swimming when in water; "fly" moves freely, colliding with blocks unless
 * noclip is on. The physics runs per simulation tick (see ticker.js), split into substeps no longer than
 * 1 / Settings.player.physicsRate, so it behaves the same at any tick rate. The position of the previous tick is kept
 * for drawing the camera between ticks.
 *
 * Collisions are resolved one axis at a time: a move along an axis checks only the block layers the box enters, so a
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
    get eyeY() { return this.y + this.#settings.eyeHeight + this.bob; }
    get eyeZ() { return this.z; }

    setEyePosition(x, y, z) {
        this.x = x;
        this.y = y - this.#settings.eyeHeight;
        this.z = z;
        // a jump, not a move: nothing to interpolate
        this.prevX = this.x;
        this.prevY = this.y;
        this.prevZ = this.z;
        this.vx = this.vy = this.vz = 0;
        this.#needsFreeSpot = true;
    }

    toggleFly() {
        this.mode = this.mode === "fly" ? "walk" : "fly";
        this.vy = 0;
        this.#needsFreeSpot = true;
    }

    toggleNoclip() {
        this.noclip = !this.noclip;
        this.#needsFreeSpot = true;
    }

    /**
     * Whether a block cell intersects the body (for not placing blocks into the player).
     */
    intersectsBlock(ix, iy, iz) {
        const hw = this.#halfWidth;
        return ix < this.x + hw && ix + 1 > this.x - hw &&
            iy < this.y + this.#settings.height && iy + 1 > this.y &&
            iz < this.z + hw && iz + 1 > this.z - hw;
    }

    /**
     * Whether a block placed into the body (see {@link intersectsBlock}) at height iy can lift the player onto it
     * ({@link stepOnto}): walking and in water or not standing (swimming, jumping, falling), the block is in the
     * lowest layer the body is in, and the body fits on top.
     */
    canStepOnto(iy) {
        if (this.mode !== "walk" || (this.onGround && !this.inWater) || iy !== Math.floor(this.y))
            return false;
        const y = this.y;
        this.y = iy + 1 + this.#settings.skin;
        const fits = !this.#overlapsBlocks();
        this.y = y;
        return fits;
    }

    /**
     * Lifts the player onto a block placed at height iy (see {@link canStepOnto}).
     */
    stepOnto(iy) {
        this.y = iy + 1 + this.#settings.skin;
        this.vy = Math.max(this.vy, 0);
    }

    /**
     * Advances the physics by one tick.
     * @param {number} tickTime seconds per tick
     * @param {PlayerInput} input
     * @param {{x: number, y: number}} lookXZ horizontal look direction, unit length, z in y (camera.directionXZ)
     * @param {{x: number, y: number, z: number}} look look direction, unit length
     * @param {{x: number, y: number, z: number}} right horizontal right vector, unit length
     */
    tick(tickTime, input, lookXZ, look, right) {
        this.prevX = this.x;
        this.prevY = this.y;
        this.prevZ = this.z;
        this.prevBob = this.bob;
        this.#floating = false;
        const substeps = Math.ceil(tickTime * this.#settings.physicsRate - 1e-9);
        const dt = tickTime / substeps;
        for (let i = 0; i < substeps; i++)
            this.#step(dt, input, lookXZ, look, right);
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
        out.y = this.prevY + (this.y - this.prevY) * alpha + this.#settings.eyeHeight +
            this.prevBob + (this.bob - this.prevBob) * alpha;
        out.z = this.prevZ + (this.z - this.prevZ) * alpha;
    }

    #step(dt, input, lookXZ, look, right) {
        const s = this.#settings;
        const collide = this.mode === "walk" || !this.noclip;
        if (collide && this.#needsFreeSpot && !this.#moveToFreeSpot())
            return; // the chunk here isn't loaded yet: wait

        if (this.mode === "fly") {
            this.#fly(input, look, right);
        } else {
            this.inWater = this.#world.isInWater(this.x, this.y + s.swim.enterHeight, this.z);
            if (this.inWater)
                this.#swim(dt, input, lookXZ, right);
            else
                this.#walk(dt, input, lookXZ, right);
        }

        if (!collide) {
            this.x += this.vx * dt;
            this.y += this.vy * dt;
            this.z += this.vz * dt;
            this.onGround = false;
            return;
        }
        // vertical first: standing on a block edge doesn't catch the horizontal move
        const hitY = this.#moveAxis(1, this.vy * dt);
        this.onGround = hitY && this.vy < 0;
        if (hitY)
            this.vy = 0;
        const hitX = this.#moveAxis(0, this.vx * dt);
        this.#wallX = hitX ? Math.sign(this.vx) : 0;
        if (hitX)
            this.vx = 0;
        const hitZ = this.#moveAxis(2, this.vz * dt);
        this.#wallZ = hitZ ? Math.sign(this.vz) : 0;
        if (hitZ)
            this.vz = 0;
    }

    /** the side (-1, 0, 1 on x and z) of the walls the last step ran into */
    #wallX = 0;
    #wallZ = 0;

    #fly(input, look, right) {
        const s = this.#settings.fly;
        const speed = s.speed * (input.sprint ? s.sprintMultiplier : 1);
        const up = (input.jump ? 1 : 0) - (input.down ? 1 : 0);
        let dx = look.x * input.forward + right.x * input.right;
        let dy = look.y * input.forward + up;
        let dz = look.z * input.forward + right.z * input.right;
        const len = Math.hypot(dx, dy, dz);
        const scale = len > 0 ? speed / len : 0;
        this.vx = dx * scale;
        this.vy = dy * scale;
        this.vz = dz * scale;
    }

    #walk(dt, input, lookXZ, right) {
        const s = this.#settings.walk;
        const speed = s.speed * (input.sprint ? s.sprintMultiplier : 1);
        this.#accelerateHorizontal(dt, input, lookXZ, right, speed, this.onGround ? s.groundAcceleration : s.airAcceleration);
        // with jump held, the next jump waits for the cooldown (landing on a step mid-jump would jump again at once);
        // a new press jumps right away
        this.#sinceJump = input.jump ? this.#sinceJump + dt : Infinity;
        if (input.jump && this.onGround && this.#sinceJump >= s.jumpCooldown) {
            this.vy = s.jumpSpeed;
            this.onGround = false;
            this.#sinceJump = 0;
        }
        this.vy = Math.max(this.vy - s.gravity * dt, -s.maxFallSpeed);
    }

    /** seconds since the last jump while jump is held; Infinity once it's released */
    #sinceJump = Infinity;

    #swim(dt, input, lookXZ, right) {
        const s = this.#settings.swim;
        const speed = s.speed * (input.sprint ? s.sprintMultiplier : 1);
        this.#accelerateHorizontal(dt, input, lookXZ, right, speed, s.acceleration);
        if (input.jump && (this.#wallX !== 0 || this.#wallZ !== 0) && this.#nearSurface()) {
            // climbing out onto a low bank: a hop just high enough to get the feet over its edge; swimming up alone
            // stops at the surface (above it the walk physics takes over)
            const rise = this.#bankRise();
            if (rise !== null) {
                // the speed that reaches the peak from here; once hopping, falling under gravity reaches the same peak
                const gravity = this.#settings.walk.gravity;
                const hop = Math.sqrt(2 * gravity * (rise + s.exitClearance));
                this.vy = Math.max(this.vy - gravity * dt, hop);
                return;
            }
        }
        // with jump held the player rises towards the floating point (the waist) at the surface, slower the closer it
        // gets, and floats there, still swimming, instead of popping out into the walk physics
        const floatY = this.y + this.#settings.height * s.depthFraction;
        const surface = this.#waterSurface(floatY);
        const depth = surface === null ? 0 : surface - floatY;
        if (surface !== null && Math.abs(depth) < s.bobRange)
            this.#floating = true;
        let targetVy;
        if (input.down)
            targetVy = -s.downSpeed;
        else if (input.jump)
            targetVy = Math.min(Math.max(depth * s.floatStiffness, -s.floatSinkSpeed), s.upSpeed);
        else if (depth < 0)
            targetVy = -s.floatSinkSpeed;
        else
            targetVy = Math.max(this.vy - s.gravity * dt, -s.maxSinkSpeed);
        this.vy += clampAbs(targetVy - this.vy, s.acceleration * dt * 2);
    }

    /**
     * The height of the water surface over the player at height y: the top of the water column in the cell at y or,
     * if y is just above the water, in the cell below; the top cell is filled up to its level (as the mesher draws
     * it). Null if there's no water there.
     */
    #waterSurface(y) {
        const world = this.#world;
        const ix = Math.floor(this.x), iz = Math.floor(this.z);
        let iy = Math.floor(y);
        if (!isLiquid(world.blockWorldAt(ix, iy, iz))) {
            iy--;
            if (!isLiquid(world.blockWorldAt(ix, iy, iz)))
                return null;
        }
        for (let i = 0; i < 16 && isLiquid(world.blockWorldAt(ix, iy + 1, iz)); i++)
            iy++;
        return iy + blockHeight(world.blockWorldAt(ix, iy, iz)) / BLOCK_HEIGHT_FULL;
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
        for (const [dx, dz] of [[this.#wallX, 0], [0, this.#wallZ]]) {
            if (dx === 0 && dz === 0)
                continue;
            const ix = Math.floor(this.x + dx * reach), iz = Math.floor(this.z + dz * reach);
            // the first free cell above the wall, from the feet up
            let top = Math.floor(this.y);
            while (top <= this.y + maxRise && this.#blocks(ix, top, iz))
                top++;
            const rise = top - this.y;
            if (rise <= 0 || rise > maxRise)
                continue;
            let room = true;
            for (let iy = top; iy < top + s.height; iy++)
                room &&= !this.#blocks(ix, iy, iz);
            if (room && (best === null || rise < best))
                best = rise;
        }
        return best;
    }

    /** whether the point swim.exitDepth above the swimming point is out of the water */
    #nearSurface() {
        const s = this.#settings;
        return !this.#world.isInWater(this.x, this.y + s.height * s.swim.depthFraction + s.swim.exitDepth, this.z);
    }

    /**
     * Changes the horizontal velocity towards the wished one (movement keys relative to the look direction) by at
     * most acceleration * dt.
     */
    #accelerateHorizontal(dt, input, lookXZ, right, speed, acceleration) {
        let wx = lookXZ.x * input.forward + right.x * input.right;
        let wz = lookXZ.y * input.forward + right.z * input.right;
        const len = Math.hypot(wx, wz);
        if (len > 0) {
            wx *= speed / len;
            wz *= speed / len;
        }
        let dvx = wx - this.vx, dvz = wz - this.vz;
        const dv = Math.hypot(dvx, dvz);
        const maxDv = acceleration * dt;
        if (dv > maxDv) {
            dvx *= maxDv / dv;
            dvz *= maxDv / dv;
        }
        this.vx += dvx;
        this.vz += dvz;
    }

    #boxMin(axis) {
        return axis === 1 ? this.y : (axis === 0 ? this.x : this.z) - this.#halfWidth;
    }

    #boxMax(axis) {
        return axis === 1 ? this.y + this.#settings.height : (axis === 0 ? this.x : this.z) + this.#halfWidth;
    }

    #shift(axis, delta) {
        if (axis === 0) this.x += delta;
        else if (axis === 1) this.y += delta;
        else this.z += delta;
    }

    /**
     * Whether a block blocks the body. Blocks of chunks that aren't loaded yet count as solid, so the player doesn't
     * fall or fly into terrain that isn't there yet.
     */
    #blocks(ix, iy, iz) {
        const world = this.#world;
        return !world.isLoadedWorld(ix, iy, iz) || isSolid(world.blockWorldAt(ix, iy, iz));
    }

    /**
     * Whether any block of one layer (cells with coordinate `layer` on `axis`) that the box's cross-section covers
     * blocks the body.
     */
    #layerBlocks(axis, layer) {
        const a1 = axis === 0 ? 1 : 0;
        const a2 = axis === 2 ? 1 : 2;
        const lo1 = Math.floor(this.#boxMin(a1)), hi1 = Math.ceil(this.#boxMax(a1)) - 1;
        const lo2 = Math.floor(this.#boxMin(a2)), hi2 = Math.ceil(this.#boxMax(a2)) - 1;
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
        // layers the move gets closer than skin to count as entered, so the box never ends up nearer than skin
        if (delta > 0) {
            const max = this.#boxMax(axis);
            // layers the box overlaps end at ceil(max) - 1, the ones entered are up to ceil(max + delta + skin) - 1
            for (let layer = Math.ceil(max), last = Math.ceil(max + delta + skin) - 1; layer <= last; layer++) {
                if (this.#layerBlocks(axis, layer)) {
                    this.#shift(axis, Math.min(delta, layer - skin - max));
                    return true;
                }
            }
        } else {
            const min = this.#boxMin(axis);
            for (let layer = Math.floor(min) - 1, last = Math.floor(min + delta - skin); layer >= last; layer--) {
                if (this.#layerBlocks(axis, layer)) {
                    this.#shift(axis, Math.max(delta, layer + 1 + skin - min));
                    return true;
                }
            }
        }
        this.#shift(axis, delta);
        return false;
    }

    #overlapsBlocks() {
        const lo = [0, 1, 2].map(a => Math.floor(this.#boxMin(a)));
        const hi = [0, 1, 2].map(a => Math.ceil(this.#boxMax(a)) - 1);
        for (let ix = lo[0]; ix <= hi[0]; ix++)
            for (let iy = lo[1]; iy <= hi[1]; iy++)
                for (let iz = lo[2]; iz <= hi[2]; iz++)
                    if (isSolid(this.#world.blockWorldAt(ix, iy, iz)))
                        return true;
        return false;
    }

    /**
     * If the box is inside blocks, moves it up to the first free spot. Waits (returns false) until the chunk is loaded.
     */
    #moveToFreeSpot() {
        const ix = Math.floor(this.x), iy = Math.floor(this.y), iz = Math.floor(this.z);
        if (!this.#world.isLoadedWorld(ix, iy, iz) || !this.#world.isLoadedWorld(ix, iy + 2, iz))
            return false;
        for (let i = 0; i < 256 && this.#overlapsBlocks(); i++)
            this.y = Math.floor(this.y) + 1 + this.#settings.skin;
        this.#needsFreeSpot = false;
        return true;
    }
}

function clampAbs(value, max) {
    return value > max ? max : value < -max ? -max : value;
}
