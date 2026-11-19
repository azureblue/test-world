/**
 * All tunable settings in one place. Plain data only (JSON-compatible); values derived from them are computed where
 * they're used (for example the fog uniforms in fog.js).
 *
 * Any value can be overridden with a URL parameter named by its path, applied when this module is first imported:
 *   ?world.generator=trees&camera.far=123&debug.overdraw=true&sky.horizonColor=#add9fa
 * The text is read as the type of the default value: a number, true/false, a string (quotes optional), an array
 * (comma separated, or JSON) or a colour (#rrggbb, #rrggbbaa, or numbers). Unknown paths and values that don't fit are
 * reported and ignored. A # in a value works as it is (the app uses no URL fragment, see urlParams).
 */
export const Settings = {
    world: {
        // chunk generator, see gen/registry.js
        generator: "default",
        // the world worker meshes with the fast, unoptimized mesher
        fastMesher: false,
        // in chunks; chunks are loaded and drawn within this distance
        renderDistance: 8,
        // loaded chunks are kept until they're this many times the render distance away
        retainDistanceFactor: 2,
        // seconds: a chunk changed in the world worker (edits, flowing water) is sent again at most this often
        chunkUpdateInterval: 0.1
    },

    camera: {
        // world position of the eye, y up (the player's feet are eyeHeight below)
        startPosition: [2, 2, 2],
        // degrees; yaw 0 looks along +x, 90 along +z; pitch is up/down, -89..89
        startYaw: 0,
        startPitch: 0,
        // vertical, degrees
        fieldOfView: 60,
        near: 0.1,
        far: 640,
        // degrees per pixel of mouse movement
        mouseSensitivity: 0.2
    },

    simulation: {
        // ticks per second; everything that changes the world over time (player physics, flowing water, block
        // updates) runs per tick, rendering runs per frame
        tickRate: 60,
        // more ticks due in one frame (after a stall, a hidden tab) are dropped: the simulation slows down instead
        maxTicksPerFrame: 10,
        // draw the camera between the last two ticks; without it movement judders when ticks and frames don't line up
        interpolate: true
    },

    player: {
        // "walk" (gravity, jumping, swimming in water) or "fly" (free movement)
        mode: "walk",
        // the body is a box: width x width x height, the feet at the bottom centre
        width: 0.6,
        height: 1.8,
        // camera height above the feet
        eyeHeight: 1.62,
        // the box always stays this far from blocks it touches, in blocks (> 0: no exact contact, no float trouble)
        skin: 0.001,
        // a block can be placed into the body if it lifts the player onto it by at most this much, in blocks: near the top
        // of a jump (one block per jump), floating in water; not when standing
        placeLiftMax: 0.5,
        // how fast such a block pushes the player up onto it, in blocks per second
        placeLiftSpeed: 4,
        // physics steps per second at least: a tick is split into substeps no longer than 1 / physicsRate, so jumps and
        // collisions behave the same at any simulation.tickRate
        physicsRate: 120,
        walk: {
            // blocks per second
            speed: 4.3,
            sprintMultiplier: 1.3,
            // how fast the speed changes, blocks per second², on the ground and in the air
            groundAcceleration: 50,
            airAcceleration: 3,
            // blocks per second²; with jumpSpeed 8.1 a jump reaches ~1.27 blocks and lasts ~0.65 s (at physicsRate 120)
            gravity: 25,
            jumpSpeed: 8.1,
            // seconds; holding jump, the next jump starts at the earliest this long after the last one (a new press
            // jumps at once)
            jumpCooldown: 0.5,
            maxFallSpeed: 78
        },
        swim: {
            // the player swims (swim physics, swim speed) while the point this high above the feet is in water
            enterHeight: 0.1,
            // the floating point, as a fraction of the height: swimming up pushes only while it is under the surface,
            // so the player floats with it at the surface; 0.73 keeps the eye ~0.3 above the water
            depthFraction: 0.73,
            // with jump held the player rises at depth * floatStiffness (1/s; depth of the floating point under the
            // surface, at most upSpeed), so it slows down near the surface and settles there smoothly
            floatStiffness: 4,
            // sinking back while the floating point is above the surface
            floatSinkSpeed: 1,
            // floating at the surface (the floating point within bobRange of it) the view gently rises and sinks:
            // bobHeight up and down (blocks), one wave per bobPeriod (seconds), fading in and out over bobFade
            // (seconds); only the camera moves, not the body
            bobHeight: 0.1,
            bobPeriod: 1.4,
            bobFade: 0.5,
            bobRange: 0.3,
            speed: 2.5,
            sprintMultiplier: 1.5,
            acceleration: 12,
            // sinking without input
            gravity: 5,
            // vertical speed with jump held / the down key held
            upSpeed: 3.5,
            downSpeed: 3,
            maxSinkSpeed: 3,
            // climbing out: with jump held against a wall near the surface (the point exitDepth above the swimming point
            // is out of the water) the player hops onto it if its top is at most exitMaxRise above the feet; the hop
            // lifts the feet exitClearance over the edge. 1.8 lets the player out onto a bank at the water's level
            // (~1.45 above the feet when floating), not one block higher
            exitDepth: 0.5,
            exitMaxRise: 1.8,
            exitClearance: 0.2
        },
        fly: {
            speed: 20,
            sprintMultiplier: 3,
            // collide with blocks (and with chunks that aren't loaded yet, which count as solid); false passes through
            // terrain (noclip), toggled with controls.toggleNoclip
            collide: true
        }
    },

    controls: {
        // KeyboardEvent.key values (letters lower case)
        forward: "w",
        back: "s",
        left: "a",
        right: "d",
        // jump; flying: up; swimming: up
        jump: " ",
        // flying: down; swimming: down
        down: "Shift",
        sprint: "Control",
        toggleFly: "f",
        toggleNoclip: "n",
        pause: "p"
    },

    interaction: {
        // how far blocks can be selected, in blocks
        reach: 5,
        // the blocks in the bar at the bottom (keys of BLOCK_IDS); the selected one (mouse wheel, 1..9) is placed with the
        // right mouse button
        itemBar: ["DIRT_GRASS", "DIRT", "ROCK", "SAND", "GRAVEL", "TREE_TRUNK", "TREE_LEAVES", "WATER", "GRASS_SHORT_0"]
    },

    sky: {
        // the sky's colour straight up and at the horizon (and below it); terrain fades into the horizon colour (the
        // fog's), so the far world reads as haze, with the sky going on above it
        zenithColor: "#4d8ff2",
        horizonColor: "#add9fa",
        // where the sky is the zenith colour: the view direction's height, 0 at the horizon, 1 straight up
        gradientHeight: 0.5,
        // the sun, in degrees: height above the horizon, direction around it (0 towards +x, 90 towards +z), radius
        sunElevation: 40,
        sunAzimuth: 120,
        sunSize: 2.5,
        // the sun is blocky: this many square pixels across its radius (more: rounder)
        sunPixels: 4,
        sunColor: "#fff5d6",
        // the glow around the sun: strength (added to the sky) and how far it reaches, in degrees (where it's 10%)
        sunGlow: 0.35,
        sunGlowSize: 20,
        // in blocks, terrain fades into the sky towards this distance; 0: as far as the loaded chunks reach in every
        // direction (see WorldRenderer), so the world's edge, and chunks dropped there when the camera moves, are
        // always in the fog
        fogDistance: 0,
        // where the fade starts, as a fraction of fogDistance squared (0.5: at about 0.7 of the distance): clear up to
        // there, then hazier towards the edge; 0: haze from close by, higher: crisp closer to the edge, a quicker fade
        fogStart: 0.5
    },

    water: {
        // how much the water hides what's behind it, 0..1, looking straight down (the water shader's alpha, see fresnel)
        opacity: 0.76,
        // average colour of the water texture
        textureColor: "#004ab0",
        // pre-pass of the water faces:
        // "depth" - depth-only program, then the colour pass; only the nearest water face is blended into a pixel
        // "full" - the same with the water program in the pre-pass (for comparison)
        // "off" - no pre-pass; overlapping water faces blend depending on the draw order
        prepass: "off",
        // the water gets more opaque the flatter it's seen: the light goes through more of it (1 / cos as much), so
        // alpha = 1 - (1 - opacity)^(1 + fresnelStrength * (1 / cos - 1)); off: not in the shader at all
        fresnel: true,
        // 0..1; 1: clear looking down, solid looking across; 0: the same opacity from every angle
        fresnelStrength: 1,
        // flowing water (world/waterFlow.js, run by the world worker), no levels yet: water woken by a block change
        // next to it flows down into an empty cell, or sideways into empty cells if it can't flow down
        flow: {
            enabled: true,
            // seconds per flow step (rounded to whole simulation ticks)
            interval: 0.25,
            // cells updated per tick at most, the rest wait for the next tick
            maxUpdatesPerTick: 256
        },
        underwater: {
            // the fog colour is the water colour scaled by this
            colorScale: 0.6,
            // in blocks
            fogDistance: 32,
            // fog amount at the camera, the base tint
            fogMin: 0.45,
            // fog amount at fogDistance and beyond
            fogMax: 0.9,
            // where the fog starts to grow above fogMin, as a fraction of fogDistance squared
            fogStart: 0,
            // the water faces seen from inside (the surface from below, air pockets): colour and alpha scale
            faceColorScale: 0.35,
            faceAlphaScale: 0.6
        }
    },

    debug: {
        // overdraw view: counts fragment shader invocations per pixel
        overdraw: false,
        // the overdraw view is read back every this many frames
        overdrawSampleInterval: 30,
        // the stats line is updated every this many frames
        statsInterval: 5,
        showStats: true
    }
};

