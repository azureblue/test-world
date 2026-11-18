// The default terrain from above, looking towards the horizon: fog, sky, distant hills.
import { SceneGenerator } from "../src/gen/sceneGenerator.js";

export const settings = { "world.renderDistance": 5 };

export async function world() {
    return SceneGenerator.over("default");
}

/** @param {import("./testGame.js").TestGame} game */
export async function run(game) {
    game.fly();
    game.setPosition(0, 25, 0);
    game.lookAt(60, 18, 60);
}
