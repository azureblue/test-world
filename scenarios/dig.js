// Flat rock, and a whole chunk of solid rock standing on it (chunk 0, 0, 0): to dig into, for the light in tunnels.
import { SceneGenerator } from "../src/gen/sceneGenerator.js";

export async function world(seed) {
    return new SceneGenerator()
        // the ground, its top at -1: wider than the render range
        .fill(-256, -256, -8, 255, 255, -1, "ROCK")
        .fill(0, 0, 0, 31, 31, 31, "ROCK");
}

/** @param {import("./testGame.js").TestGame} game */
export async function run(game) {
    game.walk();
    game.setPosition(-6, 16, 0);
    game.lookAt(0, 16, 1.5);
}
