import {
    BLOCK_HEIGHT_FULL, BLOCK_IDS, blockHeight, blockOctants, blockShape, flooded, getBlockById, isFlowing, isLiquid, isShaped,
    isXQuads, octantsBox, removed, SHAPES, WATER_SURFACE_LEVEL, withHeight, withShape
} from "./blocks.js";
import { ItemBar } from "./itemBar.js";
import { Player } from "./player.js";
import { Settings } from "./settings.js";
import { Particles } from "./world/particles.js";
import { World } from "./world/world.js";

/**
 * Breaking and placing blocks: the block the camera looks at ({@link target}, updated every frame), removed with the
 * left mouse button, the item bar's block placed on the face looked at with the right one. A slab is placed by
 * halves: on a top face the bottom half, on a bottom face the top one, on a side the half looked at; onto a slab of
 * the same kind (its inner face looked at, or in the cell the new one goes to) it adds the missing half, the two making
 * the full block.
 */
export class BlockInteraction {
    #world;
    #player;
    #itemBar;
    #particles;
    /** @type {ReturnType<World["raycasti"]>} */
    #target = null;
    /** where the target was looked at from, and the direction */
    #eye = { x: 0, y: 0, z: 0 };
    #direction = { x: 0, y: 0, z: 0 };

    /**
     * @param {World} world
     * @param {Player} player
     * @param {ItemBar} itemBar
     * @param {Particles} [particles] the broken blocks' fragments go here
     */
    constructor(world, player, itemBar, particles = null) {
        this.#world = world;
        this.#player = player;
        this.#itemBar = itemBar;
        this.#particles = particles;
    }

    /** the block looked at (and the face hit), or null */
    get target() {
        return this.#target;
    }

    /**
     * @param {{x: number, y: number, z: number}} eye
     * @param {{x: number, y: number, z: number}} direction unit length
     */
    update(eye, direction) {
        // copied: the camera's vectors change
        this.#eye.x = eye.x; this.#eye.y = eye.y; this.#eye.z = eye.z;
        this.#direction.x = direction.x; this.#direction.y = direction.y; this.#direction.z = direction.z;
        this.#target = this.#world.raycasti(eye, direction, Settings.interaction.reach);
    }

    /** Removes the block looked at, throwing out its fragments; a plant in water leaves its water. */
    breakBlock() {
        const t = this.#target;
        if (t !== null && this.#world.setBlock(t.x, t.y, t.z, removed(t.block)))
            this.#particles?.spawnBlockBreak(t.x, t.y, t.z, t.block, this.#world);
    }

    /** Places the item bar's block on the face looked at. */
    placeBlock() {
        const t = this.#target;
        if (t === null || (t.nx === 0 && t.ny === 0 && t.nz === 0))
            return; // nothing looked at, or the camera is inside the block (no face was hit)
        const world = this.#world;
        const px = t.x + t.nx, py = t.y + t.ny, pz = t.z + t.nz;
        const placed = this.#itemBar.block;
        if (placed === BLOCK_IDS.EMPTY)
            return; // an empty slot
        if (isShaped(placed)) {
            this.#placeSlab(t, px, py, pz, placed);
            return;
        }
        if (!this.#fitsPlayer(px, py, pz))
            return;
        const cell = world.blockAt(px, py, pz);
        let block = placed;
        if (isLiquid(placed)) {
            // placed water gets the level water has there: full under other water, the surface level otherwise
            block = withHeight(placed, isLiquid(world.blockAt(px, py, pz + 1)) ? BLOCK_HEIGHT_FULL : WATER_SURFACE_LEVEL);
        } else if (isXQuads(placed) && isLiquid(cell)) {
            // a plant placed into water stays in it
            block = flooded(placed, blockHeight(cell), isFlowing(cell));
        }
        world.setBlock(px, py, pz, block);
    }

    /**
     * A slab placed (see the class): the missing half of the slab looked at or of the one at px, py, pz, else a new one
     * there.
     */
    #placeSlab(t, px, py, pz, placed) {
        const world = this.#world;
        const full = getBlockById(placed).full;
        const sameKind = (block) => isShaped(block) && getBlockById(block) === getBlockById(placed);
        if (full !== null) {
            // the slab looked at, its inner face (a bottom slab's top, a top slab's bottom)
            if (sameKind(t.block) && t.nz === (blockShape(t.block) === SHAPES.SLAB_BOTTOM ? 1 : -1)) {
                this.#completeSlab(t.x, t.y, t.z, t.block, full);
                return;
            }
            const cell = world.blockAt(px, py, pz);
            if (sameKind(cell)) {
                this.#completeSlab(px, py, pz, cell, full);
                return;
            }
        }
        const hitZ = this.#eye.z + this.#direction.z * t.t;
        const top = t.nz === -1 || (t.nz === 0 && hitZ - Math.floor(hitZ) >= 0.5);
        const block = withShape(placed, top ? SHAPES.SLAB_TOP : SHAPES.SLAB_BOTTOM);
        if (this.#fitsPlayer(px, py, pz, octantsBox(blockOctants(block))))
            world.setBlock(px, py, pz, block);
    }

    /** a slab's missing half added: the full block (its name) */
    #completeSlab(x, y, z, slab, full) {
        const missing = blockShape(slab) === SHAPES.SLAB_BOTTOM ? SHAPES.SLAB_TOP : SHAPES.SLAB_BOTTOM;
        if (this.#fitsPlayer(x, y, z, octantsBox(blockOctants(withShape(slab, missing)))))
            this.#world.setBlock(x, y, z, BLOCK_IDS[full]);
    }

    /**
     * Whether a block can be placed there: not into the player, unless it can lift the player onto it (swimming,
     * jumping, a slab under the feet).
     * @param {number[]} [box] the part of the cell the block fills (octantsBox), the whole by default
     */
    #fitsPlayer(px, py, pz, box = [0, 0, 0, 1, 1, 1]) {
        const player = this.#player;
        const intoPlayer = player.intersectsBlock(px, py, pz, box) && !(player.mode === "fly" && player.noclip);
        return !intoPlayer || player.canStepOnto(pz, box[5]);
    }
}
