import { BLOCK_HEIGHT_FULL, blockHeight, flooded, isFlowing, isLiquid, isXQuads, removed, WATER_SURFACE_LEVEL, withHeight } from "./blocks.js";
import { ItemBar } from "./itemBar.js";
import { Player } from "./player.js";
import { Settings } from "./settings.js";
import { Particles } from "./world/particles.js";
import { World } from "./world/world.js";

/**
 * Breaking and placing blocks: the block the camera looks at ({@link target}, updated every frame), removed with the
 * left mouse button, the item bar's block placed on the face looked at with the right one.
 */
export class BlockInteraction {
    #world;
    #player;
    #itemBar;
    #particles;
    /** @type {ReturnType<World["raycasti"]>} */
    #target = null;

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
        const world = this.#world, player = this.#player;
        const px = t.x + t.nx, py = t.y + t.ny, pz = t.z + t.nz;
        // a block placed into the player only if it can lift the player onto it (swimming, jumping)
        const intoPlayer = player.intersectsBlock(px, py, pz) && !(player.mode === "fly" && player.noclip);
        if (intoPlayer && !player.canStepOnto(pz))
            return;
        const placed = this.#itemBar.block;
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
}
