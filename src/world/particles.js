import { getBlockById, isSolid } from "../blocks.js";
import { Settings } from "../settings.js";

// a particle's floats in Particles.data: first what the particle shader takes per instance (the drawn size shrinks at
// the end), then the physics
const X = 0, Y = 1, Z = 2, DRAWN_SIZE = 3;
// the texture patch: corner u, v, its size, the layer
const U = 4, V = 5, PATCH = 6, LAYER = 7;
const LIGHT = 8;
const VX = 9, VY = 10, VZ = 11;
const AGE = 12, LIFE = 13, SIZE = 14;

/**
 * Where the shader's per-instance inputs start in a particle's floats: the position and drawn size (4 floats), the
 * texture patch (u, v, size, layer: 4 floats), the light (1 float).
 */
export const PARTICLE_INSTANCE = Object.freeze({ position: X, texture: U, light: LIGHT });
/** floats per particle (16: whole 64-byte blocks) */
export const PARTICLE_FLOATS = 16;

/**
 * Fragments of broken blocks: small squares showing a patch of the block's texture, thrown out of it, falling with
 * gravity, bouncing a little and sliding to a stop on solid blocks, gone after their lifetime (shrinking at the end).
 * Only for the look: they run per frame on the client, nothing else sees them. Positions are the game's (z up).
 *
 * All particles are in one array, a block of {@link PARTICLE_FLOATS} each (the fields at fixed offsets), the
 * live ones first (a dead one is replaced by the last): the renderer uploads its start as the instance buffer, the
 * shader reading the fields it needs from each block.
 */
export class Particles {
    #s = Settings.particles;
    #max = this.#s.max;
    #count = 0;
    /** the particles, {@link PARTICLE_FLOATS} each, the first {@link count} alive */
    data = new Float32Array(this.#max * PARTICLE_FLOATS);

    /** the particles alive */
    get count() {
        return this.#count;
    }

    /**
     * Throws out the fragments of a broken block.
     * @param {number} x the block
     * @param {number} y
     * @param {number} z
     * @param {number} block the block that was there
     */
    spawnBlockBreak(x, y, z, block) {
        const s = this.#s;
        if (!s.enabled)
            return;
        const def = getBlockById(block);
        if (def === undefined || def.model === "none")
            return;
        const textures = Settings.render.cutoutLeaves && def.cutoutTextureIds !== null ? def.cutoutTextureIds : def.textureIds;
        const d = this.data;
        for (let n = 0; n < s.perBlock && this.#count < this.#max; n++) {
            const o = this.#count++ * PARTICLE_FLOATS;
            const size = s.minSize + Math.random() * (s.maxSize - s.minSize);
            // from inside the block, out from its centre and up
            const ox = Math.random() - 0.5, oy = Math.random() - 0.5, oz = Math.random() - 0.5;
            const speed = s.speed * (0.5 + Math.random());
            d[o + X] = x + 0.5 + ox * 0.8;
            d[o + Y] = y + 0.5 + oy * 0.8;
            d[o + Z] = z + 0.5 + oz * 0.8;
            d[o + VX] = ox * speed * 2;
            d[o + VY] = oy * speed * 2;
            d[o + VZ] = s.upSpeed * (0.5 + Math.random());
            d[o + AGE] = 0;
            d[o + LIFE] = s.lifetime * (0.6 + Math.random() * 0.8);
            d[o + SIZE] = d[o + DRAWN_SIZE] = size;
            // a patch of a face's texture as big as the particle (the texture covers a block), the sides more often
            const face = Math.random() < 0.7 ? 1 + Math.floor(Math.random() * 4) : Math.random() < 0.5 ? 0 : 5;
            d[o + U] = Math.random() * (1 - size);
            d[o + V] = Math.random() * (1 - size);
            d[o + PATCH] = size;
            d[o + LAYER] = textures[face];
            d[o + LIGHT] = 0.7 + Math.random() * 0.3;
        }
    }

    /**
     * Moves the particles by a frame.
     * @param {number} dt seconds
     * @param {{blockAt: (x: number, y: number, z: number) => number}} world
     */
    update(dt, world) {
        const s = this.#s, d = this.data;
        dt = Math.min(dt, 0.05);
        const solid = (x, y, z) => isSolid(world.blockAt(Math.floor(x), Math.floor(y), Math.floor(z)));
        const at = [0, 0, 0];
        let i = 0;
        while (i < this.#count) {
            const o = i * PARTICLE_FLOATS;
            const age = d[o + AGE] += dt, left = d[o + LIFE] - age;
            if (left <= 0) {
                this.#remove(i);
                continue;
            }
            const r = d[o + SIZE] / 2;
            d[o + VZ] -= s.gravity * dt;
            // one axis at a time: a move into a solid block stops on its face (the particle's half size away)
            let onGround = false;
            for (let a = 0; a < 3; a++) {
                const v = d[o + VX + a];
                if (v === 0)
                    continue;
                const next = d[o + X + a] + v * dt;
                const edge = next + Math.sign(v) * r;
                at[0] = d[o + X]; at[1] = d[o + Y]; at[2] = d[o + Z];
                at[a] = edge;
                if (solid(at[0], at[1], at[2])) {
                    d[o + X + a] = v > 0 ? Math.floor(edge) - r - 1e-3 : Math.floor(edge) + 1 + r + 1e-3;
                    // a small bounce, none once slow
                    d[o + VX + a] = Math.abs(v) > 1.5 ? -v * s.bounce : 0;
                    if (a === 2 && v < 0)
                        onGround = true;
                } else
                    d[o + X + a] = next;
            }
            if (onGround) {
                const slow = Math.max(0, 1 - s.groundFriction * dt);
                d[o + VX] *= slow;
                d[o + VY] *= slow;
            }
            // shrinking over the last quarter second
            d[o + DRAWN_SIZE] = d[o + SIZE] * Math.min(1, left * 4);
            i++;
        }
    }

    /** removes a particle: the last one takes its place */
    #remove(i) {
        const last = --this.#count;
        if (i !== last)
            this.data.copyWithin(i * PARTICLE_FLOATS, last * PARTICLE_FLOATS, (last + 1) * PARTICLE_FLOATS);
    }
}
