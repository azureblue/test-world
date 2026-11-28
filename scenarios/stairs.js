// Stairs and their corners on flat grass: a ring rising towards a platform (outer corners), a ring rising away from a
// pit (inner corners), a staircase up to a landing to walk up and down. The corners are set as stairsCorner would make
// them (the scene's blocks aren't placed by the player).
import { BLOCK_IDS, SHAPES, withShape } from "../src/blocks.js";
import { SceneGenerator } from "../src/gen/sceneGenerator.js";

export const settings = { "world.renderDistance": 3 };

const stairs = (shape) => withShape(BLOCK_IDS.PLANKS_STAIRS, SHAPES[shape]);

/** the scene, built in the world worker */
export async function world(seed) {
    const scene = await SceneGenerator.over("flat", seed);
    // a platform (x 0..2, y 0..2) with a ring of stairs rising towards it: outer corners
    scene.fill(0, 0, 1, 2, 2, 1, "PLANKS")
        .fill(0, -1, 1, 2, -1, 1, stairs("STAIRS_Y1")).fill(0, 3, 1, 2, 3, 1, stairs("STAIRS_Y0"))
        .fill(-1, 0, 1, -1, 2, 1, stairs("STAIRS_X1")).fill(3, 0, 1, 3, 2, 1, stairs("STAIRS_X0"))
        .set(-1, -1, 1, stairs("STAIRS_Y1_OUTER_X1")).set(3, -1, 1, stairs("STAIRS_Y1_OUTER_X0"))
        .set(-1, 3, 1, stairs("STAIRS_Y0_OUTER_X1")).set(3, 3, 1, stairs("STAIRS_Y0_OUTER_X0"));
    // a pit (x 9..11, y 0..4, 2 deep) and around it a ring of stairs rising away from it: inner corners
    scene.fill(9, 1, -1, 11, 3, 0, "EMPTY")
        .fill(9, 0, 1, 11, 0, 1, stairs("STAIRS_Y0")).fill(9, 4, 1, 11, 4, 1, stairs("STAIRS_Y1"))
        .fill(8, 1, 1, 8, 3, 1, stairs("STAIRS_X0")).fill(12, 1, 1, 12, 3, 1, stairs("STAIRS_X1"))
        .set(8, 0, 1, stairs("STAIRS_Y0_INNER_X0")).set(12, 0, 1, stairs("STAIRS_Y0_INNER_X1"))
        .set(8, 4, 1, stairs("STAIRS_Y1_INNER_X0")).set(12, 4, 1, stairs("STAIRS_Y1_INNER_X1"));
    // a staircase 3 wide rising along x (x 16..19), planks under its steps, up to a landing (x 20..22)
    for (let s = 0; s < 4; s++) {
        scene.fill(16 + s, 0, 1 + s, 16 + s, 2, 1 + s, stairs("STAIRS_X1"));
        if (s > 0)
            scene.fill(16 + s, 0, 1, 16 + s, 2, s, "PLANKS");
    }
    scene.fill(20, 0, 1, 22, 2, 4, "PLANKS");
    return scene;
}

/** @param {import("./testGame.js").TestGame} game */
export async function run(game) {
    game.walk();
    game.setPosition(6, -9, 1);
    game.lookAt(6, 2, 1);
}
