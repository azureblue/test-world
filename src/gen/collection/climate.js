import { BLOCK_HEIGHT_FULL, BLOCK_IDS, flooded, isSolid, WATER_SURFACE_LEVEL } from "../../blocks.js";
import { CHUNK_SIZE, ChunkBlockData, ChunkGenerator } from "../../chunk/chunk.js";
import { clamp, lerp, smoothstep } from "../../functions.js";
import { Vec3 } from "../../geom.js";
import { FBM } from "../../noise/fbm.js";
import { hash01, mix32 } from "../../noise/hash.js";
import { DomainWrap, Noise, Processor } from "../../noise/noise.js";
import { SimplexNoise } from "../../noise/opensimplex2.js";
import { Curve, LinearCurve, point, SmoothCurve } from "../curve.js";
import { CurveNode, GenericNode, GenNode, Node } from "../node.js";
import { TREE_MATERIALS, TREE_TYPES, TreeGenerator } from "../treeGen.js";

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
    SNOWY_PEAKS: 10
});

/** biome names by value */
export const BIOME_NAMES = Object.freeze(Object.keys(BIOMES).map(name => name.toLowerCase().replace("_", " ")));

const B = BLOCK_IDS;

/**
 * What each biome is made of and grows: the top block, the filler under it (and its depth), plants per column and trees
 * per tree cell (density 0..1), the tree types and their materials.
 */
const BIOME_LOOKS = [];
BIOME_LOOKS[BIOMES.OCEAN] = { top: B.SAND, filler: B.SAND, depth: 3 };
BIOME_LOOKS[BIOMES.RIVER] = { top: B.GRAVEL, filler: B.SAND, depth: 2 };
BIOME_LOOKS[BIOMES.BEACH] = { top: B.SAND, filler: B.SAND, depth: 4 };
BIOME_LOOKS[BIOMES.DESERT] = { top: B.SAND, filler: B.SAND, depth: 6 };
BIOME_LOOKS[BIOMES.SAVANNA] = { top: B.DIRT_GRASS, filler: B.DIRT, depth: 3, plants: 0.12, trees: 0.08, treeTypes: [TREE_TYPES.ROUND, TREE_TYPES.BUSH, TREE_TYPES.ROUND] };
BIOME_LOOKS[BIOMES.PLAINS] = { top: B.DIRT_GRASS, filler: B.DIRT, depth: 3, plants: 0.22, trees: 0.04, treeTypes: [TREE_TYPES.OAK, TREE_TYPES.ROUND, TREE_TYPES.BUSH] };
BIOME_LOOKS[BIOMES.FOREST] = { top: B.DIRT_GRASS, filler: B.DIRT, depth: 4, plants: 0.1, trees: 0.6, treeTypes: [TREE_TYPES.OAK, TREE_TYPES.OAK, TREE_TYPES.BIRCH, TREE_TYPES.BIG_OAK, TREE_TYPES.ROUND] };
BIOME_LOOKS[BIOMES.TAIGA] = { top: B.DIRT_GRASS, filler: B.DIRT, depth: 3, plants: 0.05, trees: 0.5, treeTypes: [TREE_TYPES.PINE], materials: TREE_MATERIALS.SPRUCE };
BIOME_LOOKS[BIOMES.TUNDRA] = { top: B.SNOW, filler: B.DIRT, depth: 2, trees: 0.03, treeTypes: [TREE_TYPES.PINE], materials: TREE_MATERIALS.SPRUCE };
BIOME_LOOKS[BIOMES.MOUNTAINS] = { top: B.ROCK, filler: B.ROCK, depth: 1, trees: 0.04, treeTypes: [TREE_TYPES.PINE], materials: TREE_MATERIALS.SPRUCE, grassy: true };
BIOME_LOOKS[BIOMES.SNOWY_PEAKS] = { top: B.SNOW, filler: B.ROCK, depth: 1 };
Object.freeze(BIOME_LOOKS);

