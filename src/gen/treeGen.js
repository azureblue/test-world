import { BLOCK_IDS } from "../blocks.js";
import { CHUNK_SIZE, ChunkBlockData } from "../chunk/chunk.js";
import { mix32 } from "../noise/hash.js";
import { Mulberry32 } from "../noise/prng.js";

export const TREE_TYPES = Object.freeze({
    OAK: "oak",
    BIRCH: "birch",
    PINE: "pine",
    ROUND: "round",
    BUSH: "bush",
    BIG_OAK: "bigOak",
});

const TREE_TYPE_LIST = Object.freeze(Object.values(TREE_TYPES));

const TRUNK = BLOCK_IDS.TREE_TRUNK;
const LEAVES = BLOCK_IDS.TREE_LEAVES;
const EMPTY = BLOCK_IDS.EMPTY;

function inChunk(h, x, y) {
    return h >= 0 && h < CHUNK_SIZE && x >= 0 && x < CHUNK_SIZE && y >= 0 && y < CHUNK_SIZE;
}

/**
 * @param {ChunkBlockData} chunk
 */
function setTrunk(chunk, h, x, y) {
    if (inChunk(h, x, y))
        chunk.setHXY(h, x, y, TRUNK);
}

/**
 * Leaves only fill empty blocks, so they never replace trunks or terrain.
 * @param {ChunkBlockData} chunk
 */
function setLeaves(chunk, h, x, y) {
    if (inChunk(h, x, y) && chunk.getHXY(h, x, y) === EMPTY)
        chunk.setHXY(h, x, y, LEAVES);
}

/**
 * @param {ChunkBlockData} chunk
 */
function trunkColumn(chunk, h, x, y, height) {
    for (let i = 0; i < height; i++)
        setTrunk(chunk, h + i, x, y);
}

/**
 * Ellipsoid of leaves. Roughness thins only the outer shell, so it doesn't leave detached leaves.
 * A random number is taken for every cell of the bounding box, also for cells outside the chunk,
 * so the sequence (and the tree) is the same in every chunk the tree reaches.
 * @param {ChunkBlockData} chunk
 * @param {Mulberry32} prng
 */
function leafBlob(chunk, prng, ch, cx, cy, rx, rh, roughness) {
    const ix = Math.ceil(rx);
    const ih = Math.ceil(rh);
    const invRx2 = 1 / (rx * rx);
    const invRh2 = 1 / (rh * rh);
    for (let dh = -ih; dh <= ih; dh++)
        for (let dy = -ix; dy <= ix; dy++)
            for (let dx = -ix; dx <= ix; dx++) {
                const n = prng.nextRand();
                const d = (dx * dx + dy * dy) * invRx2 + dh * dh * invRh2;
                if (d * (1 + n * roughness) <= 1)
                    setLeaves(chunk, ch + dh, cx + dx, cy + dy);
            }
}

/**
 * Flat, single layer disc of leaves.
 * @param {ChunkBlockData} chunk
 * @param {Mulberry32} prng
 */
function leafDisc(chunk, prng, h, cx, cy, r, roughness) {
    const ir = Math.ceil(r);
    const invR2 = 1 / ((r + 0.5) * (r + 0.5));
    for (let dy = -ir; dy <= ir; dy++)
        for (let dx = -ir; dx <= ir; dx++) {
            const n = prng.nextRand();
            const d = (dx * dx + dy * dy) * invR2;
            if (d * (1 + n * roughness) <= 1)
                setLeaves(chunk, h, cx + dx, cy + dy);
        }
}

/**
 * Deterministic trees written into a single chunk.
 *
 * The tree position is chunk local but may lie outside the chunk; blocks outside are skipped. All randomness comes
 * from the seed and doesn't depend on clipping, so every chunk that a tree reaches generates the same tree and
 * the parts match across chunk borders. Use {@link TreeGenerator.MAX_RADIUS} and {@link TreeGenerator.MAX_HEIGHT}
 * to find which trees can reach a chunk.
 */
export class TreeGenerator {
    /** max horizontal distance of any tree block from the tree base */
    static MAX_RADIUS = 8;
    /** max height of any tree block above the tree base */
    static MAX_HEIGHT = 16;
    /** max depth of any tree block below the tree base */
    static MAX_DEPTH = 2;

    static TYPES = TREE_TYPE_LIST;

    /**
     * @param {ChunkBlockData} chunk
     * @param {number} baseH height of the lowest trunk block, chunk local
     * @param {number} baseX chunk local, may be outside the chunk
     * @param {number} baseY chunk local, may be outside the chunk
     * @param {number} seed
     * @param {string} [type] one of {@link TREE_TYPES}, random from the seed if not given
     */
    generate(chunk, baseH, baseX, baseY, seed, type = null) {
        const prng = new Mulberry32(mix32(seed >>> 0));
        type ??= TREE_TYPE_LIST[prng.nextRandInt(0, TREE_TYPE_LIST.length - 1)];
        switch (type) {
            case TREE_TYPES.OAK:
                TreeGenerator.#oak(chunk, prng, baseH, baseX, baseY);
                break;
            case TREE_TYPES.BIRCH:
                TreeGenerator.#birch(chunk, prng, baseH, baseX, baseY);
                break;
            case TREE_TYPES.PINE:
                TreeGenerator.#pine(chunk, prng, baseH, baseX, baseY);
                break;
            case TREE_TYPES.ROUND:
                TreeGenerator.#round(chunk, prng, baseH, baseX, baseY);
                break;
            case TREE_TYPES.BUSH:
                TreeGenerator.#bush(chunk, prng, baseH, baseX, baseY);
                break;
            case TREE_TYPES.BIG_OAK:
                TreeGenerator.#bigOak(chunk, prng, baseH, baseX, baseY);
                break;
            default:
                throw new Error(`unknown tree type: ${type}`);
        }
    }

