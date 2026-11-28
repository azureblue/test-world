// A closed snow room lit by a lamp, a row of stairs rising +y ending next to a column of stairs rising +x: the place
// where the AO of a stair's side (an L of quarters) meets the tall side of the stair beside it (x 10, y 6, z 1.5, on
// the column's east side). Starts inside, looking at it.
import { BLOCK_IDS, SHAPES, withShape } from "../src/blocks.js";
import { SceneGenerator } from "../src/gen/sceneGenerator.js";

export const settings = { "world.renderDistance": 3 };

const stairs = (shape) => withShape(BLOCK_IDS.PLANKS_STAIRS, SHAPES[shape]);

/** the scene, built in the world worker */
export async function world(seed) {
    return (await SceneGenerator.over("flat", seed))
        // the room: inside x 3..13, y 3..13, z 1..5
        .fill(2, 2, 1, 14, 14, 6, "SNOW").fill(3, 3, 1, 13, 13, 5, "EMPTY").set(7, 7, 1, "LAMP")
        // the row along y 5 (x 5..9; it goes on, so its end stays straight), the column along x 9 (y 6..9)
        .fill(5, 5, 1, 9, 5, 1, stairs("STAIRS_Y1")).fill(9, 6, 1, 9, 9, 1, stairs("STAIRS_X1"));
}

/** @param {import("./testGame.js").TestGame} game */
export async function run(game) {
    game.walk();
    game.setPosition(12.5, 4, 1);
    game.lookAt(10, 6, 1.5);
}
