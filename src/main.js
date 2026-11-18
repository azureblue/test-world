import { Game } from "./game.js";

/**
 * Starts the game in the page (index.html).
 * @returns {Promise<Game>}
 */
export async function start() {
    return Game.start(document.body);
}