    /**
     * @param {number} baseH
     * @param {number} baseX
     * @param {number} baseY
     * @returns {boolean} whether a tree with this base can have blocks in the chunk
     */
    static canReachChunk(baseH, baseX, baseY) {
        const r = TreeGenerator.MAX_RADIUS;
        return baseX + r >= 0 && baseX - r < CHUNK_SIZE &&
            baseY + r >= 0 && baseY - r < CHUNK_SIZE &&
            baseH + TreeGenerator.MAX_HEIGHT >= 0 && baseH - TreeGenerator.MAX_DEPTH < CHUNK_SIZE;
    }

    /** classic small tree, slightly flattened crown around the trunk top */
    static #oak(chunk, prng, h, x, y) {
        const trunkHeight = prng.nextRandInt(4, 6);
        const rx = 2.2 + prng.nextRand() * 0.8;
        leafBlob(chunk, prng, h + trunkHeight - 1, x, y, rx, 2.2, 0.35);
        trunkColumn(chunk, h, x, y, trunkHeight);
    }

    /** tall, thin trunk with a narrow, elongated crown */
    static #birch(chunk, prng, h, x, y) {
        const trunkHeight = prng.nextRandInt(7, 10);
        const rx = 1.6 + prng.nextRand() * 0.5;
        const rh = 2.6 + prng.nextRand() * 0.8;
        leafBlob(chunk, prng, h + trunkHeight - 2, x, y, rx, rh, 0.3);
        trunkColumn(chunk, h, x, y, trunkHeight);
    }

    /** conical crown of flat tiers, every other tier narrower */
    static #pine(chunk, prng, h, x, y) {
        const trunkHeight = prng.nextRandInt(9, 13);
        const crownBottom = prng.nextRandInt(2, 3);
        const maxR = 2.2 + prng.nextRand() * 1.2;
        const top = h + trunkHeight;
        const crownLayers = trunkHeight - crownBottom;
        // single leaf on the very top, then tiers going down
        setLeaves(chunk, top, x, y);
        for (let i = 0; i < crownLayers; i++) {
            const cone = maxR * (i + 1) / crownLayers;
            const r = Math.max(0, (i & 1) === 0 ? cone - 1 : cone);
            leafDisc(chunk, prng, top - 1 - i, x, y, r, 0.3);
        }
        trunkColumn(chunk, h, x, y, trunkHeight);
    }

    /** short trunk with a round, slightly rough crown */
    static #round(chunk, prng, h, x, y) {
        const trunkHeight = prng.nextRandInt(3, 5);
        const r = 2.5 + prng.nextRand() * 0.7;
        leafBlob(chunk, prng, h + trunkHeight + 1, x, y, r, r, 0.3);
        trunkColumn(chunk, h, x, y, trunkHeight + 1);
    }

    /** low leaf blob with almost no trunk */
    static #bush(chunk, prng, h, x, y) {
        const rx = 1.5 + prng.nextRand() * 0.7;
        leafBlob(chunk, prng, h + 1, x, y, rx, 1.3, 0.5);
        setTrunk(chunk, h, x, y);
    }

    /** taller tree with root flare, a few branches and a leaf blob at each branch end */
    static #bigOak(chunk, prng, h, x, y) {
        const trunkHeight = prng.nextRandInt(6, 9);

        const roots = [];
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
            roots.push({ dx, dy, height: prng.nextRandInt(0, 2) });

        const branchCount = prng.nextRandInt(2, 4);
        const angleOffset = prng.nextRand() * Math.PI * 2;
        const branches = [];
        for (let b = 0; b < branchCount; b++) {
            const angle = angleOffset + (b / branchCount) * Math.PI * 2 + (prng.nextRand() - 0.5) * 0.8;
            const startH = h + prng.nextRandInt(Math.floor(trunkHeight * 0.45), trunkHeight - 2);
            const length = prng.nextRandInt(3, 5);
            const cells = [];
            for (let s = 1; s <= length; s++) {
                cells.push({
                    h: startH + Math.floor(s * 0.7),
                    x: x + Math.round(Math.cos(angle) * s),
                    y: y + Math.round(Math.sin(angle) * s),
                });
            }
            branches.push(cells);
        }

        leafBlob(chunk, prng, h + trunkHeight, x, y, 2.8 + prng.nextRand() * 0.4, 2.2, 0.35);
        for (const cells of branches) {
            const end = cells[cells.length - 1];
            leafBlob(chunk, prng, end.h + 1, end.x, end.y, 2.0 + prng.nextRand() * 0.6, 1.6, 0.4);
        }

        for (const cells of branches)
            for (const c of cells)
                setTrunk(chunk, c.h, c.x, c.y);
        for (const root of roots)
            trunkColumn(chunk, h, x + root.dx, y + root.dy, root.height);
        trunkColumn(chunk, h, x, y, trunkHeight);
    }
}
