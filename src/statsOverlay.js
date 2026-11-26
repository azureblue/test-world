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
        `| triangles ${passes.map(([name, , t]) => `${name}:${formatK(t)}`).join(" ")} all:${formatK(tris)} ` +
        `| particles ${d.particles}`;
}

/** the levels of stats, see StatsOverlay */
const LEVELS = 3;

/**
 * The debug numbers at the top of the screen (Settings.debug.showStats), updated every statsInterval frames, in levels
 * (Settings.debug.statsLevel, the next one by Settings.controls.stats, after the last the first):
 * 0. a line: fps, the camera's position, the block looked at;
 * 1. the line longer: also the direction, the player (its mode, speed) and where it is (block, chunk, the block there);
 * 2. also a line under it of the draws, the chunks drawn, the overdraw, the quick mesher's time.
 */
export class StatsOverlay {
    #element;
    // updating text nodes' data in place avoids replacing the DOM children on every stats update
    #text = document.createTextNode("");
    #drawText = document.createTextNode("");
    #drawLine = document.createElement("div");
    #level = 0;
    #pos = new Position();

    /** @param {HTMLElement} element */
    constructor(element) {
        this.#element = element;
        const line = document.createElement("div");
        line.append(this.#text);
        this.#drawLine.className = "stats-line";
        this.#drawLine.append(this.#drawText);
        element.replaceChildren(line, this.#drawLine);
        this.level = Settings.debug.statsLevel;
        if (!Settings.debug.showStats)
            element.style.display = "none";
    }

    get level() {
        return this.#level;
    }

    /** @param {number} value 0..2, see the class */
    set level(value) {
        this.#level = Math.min(Math.max(Math.trunc(value) || 0, 0), LEVELS - 1);
        this.#drawLine.hidden = this.#level < 2;
    }

    /** the next level of stats, after the last the first */
    nextLevel() {
        this.level = (this.#level + 1) % LEVELS;
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
        const camPos = camera.position, camDir = camera.direction;
        const looking = target === null ? "" : ` looking at ${getBlockById(target.block).name}`;
        const position = `fps ${fps} pos ${camPos.x.toFixed(1)}x ${camPos.y.toFixed(1)}y ${camPos.z.toFixed(1)}z`;
        if (this.#level === 0) {
            this.#text.data = position + looking;
            return;
        }
        const pos = this.#pos;
        pos.set(camPos.x, camPos.y, camPos.z);
        const status = player.mode === "fly" ? (player.noclip ? " noclip" : "")
            : player.inWater ? " swimming" : player.onGround ? " ground" : " air";
        this.#text.data = position +
            ` dir ${camDir.x.toFixed(1)}x ${camDir.y.toFixed(1)}y ${camDir.z.toFixed(1)}z ` +
            `cam ${camera.pitch.toFixed(1)}p ${camera.yaw.toFixed(1)}y ` +
            `${player.mode}${status} ` +
            `speed ${Math.hypot(player.vx, player.vy).toFixed(1)} up ${player.vz.toFixed(1)} ` +
            `block x:${pos.ix} y:${pos.iy} z:${pos.iz} ` +
            `chunk x:${pos.cx} y:${pos.cy} z:${pos.cz} ` +
            `local x:${pos.bx} y:${pos.by} z:${pos.bz} ` +
            `in ${getBlockById(world.blockAt(pos.ix, pos.iy, pos.iz)).name}` + looking;
        if (this.#level < 2)
            return;
        const overdraw = renderer.overdrawStats;
        this.#drawText.data =
            `chunks ${frameStats.chunksDrawn}/${frameStats.chunksInRange}/${world.chunksInView} ` +
            (overdraw ? `overdraw avg:${overdraw.avg.toFixed(2)} max:${overdraw.max} ` : "") +
            `quick mesh ${world.quickMeshTime.toFixed(2)} ms | ` +
            drawStatsLine(renderer.drawStats);
    }
}
