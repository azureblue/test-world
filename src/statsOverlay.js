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
 * Draw calls and triangles per pass of the chunk meshes (solid, cutout leaves, water with its pre-pass, plants) and
 * their sums; the sky and the block outline aren't counted.
 * @param {import("./mesh/uIntMesh.js").DrawStats} d
 */
function drawStatsLine(d) {
    const passes = [
        ["solid", d.solidDraws, d.solidTris], ["cutout", d.cutoutDraws, d.cutoutTris],
        ["water", d.waterDraws, d.waterTris], ["plants", d.xQuadDraws, d.xQuadTris]
    ];
    const draws = passes.reduce((sum, p) => sum + p[1], 0), tris = passes.reduce((sum, p) => sum + p[2], 0);
    return `draws ${passes.map(([name, n]) => `${name}:${n}`).join(" ")} all:${draws} ` +
        `| triangles ${passes.map(([name, , t]) => `${name}:${formatK(t)}`).join(" ")} all:${formatK(tris)}`;
}

/**
 * The debug numbers at the top of the screen (Settings.debug.showStats), updated every statsInterval frames: a line
 * of the camera, player and world, and a line of the draws (Settings.debug.showDrawStats).
 */
export class StatsOverlay {
    #element;
    // updating text nodes' data in place avoids replacing the DOM children on every stats update
    #text = document.createTextNode("");
    #drawText = document.createTextNode("");
    #pos = new Position();

    /** @param {HTMLElement} element */
    constructor(element) {
        this.#element = element;
        if (Settings.debug.showDrawStats)
            element.replaceChildren(this.#text, document.createElement("br"), this.#drawText);
        else
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
        pos.set(camPos.x, camPos.y, camPos.z);
        const block = world.blockAt(pos.ix, pos.iy, pos.iz);
        const overdraw = renderer.overdrawStats;
        this.#text.data =
            `pos ${camPos.x.toFixed(1)}x ${camPos.y.toFixed(1)}y ${camPos.z.toFixed(1)}z ` +
            `dir ${camDir.x.toFixed(1)}x ${camDir.y.toFixed(1)}y ${camDir.z.toFixed(1)}z ` +
            `cam ${camera.pitch.toFixed(1)}p ${camera.yaw.toFixed(1)}y ` +
            `fps ${fps} ` +
            `${player.mode}${player.mode === "fly" && player.noclip ? " noclip" : ""}` +
            `${player.mode === "walk" ? (player.inWater ? " swimming" : player.onGround ? " ground" : " air") : ""} ` +
            `chunks ${frameStats.chunksDrawn}/${frameStats.chunksInRange}/${world.chunksInView} ` +
            (overdraw ? `overdraw avg:${overdraw.avg.toFixed(2)} max:${overdraw.max} ` : "") +
            `block x:${pos.ix} y:${pos.iy} z:${pos.iz} ` +
            `chunk x:${pos.cx} y:${pos.cy} z:${pos.cz} ` +
            `local x:${pos.bx} y:${pos.by} z:${pos.bz} ` +
            `${getBlockById(block).name} ` +
            `${target === null ? "" : "looking at " + getBlockById(target.block).name + " at " + target.x + " " + target.y + " " + target.z}`;
        if (Settings.debug.showDrawStats)
            this.#drawText.data = drawStatsLine(renderer.drawStats);
    }
}
