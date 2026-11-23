import { Chunk } from "../chunk/chunk.js";
import { Vec3 } from "../geom.js";

/**
 * A chunk the client keeps: requested from the world worker, then loaded with its data and mesh.
 */
export class ChunkEntry {
    /**@type {Vec3} */
    position;
    /**@type {Chunk} */
    chunk;
    loaded = false;
    /** id of the latest request for this chunk */
    requestId = 0;
    /** version of the chunk message the data and mesh come from, older ones are dropped */
    version = 0;
    /** the light the mesh was made with (ChunkResponse.light), for the quick meshes of edits
     * @type {Uint8Array | null} */
    light = null;

    /** @param {Vec3} position */
    constructor(position) {
        this.position = position;
    }
}

/** key of the chunk maps, chunk coordinates */
export function pos3ToKey(x, y, z = 0) {
    return x + ":" + y + ":" + z;
}
