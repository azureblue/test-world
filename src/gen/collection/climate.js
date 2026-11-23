import { BLOCK_HEIGHT_FULL, BLOCK_IDS, flooded, isSolid, WATER_SURFACE_LEVEL } from "../../blocks.js";
import { CHUNK_SIZE, ChunkBlockData, ChunkGenerator } from "../../chunk/chunk.js";
import { clamp, lerp, smoothstep } from "../../functions.js";
import { Vec3 } from "../../geom.js";
import { ErodedFBM, FBM, RidgedFBM } from "../../noise/fbm.js";
import { hash01, mix32 } from "../../noise/hash.js";
import { DomainProcessor, DomainWrap, Noise, Processor } from "../../noise/noise.js";
import { SimplexNoise } from "../../noise/opensimplex2.js";
import { LinearCurve, point, SmoothCurve, TerraceCurve } from "../curve.js";
import { CurveNode, GenericNode, GenNode } from "../node.js";
import { SPECIES, TreeBuilder } from "../trees/treeBuilder.js";
import { LruCache } from "../../utils.js";

/** the sea's surface: water fills everything below this height that isn't solid */
export const SEA_LEVEL = 0;

/** biomes, the values of the "biome" layer */
export const BIOMES = Object.freeze({
    OCEAN: 0,
    RIVER: 1,
    BEACH: 2,
    DESERT: 3,
    SAVANNA: 4,
    PLAINS: 5,
    FOREST: 6,
    TAIGA: 7,
    TUNDRA: 8,
    MOUNTAINS: 9,
    SNOWY_PEAKS: 10,
    MEADOW: 11,
    BIRCH_FOREST: 12,
    DARK_FOREST: 13,
    SHRUBLAND: 14,
    STEPPE: 15,
    LAKE: 16
});

/** biome names by value */
export const BIOME_NAMES = Object.freeze(Object.keys(BIOMES).map(name => name.toLowerCase().replace("_", " ")));

const B = BLOCK_IDS;

/**
 * What each biome is made of and grows: the top block, the filler under it (and its depth), plants per column and trees
 * per tree cell (density 0..1), the tree species (picked evenly, so repeats weigh); patches: [block, from, to] the top and filler
 * where the soil is in from..to (gravel, sand; on land above rock outcrops, see {@link OUTCROP_SOIL}).
 */
const BIOME_LOOKS = [];
BIOME_LOOKS[BIOMES.OCEAN] = { top: B.SAND, filler: B.SAND, depth: 3 };
BIOME_LOOKS[BIOMES.RIVER] = { top: B.GRAVEL, filler: B.SAND, depth: 2 };
BIOME_LOOKS[BIOMES.LAKE] = { top: B.SAND, filler: B.SAND, depth: 2 };
BIOME_LOOKS[BIOMES.BEACH] = { top: B.SAND, filler: B.SAND, depth: 4 };
BIOME_LOOKS[BIOMES.DESERT] = { top: B.SAND, filler: B.SAND, depth: 6 };
BIOME_LOOKS[BIOMES.SAVANNA] = { top: B.DIRT_GRASS, filler: B.DIRT, depth: 3, plants: 0.06, trees: 0.08, species: [SPECIES.ACACIA], patches: [[B.SAND, 0.65, 1]] };
BIOME_LOOKS[BIOMES.PLAINS] = { top: B.DIRT_GRASS, filler: B.DIRT, depth: 3, plants: 0.1, trees: 0.04, species: [SPECIES.OAK, SPECIES.OAK, SPECIES.OAK, SPECIES.BIG_OAK] };
BIOME_LOOKS[BIOMES.FOREST] = { top: B.DIRT_GRASS, filler: B.DIRT, depth: 4, plants: 0.05, trees: 0.6, species: [SPECIES.OAK, SPECIES.OAK, SPECIES.BIG_OAK, SPECIES.BIG_OAK, SPECIES.BIRCH] };
BIOME_LOOKS[BIOMES.TAIGA] = { top: B.DIRT_GRASS, filler: B.DIRT, depth: 3, plants: 0.03, trees: 0.5, species: [SPECIES.SPRUCE, SPECIES.SPRUCE, SPECIES.SPRUCE, SPECIES.PINE], patches: [[B.GRAVEL, -1, -0.78]] };
BIOME_LOOKS[BIOMES.TUNDRA] = { top: B.SNOW, filler: B.DIRT, depth: 2, trees: 0.03, species: [SPECIES.SPRUCE], patches: [[B.GRAVEL, -1, -0.75]] };
BIOME_LOOKS[BIOMES.MOUNTAINS] = { top: B.ROCK, filler: B.ROCK, depth: 1, trees: 0.04, species: [SPECIES.SPRUCE, SPECIES.PINE], grassy: true };
BIOME_LOOKS[BIOMES.SNOWY_PEAKS] = { top: B.SNOW, filler: B.ROCK, depth: 1 };
BIOME_LOOKS[BIOMES.MEADOW] = { top: B.DIRT_GRASS, filler: B.DIRT, depth: 4, plants: 0.22, trees: 0.015, species: [SPECIES.OAK, SPECIES.OAK, SPECIES.BIG_OAK] };
BIOME_LOOKS[BIOMES.BIRCH_FOREST] = { top: B.DIRT_GRASS, filler: B.DIRT, depth: 4, plants: 0.08, trees: 0.5, species: [SPECIES.BIRCH, SPECIES.BIRCH, SPECIES.BIRCH, SPECIES.OAK] };
BIOME_LOOKS[BIOMES.DARK_FOREST] = { top: B.DIRT_GRASS, filler: B.DIRT, depth: 4, plants: 0.02, trees: 0.9, species: [SPECIES.BIG_OAK, SPECIES.BIG_OAK, SPECIES.OAK] };
BIOME_LOOKS[BIOMES.SHRUBLAND] = { top: B.DIRT_GRASS, filler: B.DIRT, depth: 3, plants: 0.07, trees: 0.3, species: [SPECIES.OAK, SPECIES.ACACIA], patches: [[B.SAND, 0.7, 1], [B.GRAVEL, -1, -0.75]] };
BIOME_LOOKS[BIOMES.STEPPE] = { top: B.DIRT_GRASS, filler: B.DIRT, depth: 3, plants: 0.12, trees: 0.01, species: [SPECIES.OAK], patches: [[B.GRAVEL, -1, -0.7]] };
Object.freeze(BIOME_LOOKS);

