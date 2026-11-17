/**
 * The values the shaders get for one camera state: the fog part of the Camera block (shaders/README.md), the clear
 * colour and the water program's water_face_mul.
 */
class FogState {
    /** fog_inv_dist_sq .. fog_range of the Camera block, consecutive in std140, written with one bufferSubData */
    uniformData;
    /** @type {number[]} the fog colour: empty space beyond the loaded chunks is as far as it gets */
    clearColor;
    waterFaceMul;

    /**
     * fog amount = min + (max - min) * smoothstep(start, 1, distance² / fogDistance²)
     * @param {number} fogDistance
     * @param {number[]} color
     * @param {number} start
     * @param {number} min
     * @param {number} max
     * @param {number[]} waterFaceMul
     */
    constructor(fogDistance, color, start, min, max, waterFaceMul) {
        // fog_inv_dist_sq fills the slot after the vec3 cam_pos, the rest follows without padding:
        // [fog_inv_dist_sq, fog_color.rgb, fog_scale, fog_bias, fog_min, fog_range];
        // scale and bias turn smoothstep(start, 1, x) into smoothstep(0, 1, x * scale + bias), no division in shaders
        const scale = 1 / (1 - start);
        this.uniformData = new Float32Array([1 / (fogDistance * fogDistance), ...color, scale, -start * scale, min, max - min]);
        this.clearColor = color;
        this.waterFaceMul = new Float32Array(waterFaceMul);
    }
}

/**
 * Fog and water tint above and under water, from settings.sky and settings.water.
 */
export class Fog {
    /** @type {FogState} */
    aboveWater;
    /** @type {FogState} */
    underWater;

    /**
     * @param {typeof import("./settings.js").Settings.sky} sky
     * @param {typeof import("./settings.js").Settings.water} water
     */
    constructor(sky, water) {
        this.aboveWater = new FogState(sky.fogDistance, sky.color, sky.fogStart, 0, 1, [1, 1, 1, 1]);

        // Seen from above, the water surface (texture alpha a, not premultiplied, blended with ONE, ONE_MINUS_SRC_ALPHA)
        // gives tex.rgb + (1 - a) * scene, i.e. the scene mixed by a towards tex.rgb / a: that is the water colour.
        const alpha = water.textureAlpha / 255;
        const waterColor = water.textureColor.map(v => v / alpha);
        const under = water.underwater;
        const color = waterColor.map(v => v * under.colorScale);
        const faceMul = [under.faceColorScale, under.faceColorScale, under.faceColorScale, under.faceAlphaScale];
        this.underWater = new FogState(under.fogDistance, color, under.fogStart, under.fogMin, under.fogMax, faceMul);
    }

    /**
     * @param {boolean} inWater
     * @returns {FogState}
     */
    get(inWater) {
        return inWater ? this.underWater : this.aboveWater;
    }
}
