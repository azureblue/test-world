// A pool dug in flat ground: water 3 deep with a 7/8 surface, a rock slab over one end, plants in the water.
import { BLOCK_IDS, BLOCK_HEIGHT_FULL, flooded, WATER_SURFACE_LEVEL } from "../src/blocks.js";
import { SceneGenerator } from "../src/gen/sceneGenerator.js";

export const settings = { "world.renderDistance": 3 };

/** the scene, built in the world worker */
export async function world() {
    const surface = flooded(BLOCK_IDS.EMPTY, WATER_SURFACE_LEVEL);
    const plant = BLOCK_IDS.GRASS_SHORT_0;
    return (await SceneGenerator.over("flat"))
        .fill(-6, -3, -6, 6, 0, 6, "EMPTY")
        .fill(-6, -3, -6, 6, -2, 6, "WATER")
        .fill(-6, -1, -6, 6, -1, 6, surface)
        // a slab over the north end, at the surface's height: the water under it stays 7/8
        .fill(-6, 0, -6, 6, 0, -3, "ROCK")        
        .set(2, -3, 2, flooded(plant, BLOCK_HEIGHT_FULL))
        .set(-2, -1, 3, flooded(plant, WATER_SURFACE_LEVEL));
}

/** @param {import("./testGame.js").TestGame} game */
export async function run(game) {
    game.walk();
    game.setPosition(0, 3, 12);
    game.lookAt(0, -1, 0);
}