/** land where the soil is below this is a rock outcrop, raised a little (the height layer) */
const OUTCROP_SOIL = -0.9;
/** lakes: at most one per cell of this grid (blocks), with this chance */
const LAKE_CELL = 192;
const LAKE_CHANCE = 0.6;
/** lakes kept (cells) */
const LAKE_CACHE_SIZE = 1024;
/** a lake's shore (in its radii, from the centre): flat at its level, then back to the land */
const LAKE_SHORE = 1.25;
const LAKE_SHORE_END = 1.8;
/** a column this much higher than a neighbour is a cliff: bare rock */
const CLIFF_SLOPE = 3;
/** the grid trees are placed on: one candidate per cell, jittered, kept by the biome's tree density */
const TREE_CELL = 6;
/** blocks from the equator to a pole (latitude 0 to 1); the bands repeat beyond */
const POLE_DISTANCE = 4096;
/** the latitude at y = 0: temperate */
const SPAWN_LATITUDE = 0.55;
/** how far the climate bands bend (blocks along y) */
const LATITUDE_WARP = 700;
/** the rain shadow: how far upwind (west) mountains dry the land */
const RAIN_SHADOW_DISTANCE = 500;
/** chunk columns kept (their heights, surfaces and trees), for the chunks above and below */
const COLUMN_CACHE_SIZE = 64;

/**
 * The patch a land column is in: the biome's (by the soil), a rock outcrop (lowest soil, not in sand), or null.
 * @returns {number | null} the block
 */
function patchOf(look, soil, height) {
    if (height <= SEA_LEVEL + 1)
        return null;
    if (soil < OUTCROP_SOIL && look.top !== B.SAND)
        return B.ROCK;
    for (const [block, from, to] of look.patches ?? [])
        if (soil >= from && soil <= to)
            return block;
    return null;
}

/**
 * A column's height without the features 1 block thin (pillars, fins, slits), left where the terrace edges cross the
 * smooth height's small bumps: a column 2 or more above (below) both neighbours along x or along y gets the higher
 * (lower) of them.
 * @param {number} h the column
 * @param {number} l the neighbours: -x, +x, -y, +y
 */
function thin(h, l, r, d, u) {
    let out = h;
    if (h - Math.max(l, r) >= 2)
        out = Math.max(l, r);
    if (h - Math.max(d, u) >= 2)
        out = Math.min(out, Math.max(d, u));
    if (Math.min(l, r) - h >= 2)
        out = Math.min(l, r);
    if (Math.min(d, u) - h >= 2)
        out = Math.max(out, Math.min(d, u));
    return out;
}

/** biome colours by value, for the inspector (src/gen/inspector) */
export const BIOME_COLORS = [];
BIOME_COLORS[BIOMES.OCEAN] = [40, 80, 170];
BIOME_COLORS[BIOMES.RIVER] = [60, 130, 230];
BIOME_COLORS[BIOMES.BEACH] = [230, 215, 150];
BIOME_COLORS[BIOMES.DESERT] = [240, 200, 90];
BIOME_COLORS[BIOMES.SAVANNA] = [180, 170, 70];
BIOME_COLORS[BIOMES.PLAINS] = [130, 200, 90];
BIOME_COLORS[BIOMES.FOREST] = [40, 120, 40];
BIOME_COLORS[BIOMES.TAIGA] = [40, 90, 80];
BIOME_COLORS[BIOMES.TUNDRA] = [200, 220, 230];
BIOME_COLORS[BIOMES.MOUNTAINS] = [120, 110, 100];
BIOME_COLORS[BIOMES.SNOWY_PEAKS] = [250, 250, 255];
BIOME_COLORS[BIOMES.MEADOW] = [160, 225, 100];
BIOME_COLORS[BIOMES.BIRCH_FOREST] = [90, 160, 70];
BIOME_COLORS[BIOMES.DARK_FOREST] = [25, 80, 30];
BIOME_COLORS[BIOMES.SHRUBLAND] = [140, 150, 80];
BIOME_COLORS[BIOMES.STEPPE] = [175, 190, 110];
BIOME_COLORS[BIOMES.LAKE] = [70, 160, 220];
Object.freeze(BIOME_COLORS);