/** a column this much higher than a neighbour is a cliff: bare rock */
const CLIFF_SLOPE = 3;
/** the grid trees are placed on: one candidate per cell, jittered, kept by the biome's tree density */
const TREE_CELL = 6;
/** chunk columns kept (their heights, surfaces and trees), for the chunks above and below */
const COLUMN_CACHE_SIZE = 64;

/**
 * A layer of the generator: a node, how to show it (the introspector: src/gen/test/climate.html) and what it means.
 * @typedef {{node: Node, view: "grey" | "height" | "temperature" | "humidity" | "biome", range?: number[], about: string}} Layer
 *   range: the values shown from black to white (view "grey")
 */

/**
 * The world in 2D layers, each a node (gen/node.js) of one graph evaluated per column (x, y in chunk space, blocks):
 *
 * - **continentalness**: oceans and continents, very low frequency, domain warped; the height of the land and the sea
 *   floor through a curve (continent height);
 * - **hills**: rolling relief over it, more of it inland and where the **roughness** is high (base height);
 * - **erosion**: where mountains may rise (low erosion: high mountains);
 * - **ridges**: ridged noise, domain warped: long mountain chains, scaled by erosion, only on land;
 * - **rivers**: where a low frequency noise crosses 0; the river bank flattens the land towards the river and keeps
 *   the mountains off it; the river bed is below the sea level, so rivers are water like the sea;
 * - **detail**: fine relief of a block or a few, more where rough, most on mountains (craggy peaks);
 * - **height**: all of it;
 * - **temperature**: noise, colder higher up (so the peaks get snow); **humidity**: noise, wetter near the sea;
 * - **biome**: from the height, the temperature, the humidity, the mountains and the rivers.
 *
 * Chunks are built per column from the layers: the biome's top and filler blocks over rock (bare rock on cliffs), the
 * sea, plants and trees (jittered on a grid, by the biome's density, spruce in the cold). Everything is from the
 * seed and the position, so chunks match at their borders and every generation is the same.
 */
export class ClimateGenerator extends ChunkGenerator {
    /** @type {Layer[]} in the order the introspector shows them */
    layers;
    /** the layers by node name */
    #nodes;
    // iteration ids for the nodes' caches: one per column evaluated, never repeated
    #iteration = 0;
    // the graph is evaluated this far from the asked column: noise is 0 at the origin, every layer would be there
    #offsetX;
    #offsetY;
    #treeGen = new TreeGenerator();
    /** chunk column key -> its columns (see #column) */
    #columns = new Map();

