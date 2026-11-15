import { BLOCK_IDS } from "../blocks.js";
import { CHUNK_SIZE, ChunkBlockData } from "../chunk/chunk.js";
import { Mulberry32 } from "../noise/prng.js";
import { LinearCurve, point } from "./curve.js";

export class TreeGenerator {
    static #crownSizeRadiuses = [
        [],
        [0],
        [-1, -2],
        [-1, -2, 2],
    ]

    /**
     * @param {ChunkBlockData} chunk
     * @param {number} baseH
     * @param {number} baseX
     * @param {number} baseY
     * @param {number} seed
     */
    generate(chunk, baseH, baseX, baseY, seed) {
        const prng = new Mulberry32(seed);
        const trunkHeight = prng.nextRandInt(5, 9);
        const crownHeight = prng.nextRandInt(2, 3);
        const crownStart = trunkHeight - Math.round(crownHeight / 2);
        // const crownTopR = prng.nextRandInt(2, 3);
        // const crownMidR = prng.nextRandInt(4, 6);
        // const crownBottomR = prng.nextRandInt(0, 4);
        // const crownTopMidBias = prng.nextRandInt(, 1);
        // const crownSizeCurve = new LinearCurve([point(0, crownMidR), point(crownHeight, crownTopR)]);
        for (let h = 0; h < trunkHeight; h++) {
            chunk.setHXY(baseH + h, baseX, baseY, BLOCK_IDS.TREE_TRUNK);
        }

        for (let ch = 0; ch < crownHeight; ch++) {
            // const r = Math.round(crownSizeCurve.apply(ch));
            const crownLayer = TreeGenerator.#crownSizeRadiuses[crownHeight][ch] ?? 0;
            const r = Math.abs(crownLayer);
            const roundCorners = crownLayer < 0;
            const h = baseH + crownStart + crownHeight - ch;
            for (let y = -r; y <= r; y++) {
                for (let x = -r; x <= r; x++) {
                    // const distSq = x * x + y * y;
                    // const noise = prng.nextRand();
                    // if (distSq <= r * r + noise * 1.5) {
                        chunk.setHXY(h, baseX + x, baseY + y, BLOCK_IDS.TREE_LEAVES);
                    // }
                }
            }
            if (roundCorners) {
                chunk.setHXY(h, baseX - r, baseY - r, BLOCK_IDS.EMPTY);
                chunk.setHXY(h, baseX - r, baseY + r, BLOCK_IDS.EMPTY);
                chunk.setHXY(h, baseX + r, baseY - r, BLOCK_IDS.EMPTY);
                chunk.setHXY(h, baseX + r, baseY + r, BLOCK_IDS.EMPTY);
            }
        }
    }
}

export class TreeGenerator0 {
    static SHAPES = {
        OAK: "oak",
        PINE: "pine",
        ROUND: "round",
    };

    static generate(chunk, baseH, baseX, baseY, seed, options = {}) {
        const shape = options.shape ?? TreeGenerator0.SHAPES.OAK;

        const height =
            options.height ??
            TreeGenerator0.randInt(seed ^ 0x1234, 5, 8);

        const crownRadius =
            options.crownRadius ??
            TreeGenerator0.randInt(seed ^ 0x5678, 2, 3);

        switch (shape) {
            case TreeGenerator0.SHAPES.PINE:
                TreeGenerator0.#generatePineTree(
                    chunk,
                    baseH,
                    baseX,
                    baseY,
                    seed,
                    height,
                    crownRadius
                );
                break;

            case TreeGenerator0.SHAPES.ROUND:
                TreeGenerator0.#generateRoundTree(
                    chunk,
                    baseH,
                    baseX,
                    baseY,
                    seed,
                    height,
                    crownRadius
                );
                break;