/**
 * The world in 2D layers, each a node (gen/node.js) of one graph evaluated per column (x, y in chunk space, blocks):
 *
 * - **continentalness**: oceans and continents, very low frequency, domain warped; through a curve with flat steps
 *   (continent height): the sea floor, coastal lowlands, an upland and a highland plateau, escarpments between them;
 * - **hills**: eroded fBm (clean slopes, carved valleys) rising from the plateaus, flat topped (hill shape, a curve),
 *   as high as the **roughness** lets them (hill height, a curve: flat meadows over almost half the land, rolling
 *   hills, rugged hills); under the sea the hills too, higher in the deep (the sea floor isn't a smooth slope);
 * - **ridges**: a ridged multifractal, domain warped: mountain chains, sharp ridges, smooth valleys between; the
 *   **erosion** (through a curve, uplift) lowers them instead of scaling them, so the edges of a range are foothills,
 *   not a range shrunk; the mountain profile curve makes the slopes concave (gentle at the foot, steep at the top);
 * - **rivers**: where a low frequency noise crosses 0, as wide as the **river width** says (and deeper the wider);
 *   the width changing along it; the channel's bed is rounded, below the sea level (rivers are water like the sea);
 *   the banks (river bank) keep the mountains off: a flat floodplain with sand bars and the valley's sides (curves
 *   of the distance), in places (**cut bank**, on one side, switching along the river: **bank side**) a wall up to
 *   the land instead; rivers cut through anything;
 * - **detail**: a block or so of relief, more where rough, none in the rivers; the **swell**: a block or two over all
 *   land, floodplains and shores too, so no surface is dead flat;
 * - **escarpments**: a few long cliffs, up to 11 blocks, where a noise crosses 0, their height changing along them and
 *   fading out, the edges jagged (**strata jag**);
 * - **terraces**: on the sea floor (almost all of it, by the **strata**), steps of 1..7 blocks with vertical walls,
 *   the levels tilted (**strata tilt**) and the edges jagged so they don't follow the smooth contours; columns left 1
 *   block thin (here and at escarpments) are levelled when chunks are built;
 * - **lakes**: small lakes above the sea level, at most one per cell of a grid, on flat land off mountains and rivers,
 *   their own water level (the lowest land around), a rounded basin, a flat shore at the level (holding the water);
 * - **height**: all of it, and rock outcrops (raised a little) where the **soil** is lowest;
 * - **latitude**: the climate's big steering, like on the Earth: 0 at the equator, 1 at a pole, along y (warped), a
 *   pole every {@link POLE_DISTANCE} blocks, the spawn temperate. Temperature: hot to cold by latitude, noise, colder
 *   higher up. Humidity: by latitude (wet tropics, dry subtropics, wet temperate belt, dry poles), wetter at the coast
 *   and drier inland (continentality), drier behind mountains (the rain shadow: the uplift upwind, wind from the west),
 *   noise;
 * - **biome**: from the height, the temperature, the humidity, the mountains and the rivers; the **variety** picks
 *   among the biomes a climate allows (meadow or plains, birch, dark or mixed forest, shrubland or steppe).
 *
 * Chunks are built per column from the layers: the biome's top and filler blocks over rock, the sea and lakes, plants
 * and trees (jittered on a grid, by the biome's density and species, see trees/treeBuilder.js). Cliffs are rock, or
 * dirt under grass as high as the **soil** allows; the sea, river and lake floors have the soil's patches of gravel and
 * dirt, rock where steep, plants in the shallows. Everything is from the seed and the position, so chunks match at
 * their borders and every generation is the same.
 */
export class ClimateGenerator extends ChunkGenerator {
    /** @type {import("../inspector/layerView.js").Layer[]} in the order the inspector shows them */
    layers;
    /** for the inspector: heights below are the sea */
    seaLevel = SEA_LEVEL;
    /** the layers by node name */
    #nodes;
    // iteration ids for the nodes' caches: one per column evaluated, never repeated
    #iteration = 0;
    // the graph is evaluated this far from the asked column: noise is 0 at the origin, every layer would be there
    #offsetX;
    #offsetY;
    #treeBuilder = new TreeBuilder();
    /** chunk column key -> its columns (see #column) */
    #columns = new LruCache(COLUMN_CACHE_SIZE);
    /** lake cell key -> its lake or null (see #lake) */
    #lakes = new LruCache(LAKE_CACHE_SIZE);