    /** @param {number} seed */
    constructor(seed = 1) {
        super();
        const s = (k) => mix32(Math.imul(seed, 0x9e3779b1) ^ Math.imul(k + 1, 0x85ebca6b)) | 0;
        // fbm of simplex noise spans about -0.55..0.55; stretched to about -1..1
        const stretch = Processor.of(v => clamp(v * 1.8, -1, 1));
        const warp = (k, warpFreq, warpAmp) => DomainWrap.basic({
            noiseGenerator: new Noise(SimplexNoise.seed(s(k)), { reducer: FBM.reducer({ octaves: 2 }) }), warpFreq, warpAmp
        });

        const continentalness = new GenNode(new Noise(SimplexNoise.seed(s(1)), {
            preprocessors: [warp(101, 0.0015, 120)],
            reducer: FBM.reducer({ octaves: 6, frequency: 0.0007, gain: 0.5 }),
            postprocessors: [stretch]
        }), "continentalness");
        const hills = new GenNode(new Noise(SimplexNoise.seed(s(2)), {
            reducer: FBM.reducer({ octaves: 5, frequency: 0.009, gain: 0.55 }), postprocessors: [stretch]
        }), "hills");
        // where the land is rough: more hills, more detail (0..1)
        const roughness = new GenNode(new Noise(SimplexNoise.seed(s(8)), {
            reducer: FBM.reducer({ octaves: 3, frequency: 0.003 }), postprocessors: [stretch, Processor.of(v => (v + 1) / 2)]
        }), "roughness");
        // fine relief: a block or a few, more of it where rough and on mountains
        const detail = new GenNode(new Noise(SimplexNoise.seed(s(9)), {
            reducer: FBM.reducer({ octaves: 4, frequency: 0.06, gain: 0.6 }), postprocessors: [stretch]
        }), "detail");
        const erosion = new GenNode(new Noise(SimplexNoise.seed(s(3)), {
            reducer: FBM.reducer({ octaves: 3, frequency: 0.0011 }), postprocessors: [stretch]
        }), "erosion");
        // ridged: 1 - |noise| per octave, peaks at 1; squared, the ridges narrow; the higher octaves make them craggy
        const ridges = new GenNode(new Noise(SimplexNoise.seed(s(4)), {
            preprocessors: [warp(104, 0.003, 60)],
            reducer: FBM.reducer({ octaves: 6, frequency: 0.0013, gain: 0.5, processor: Processor.of(v => 1 - Math.abs(v)) }),
            postprocessors: [Processor.of(r => r * r)]
        }), "ridges");
        const rivers = new GenNode(new Noise(SimplexNoise.seed(s(5)), {
            preprocessors: [warp(105, 0.003, 70)],
            reducer: FBM.reducer({ octaves: 2, frequency: 0.0008 }),
            postprocessors: [stretch]
        }), "rivers");
        const temperatureNoise = new GenNode(new Noise(SimplexNoise.seed(s(6)), {
            reducer: FBM.reducer({ octaves: 3, frequency: 0.0006 }), postprocessors: [stretch]
        }), "temperature noise");
        const humidityNoise = new GenNode(new Noise(SimplexNoise.seed(s(7)), {
            reducer: FBM.reducer({ octaves: 3, frequency: 0.0008 }), postprocessors: [stretch]
        }), "humidity noise");

        // the height of the land and the sea floor from the continentalness: deep sea, shelf, coast, plains, highlands
        const continentHeight = new CurveNode(continentalness, new LinearCurve([
            point(-1, -48), point(-0.6, -30), point(-0.38, -8), point(-0.26, -1), point(-0.18, 2), point(0.15, 8),
            point(0.55, 18), point(1, 34)
        ]), "continent height");
        // plus the hills, more of them inland and where rough
        const baseHeight = new GenericNode([continentHeight, hills, roughness], null, ([base, h, rough]) =>
            base + h * (2 + 10 * smoothstep(-2, 12, base) * (0.4 + rough)), "base height");

        // 1 far from rivers, 0 in them: the river (~|n| < 0.025) and a valley widening it
        const riverBank = new CurveNode(rivers, new SmoothCurve([-1, -0.14, -0.025, 0.025, 0.14, 1], [1, 1, 0, 0, 1, 1]), "river bank");

        // how much of the ridges rises: all where the erosion is low, none where it's high
        const uplift = new CurveNode(erosion, new SmoothCurve([-1, -0.45, 0.35, 1], [1, 1, 0, 0]), "uplift");

        // mountain height: the ridges by the uplift, only on land, not across rivers
        const mountains = new GenericNode([ridges, uplift, baseHeight, riverBank], null, ([r, u, base, bank]) =>
            r * 110 * u * smoothstep(2, 14, base) * bank, "mountains");

        // the land carved down to the river bed (below the sea level) near rivers, the mountains on top, the detail
        // over all of it: a little on plains, more where rough, most on mountains (not in rivers, not under the sea)
        const height = new GenericNode([baseHeight, mountains, riverBank, detail, roughness], null, ([base, m, bank, d, rough]) => {
            const carved = base > SEA_LEVEL ? lerp(SEA_LEVEL - 3, base, bank) : base;
            const land = smoothstep(SEA_LEVEL, SEA_LEVEL + 6, carved);
            return carved + m + d * (land * bank * (0.6 + 2.5 * rough) + m * 0.09);
        }, "height");

        // colder higher up: nothing on the plains, about 1 per 100 blocks above them
        const cooling = new CurveNode(height, new LinearCurve([point(12, 0), point(150, -1.5)]), "cooling");
        const temperature = new GenericNode([temperatureNoise, cooling], null, ([t, c]) => clamp(t + c, -1, 1), "temperature");
        // wetter near the sea: by the base height (the sea floor and the coast)
        const seaHumidity = new CurveNode(baseHeight, new SmoothCurve([-6, 10], [0.35, 0]), "sea humidity");
        const humidity = new GenericNode([humidityNoise, seaHumidity], null, ([m, wet]) => clamp(m + wet, -1, 1), "humidity");

        const biome = new GenericNode([height, baseHeight, mountains, riverBank, temperature, humidity], null,
            ([h, base, m, bank, t, wet]) => {
                const riverside = bank < 0.3 && base > SEA_LEVEL;
                if (h < SEA_LEVEL)
                    return riverside ? BIOMES.RIVER : BIOMES.OCEAN;
                // the river's low shore: sand, like a beach
                if (riverside && h <= SEA_LEVEL + 1 && t > -0.5)
                    return BIOMES.BEACH;
                if (m > 28)
                    return t < -0.5 ? BIOMES.SNOWY_PEAKS : BIOMES.MOUNTAINS;
                if (h <= SEA_LEVEL + 2 && base < SEA_LEVEL + 3 && t > -0.5)
                    return BIOMES.BEACH;
                if (t < -0.5)
                    return BIOMES.TUNDRA;
                if (t < -0.15)
                    return BIOMES.TAIGA;
                if (t > 0.4)
                    return wet < 0 ? BIOMES.DESERT : BIOMES.SAVANNA;
                return wet > 0.05 ? BIOMES.FOREST : BIOMES.PLAINS;
            }, "biome");

        this.layers = [
            { node: continentalness, view: "grey", range: [-1, 1], about: "oceans (low) and continents (high)" },
            { node: continentHeight, view: "height", about: "continentalness through a curve" },
            { node: hills, view: "grey", range: [-1, 1], about: "rolling relief" },
            { node: roughness, view: "grey", range: [0, 1], about: "high: more hills and detail" },
            { node: baseHeight, view: "height", about: "continent height plus the hills" },
            { node: erosion, view: "grey", range: [-1, 1], about: "low: mountains may rise" },
            { node: uplift, view: "grey", range: [0, 1], about: "the erosion through a curve: how much of the ridges rises" },
            { node: ridges, view: "grey", range: [0, 1], about: "mountain chains" },
            { node: mountains, view: "grey", range: [0, 110], about: "ridges × low erosion, on land, off rivers" },
            { node: rivers, view: "grey", range: [-1, 1], about: "rivers where it crosses 0" },
            { node: riverBank, view: "grey", range: [0, 1], about: "0 in rivers, 1 away from them" },
            { node: detail, view: "grey", range: [-1, 1], about: "fine relief, by roughness and mountains" },
            { node: height, view: "height", about: "the surface height" },
            { node: temperatureNoise, view: "grey", range: [-1, 1], about: "temperature before the height" },
            { node: cooling, view: "grey", range: [-1.5, 0], about: "the height through a curve: colder higher up" },
            { node: temperature, view: "temperature", about: "colder higher up" },
            { node: humidityNoise, view: "grey", range: [-1, 1], about: "humidity before the sea" },
            { node: seaHumidity, view: "grey", range: [0, 0.35], about: "the base height through a curve: wetter near the sea" },
            { node: humidity, view: "humidity", about: "wetter near the sea" },
            { node: biome, view: "biome", about: "from height, temperature, humidity, mountains, rivers" }
        ];
        this.#nodes = Object.fromEntries(this.layers.map(l => [l.node.name, l.node]));
        this.seed = seed;
        this.#offsetX = Math.floor((hash01(seed, 1, 2) - 0.5) * 100000);
        this.#offsetY = Math.floor((hash01(seed, 3, 4) - 0.5) * 100000);
    }

