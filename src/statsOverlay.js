import { getBlockById } from "./blocks.js";
import { Camera } from "./camera.js";
import { Player } from "./player.js";
import { WorldRenderer } from "./render/worldRenderer.js";
import { Settings } from "./settings.js";
import { Position, World } from "./world/world.js";

function formatK(n) {
    return n >= 1000 ? (n / 1000).toFixed(0) + "k" : n.toFixed(0);
}

/**
 * The line of debug numbers at the top of the screen (Settings.debug.showStats), updated every statsInterval frames.
 */
export class StatsOverlay {
    #element;
    // updating a text node's data in place avoids replacing the DOM child on every stats update
    #text = document.createTextNode("");
    #pos = new Position();

    /** @param {HTMLElement} element */
    constructor(element) {
        this.#element = element;
        element.replaceChildren(this.#text);
        if (!Settings.debug.showStats)
            element.style.display = "none";
    }

    /**
     * @param {number} frameNumber
     * @param {object} state
     * @param {Camera} state.camera
     * @param {Player} state.player
     * @param {World} state.world
     * @param {WorldRenderer} state.renderer
     * @param {import("./render/worldRenderer.js").FrameStats} state.frame what the frame drew
     * @param {number} state.fps
     * @param {{x: number, y: number, z: number, block: number} | null} state.target the block looked at
     */
    update(frameNumber, { camera, player, world, renderer, frame: frameStats, fps, target }) {
        if (!Settings.debug.showStats || frameNumber % Settings.debug.statsInterval !== 0)
            return;
        const pos = this.#pos;
        const camPos = camera.position, camDir = camera.direction;
        pos.setWorld(camPos.x, camPos.y, camPos.z);
        const block = world.blockAt(pos.ix, pos.iy, pos.iz);
        const draws = renderer.drawStats;
        const overdraw = renderer.overdrawStats;
        this.#text.data =
            `world pos ${pos.wx.toFixed(1)}x ${pos.wz.toFixed(1)}z ${pos.wy.toFixed(1)}y ` +
            `dir ${camDir.x.toFixed(1)}x ${camDir.z.toFixed(1)}z ${camDir.y.toFixed(1)}y ` +
            `cam ${camera.pitch.toFixed(1)}p ${camera.yaw.toFixed(1)}y ` +
            `fps ${fps} ` +
            `${player.mode}${player.mode === "fly" && player.noclip ? " noclip" : ""}` +
            `${player.mode === "walk" ? (player.inWater ? " swimming" : player.onGround ? " ground" : " air") : ""} ` +
            `chunks ${frameStats.chunksDrawn}/${frameStats.chunksInRange}/${world.chunksInView} ` +
            `draws s:${draws.solidDraws} w:${draws.waterDraws} x:${draws.xQuadDraws} ` +
            `tris s:${formatK(draws.solidTris)} w:${formatK(draws.waterTris)} x:${formatK(draws.xQuadTris)} ` +
            (overdraw ? `overdraw avg:${overdraw.avg.toFixed(2)} max:${overdraw.max} ` : "") +
            `pos x:${pos.ix} y:${pos.iy} z:${pos.iz} ` +
            `chunk x:${pos.cx} y:${pos.cy} z:${pos.cz} ` +
            `local x:${pos.bx} y:${pos.by} z:${pos.bz} ` +
            `${getBlockById(block).name} ` +
            `${target === null ? "" : "looking at " + getBlockById(target.block).name + " at " + target.x + " " + target.y + " " + target.z}`;
    }
}