/** a colour in hex: rrggbb or rrggbbaa (alpha), "#" optional */
const HEX_COLOR = /^#?([0-9a-f]{6}(?:[0-9a-f]{2})?)$/i;

/**
 * A colour setting's value as red, green, blue, alpha, 0..1: a "#rrggbb" or "#rrggbbaa" string (the defaults, for an
 * editor's colour picker) or [r, g, b] / [r, g, b, a]; alpha 1 if it has none.
 * @param {string | number[]} color
 * @returns {number[]}
 */
export function rgba(color) {
    if (Array.isArray(color))
        return color.length === 4 ? color : [...color, 1];
    const hex = HEX_COLOR.exec(color)[1];
    const channels = [0, 2, 4, 6].slice(0, hex.length / 2).map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
    return channels.length === 4 ? channels : [...channels, 1];
}

/**
 * A colour setting's value as red, green, blue, 0..1 (alpha, if it has one, left out), see {@link rgba}.
 * @param {string | number[]} color
 * @returns {number[]}
 */
export function rgb(color) {
    return rgba(color).slice(0, 3);
}

/** whether a setting is a colour: its default is a "#rrggbb" or "#rrggbbaa" string */
function isColorSetting(current) {
    return typeof current === "string" && current.startsWith("#") && HEX_COLOR.test(current);
}