    /** @param {number} seed */
    constructor(seed) {
        super(seed);
        this.#offsetX = Math.floor((hash01(seed, 1, 2) - 0.5) * 100000);
        this.#offsetY = Math.floor((hash01(seed, 3, 4) - 0.5) * 100000);
        const offsetY = this.#offsetY;
        const s = (k) => mix32(Math.imul(seed, 0x9e3779b1) ^ Math.imul(k + 1, 0x85ebca6b)) | 0;
        // fbm of simplex noise spans about -0.55..0.55; stretched to about -1..1
        const stretch = Processor.of(v => clamp(v * 1.8, -1, 1));
        const to01 = Processor.of(v => (v + 1) / 2);
        const warp = (k, warpFreq, warpAmp) => DomainWrap.basic({
            noiseGenerator: new Noise(SimplexNoise.seed(s(k)), { reducer: FBM.reducer({ octaves: 2 }) }), warpFreq, warpAmp
        });
        // a noise layer: fBm of simplex noise (or another reducer), stretched to about -1..1 (or other postprocessors),
        // domain warped by warp = [k, frequency, amplitude] or other preprocessors
        const noise = (name, k, { frequency, octaves, gain, reducer, warp: w, pre, post = [stretch] }) =>
            new GenNode(new Noise(SimplexNoise.seed(s(k)), {
                preprocessors: w ? [warp(...w)] : pre, reducer: reducer ?? FBM.reducer({ octaves, frequency, gain }),
                postprocessors: post
            }), name);
        // the layers the inspector shows, in the order declared: view "height", "temperature", "humidity",
        // "categories" (with more, e.g. names), or a range [min, max] (grey)
        this.layers = [];
        const show = (node, view, about, more = {}) => {
            this.layers.push(Array.isArray(view) ? { node, view: "grey", range: view, about } : { node, view, about, ...more });
            return node;
        };

        const continentalness = show(noise("continentalness", 1, { frequency: 0.00045, octaves: 6, warp: [101, 0.001, 200] }),
            [-1, 1], "oceans (low) and continents (high)");
        // the land and the sea floor: deep sea, shelf, coast, lowlands, escarpment, upland plateau, escarpment,
        // highland plateau
        const continentHeight = show(new CurveNode(continentalness, new LinearCurve([
            point(-1, -50), point(-0.55, -34), point(-0.3, -12), point(-0.18, -3), point(-0.12, 1), point(-0.02, 3),
            point(0.14, 5), point(0.21, 14), point(0.38, 16), point(0.45, 27), point(0.7, 30), point(1, 42)
        ]), "continent height"), "height", "continentalness through a curve: plateaus, escarpments");

        // where the land is rough (0..1): the hills' height, the detail
        const roughness = show(noise("roughness", 8, { frequency: 0.0012, octaves: 3, post: [stretch, to01] }),
            [0, 1], "high: higher hills, more detail");
        const hillHeight = show(new CurveNode(roughness, new SmoothCurve([0, 0.55, 0.7, 0.85, 1], [2.5, 3, 7, 14, 24]), "hill height"),
            [0, 26], "the roughness through a curve: meadows to hills");
        // 0..1, rising from the plateau
        const hills = show(noise("hills", 2, { reducer: new ErodedFBM({ octaves: 5, frequency: 0.005 }), post: [stretch, to01] }),
            [0, 1], "eroded fBm: clean slopes, carved valleys");
        // flat tops and bottoms, steeper sides: not domes
        const hillShape = show(new CurveNode(hills, new SmoothCurve([0, 0.3, 0.45, 0.6, 0.75, 1], [0, 0.05, 0.3, 0.75, 0.9, 1]), "hill shape"),
            [0, 1], "the hills through a curve: flat tops, steep sides");
        // jags the edges of cliffs (escarpments, terraces) and lake shores: coarser than the detail, which would leave
        // pillars
        const strataJag = show(noise("strata jag", 16, { frequency: 0.015, octaves: 2 }),
            [-1, 1], "jags the edges of escarpments, terraces, lake shores");
        // escarpments: long cliffs where a noise crosses 0 (jagged), up to 11 blocks, their height changing along
        // them and fading out (escarpment height, a curve); the high side where the noise is above 0
        const escarpments = show(noise("escarpments", 17, { frequency: 0.0012, octaves: 2, warp: [117, 0.003, 60] }),
            [-1, 1], "cliffs where it crosses 0");
        const escarpmentSize = show(noise("escarpment size", 18, { frequency: 0.003, octaves: 2 }), [-1, 1], "high: high cliffs");
        const escarpmentHeight = show(new CurveNode(escarpmentSize, new SmoothCurve([-1, 0.25, 0.65, 1], [0, 0, 7, 11]), "escarpment height"),
            [0, 12], "the size through a curve: none, then up to 11");
        const escarpment = show(new GenericNode([escarpments, strataJag, escarpmentHeight], null, ([n, jag, h]) =>
            smoothstep(-0.002, 0.002, n + jag * 0.012) * h, "escarpment"), [0, 12], "the cliffs' high side");
        // on land, the escarpments not at the coast; under the sea, the hills around their middle, higher in the deep
        // and where rough (the sea floor isn't a smooth slope)
        const baseHeight = show(new GenericNode([continentHeight, hillShape, hillHeight, escarpment, roughness], null,
            ([base, h, amp, e, rough]) => {
                const land = smoothstep(-2, 6, base);
                const sea = (h - 0.4) * (3 + 10 * smoothstep(-4, -30, base)) * (0.5 + rough);
                return base + (h * amp + e) * land + sea * (1 - land);
            }, "base height"), "height", "continent height plus the hills and escarpments");

        // mountain chains (0..1), lowered where the erosion is high (uplift low)
        const ridges = show(noise("ridges", 4, {
            reducer: new RidgedFBM({ octaves: 8, frequency: 0.0006, gain: 0.6 }), warp: [104, 0.0012, 160], post: []
        }), [0, 1], "ridged multifractal: mountain chains");
        const erosionNoise = { frequency: 0.0009, octaves: 3 };
        const upliftCurve = new SmoothCurve([-1, -0.25, 0.45, 1], [1, 1, 0, 0]);
        const erosion = show(noise("erosion", 3, erosionNoise), [-1, 1], "low: mountains may rise");
        const uplift = show(new CurveNode(erosion, upliftCurve, "uplift"), [0, 1], "the erosion through a curve");
        const ridgeHeight = show(new GenericNode([ridges, uplift], null, ([r, u]) => r - (1 - u) * 0.35, "ridge height"),
            [0, 1], "the ridges lowered where the uplift is low");
        const mountainProfile = show(new CurveNode(ridgeHeight, new SmoothCurve([0.1, 0.24, 0.42, 0.62, 0.9], [0, 5, 26, 72, 135]), "mountain profile"),
            [0, 135], "ridge height through a curve: concave slopes");

        // rivers: the channel where |rivers| < width (in the noise's units), deeper the wider
        const rivers = show(noise("rivers", 5, { frequency: 0.0007, octaves: 2, warp: [105, 0.0025, 80] }),
            [-1, 1], "rivers where it crosses 0");
        const riverSize = show(noise("river size", 10, { frequency: 0.005, octaves: 2 }), [-1, 1], "big rivers where high");
        const riverWidth = show(new CurveNode(riverSize, new SmoothCurve([-1, -0.3, 0.6, 1], [0.008, 0.012, 0.03, 0.036]), "river width"),
            [0, 0.036], "the river size through a curve");
        const riverDistance = show(new GenericNode([rivers, riverWidth], null, ([n, w]) => Math.abs(n) - w, "river distance"),
            [-0.04, 0.2], "below 0: the channel");
        // the cut bank: the side (the sign of the river noise) where the river undercuts a wall, switching sides
        // along the river (another noise's sign); 1: a wall, 0: a gentle side (where it leaves sand bars)
        const bankSide = show(noise("bank side", 13, { frequency: 0.004, octaves: 2 }), [-1, 1], "which side the cut bank is on");
        const cutBank = show(new GenericNode([rivers, bankSide], null, ([n, side]) =>
            smoothstep(0.45, 0.7, Math.sign(n) * side), "cut bank"), [0, 1], "1: a wall at the river, 0: a gentle side");
        // 0 at the channel, 1 away from the river, by the distance: a flat floodplain, then the valley's sides; or a wall
        const gentleBank = new SmoothCurve([0, 0.015, 0.1], [0, 0.06, 1]), wallBank = new SmoothCurve([0, 0.002, 0.004], [0, 0.02, 1]);
        const riverBank = show(new GenericNode([riverDistance, cutBank], null, ([dist, cut]) =>
            lerp(gentleBank.apply(dist), wallBank.apply(dist), cut), "river bank"), [0, 1], "0 at the river, 1 away: gentle or a wall");

        const mountains = show(new GenericNode([mountainProfile, baseHeight, riverBank], null, ([m, base, bank]) =>
            m * smoothstep(SEA_LEVEL, SEA_LEVEL + 5, base) * bank, "mountains"), [0, 135], "the profile on land, off rivers");

        // fine relief: a block or so, more where rough
        const detail = show(noise("detail", 9, { frequency: 0.05, octaves: 3 }), [-1, 1], "fine relief, by roughness");
        // a gentle swell of a block or two over all land, the floodplains and shores too: no surface dead flat
        const swell = show(noise("swell", 21, { frequency: 0.015, octaves: 2 }), [-1, 1], "a block or two over all land");

        // the land carved to the river: the channel's bed rounded, 2..7 below the sea's surface by the width; the
        // valley lowered to the sea level by the bank; the mountains and the detail on top
        const rawHeight = show(new GenericNode([baseHeight, mountains, riverDistance, riverWidth, riverBank, detail, roughness, swell], null,
            ([base, m, dist, width, bank, d, rough, sw]) => {
                let carved = base;
                if (dist < 0) {
                    const t = Math.min(1, -dist / width), depth = 2 + 5 * smoothstep(0.008, 0.036, width);
                    carved = Math.min(base, SEA_LEVEL - 0.5 - depth * (1 - (1 - t) * (1 - t)) + d * 0.8);
                } else if (base > SEA_LEVEL)
                    carved = lerp(SEA_LEVEL, base, bank);
                const land = smoothstep(SEA_LEVEL, SEA_LEVEL + 4, carved);
                const shore = dist < 0 ? 0 : smoothstep(SEA_LEVEL - 2, SEA_LEVEL + 1, carved);
                return carved + m + d * land * bank * (0.4 + 1.6 * rough) + sw * (1.2 + rough) * shore;
            }, "raw height"), "height", "carved by rivers, mountains, detail");

        // the climate: latitude, 0 at the equator, 1 at a pole, the bands warped
        const latitudeWarp = show(noise("latitude warp", 12, { frequency: 0.0004, octaves: 3 }), [-1, 1], "bends the climate bands");
        const latitude = show(new GenericNode([latitudeWarp], null, ([w], _, x, y) => {
            const u = ((y - offsetY + w * LATITUDE_WARP) / POLE_DISTANCE + SPAWN_LATITUDE) % 2;
            const p = u < 0 ? u + 2 : u;
            return p <= 1 ? p : 2 - p;
        }, "latitude"), [0, 1], "0 equator, 1 pole");
        // wet tropics, dry subtropics (deserts), the wet temperate belt, dry poles
        const latitudeHumidity = show(new CurveNode(latitude, new SmoothCurve([0, 0.15, 0.32, 0.5, 0.68, 0.85, 1],
            [0.6, 0.3, -0.55, 0, 0.35, 0, -0.35]), "latitude humidity"), "humidity", "the latitude through a curve: climate belts");
        // continentality: wetter at the coast, drier deep inland
        const coastHumidity = show(new CurveNode(continentalness, new SmoothCurve([-0.2, 0.05, 0.45, 1], [0.35, 0.15, -0.1, -0.3]), "coast humidity"),
            "humidity", "the continentalness through a curve");
        // the rain shadow: the uplift (where mountains may rise) upwind, the wind from the west: the erosion's noise
        // shifted
        const upwindErosion = show(noise("upwind erosion", 3, {
            ...erosionNoise, pre: [DomainProcessor.of((x, y, out) => { out[0] = x - RAIN_SHADOW_DISTANCE; out[1] = y; })]
        }), [-1, 1], `the erosion ${RAIN_SHADOW_DISTANCE} blocks west`);
        const rainShadow = show(new GenericNode([upwindErosion], null, ([e]) => 0.3 * upliftCurve.apply(e), "rain shadow"),
            [0, 0.3], "the upwind uplift: drier");
        const humidityNoise = show(noise("humidity noise", 7, { frequency: 0.0006, octaves: 3 }), [-1, 1], "local wetter and drier");
        const humidity = show(new GenericNode([latitudeHumidity, coastHumidity, rainShadow, humidityNoise], null,
            ([l, coast, shadow, n]) => clamp(l + coast - shadow + 0.35 * n, -1, 1), "humidity"),
            "humidity", "latitude, coast, rain shadow, noise");

        // terraces on the sea floor: steps of 1..7 blocks with vertical walls; the levels tilted (strata tilt, slowly)
        // and the edges jagged (strata jag), so they don't follow the smooth height's contours
        const strataTilt = show(noise("strata tilt", 14, { frequency: 0.002, octaves: 2 }), [-1, 1], "tilts the terrace levels");
        const terraceInput = show(new GenericNode([rawHeight, strataTilt, strataJag], null, ([h, tilt, jag]) =>
            h + tilt * 12 + jag * 2.5, "terrace input"), "height", "the raw height, tilted, jagged");
        const terraced = show(new CurveNode(terraceInput, new TerraceCurve(4, 1, { jitter: 0.75, seed: s(15) }), "terraced"),
            "height", "the terrace input through a terrace curve");
        // where the sea floor is terraced (almost everywhere, not where it's lowest)
        const strata = show(noise("strata", 11, { frequency: 0.0016, octaves: 3 }), [-1, 1], "the sea floor is terraced where not lowest");
        // patches of ground: rock outcrops (lowest, raised here), gravel and sand by the biome; read when the columns are
        // built, also for up to which height walls in grass are dirt (high) or only low ones, and the sea and river
        // floor's gravel (low) and dirt (high) patches
        const soil = show(noise("soil", 20, { frequency: 0.008, octaves: 3 }),
            [-1, 1], "outcrops (lowest), patches; walls of dirt (high) or rock; the sea floor's patches");
        // lakes above the sea level (see #lake): the distance to the cell's lake in its radii, the shore wobbling (by the
        // strata jag); its water level near it (else the sea level)
        const lake = show(new GenericNode([strataJag], null, ([jag], _, x, y) => {
            const l = this.#lakeAt(x, y);
            return l === null ? 99 : (Math.hypot(x - l.x, y - l.y) + jag * l.r * 0.45) / l.r;
        }, "lake"), [0, 2], "distance to the lake in its radii: below 1 water");
        const lakeLevel = show(new GenericNode([lake], null, ([q], _, x, y) =>
            q < LAKE_SHORE_END ? this.#lakeAt(x, y).level : SEA_LEVEL, "lake level"), "height", "the lake's water level near it");
        const height = show(new GenericNode([rawHeight, terraced, strataTilt, strata, riverBank, soil, lake, lakeLevel],
            null, ([h, t, tilt, k, bank, sl, q, level], _, x, y) => {
                // terraces: almost all the sea floor (not river beds)
                const amount = smoothstep(-0.8, -0.4, k) * smoothstep(-1, -3, h) * 0.95 * bank;
                const outcrop = 3 * smoothstep(OUTCROP_SOIL, OUTCROP_SOIL - 0.2, sl) * smoothstep(1, 4, h);
                h = lerp(h, t - tilt * 12, amount) + outcrop;
                if (q >= LAKE_SHORE_END)
                    return h;
                // a lake: the basin, rounded, below its level; a flat shore at the level (a block above when sunk)
                // around it (holding the water), then back to the land, up or down
                const l = this.#lakeAt(x, y);
                if (q < 1)
                    return Math.min(h, level - 1 - l.depth * (1 - q * q));
                return lerp(l.shore, h, smoothstep(LAKE_SHORE, LAKE_SHORE_END, q));
            }, "height"), "height", "the surface height");

        const latitudeTemperature = show(new CurveNode(latitude, new SmoothCurve([0, 0.25, 0.8, 1], [1, 0.6, -0.4, -0.85]), "latitude temperature"),
            "temperature", "the latitude through a curve");
        const temperatureNoise = show(noise("temperature noise", 6, { frequency: 0.0005, octaves: 3 }), [-1, 1], "local warmer and colder");
        // colder higher up: nothing on the plains, about 1 per 100 blocks above them
        const cooling = show(new CurveNode(height, new LinearCurve([point(12, 0), point(150, -1.5)]), "cooling"),
            [-1.5, 0], "the height through a curve: colder higher up");
        const temperature = show(new GenericNode([latitudeTemperature, temperatureNoise, cooling], null, ([l, t, c]) =>
            clamp(l + 0.3 * t + c, -1, 1), "temperature"), "temperature", "latitude, noise, height");

        // which of the biomes a climate allows: meadows or plains, birch, dark or mixed forest, shrubland or steppe
        const variety = show(noise("variety", 19, { frequency: 0.0018, octaves: 3, warp: [119, 0.004, 50] }),
            [-1, 1], "picks among the biomes a climate allows");

        const biome = new GenericNode([height, baseHeight, mountains, riverDistance, cutBank, temperature, humidity, variety, lake], null,
            ([h, base, m, dist, cut, t, wet, v, q]) => {
                if (q < 1)
                    return BIOMES.LAKE;
                const riverside = dist < 0.01 && base > SEA_LEVEL;
                if (h < SEA_LEVEL)
                    return riverside ? BIOMES.RIVER : BIOMES.OCEAN;
                // the river's low gentle shore: sand bars
                if (riverside && h <= SEA_LEVEL + 1 && cut < 0.1 && dist < 0.006 && t > -0.5)
                    return BIOMES.BEACH;
                if (m > 28)
                    return t < -0.55 ? BIOMES.SNOWY_PEAKS : BIOMES.MOUNTAINS;
                if (h <= SEA_LEVEL + 2 && base < SEA_LEVEL + 3 && t > -0.5)
                    return BIOMES.BEACH;
                if (t < -0.6)
                    return BIOMES.TUNDRA;
                if (t < -0.2)
                    return wet < -0.3 && v > 0.2 ? BIOMES.STEPPE : BIOMES.TAIGA;
                if (t > 0.45) {
                    if (wet < -0.35)
                        return BIOMES.DESERT;
                    if (wet < 0.25)
                        return v > 0.35 ? BIOMES.SHRUBLAND : BIOMES.SAVANNA;
                    return v < -0.3 ? BIOMES.DARK_FOREST : BIOMES.FOREST;
                }
                // temperate: wet forests (birch towards the cold), grass in between, dry steppe and shrubland
                if (wet > 0.3)
                    return v < -0.3 ? BIOMES.DARK_FOREST : v > 0.3 || t < -0.05 ? BIOMES.BIRCH_FOREST : BIOMES.FOREST;
                if (wet > 0)
                    return v > 0.15 ? BIOMES.MEADOW : v < -0.4 ? BIOMES.FOREST : BIOMES.PLAINS;
                if (wet > -0.35)
                    return v < -0.2 ? BIOMES.SHRUBLAND : v > 0.45 ? BIOMES.MEADOW : BIOMES.PLAINS;
                return v < -0.3 ? BIOMES.SHRUBLAND : BIOMES.STEPPE;
            }, "biome");
        show(biome, "categories", "from height, temperature, humidity, mountains, rivers", { names: BIOME_NAMES, colors: BIOME_COLORS });
        this.#nodes = Object.fromEntries(this.layers.map(l => [l.node.name, l.node]));
    }

    static async create(seed, params = {}) {
        return new ClimateGenerator(seed);
    }

    /**
     * Evaluates every layer at a column; their nodes' gen(x, y, iteration) then read the values from their caches
     * (x and y aren't used again: the graph is evaluated at the seed's offset).
     * @returns {number} the iteration to read them with
     */
    evaluate(x, y) {
        x += this.#offsetX;
        y += this.#offsetY;
        // the lake's level is from the graph at other columns: before this column's iteration
        this.#lakeAt(x, y);
        const iteration = ++this.#iteration;
        for (const layer of this.layers)
            layer.node.gen(x, y, iteration);
        return iteration;
    }

    /**
     * The lake of the cell of a column (graph coordinates), or null.
     * @returns {{x: number, y: number, r: number, level: number, shore: number, depth: number} | null}
     */
    #lakeAt(x, y) {
        return this.#lake(Math.floor(x / LAKE_CELL), Math.floor(y / LAKE_CELL));
    }

    /**
     * A cell's lake, if its hash says there is one and the land suits it: a centre and a radius (3..18, mostly small)
     * away from the cell's borders (so a lake and its shore stay in the cell), on flat land above the sea (the raw
     * height at the centre and 4 points on the edge differ by under 10), off mountains and rivers; its level the lowest
     * of those heights or sunk up to 4 under it (its shore then a block above the water), its depth 1..6 (shallower
     * when small). Kept, evaluating the graph at those points (with their own iterations: call it before a column's
     * iteration, as evaluate does).
     * @returns {{x: number, y: number, r: number, level: number, shore: number, depth: number} | null}
     */
    #lake(gx, gy) {
        return this.#lakes.get(gx + "," + gy, () => this.#makeLake(gx, gy));
    }

