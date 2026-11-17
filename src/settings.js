/**
 * All tunable settings in one place. Plain data only (JSON-compatible); values derived from them are computed where
 * they're used (for example the fog uniforms in fog.js).
 *
 * Any value can be overridden with a URL parameter named by its path, applied when this module is first imported:
 *   ?world.generator=trees&camera.far=123&debug.overdraw=true&sky.color=0.5,0.7,1
 * The text is read as the type of the default value: a number, true/false, a string (quotes optional) or an array
 * (comma separated, or JSON). Unknown paths and values that don't fit are reported and ignored.
 */
export const Settings = {
    world: {
        // chunk generator, see gen/registry.js
        generator: "default",
        // the chunk loader meshes with the fast, unoptimized mesher
        fastMesher: false,
        // in chunks; chunks are loaded and drawn within this distance
        renderDistance: 8,
        // loaded chunks are kept until they're this many times the render distance away
        retainDistanceFactor: 2
    },

    camera: {
        startPosition: [-5, 3, 0],
        // vertical, degrees
        fieldOfView: 60,
        near: 0.1,
        far: 640,
        // blocks per frame
        moveSpeed: 0.5,
        // degrees per pixel of mouse movement
        mouseSensitivity: 0.2
    },

    interaction: {
        // how far blocks can be selected, in blocks
        reach: 5,
        // the block placed with the right mouse button, a key of BLOCK_IDS
        placeBlock: "ROCK"
    },

    sky: {
        color: [0.522, 0.855, 1],
        // in blocks, terrain fades into the sky towards this distance
        fogDistance: 256,
        // where the fade starts, as a fraction of fogDistance squared
        fogStart: 0.6
    },

    water: {
        // alpha of the water texture, 0..255 (applied to the texture when it's loaded, see textures.js)
        textureAlpha: 220,
        // average colour of the water texture
        textureColor: [0, 0.29, 0.69],
        // height of the water surface in its cell; must match WATER_LEVEL_SURFACE in mesh/cpp/blocks.hpp (7/8)
        surfaceLevel: 0.875,
        // pre-pass of the water faces:
        // "depth" - depth-only program, then the colour pass; only the nearest water face is blended into a pixel
        // "full" - the same with the water program in the pre-pass (for comparison)
        // "off" - no pre-pass; overlapping water faces blend depending on the draw order
        prepass: "off",
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
        statsInterval: 5
    }
};

/**
 * Reads a URL parameter value as the type of the current (default) value.
 * @param {string} text
 * @param {any} current
 * @returns {any} the value, or undefined if the text doesn't fit the type
 */
function parseAs(text, current) {
    if (typeof current === "boolean")
        return text === "true" ? true : text === "false" ? false : undefined;
    if (typeof current === "number") {
        const value = Number(text);
        return text.trim() === "" || Number.isNaN(value) ? undefined : value;
    }
    if (typeof current === "string")
        return /^(["']).*\1$/.test(text) ? text.slice(1, -1) : text;
    if (Array.isArray(current)) {
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

/**
 * Applies the parameters whose names are setting paths (contain a dot); other parameters are left alone.
 * @param {URLSearchParams} params
 */
function applyUrlParams(params) {
    for (const [path, text] of params) {
        if (!path.includes("."))
            continue;
        const keys = path.split(".");
        const last = keys.pop();
        let parent = Settings;
        for (const key of keys) {
            parent = Object.hasOwn(parent, key) ? parent[key] : undefined;
            if (typeof parent !== "object" || parent === null || Array.isArray(parent))
                break;
        }
        const exists = typeof parent === "object" && parent !== null && !Array.isArray(parent) && Object.hasOwn(parent, last);
        const current = exists ? parent[last] : undefined;
        if (!exists || (typeof current === "object" && !Array.isArray(current))) {
            console.warn(`Settings: no setting "${path}", URL parameter ignored`);
            continue;
        }
        const value = parseAs(text, current);
        if (value === undefined) {
            console.warn(`Settings: "${text}" doesn't fit ${path} (default ${JSON.stringify(current)}), URL parameter ignored`);
            continue;
        }
        parent[last] = value;
    }
}

applyUrlParams(new URL(self.location.href).searchParams);
