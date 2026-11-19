import { rgb } from "./settings.js";

/**
 * The fog for one camera state: the Fog block (shaders/README.md) and the clear colour.
 */
class FogState {
    /** the Fog block, all of it (8 floats in std140), written with one bufferSubData */
    uniformData;
    /** @type {number[]} the fog colour: empty space beyond the loaded chunks is as far as it gets */
    clearColor;

    /**
     * fog amount = min + (max - min) * smoothstep(start, 1, distance² / fogDistance²)
     * @param {number} fogDistance
     * @param {number[]} color
     * @param {number} start
     * @param {number} min
     * @param {number} max
     */
    constructor(fogDistance, color, start, min, max) {
        // std140: fog_inv_dist_sq fills the slot after the vec3 fog_color, the rest follows without padding:
        // [fog_color.rgb, fog_inv_dist_sq, fog_scale, fog_bias, fog_min, fog_range];
        // scale and bias turn smoothstep(start, 1, x) into smoothstep(0, 1, x * scale + bias), no division in shaders
        const scale = 1 / (1 - start);
        this.uniformData = new Float32Array([...color, 1 / (fogDistance * fogDistance), scale, -start * scale, min, max - min]);
        this.clearColor = color;
    }
}

/**
 * Fog above and under water, from settings.sky and settings.water.
 */
export class Fog {
    /** @type {FogState} */
    aboveWater;
    /** @type {FogState} */
    underWater;

    /**
     * @param {typeof import("./settings.js").Settings.sky} sky
     * @param {typeof import("./settings.js").Settings.water} water
     * @param {number} autoDistance in blocks: the fog distance when sky.fogDistance is 0
     */
    constructor(sky, water, autoDistance) {
        const fogDistance = sky.fogDistance > 0 ? sky.fogDistance : autoDistance;
        this.aboveWater = new FogState(fogDistance, rgb(sky.horizonColor), sky.fogStart, 0, 1);

        // Seen from above, the water surface (alpha a = water.opacity, set by the water shader, the colour not
        // premultiplied, blended with ONE, ONE_MINUS_SRC_ALPHA) gives tex.rgb + (1 - a) * scene, i.e. the scene mixed by
        // a towards tex.rgb / a: that is the water colour.
        const alpha = water.opacity;
        const waterColor = rgb(water.textureColor).map(v => v / alpha);
        const under = water.underwater;
        const color = waterColor.map(v => v * under.colorScale);
        this.underWater = new FogState(under.fogDistance, color, under.fogStart, under.fogMin, under.fogMax);
    }

    /**
     * @param {boolean} inWater
     * @returns {FogState}
     */
    get(inWater) {
        return inWater ? this.underWater : this.aboveWater;
    }
}