    #makeLake(gx, gy) {
        let lake = null;
        const hash = (k) => hash01(this.seed ^ k, gx, gy);
        if (hash(0x1a1) < LAKE_CHANCE) {
            const x = (gx + 0.2 + 0.6 * hash(0x1a2)) * LAKE_CELL, y = (gy + 0.2 + 0.6 * hash(0x1a3)) * LAKE_CELL;
            // mostly small ponds, a few bigger lakes
            const r = 3 + 15 * hash(0x1a4) ** 2;
            const n = this.#nodes;
            let min = Infinity, max = -Infinity, suits = true;
            for (const [dx, dy] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) {
                const it = ++this.#iteration;
                const h = n["raw height"].gen(x + dx, y + dy, it);
                min = Math.min(min, h);
                max = Math.max(max, h);
                if (n.mountains.gen(x + dx, y + dy, it) > 2 || n["river distance"].gen(x + dx, y + dy, it) < 0.03)
                    suits = false;
            }
            if (suits && min > SEA_LEVEL + 3 && max - min < 10) {
                // the level at the lowest point, or sunk a few blocks under it (the land rising to the shore), above
                // the sea
                const sink = Math.min(Math.max(0, Math.floor(hash(0x1a6) * 7) - 2), Math.floor(min) - SEA_LEVEL - 2);
                const level = Math.floor(min) - sink;
                lake = { x, y, r, level, shore: level + Math.min(sink, 1), depth: 1 + Math.min(5, r * 0.35) * hash(0x1a5) };
            }
        }
        return lake;
    }

    /**
     * A column without its neighbours: the ground height (the first empty cell), the climate (also for block variants
     * later, see docs/proposals/block-definitions.md), the biome, the soil.
     * @returns {{height: number, temperature: number, humidity: number, biome: number, soil: number}}
     */
    climateAt(x, y) {
        const it = this.evaluate(x, y);
        const n = this.#nodes;
        return {
            height: Math.floor(n.height.gen(x, y, it)), temperature: n.temperature.gen(x, y, it),
            humidity: n.humidity.gen(x, y, it), biome: n.biome.gen(x, y, it), soil: n.soil.gen(x, y, it)
        };
    }

    /**
     * The columns of a chunk column, kept for the chunks above and below: per column the ground height, the top and
     * filler blocks and the filler's depth, the plant; the trees that can reach it.
     */
    #column(cx, cy) {
        return this.#columns.get(cx + "," + cy, () => this.#makeColumn(cx, cy));
    }

    #makeColumn(cx, cy) {
        const startX = cx * CHUNK_SIZE, startY = cy * CHUNK_SIZE;
        // the heights with a margin of 2: thinned with a margin of 1, for the slopes
        const R = CHUNK_SIZE + 4;
        const raw = new Int32Array(R * R);
        const biomes = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
        const soils = new Float32Array(CHUNK_SIZE * CHUNK_SIZE);
        const waters = new Int32Array(CHUNK_SIZE * CHUNK_SIZE);
        const nodes = this.#nodes;
        for (let y = -2; y <= CHUNK_SIZE + 1; y++)
            for (let x = -2; x <= CHUNK_SIZE + 1; x++) {
                const wx = startX + x, wy = startY + y;
                const it = this.evaluate(wx, wy);
                raw[(y + 2) * R + x + 2] = Math.floor(nodes.height.gen(wx, wy, it));
                if (x >= 0 && y >= 0 && x < CHUNK_SIZE && y < CHUNK_SIZE) {
                    biomes[y * CHUNK_SIZE + x] = nodes.biome.gen(wx, wy, it);
                    soils[y * CHUNK_SIZE + x] = nodes.soil.gen(wx, wy, it);
                    waters[y * CHUNK_SIZE + x] = biomes[y * CHUNK_SIZE + x] === BIOMES.LAKE ? nodes["lake level"].gen(wx, wy, it) : SEA_LEVEL;
                }
            }
        const E = CHUNK_SIZE + 2;
        const heights = new Int32Array(E * E);
        for (let y = 0; y < E; y++)
            for (let x = 0; x < E; x++) {
                const r = (y + 1) * R + x + 1;
                heights[y * E + x] = thin(raw[r], raw[r - 1], raw[r + 1], raw[r - R], raw[r + R]);
            }

        const size = CHUNK_SIZE * CHUNK_SIZE;
        const column = {
            heights: new Int32Array(size), tops: new Uint32Array(size), fillers: new Uint32Array(size),
            depths: new Uint8Array(size), plants: new Uint32Array(size), waters, trees: this.#trees(startX, startY)
        };
        for (let y = 0; y < CHUNK_SIZE; y++)
            for (let x = 0; x < CHUNK_SIZE; x++) {
                const i = y * CHUNK_SIZE + x, e = (y + 1) * E + x + 1;
                const h = heights[e];
                const slope = Math.max(Math.abs(h - heights[e - 1]), Math.abs(h - heights[e + 1]),
                    Math.abs(h - heights[e - E]), Math.abs(h - heights[e + E]));
                const biome = biomes[i];
                const look = BIOME_LOOKS[biome];
                const soil = soils[i], water = waters[i], wx = startX + x, wy = startY + y;
                let top = look.top, filler = look.filler, depth = look.depth;
                // the sea, river and lake floor: patches of gravel (most in the deep) and of dirt (not deep)
                if (biome === BIOMES.OCEAN || biome === BIOMES.RIVER || biome === BIOMES.LAKE) {
                    const deep = h < water - 14;
                    if (soil < (deep ? 0.15 : -0.35))
                        top = filler = B.GRAVEL;
                    else if (!deep && soil > 0.3)
                        top = filler = B.DIRT;
                    else if (biome === BIOMES.RIVER && soil > -0.05)
                        top = B.SAND;
                }
                // beaches and river bars: gravel in places
                if (biome === BIOMES.BEACH && soil < -0.3)
                    top = filler = B.GRAVEL;
                // patches on land: the biome's, rock outcrops
                const patch = patchOf(look, soil, h);
                if (patch !== null) {
                    top = filler = patch;
                    if (patch === B.ROCK)
                        depth = 1;
                }
                // gentle mountain slopes low enough have grass
                if (look.grassy && slope < 2 && h < 70) {
                    top = B.DIRT_GRASS;
                    filler = B.DIRT;
                    depth = 2;
                }
                // cliffs: in grass dirt under it, as high as the soil allows (up to 10 where high, else 4); else bare rock
                // (sand and snow slide off too), also under water
                if (slope >= CLIFF_SLOPE) {
                    if (top === B.DIRT_GRASS && h > SEA_LEVEL && slope < (soil > 0 ? 11 : 5)) {
                        filler = B.DIRT;
                        depth = Math.max(depth, slope + 1);
                    } else {
                        top = filler = B.ROCK;
                        depth = 1;
                    }
                }
                column.heights[i] = h;
                column.tops[i] = top;
                column.fillers[i] = filler;
                column.depths[i] = depth;
                // plants: the biome's on its top block; under shallow water, on dirt and a few on sand
                const plants = h >= water ? (top === look.top ? look.plants ?? 0 : 0)
                    : h > water - 14 && h < water - 1 ? (top === B.DIRT ? 0.35 : top === B.SAND ? 0.05 : 0) : 0;
                if (hash01(this.seed ^ 0x5eed, wx, wy) < plants)
                    column.plants[i] = hash01(this.seed ^ 0x9a17, wx, wy) < 0.5 ? B.GRASS_SHORT_0 : B.GRASS_SHORT_1;
            }

        return column;
    }

    /**
     * The trees that can reach the chunk column starting at (startX, startY): one candidate per cell of a grid, at a
     * random place in it, kept by its biome's tree density, on grass, not on a slope.
     * @returns {{x: number, y: number, h: number, seed: number, species: string}[]} x, y, h: world
     */
    #trees(startX, startY) {
        const trees = [];
        const r = TreeBuilder.MAX_RADIUS;
        const gx0 = Math.floor((startX - r) / TREE_CELL), gx1 = Math.floor((startX + CHUNK_SIZE - 1 + r) / TREE_CELL);
        const gy0 = Math.floor((startY - r) / TREE_CELL), gy1 = Math.floor((startY + CHUNK_SIZE - 1 + r) / TREE_CELL);
        for (let gy = gy0; gy <= gy1; gy++)
            for (let gx = gx0; gx <= gx1; gx++) {
                const x = gx * TREE_CELL + Math.floor(hash01(this.seed ^ 0x7e1, gx, gy) * TREE_CELL);
                const y = gy * TREE_CELL + Math.floor(hash01(this.seed ^ 0x7e2, gx, gy) * TREE_CELL);
                const { height, biome, soil } = this.climateAt(x, y);
                const look = BIOME_LOOKS[biome];
                if (look.trees === undefined || height <= SEA_LEVEL || hash01(this.seed ^ 0x7e3, gx, gy) >= look.trees)
                    continue;
                // not on rock, gravel, sand
                if (patchOf(look, soil, height) !== null)
                    continue;
                // on even ground only (where the column isn't rock)
                let flat = true;
                for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
                    if (Math.abs(this.climateAt(x + dx, y + dy).height - height) >= 2)
                        flat = false;
                if (!flat)
                    continue;
                const seed = mix32(Math.imul(gx, 73856093) ^ Math.imul(gy, 19349663) ^ this.seed);
                const species = look.species[Math.floor(hash01(this.seed ^ 0x7e4, gx, gy) * look.species.length)];
                trees.push({ x, y, h: height, seed, species });
            }
        return trees;
    }

    /** the ground's top block, or the top a tree that can reach the column can have */
    solidTops(cx, cy) {
        const { heights, trees } = this.#column(cx, cy);
        const tops = heights.map(h => h - 1);
        const startX = cx * CHUNK_SIZE, startY = cy * CHUNK_SIZE, r = TreeBuilder.MAX_RADIUS;
        for (const tree of trees) {
            const top = tree.h + TreeBuilder.MAX_HEIGHT;
            for (let y = Math.max(tree.y - r - startY, 0); y <= Math.min(tree.y + r - startY, CHUNK_SIZE - 1); y++)
                for (let x = Math.max(tree.x - r - startX, 0); x <= Math.min(tree.x + r - startX, CHUNK_SIZE - 1); x++)
                    tops[y * CHUNK_SIZE + x] = Math.max(tops[y * CHUNK_SIZE + x], top);
        }
        return tops;
    }

    /**
     * @param {Vec3} chunkPos
     * @returns {ChunkBlockData}
     */
    generateChunk(chunkPos) {
        const chunk = new ChunkBlockData();
        const column = this.#column(chunkPos.x, chunkPos.y);
        const startH = chunkPos.z * CHUNK_SIZE, endH = startH + CHUNK_SIZE;
        const { heights, tops, fillers, depths, plants, waters } = column;
        for (let y = 0; y < CHUNK_SIZE; y++)
            for (let x = 0; x < CHUNK_SIZE; x++) {
                const i = y * CHUNK_SIZE + x;
                const ground = heights[i];
                // ground: rock, the filler, the top (at ground - 1)
                const fillerFrom = ground - 1 - depths[i];
                for (let h = startH; h < Math.min(ground, endH); h++)
                    chunk.setHXY(h - startH, x, y, h === ground - 1 ? tops[i] : h >= fillerFrom ? fillers[i] : B.ROCK);
                // a plant on the ground
                if (plants[i] !== 0 && ground >= startH && ground < endH)
                    chunk.setHXY(ground - startH, x, y, plants[i]);
                // the sea (and rivers) or a lake up to its level: full, the top cell at the surface level; plants stay
                // in it
                const water = waters[i];
                for (let h = Math.max(ground, startH); h < Math.min(water, endH); h++) {
                    const block = chunk.getHXY(h - startH, x, y);
                    if (!isSolid(block))
                        chunk.setHXY(h - startH, x, y, flooded(block, h === water - 1 ? WATER_SURFACE_LEVEL : BLOCK_HEIGHT_FULL));
                }
            }
        const startX = chunkPos.x * CHUNK_SIZE, startY = chunkPos.y * CHUNK_SIZE;
        for (const tree of column.trees) {
            const baseH = tree.h - startH, baseX = tree.x - startX, baseY = tree.y - startY;
            if (TreeBuilder.canReachChunk(baseH, baseX, baseY))
                this.#treeBuilder.generate(chunk, baseH, baseX, baseY, tree.seed, tree.species);
        }
        return chunk;
    }
}
