import { Chunk } from "../chunk/chunk.js";
import { Vec3 } from "../geom.js";

/**
 * A chunk the world keeps: requested from the chunk loader, then loaded with its data and mesh.
 */
export class ChunkEntry {
    /**@type {Vec3} */
    position;
    /**@type {Chunk} */
    chunk;
    loaded = false;
    /** loaded, but requested again after an edit */
    dirty = false;
    /** id of the latest request for this chunk, responses to older requests are dropped */
    requestId = 0;

    /** @param {Vec3} position */
    constructor(position) {
        this.position = position;
    }
}

/** key of the chunk maps, chunk coordinates */
export function pos3ToKey(x, y, z = 0) {
    return x + ":" + y + ":" + z;
}
