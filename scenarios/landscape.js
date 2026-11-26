// The default terrain from above, looking towards the horizon: fog, sky, distant hills.
import { SceneGenerator } from "../src/gen/sceneGenerator.js";

export const settings = { "world.renderDistance": 5 };

export async function world(seed) {
    return SceneGenerator.over("noise", seed);
}

/** @param {import("./testGame.js").TestGame} game */
export async function run(game) {
    game.fly();
    game.setPosition(0, 0, 25);
    game.lookAt(60, -60, 18);
}