            case TreeGenerator0.SHAPES.OAK:
            default:
                TreeGenerator0.#generateOakTree(
                    chunk,
                    baseH,
                    baseX,
                    baseY,
                    seed,
                    height,
                    crownRadius
                );
                break;
        }

        return chunk;
    }

    static treeSeed(worldSeed, chunkX, chunkY, x, y) {
        return TreeGenerator0.hash32(
            worldSeed ^
            Math.imul(chunkX, 73856093) ^
            Math.imul(chunkY, 19349663) ^
            Math.imul(x, 83492791) ^
            Math.imul(y, 2654435761)
        );
    }

    static hash32(seed) {
        seed |= 0;
        seed ^= seed >>> 16;
        seed = Math.imul(seed, 0x7feb352d);
        seed ^= seed >>> 15;
        seed = Math.imul(seed, 0x846ca68b);
        seed ^= seed >>> 16;
        return seed >>> 0;
    }

    static rand01(seed) {
        return TreeGenerator0.hash32(seed) / 0xFFFFFFFF;
    }

    static randInt(seed, min, max) {
        return min + Math.floor(TreeGenerator0.rand01(seed) * (max - min + 1));
    }

    static #inChunk(h, x, y) {
        return (
            h >= 0 && h < CHUNK_SIZE &&
            x >= 0 && x < CHUNK_SIZE &&
            y >= 0 && y < CHUNK_SIZE
        );
    }

    static #setIfInside(chunk, h, x, y, block) {
        if (TreeGenerator0.#inChunk(h, x, y)) {
            chunk.setHXY(h, x, y, block);
        }
    }

    static #leafKey(h, x, y) {
        return `${h}:${x}:${y}`;
    }

    static #addLeaf(leaves, h, x, y) {
        leaves.add(TreeGenerator0.#leafKey(h, x, y));
    }

    static #hasLeaf(leaves, h, x, y) {
        return leaves.has(TreeGenerator0.#leafKey(h, x, y));
    }

    static #countLeafNeighbors6(leaves, h, x, y) {
        let count = 0;

        if (TreeGenerator0.#hasLeaf(leaves, h + 1, x, y)) count++;
        if (TreeGenerator0.#hasLeaf(leaves, h - 1, x, y)) count++;
        if (TreeGenerator0.#hasLeaf(leaves, h, x + 1, y)) count++;
        if (TreeGenerator0.#hasLeaf(leaves, h, x - 1, y)) count++;
        if (TreeGenerator0.#hasLeaf(leaves, h, x, y + 1)) count++;
        if (TreeGenerator0.#hasLeaf(leaves, h, x, y - 1)) count++;

        return count;
    }

    static #pruneLooseLeaves(leaves) {
        const result = new Set();

        for (const key of leaves) {
            const [h, x, y] = key.split(":").map(Number);

            const neighbors = TreeGenerator0.#countLeafNeighbors6(leaves, h, x, y);

            // 0-1 sąsiad = prawie zawsze brzydki pojedynczy wystający voxel.
            if (neighbors >= 2) {
                result.add(key);
            }
        }

        return result;
    }

    static #writeLeaves(chunk, leaves) {
        for (const key of leaves) {
            const [h, x, y] = key.split(":").map(Number);

            TreeGenerator0.#setIfInside(
                chunk,
                h,
                x,
                y,
                BLOCK_IDS.LEAVES
            );
        }
    }
    static #generateOakTree(chunk, baseH, baseX, baseY, seed, height, crownRadius) {
        const trunkHeight = Math.max(4, height - 2);
        const r = Math.max(1, crownRadius);

        for (let h = 0; h <= trunkHeight; h++) {
            TreeGenerator0.#setIfInside(chunk, baseH + h, baseX, baseY, BLOCK_IDS.TREE_TRUNK);
        }

        const crownBaseH = baseH + trunkHeight - 2;

        TreeGenerator0.#leafLayer(chunk, crownBaseH + 0, baseX, baseY, r);
        TreeGenerator0.#leafLayer(chunk, crownBaseH + 1, baseX, baseY, r);
        TreeGenerator0.#leafLayer(chunk, crownBaseH + 2, baseX, baseY, r);
        TreeGenerator0.#leafLayer(chunk, crownBaseH + 3, baseX, baseY, Math.max(1, r - 1));
        TreeGenerator0.#leafLayer(chunk, crownBaseH + 4, baseX, baseY, Math.max(0, r - 2));

        for (let h = 0; h <= trunkHeight; h++) {
            TreeGenerator0.#setIfInside(chunk, baseH + h, baseX, baseY, BLOCK_IDS.TREE_TRUNK);
        }
    }
    static #leafLayer(chunk, h, centerX, centerY, radius) {
        for (let y = -radius; y <= radius; y++) {
            for (let x = -radius; x <= radius; x++) {
                const ax = Math.abs(x);
                const ay = Math.abs(y);

                // Ucina tylko rogi, żeby nie było pełnego kwadratu.
                if (radius > 1 && ax === radius && ay === radius) {
                    continue;
                }

                TreeGenerator0.#setIfInside(
                    chunk,
                    h,
                    centerX + x,
                    centerY + y,
                    BLOCK_IDS.TREE_LEAVES
                );
            }
        }
    }
    static #generatePineTree(chunk, baseH, baseX, baseY, seed, height, crownRadius) {
        for (let h = 0; h < height; h++) {
            TreeGenerator0.#setIfInside(
                chunk,
                baseH + h,
                baseX,
                baseY,
                BLOCK_IDS.TREE_TRUNK
            );
        }

        const crownStart = Math.floor(height * 0.35);
        const crownHeight = height - crownStart;

        for (let i = 0; i < crownHeight; i++) {
            const h = baseH + crownStart + i;

            const t = i / Math.max(1, crownHeight - 1);
            const radius = Math.round((1.0 - t) * crownRadius);

            for (let dy = -radius; dy <= radius; dy++) {
                for (let dx = -radius; dx <= radius; dx++) {
                    const manhattan = Math.abs(dx) + Math.abs(dy);

                    const noise = TreeGenerator0.rand01(
                        seed ^
                        ((dx + 16) * 374761393) ^
                        ((dy + 16) * 668265263) ^
                        (i * 2147483647)
                    );

                    if (manhattan <= radius + noise * 0.7) {
                        TreeGenerator0.#setIfInside(
                            chunk,
                            h,
                            baseX + dx,
                            baseY + dy,
                            BLOCK_IDS.TREE_LEAVES
                        );
                    }
                }
            }
        }

        TreeGenerator0.#setIfInside(
            chunk,
            baseH + height,
            baseX,
            baseY,
            BLOCK_IDS.TREE_LEAVES
        );
    }

    static #generateRoundTree(chunk, baseH, baseX, baseY, seed, height, crownRadius) {
        const trunkHeight = Math.max(3, height - crownRadius - 1);

        for (let h = 0; h < trunkHeight; h++) {
            TreeGenerator0.#setIfInside(
                chunk,
                baseH + h,
                baseX,
                baseY,
                BLOCK_IDS.TREE_TRUNK
            );
        }

        const centerH = baseH + trunkHeight + 1;
        const r = crownRadius;

        for (let dh = -r; dh <= r; dh++) {
            for (let dy = -r; dy <= r; dy++) {
                for (let dx = -r; dx <= r; dx++) {
                    const distSq = dx * dx + dy * dy + dh * dh;

                    const noise = TreeGenerator0.rand01(
                        seed ^
                        ((dx + 32) * 92837111) ^
                        ((dy + 32) * 689287499) ^
                        ((dh + 32) * 283923481)
                    );

                    if (distSq <= r * r + noise * 1.5) {
                        TreeGenerator0.#setIfInside(
                            chunk,
                            centerH + dh,
                            baseX + dx,
                            baseY + dy,
                            BLOCK_IDS.TREE_LEAVES
                        );
                    }
                }
            }
        }

        TreeGenerator0.#setIfInside(
            chunk,
            baseH + trunkHeight,
            baseX,
            baseY,
            BLOCK_IDS.TREE_TRUNK
        );
    }
}