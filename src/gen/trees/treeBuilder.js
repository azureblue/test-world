import { BLOCK_IDS } from "../../blocks.js";
import { CHUNK_SIZE, ChunkBlockData } from "../../chunk/chunk.js";
import { mix32 } from "../../noise/hash.js";
import { Mulberry32 } from "../../noise/prng.js";
import { LruCache } from "../../utils.js";

/** the species {@link TreeBuilder} grows */
export const SPECIES = Object.freeze({
    OAK: "oak",
    BIG_OAK: "bigOak",
    BIRCH: "birch",
    SPRUCE: "spruce",
    PINE: "pine",
    ACACIA: "acacia",
});

const OAK = Object.freeze({ trunk: BLOCK_IDS.TREE_TRUNK, leaves: BLOCK_IDS.TREE_LEAVES });
const SPRUCE = Object.freeze({ trunk: BLOCK_IDS.SPRUCE_TRUNK, leaves: BLOCK_IDS.SPRUCE_LEAVES });

/** the blocks each species is made of, unless generate is given others */
export const SPECIES_MATERIALS = Object.freeze({
    [SPECIES.OAK]: OAK, [SPECIES.BIG_OAK]: OAK, [SPECIES.BIRCH]: OAK, [SPECIES.SPRUCE]: SPRUCE,
    [SPECIES.PINE]: SPRUCE, [SPECIES.ACACIA]: OAK
});

// the grid a tree is built in: (2R + 1)² columns around the trunk, HEIGHT cells up from its base
const R = 7;
const W = 2 * R + 1;
const HEIGHT = 20;
const EMPTY = 0, WOOD = 1, LEAF = 2;
/** built trees kept (species and seed -> cells) */
const CACHE_SIZE = 512;

/**
 * A tree's cells while it's built: wood (trunk, branches) and leaves, around its base. Out of the grid is ignored.
 */
class Grid {
    cells = new Uint8Array(W * W * HEIGHT);