    static async create(params = {}) {
        return new ClimateGenerator(params.seed ?? 1);
    }

    /**
     * Evaluates the graph at a column; the layers' values are then read with {@link ClimateGenerator#layerValue}.
     * @returns {number} the iteration to read them with
     */
    evaluate(x, y) {
        const iteration = ++this.#iteration;
        this.#nodes.biome.gen(x + this.#offsetX, y + this.#offsetY, iteration);
        return iteration;
    }

    /**
     * A layer's value at the column {@link ClimateGenerator#evaluate} evaluated last (from the node's cache: x and y
     * aren't used again).
     * @param {Layer} layer
     */
    layerValue(layer, x, y, iteration) {
        return layer.node.gen(x, y, iteration);
    }

    /**
     * The climate at a column (for block variants later, see docs/proposals/block-definitions.md).
     * @returns {{height: number, temperature: number, humidity: number, biome: number}}
     */
    climateAt(x, y) {
        const it = this.evaluate(x, y);
        const n = this.#nodes;
        return {
            height: Math.floor(n.height.gen(x, y, it)), temperature: n.temperature.gen(x, y, it),
            humidity: n.humidity.gen(x, y, it), biome: n.biome.gen(x, y, it)
        };
    }

    /**
     * The surface of a column without its neighbours: ground height (the first empty cell) and biome.
     * @returns {{height: number, biome: number}}
     */
    #surface(x, y) {
        const it = this.evaluate(x, y);
        return { height: Math.floor(this.#nodes.height.gen(x, y, it)), biome: this.#nodes.biome.gen(x, y, it) };
    }

    /**
     * The columns of a chunk column, kept for the chunks above and below: per column the ground height, the top and
     * filler blocks and the filler's depth, the plant; the trees that can reach it.
     */
    #column(cx, cy) {
        const key = cx + "," + cy;
        let column = this.#columns.get(key);
        if (column !== undefined) {
            // most recently used last
            this.#columns.delete(key);
            this.#columns.set(key, column);
            return column;
        }
        const startX = cx * CHUNK_SIZE, startY = cy * CHUNK_SIZE;
        const E = CHUNK_SIZE + 2;
        // heights with a margin of 1, for the slopes
        const heights = new Int32Array(E * E);
        const biomes = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
        const nodes = this.#nodes;
        for (let y = -1; y <= CHUNK_SIZE; y++)
            for (let x = -1; x <= CHUNK_SIZE; x++) {
                const wx = startX + x, wy = startY + y;
                const it = this.evaluate(wx, wy);
                heights[(y + 1) * E + x + 1] = Math.floor(nodes.height.gen(wx, wy, it));
                if (x >= 0 && y >= 0 && x < CHUNK_SIZE && y < CHUNK_SIZE)
                    biomes[y * CHUNK_SIZE + x] = nodes.biome.gen(wx, wy, it);
            }

        const size = CHUNK_SIZE * CHUNK_SIZE;
        column = {
            heights: new Int32Array(size), tops: new Uint32Array(size), fillers: new Uint32Array(size),
            depths: new Uint8Array(size), plants: new Uint32Array(size), trees: this.#trees(startX, startY)
        };
        for (let y = 0; y < CHUNK_SIZE; y++)
            for (let x = 0; x < CHUNK_SIZE; x++) {
                const i = y * CHUNK_SIZE + x, e = (y + 1) * E + x + 1;
                const h = heights[e];
                const slope = Math.max(Math.abs(h - heights[e - 1]), Math.abs(h - heights[e + 1]),
                    Math.abs(h - heights[e - E]), Math.abs(h - heights[e + E]));
                const biome = biomes[i];
                const look = BIOME_LOOKS[biome];
                let top = look.top, filler = look.filler, depth = look.depth;
                // the sea floor: gravel in the deep
                if (biome === BIOMES.OCEAN && h < SEA_LEVEL - 10)
                    top = filler = B.GRAVEL;
                // gentle mountain slopes low enough have grass
                if (look.grassy && slope < 2 && h < 70) {
                    top = B.DIRT_GRASS;
                    filler = B.DIRT;
                    depth = 2;
                }
                // cliffs: bare rock (sand and snow slide off too)
                if (slope >= CLIFF_SLOPE && h > SEA_LEVEL) {
                    top = filler = B.ROCK;
                    depth = 1;
                }
                column.heights[i] = h;
                column.tops[i] = top;
                column.fillers[i] = filler;
                column.depths[i] = depth;
                const wx = startX + x, wy = startY + y;
                if (top === look.top && h >= SEA_LEVEL && look.plants !== undefined && hash01(this.seed ^ 0x5eed, wx, wy) < look.plants)
                    column.plants[i] = hash01(this.seed ^ 0x9a17, wx, wy) < 0.5 ? B.GRASS_SHORT_0 : B.GRASS_SHORT_1;
            }

        this.#columns.set(key, column);
        if (this.#columns.size > COLUMN_CACHE_SIZE)
            this.#columns.delete(this.#columns.keys().next().value);
        return column;
    }

    /**
     * The trees that can reach the chunk column starting at (startX, startY): one candidate per cell of a grid, at a
     * random place in it, kept by its biome's tree density, on grass, not on a slope.
     * @returns {{x: number, y: number, h: number, seed: number, type: string, materials: object}[]} x, y, h: world
     */
    #trees(startX, startY) {
        const trees = [];
        const r = TreeGenerator.MAX_RADIUS;
        const gx0 = Math.floor((startX - r) / TREE_CELL), gx1 = Math.floor((startX + CHUNK_SIZE - 1 + r) / TREE_CELL);
        const gy0 = Math.floor((startY - r) / TREE_CELL), gy1 = Math.floor((startY + CHUNK_SIZE - 1 + r) / TREE_CELL);
        for (let gy = gy0; gy <= gy1; gy++)
            for (let gx = gx0; gx <= gx1; gx++) {
                const x = gx * TREE_CELL + Math.floor(hash01(this.seed ^ 0x7e1, gx, gy) * TREE_CELL);
                const y = gy * TREE_CELL + Math.floor(hash01(this.seed ^ 0x7e2, gx, gy) * TREE_CELL);
                const { height, biome } = this.#surface(x, y);
                const look = BIOME_LOOKS[biome];
                if (look.trees === undefined || height <= SEA_LEVEL || hash01(this.seed ^ 0x7e3, gx, gy) >= look.trees)
                    continue;
                // on even ground only (where the column isn't rock)
                let flat = true;
                for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
                    if (Math.abs(this.#surface(x + dx, y + dy).height - height) >= 2)
                        flat = false;
                if (!flat)
                    continue;
                const seed = mix32(Math.imul(gx, 73856093) ^ Math.imul(gy, 19349663) ^ this.seed);
                const type = look.treeTypes[Math.floor(hash01(this.seed ^ 0x7e4, gx, gy) * look.treeTypes.length)];
                trees.push({ x, y, h: height, seed, type, materials: look.materials ?? TREE_MATERIALS.OAK });
            }
        return trees;
    }

    /**
     * @param {Vec3} chunkPos
     * @returns {ChunkBlockData}
     */
    generateChunk(chunkPos) {
        const chunk = new ChunkBlockData();
        const column = this.#column(chunkPos.x, chunkPos.y);
        const startH = chunkPos.z * CHUNK_SIZE, endH = startH + CHUNK_SIZE;
        const { heights, tops, fillers, depths, plants } = column;
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
                // the sea (and rivers) up to its level: full, the top cell at the surface level; plants stay in it
                for (let h = Math.max(ground, startH); h < Math.min(SEA_LEVEL, endH); h++) {
                    const block = chunk.getHXY(h - startH, x, y);
                    if (!isSolid(block))
                        chunk.setHXY(h - startH, x, y, flooded(block, h === SEA_LEVEL - 1 ? WATER_SURFACE_LEVEL : BLOCK_HEIGHT_FULL));
                }
            }
        const startX = chunkPos.x * CHUNK_SIZE, startY = chunkPos.y * CHUNK_SIZE;
        for (const tree of column.trees) {
            const baseH = tree.h - startH, baseX = tree.x - startX, baseY = tree.y - startY;
            if (TreeGenerator.canReachChunk(baseH, baseX, baseY))
                this.#treeGen.generate(chunk, baseH, baseX, baseY, tree.seed, tree.type, tree.materials);
        }
        return chunk;
    }
}