/** a colour value: "#rrggbb", "#rrggbbaa", or 3 or 4 numbers */
function isColor(value) {
    return (typeof value === "string" && value.startsWith("#") && HEX_COLOR.test(value)) ||
        (Array.isArray(value) && (value.length === 3 || value.length === 4) &&
            value.every(v => typeof v === "number" && !Number.isNaN(v)));
}

/**
 * Reads a URL parameter value as the type of the current (default) value.
 * @param {string} text
 * @param {any} current
 * @returns {any} the value, or undefined if the text doesn't fit the type
 */
function parseAs(text, current) {
    if (isColorSetting(current)) {
        // rrggbb[aa] or #rrggbb[aa] (# is %23 in a URL), or r,g,b[,a] / [r,g,b[,a]]
        const hex = HEX_COLOR.exec(text.trim());
        if (hex !== null)
            return "#" + hex[1].toLowerCase();
        let value;
        try {
            value = JSON.parse(text.startsWith("[") ? text : `[${text}]`);
        } catch {
            return undefined;
        }
        return isColor(value) ? value : undefined;
    }
    if (typeof current === "boolean")
        return text === "true" ? true : text === "false" ? false : undefined;
    if (typeof current === "number") {
        const value = Number(text);
        return text.trim() === "" || Number.isNaN(value) ? undefined : value;
    }
    if (typeof current === "string")
        return /^(["']).*\1$/.test(text) ? text.slice(1, -1) : text;
    if (Array.isArray(current) && current.length > 0 && current.every(v => typeof v === "string")) {
        // a list of names: comma separated (quotes optional) or a JSON array, any length
        let value;
        try {
            value = text.startsWith("[") ? JSON.parse(text) : text.split(",").map(v => parseAs(v.trim(), ""));
        } catch {
            return undefined;
        }
        return Array.isArray(value) && value.length > 0 && value.every(v => typeof v === "string" && v !== "") ? value : undefined;
    }
    if (Array.isArray(current)) {
        // a vector (a colour, a position): the same length and types
        let value;
        try {
            value = JSON.parse(text.startsWith("[") ? text : `[${text}]`);
        } catch {
            return undefined;
        }
        const fits = Array.isArray(value) && value.length === current.length &&
            value.every((v, i) => typeof v === typeof current[i]);
        return fits ? value : undefined;
    }
    return undefined;
}

/** every setting changed from its default (URL parameters, overrideSettings): path -> value */
const overrides = new Map();

/**
 * The parent object and current value of a setting path, or null if there's no such setting (a group isn't one).
 * @param {string} path
 * @returns {{parent: object, key: string, current: any} | null}
 */
function findSetting(path) {
    const keys = path.split(".");
    const key = keys.pop();
    let parent = Settings;
    for (const k of keys) {
        parent = Object.hasOwn(parent, k) ? parent[k] : undefined;
        if (typeof parent !== "object" || parent === null || Array.isArray(parent))
            return null;
    }
    if (!Object.hasOwn(parent, key))
        return null;
    const current = parent[key];
    return typeof current === "object" && !Array.isArray(current) ? null : { parent, key, current };
}

/**
 * Whether a value fits a setting: the default's type; a list of names any length, a vector (colour, position) the
 * same length and types.
 */
function fits(value, current) {
    if (isColorSetting(current))
        return isColor(value);
    if (!Array.isArray(current))
        return typeof value === typeof current && !(typeof value === "number" && Number.isNaN(value));
    if (!Array.isArray(value))
        return false;
    if (current.length > 0 && current.every(v => typeof v === "string"))
        return value.length > 0 && value.every(v => typeof v === "string" && v !== "");
    return value.length === current.length && value.every((v, i) => typeof v === typeof current[i]);
}

/**
 * Applies the parameters whose names are setting paths (contain a dot); other parameters are left alone.
 * @param {Iterable<[string, string]>} params
 */
function applyUrlParams(params) {
    for (const [path, text] of params) {
        if (!path.includes("."))
            continue;
        const setting = findSetting(path);
        if (setting === null) {
            console.warn(`Settings: no setting "${path}", URL parameter ignored`);
            continue;
        }
        const value = parseAs(text, setting.current);
        if (value === undefined) {
            console.warn(`Settings: "${text}" doesn't fit ${path} (default ${JSON.stringify(setting.current)}), URL parameter ignored`);
            continue;
        }
        setting.parent[setting.key] = value;
        overrides.set(path, value);
    }
}

/**
 * Changes settings from code, like URL parameters do (tests). Call it before the modules that read settings when
 * they're loaded (world/chunkManager.js, game.js) are imported. The world worker gets the overrides too
 * ({@link settingsParams}).
 * @param {{[path: string]: any}} values setting path (as in URL parameters) -> value of the setting's type
 * @throws if a path isn't a setting or a value doesn't fit it
 */
export function overrideSettings(values) {
    for (const [path, value] of Object.entries(values)) {
        const setting = findSetting(path);
        if (setting === null)
            throw new Error(`Settings: no setting "${path}"`);
        if (!fits(value, setting.current))
            throw new Error(`Settings: ${JSON.stringify(value)} doesn't fit ${path} (default ${JSON.stringify(setting.current)})`);
        setting.parent[setting.key] = value;
        overrides.set(path, value);
    }
}

/**
 * The settings changed from their defaults, as URL parameters (for the world worker, which reads its settings from
 * its URL).
 * @returns {URLSearchParams}
 */
export function settingsParams() {
    const params = new URLSearchParams();
    for (const [path, value] of overrides)
        params.set(path, typeof value === "object" ? JSON.stringify(value) : String(value));
    return params;
}

/**
 * The parameters of a URL, also after a "#": a colour like sky.zenithColor=#4d8ff2 would otherwise end the query
 * there (the browser takes the rest as the fragment), so the query and the fragment are read as one.
 * @param {string} href
 * @returns {Array<[string, string]>}
 */
function urlParams(href) {
    const start = href.indexOf("?");
    if (start < 0)
        return [];
    const params = [];
    for (const pair of href.slice(start + 1).split("&")) {
        if (pair === "")
            continue;
        const eq = pair.indexOf("=");
        const decode = (text) => decodeURIComponent(text.replace(/\+/g, " "));
        params.push(eq < 0 ? [decode(pair), ""] : [decode(pair.slice(0, eq)), decode(pair.slice(eq + 1))]);
    }
    return params;
}

applyUrlParams(urlParams(self.location.href));
