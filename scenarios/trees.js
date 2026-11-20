// Every tree species (TreeBuilder) on flat grass: each column along x one species, each row along -z another seed of
// it (see TreeGalleryGenerator).
import { SceneGenerator } from "../src/gen/sceneGenerator.js";

export const settings = { "world.renderDistance": 5 };

export async function world(seed) {
    return SceneGenerator.over("trees", seed);
}

/** @param {import("./testGame.js").TestGame} game */
export async function run(game) {
    game.fly();
    game.setPosition(-10, 10, 12);
    game.lookAt(30, 5, -30);
}
