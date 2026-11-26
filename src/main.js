import { Game } from "./game.js";
import { chooseWorld } from "./menu/worldMenu.js";

/**
 * Starts the game in the page (index.html): the world in the URL (world.id), or the one chosen in the world menu, or
 * one that isn't saved (world.menu=false, or "Play without saving").
 * @returns {Promise<Game>}
 */
export async function start() {
    return Game.start(document.body, await chooseWorld(document.body));
}
