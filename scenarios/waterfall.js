// A rock pillar on flat ground; once loaded, a water source appears on top: it falls down the sides and spreads.
import { BLOCK_IDS, flooded, WATER_SURFACE_LEVEL } from "../src/blocks.js";
import { SceneGenerator } from "../src/gen/sceneGenerator.js";

export const settings = { "world.renderDistance": 3 };

export async function world(seed) {
    return (await SceneGenerator.over("flat", seed))
        .fill(0, 0, 1, 1, 1, 6, "ROCK");
}

/** @param {import("./testGame.js").TestGame} game */
export async function run(game) {
    game.fly();
    game.setPosition(-9, -10, 7);
    game.lookAt(0, 0, 3);
    await game.ready();
    // placed now, not in the scene: a change wakes the water flow
    game.set(0, 0, 7, flooded(BLOCK_IDS.EMPTY, WATER_SURFACE_LEVEL));
}
