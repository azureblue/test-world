import { BLOCK_IDS } from "../blocks.js";
import { CHUNK_SIZE } from "../chunk/chunk.js";

export class TreeGenerator {
    static SHAPES = {
        OAK: "oak",
        PINE: "pine",
        ROUND: "round",
    };

    static generate(chunk, baseH, baseX, baseY, seed, options = {}) {
        const shape = options.shape ?? TreeGenerator.SHAPES.ROUND;

        const height =
            options.height ??
            TreeGenerator.randInt(seed ^ 0x1234, 5, 8);

        const crownRadius =
            options.crownRadius ??
            TreeGenerator.randInt(seed ^ 0x5678, 2, 3);

        switch (shape) {
            case TreeGenerator.SHAPES.PINE:
                TreeGenerator.#generatePineTree(
                    chunk,
                    baseH,
                    baseX,
                    baseY,
                    seed,
                    height,
                    crownRadius
                );
                break;

            case TreeGenerator.SHAPES.ROUND:
                TreeGenerator.#generateRoundTree(
                    chunk,
                    baseH,
                    baseX,
                    baseY,
                    seed,
                    height,
                    crownRadius
                );
                break;

            case TreeGenerator.SHAPES.OAK:
            default:
                TreeGenerator.#generateOakTree(
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
        return TreeGenerator.hash32(
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
        return TreeGenerator.hash32(seed) / 0xFFFFFFFF;
    }

    static randInt(seed, min, max) {
        return min + Math.floor(TreeGenerator.rand01(seed) * (max - min + 1));
    }

    static #inChunk(h, x, y) {
        return (
            h >= 0 && h < CHUNK_SIZE &&
            x >= 0 && x < CHUNK_SIZE &&
            y >= 0 && y < CHUNK_SIZE
        );
    }

    static #setIfInside(chunk, h, x, y, block) {
        if (TreeGenerator.#inChunk(h, x, y)) {
            chunk.setHXY(h, x, y, block);
        }
    }

    static #generateOakTree(chunk, baseH, baseX, baseY, seed, height, crownRadius) {
        const trunkHeight = Math.max(3, height - crownRadius);

        for (let h = 0; h < trunkHeight; h++) {
            TreeGenerator.#setIfInside(
                chunk,
                baseH + h,
                baseX,
                baseY,
                BLOCK_IDS.TREE_TRUNK
            );
        }

        const crownCenterH = baseH + trunkHeight;
        const r = crownRadius;

        for (let dh = -r; dh <= r; dh++) {
            for (let dy = -r; dy <= r; dy++) {
                for (let dx = -r; dx <= r; dx++) {
                    const dist =
                        dx * dx +
                        dy * dy +
                        dh * dh * 1.4;

                    const noise = TreeGenerator.rand01(
                        seed ^
                        ((dx + 16) * 73856093) ^
                        ((dy + 16) * 19349663) ^
                        ((dh + 16) * 83492791)
                    );

                    const limit = r * r + noise * 1.3;

                    if (dist <= limit) {
                        const h = crownCenterH + dh;
                        const x = baseX + dx;
                        const y = baseY + dy;

                        const isInsideTrunk =
                            x === baseX &&
                            y === baseY &&
                            h < baseH + trunkHeight;

                        if (!isInsideTrunk) {
                            TreeGenerator.#setIfInside(
                                chunk,
                                h,
                                x,
                                y,
                                BLOCK_IDS.TREE_LEAVES
                            );
                        }
                    }
                }
            }
        }

        // Pień aż do środka korony.
        for (let h = 0; h <= trunkHeight; h++) {
            TreeGenerator.#setIfInside(
                chunk,
                baseH + h,
                baseX,
                baseY,
                BLOCK_IDS.TREE_TRUNK
            );
        }
    }

    static #generatePineTree(chunk, baseH, baseX, baseY, seed, height, crownRadius) {
        for (let h = 0; h < height; h++) {
            TreeGenerator.#setIfInside(
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

                    const noise = TreeGenerator.rand01(
                        seed ^
                        ((dx + 16) * 374761393) ^
                        ((dy + 16) * 668265263) ^
                        (i * 2147483647)
                    );

                    if (manhattan <= radius + noise * 0.7) {
                        TreeGenerator.#setIfInside(
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

        TreeGenerator.#setIfInside(
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
            TreeGenerator.#setIfInside(
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

                    const noise = TreeGenerator.rand01(
                        seed ^
                        ((dx + 32) * 92837111) ^
                        ((dy + 32) * 689287499) ^
                        ((dh + 32) * 283923481)
                    );

                    if (distSq <= r * r + noise * 1.5) {
                        TreeGenerator.#setIfInside(
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

        TreeGenerator.#setIfInside(
            chunk,
            baseH + trunkHeight,
            baseX,
            baseY,
            BLOCK_IDS.TREE_TRUNK
        );
    }
}