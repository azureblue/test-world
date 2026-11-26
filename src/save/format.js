/**
 * The version of the saved form (world records and chunks, docs/proposals/world-saving.md). It goes up with every
 * change to what's saved (a block renamed, a state bit moved, a new field), with a conversion from the version before
 * in {@link CONVERSIONS}; changes that don't touch the saved form (new blocks, new rules, a different generator) need
 * none. Data newer than this isn't loaded.
 */
export const FORMAT_VERSION = 1;

/**
 * A conversion from one version to the next, of a world record and of a chunk's palette, in place.
 * @typedef {object} Conversion
 * @property {(world: object) => void} world
 * @property {(palette: Array<[string, number]>) => void} palette the chunk's palette: block names and states
 */

/**
 * CONVERSIONS[v - 1] converts version v to v + 1; FORMAT_VERSION - 1 of them. For example a block renamed:
 * { world: () => {}, palette: p => p.forEach(e => { if (e[0] === "OLD") e[0] = "NEW"; }) }
 * @type {Conversion[]}
 */
const CONVERSIONS = [];

if (CONVERSIONS.length !== FORMAT_VERSION - 1)
    throw new Error(`save/format.js: ${CONVERSIONS.length} conversions for format version ${FORMAT_VERSION}`);

/**
 * Brings saved data of an older version to the current one, in place.
 * @param {number} version the data's version
 * @param {"world" | "palette"} kind
 * @param {any} data
 * @throws if the data is newer than this game
 */
export function upgrade(version, kind, data) {
    if (version > FORMAT_VERSION)
        throw new Error(`saved with a newer version of the game (format ${version}, this one reads up to ${FORMAT_VERSION})`);
    for (let v = version; v < FORMAT_VERSION; v++)
        CONVERSIONS[v - 1][kind](data);
}