    #index(h, x, y) {
        return x < -R || x > R || y < -R || y > R || h < 0 || h >= HEIGHT ? -1 : (h * W + y + R) * W + x + R;
    }

    get(h, x, y) {
        const i = this.#index(h, x, y);
        return i < 0 ? EMPTY : this.cells[i];
    }

    wood(h, x, y) {
        const i = this.#index(h, x, y);
        if (i >= 0)
            this.cells[i] = WOOD;
    }

    leaf(h, x, y) {
        const i = this.#index(h, x, y);
        if (i >= 0 && this.cells[i] === EMPTY)
            this.cells[i] = LEAF;
    }

    trunk(h, x, y, height) {
        for (let i = 0; i < height; i++)
            this.wood(h + i, x, y);
    }

    /**
     * A limb from the side of the trunk's cell at h: len cells out along a direction ([dx, dy] of
     * {@link DIRECTIONS}), the rise of them after the first flat ones each followed by a cell up: a staircase, its
     * cells sharing faces. A limb from below the trunk's top starts flat (flat 1), so it doesn't climb along the trunk.
     * @returns {number[]} its end [h, x, y]
     */
    limb(h, [dx, dy], len, rise, flat = 0) {
        let x = 0, y = 0;
        for (let s = 1; s <= len; s++) {
            x += dx, y += dy;
            this.wood(h, x, y);
            if (s > flat && s <= flat + rise)
                this.wood(++h, x, y);
        }
        return [h, x, y];
    }

    /** an ellipsoid of leaves (radii to the cells' centres), its edge a bit uneven (by the prng) */
    blob(prng, h, x, y, rx, rh) {
        const ix = Math.ceil(rx), ih = Math.ceil(rh), ex = (rx + 0.5) ** 2, eh = (rh + 0.5) ** 2;
        for (let dh = -ih; dh <= ih; dh++)
            for (let dy = -ix; dy <= ix; dy++)
                for (let dx = -ix; dx <= ix; dx++) {
                    const d = (dx * dx + dy * dy) / ex + dh * dh / eh;
                    if (d <= 0.9 + 0.2 * prng.nextRand())
                        this.leaf(h + dh, x + dx, y + dy);
                }
    }

    /** a flat disc of leaves, one cell high */
    disc(h, x, y, r) {
        const ir = Math.ceil(r);
        for (let dy = -ir; dy <= ir; dy++)
            for (let dx = -ir; dx <= ir; dx++)
                if (dx * dx + dy * dy <= (r + 0.3) * (r + 0.3))
                    this.leaf(h, x + dx, y + dy);
    }

    /**
     * Tidies the leaves: fills empty cells that leaves surround (4 or more of 6 faces), then removes leaves that
     * stick out (less than 2 faces on wood or leaves, wood counting 2) and lone cubes on top (nothing beside them,
     * not on wood), so no lone cubes and no holes.
     */
    tidy() {
        const c = this.cells;
        const neighbours = (h, x, y, kind) => {
            let n = 0;
            for (const [a, b, e] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
                const v = this.get(h + a, x + b, y + e);
                n += kind === LEAF ? (v === LEAF ? 1 : 0) : (v === WOOD ? 2 : v === LEAF ? 1 : 0);
            }
            return n;
        };
        const pass = (from, to, test) => {
            const changed = [];
            for (let h = 0; h < HEIGHT; h++)
                for (let y = -R; y <= R; y++)
                    for (let x = -R; x <= R; x++)
                        if (c[this.#index(h, x, y)] === from && test(h, x, y))
                            changed.push(this.#index(h, x, y));
            for (const i of changed)
                c[i] = to;
        };
        pass(EMPTY, LEAF, (h, x, y) => neighbours(h, x, y, LEAF) >= 4);
        pass(LEAF, EMPTY, (h, x, y) => neighbours(h, x, y, WOOD) < 2 ||
            this.get(h + 1, x, y) === EMPTY && this.get(h - 1, x, y) !== WOOD &&
            this.get(h, x + 1, y) === EMPTY && this.get(h, x - 1, y) === EMPTY &&
            this.get(h, x, y + 1) === EMPTY && this.get(h, x, y - 1) === EMPTY);
    }

    /** the cells set, as [h, x, y, kind] in a flat array (wood first, so leaves never cover it) */
    list() {
        const out = [];
        for (const kind of [WOOD, LEAF])
            for (let h = 0; h < HEIGHT; h++)
                for (let y = -R; y <= R; y++)
                    for (let x = -R; x <= R; x++)
                        if (this.cells[this.#index(h, x, y)] === kind)
                            out.push(h, x, y, kind);
        return Int8Array.from(out);
    }
}

/** the directions limbs grow in: east, north, west, south */
const DIRECTIONS = Object.freeze([[1, 0], [0, 1], [-1, 0], [0, -1]]);

/** n different directions (1..4), at random: 2 can be opposite or at a right angle */
function directions(prng, n) {
    const d = [...DIRECTIONS];
    for (let i = d.length - 1; i > 0; i--) {
        const j = prng.nextRandInt(0, i);
        [d[i], d[j]] = [d[j], d[i]];
    }
    return d.slice(0, n);
}

/**
 * The species' shapes: each a fixed plan, the prng only varying sizes a little and the limbs' directions, so a species
 * looks like itself every time. h, x, y are from the tree's base (its lowest trunk cell).
 * @type {Object<string, (g: Grid, prng: Mulberry32) => void>}
 */
const SHAPES = {
    /**
     * A short trunk; discs of leaves narrowing up from a wide bottom to a small top: a small, triangular crown,
     * rounded. Smaller trees have fewer layers.
     */
    [SPECIES.OAK](g, prng) {
        const t = prng.nextRandInt(2, 3), small = prng.nextRand() < 0.5;
        const layers = small ? [1.6, 2.1, 1.5, 1] : [1.8, 2.4, 2, 1.5, 1];
        g.trunk(0, 0, 0, t + layers.length - 1);
        for (const [i, r] of layers.entries())
            g.disc(t + i, 0, 0, r);
    },

    /** a short trunk; 3..4 branches out and up, a clump of leaves on each, one over the top: a broad, clumpy dome */
    [SPECIES.BIG_OAK](g, prng) {
        const t = prng.nextRandInt(3, 4);
        g.trunk(0, 0, 0, t + 3);
        for (const dir of directions(prng, prng.nextRandInt(3, 4))) {
            const [h, x, y] = g.limb(t + prng.nextRandInt(-1, 1), dir, 2, 1, 1);
            g.blob(prng, h + 1, x, y, 2.1 + prng.nextRand() * 0.3, 1.8);
        }
        g.blob(prng, t + 4, 0, 0, 2.3, 2);
    },

    /** a tall, thin trunk; small clumps up its top half, a little off it: a narrow, ragged oval */
    [SPECIES.BIRCH](g, prng) {
        const t = prng.nextRandInt(6, 8);
        g.trunk(0, 0, 0, t);
        const n = 3, a0 = prng.nextRand() * Math.PI * 2;
        for (let i = 0; i < n; i++) {
            const h = Math.round(t * 0.5 + (t * 0.5) * i / (n - 1));
            const a = a0 + i * 2.4, off = i === n - 1 ? 0 : 1;
            g.blob(prng, h, Math.round(Math.cos(a) * off), Math.round(Math.sin(a) * off), i === n - 1 ? 1.3 : 1.7, 1.5);
        }
    },

    /** the trunk to the top; tiers every 2 cells, each a disc and a narrower one on it, shrinking up to a tip */
    [SPECIES.SPRUCE](g, prng) {
        const t = prng.nextRandInt(7, 10);
        const bottom = prng.nextRandInt(1, 2), maxR = 2.4 + prng.nextRand() * 0.5;
        // the trunk stops below the top tiers, where they're too small to hide it: leaves above it to the tip
        g.trunk(0, 0, 0, t - 2);
        for (let h = t - 2; h <= t; h++)
            g.leaf(h, 0, 0);
        for (let h = t - 1; h >= bottom; h -= 2) {
            const r = 0.6 + (maxR - 0.6) * (t - h) / (t - bottom);
            g.disc(h, 0, 0, r);
            g.disc(h + 1, 0, 0, Math.max(0, r - 1.3));
        }
    },

    /** a tall bare trunk; a few flat clumps around its top: an umbrella crown high up */
    [SPECIES.PINE](g, prng) {
        const t = prng.nextRandInt(7, 9);
        g.trunk(0, 0, 0, t + 1);
        for (const dir of directions(prng, 3)) {
            const [h, x, y] = g.limb(t - prng.nextRandInt(1, 3), dir, 2, 1, 1);
            g.blob(prng, h + 1, x, y, 1.6, 0.9);
        }
        g.blob(prng, t + 1, 0, 0, 1.9, 1);
    },

    /**
     * A short trunk with 1..3 limbs, each straight out and up, a flat, wide canopy on each: a flat-topped savanna
     * tree. One limb: from the trunk's top, lower, the biggest canopy; more: smaller ones, each from its own height
     * (the trunk up to the highest), the lower ones a cell longer.
     */
    [SPECIES.ACACIA](g, prng) {
        const n = prng.nextRandInt(1, 3);
        const starts = Array.from({ length: n }, () => n === 1 ? prng.nextRandInt(1, 2) : 2 + prng.nextRandInt(0, 2));
        const top = Math.max(...starts);
        g.trunk(0, 0, 0, top + 1);
        for (const [i, dir] of directions(prng, n).entries()) {
            const below = starts[i] < top ? 1 : 0;
            const len = (n === 1 ? 2 : prng.nextRandInt(2, 3)) + below;
            const [h, x, y] = g.limb(starts[i], dir, len, len - below, below);
            const r = [3.7, 3, 2.5][n - 1] + prng.nextRand() * 0.4;
            g.disc(h + 1, x, y, r);
            g.disc(h + 2, x, y, r - 1.4);
        }
    },
};

/**
 * Trees grown from a plan per species ({@link SPECIES}), then tidied (see Grid.tidy), and written into chunks.
 *
 * A tree is built whole in its own grid around its base, the same from its seed whatever chunk asks for it, then the
 * part in the chunk is written: trees match across chunk borders. Built trees are kept, so the chunks a tree reaches
 * build it once. Use {@link TreeBuilder.MAX_RADIUS} and {@link TreeBuilder.MAX_HEIGHT} to find which trees can reach a
 * chunk.
 */
export class TreeBuilder {
    /** max horizontal distance of any tree block from the tree base */
    static MAX_RADIUS = R;
    /** max height of any tree block above the tree base */
    static MAX_HEIGHT = HEIGHT - 1;

    static SPECIES = Object.freeze(Object.values(SPECIES));

    /** species and seed -> the tree's cells (see Grid.list) */
    #trees = new LruCache(CACHE_SIZE);

    /**
     * @param {ChunkBlockData} chunk
     * @param {number} baseH height of the lowest trunk block, chunk local
     * @param {number} baseX chunk local, may be outside the chunk
     * @param {number} baseY chunk local, may be outside the chunk
     * @param {number} seed
     * @param {string} species one of {@link SPECIES}
     * @param {{trunk: number, leaves: number}} [materials] the species' own if not given
     */
    generate(chunk, baseH, baseX, baseY, seed, species, materials = SPECIES_MATERIALS[species]) {
        const cells = this.#tree(species, seed);
        for (let i = 0; i < cells.length; i += 4) {
            const h = baseH + cells[i], x = baseX + cells[i + 1], y = baseY + cells[i + 2];
            if (h < 0 || h >= CHUNK_SIZE || x < 0 || x >= CHUNK_SIZE || y < 0 || y >= CHUNK_SIZE)
                continue;
            if (cells[i + 3] === WOOD)
                chunk.setHXY(h, x, y, materials.trunk);
            else if (chunk.getHXY(h, x, y) === BLOCK_IDS.EMPTY)
                chunk.setHXY(h, x, y, materials.leaves);
        }
    }

    /**
     * @returns {boolean} whether a tree with this base can have blocks in the chunk
     */
    static canReachChunk(baseH, baseX, baseY) {
        return baseX + R >= 0 && baseX - R < CHUNK_SIZE && baseY + R >= 0 && baseY - R < CHUNK_SIZE &&
            baseH + HEIGHT > 0 && baseH < CHUNK_SIZE;
    }

    #tree(species, seed) {
        return this.#trees.get(species + ":" + (seed >>> 0), () => {
            const shape = SHAPES[species];
            if (shape === undefined)
                throw new Error(`unknown tree species: ${species}`);
            const g = new Grid();
            shape(g, new Mulberry32(mix32(seed >>> 0)));
            g.tidy();
            return g.list();
        });
    }
}
