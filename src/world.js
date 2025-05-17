import { Chunk, CHUNK_SIZE_BIT_POS, ChunkData, UIntMesh } from "./chunk.js";
import { ivec2, IVec3, ivec3, Vec2, vec2, Vec3, vec3 } from "./geom.js";
import { Int32Buffer, Logger, UInt32Buffer } from "./utils.js";
const logger = new Logger("World");
const CHUNK_RENDER_DIST = 14;
const CHUNK_RENDER_DIST_SQ = CHUNK_RENDER_DIST * CHUNK_RENDER_DIST;

export class BlockLocation {
    constructor() {
        this.chunkPos = ivec2();
        this.blockInChunkPos = ivec3();
    }
}

class ChunkEntry {
    /**@type {Chunk} */
    chunk;
    loaded = false;
    shouldRemove = false;
}

/**
 * @param {number} x [-32767, 32767]
 * @param {number} y [-32767, 32767]
 */
function posToKey(x, y) {
    return (x + 32767) << 16 | (y + 32767);
}

function keyToX(key) {
    return (key >>> 16) - 32767;
}

function keyToY(key) {
    return (key & 0xFFFF) - 32767;
}

class ChunkLoadPromise {

    constructor(key) {
        this.key = key;
        this.resolve = null;
        this.promise = new Promise((res, rej) => {
            this.resolve = (chunk) => {
                res(chunk);
            }
        });
    }
}

const tmpBlockLocation = new BlockLocation();

export class World {
    #frame = 0;
    #chunkLoader
    #tmpBuffer = new Int32Buffer(1000);
    #pos = vec2();
    #chunkPos = ivec2(0xFFFFFFFF, 0xFFFFFFFF);
    #rangeDeltas;

    /** @type {Map<number, ChunkEntry>} */
    #chunks = new Map();

    /** @type {Map<number, object} */
    #chunkDataQueue = new Map();

    /**@type {ChunkLoadPromise} */
    #currentChunkPromise = null;

    #chunkKeysSorted;

    /**
     * @param {Worker} chunkLoader 
     */
    constructor(chunkLoader) {
        this.#chunkLoader = chunkLoader;
        this.#chunkLoader.onmessage = (me) => this.onChunk(me.data);
        const tmpBuff = new UInt32Buffer(512);
        tmpBuff.put(posToKey(0, 0));
        for (let r = 1; r < CHUNK_RENDER_DIST; r++) {
            const rangeFrom = -r;
            const rangeTo = r;
            const rSq = r * r;
            for (let horizontal = rangeFrom; horizontal <= r; horizontal++) {
                if ((horizontal * horizontal + rSq) > CHUNK_RENDER_DIST_SQ)
                    continue;
                tmpBuff.put(posToKey(horizontal, -r));
                tmpBuff.put(posToKey(horizontal, r));
            }

            for (let vert = rangeFrom + 1; vert <= rangeTo - 1; vert++) {
                if ((vert * vert + rSq) > CHUNK_RENDER_DIST_SQ)
                    continue;
                tmpBuff.put(posToKey(-r, vert));
                tmpBuff.put(posToKey(r, vert));
            }
        }
        this.#rangeDeltas = tmpBuff.trimmed();
        this.#rangeDeltas.sort((a, b) => {
            const ax = keyToX(a);
            const bx = keyToX(b);
            const ay = keyToY(a);
            const by = keyToY(b);
            return (ax * ax + ay * ay) - (bx * bx + by * by);
        })
        this.#chunkKeysSorted = new Int32Buffer(this.#rangeDeltas.length);
    }

    onChunk(data) {
        const chunkPos = vec2(data.chunkPos[0], data.chunkPos[1]);
        const key = posToKey(chunkPos.x, chunkPos.y);
        if (this.#currentChunkPromise != null && this.#currentChunkPromise.key == key)
            this.processChunkData(data);
        else
            this.#chunkDataQueue.set(key, data);
    }

    /**
     * 
     * @param {Vec2} pos 
     */
    inRange(pos) {
        const dx = (pos.x - this.#chunkPos.x) | 0;
        const dy = (pos.y - this.#chunkPos.y) | 0;
        return (dx * dx + dy * dy) <= CHUNK_RENDER_DIST_SQ;
    }

    processChunkData(data) {
        const chunkPos = vec2(data.chunkPos[0], data.chunkPos[1]);
        const key = posToKey(chunkPos.x, chunkPos.y);
        if (!this.inRange(chunkPos))
            return false;
        logger.info(`got chunk (${chunkPos.x}, ${chunkPos.y})`);
        if (!this.#chunks.has(key)) {
            logger.debug("missing entry for key: " + key);
            return false;
        }
        const entry = this.#chunks.get(key);
        const now = performance.now();
        const chunkData = new ChunkData();
        chunkData.data.set(data.rawChunkData);
        const translation = data.meshTranslation;
        const mesh = UIntMesh.load(data.rawMeshData, vec3(...translation));
        const chunk = new Chunk(chunkPos, chunkData, mesh);
        entry.chunk = chunk;
        entry.loaded = true;
        // logger.debug(`uploading mesh time: ${perfDiff(now)}`);
        if (this.#currentChunkPromise !== null) {
            if (this.#currentChunkPromise.key === key) {
                this.#currentChunkPromise.resolve(chunk);
                this.#currentChunkPromise = null;
            }
        }
        return true;
    }

    moveTo(x, y) {
        this.#pos.x = x;
        this.#pos.y = y;
        const cx = Math.floor(x) >> CHUNK_SIZE_BIT_POS;
        const cy = (-Math.ceil(y)) >> CHUNK_SIZE_BIT_POS;
        const changed = (this.#chunkPos.x != cx || this.#chunkPos.y != cy);

        this.#chunkPos.x = cx;
        this.#chunkPos.y = cy;
        if (changed) {
            this.updateChunksInRange();
        }
    }

    updateChunksInRange() {
        // if (this.#frame == 1) {
        this.#tmpBuffer.reset();
        for (const key of this.#chunks.keys()) {
            this.#tmpBuffer.put(key);
        }
        // } else if (this.#frame == 2) {
        // const now = performance.now();
        for (let i = 0; i < this.#tmpBuffer.length; i++) {
            const key = this.#tmpBuffer.array[i];
            const x = keyToX(key);
            const y = keyToY(key);
            const dx = x - this.#chunkPos.x;
            const dy = y - this.#chunkPos.y;
            if (dx * dx + dy * dy > CHUNK_RENDER_DIST_SQ) {
                logger.info("removing chunk: " + x + " " + y);
                this.#chunks.delete(key);
            }
        }
        // logger.debug(`checking chunks time: ${perfDiff(now)}`);
        // } else if (this.#frame == 0) {
        this.#chunkKeysSorted.reset();
        // const now = performance.now();
        for (const delta of this.#rangeDeltas) {
            const dx = keyToX(delta);
            const dy = keyToY(delta);
            const cx = this.#chunkPos.x + dx;
            const cy = this.#chunkPos.y + dy;
            const key = posToKey(cx, cy);
            this.#chunkKeysSorted.put(key);
            if (!this.#chunks.has(key)) {
                const entry = new ChunkEntry();
                logger.info(`requesting chunk  (${cx}, ${cy})`);
                this.#chunks.set(key, entry);
                this.#chunkLoader.postMessage({ cx: cx, cy: cy })
            }
        }
        // logger.debug(`requesting new chunks time: ${perfDiff(now)}`);
        // } 
    }

    /**@returns {Chunk} */
    async getCurrentChunk() {
        const key = posToKey(this.#chunkPos.x, this.#chunkPos.y);
        const entry = this.#chunks.get(key);
        if (entry === undefined) {
            logger.error("missing entry for current chunk");
            return null;
        }

        if (entry.loaded) {
            return entry.chunk;
        } else {
            this.#currentChunkPromise = new ChunkLoadPromise(key);
            return await this.#currentChunkPromise.promise;
        }
    }

    update() {
        if (this.#frame > 2) {
            if (this.#chunkDataQueue.size > 0) {
                const entriesIter = this.#chunkDataQueue.entries();
                for (let i = 0; i < 10; i++) {
                    const next = entriesIter.next();
                    if (next.done)
                        break;
                    const entry = next.value;
                    this.#chunkDataQueue.delete(entry[0]);
                    if (this.processChunkData(entry[1]))
                        break;
                    // console.log("next");
                }
            }
        }
        this.#frame++;
        if (this.#frame == 10) {
            this.#frame = 0;
        }
    }

    render(renderChunk) {
        for (let i = this.#chunkKeysSorted.length; i >= 0; i--) {
            const key = this.#chunkKeysSorted.array[i];
            const value = this.#chunks.get(key);
            if (value !== undefined && value.loaded) {
                renderChunk(value.chunk);
            }
        }
        // for (const entry of this.#chunks.entries()) {
        //     const value = entry[1];
        //     if (!value.loaded)
        //         continue;
        //     renderChunk(value.chunk);
        // }
    }


    /**
     * Performs voxel-accurate DDA raycast without integer casting.
     * @param {Vec3} pos 
     * @param {Vec3} dir 
     * @param {number} maxDist - Maximum ray distance
     * @returns {{x, y, z, value, distance} | null}
     */
    raycasti(pos, dir, maxDist = 5) {
        let x = Math.floor(pos.x);
        let y = Math.floor(pos.y);
        let z = Math.floor(pos.z);

        // Direction of step in each axis (+1 or -1)
        const stepX = Math.sign(dir.x);
        const stepY = Math.sign(dir.y);
        const stepZ = Math.sign(dir.z);

        // How far along the ray we must move in order to cross a voxel boundary on each axis
        const tDeltaX = dir.x !== 0 ? Math.abs(1 / dir.x) : Infinity;
        const tDeltaY = dir.y !== 0 ? Math.abs(1 / dir.y) : Infinity;
        const tDeltaZ = dir.z !== 0 ? Math.abs(1 / dir.z) : Infinity;

        // Calculate initial tMax values: distance to the first voxel boundary
        const tMaxX = dir.x !== 0
            ? ((stepX > 0 ? (x + 1 - pos.x) : (pos.x - x)) * tDeltaX)
            : Infinity;
        const tMaxY = dir.y !== 0
            ? ((stepY > 0 ? (y + 1 - pos.y) : (pos.y - y)) * tDeltaY)
            : Infinity;
        const tMaxZ = dir.z !== 0
            ? ((stepZ > 0 ? (z + 1 - pos.z) : (pos.z - z)) * tDeltaZ)
            : Infinity;

        let tMax = { x: tMaxX, y: tMaxY, z: tMaxZ };
        let t = 0;

        while (t <= maxDist) {
            const block = this.blockAtWorldIPos(ivec3(x, y, z));
            if (block !== 0) {
                return { hit: true, x, y, z, block };
            }

            // Step to the next voxel
            if (tMax.x < tMax.y && tMax.x < tMax.z) {
                x += stepX;
                t = tMax.x;
                tMax.x += tDeltaX;
            } else if (tMax.y < tMax.z) {
                y += stepY;
                t = tMax.y;
                tMax.y += tDeltaY;
            } else {
                z += stepZ;
                t = tMax.z;
                tMax.z += tDeltaZ;
            }
        }

        return null;
    }

    /**
     * @param {IVec3} pos 
     */
    switchBlockPos(pos) {
        return new ivec3(pos.x, pos.y, -pos.z - 1);
    }

    /**
     * @param {IVec3} worldIPos 
     */
    blockAtWorldIPos(worldIPos) {
        const pos = this.switchBlockPos(worldIPos);
        const cx = pos.x >> CHUNK_SIZE_BIT_POS;
        const cy = pos.z >> CHUNK_SIZE_BIT_POS;
        const bx = pos.x & 0xF;
        const by = pos.z & 0xF;
        const bh = pos.y & 0xFF;

        const entry = this.#chunks.get(posToKey(cx, cy));
        if (entry === undefined || !entry.loaded)
            return 0;

        return entry.chunk.data.get(bh, bx, by);
    }

    /**
     * @param {BlockLocation} blockLocation 
     * @param {Vec3} pos 
     */
    blockLocation(blockLocation, pos) {
        const cx = Math.floor(pos.x) >> CHUNK_SIZE_BIT_POS;
        const cy = (-Math.ceil(pos.z)) >> CHUNK_SIZE_BIT_POS;
        const bx = Math.floor(pos.x) & 0xF;
        const by = (pos.z <= 0 ? (Math.floor(-pos.z) % 16) : 15 - (Math.floor(pos.z) % 16)) | 0
        blockLocation.chunkPos.x = cx;
        blockLocation.chunkPos.y = cy;
        blockLocation.blockInChunkPos.x = bx;
        blockLocation.blockInChunkPos.z = by;
        blockLocation.blockInChunkPos.y = Math.floor(pos.y);
    }

    /**
 * @param {BlockLocation} blockLocation 
 * @param {Vec3} pos 
 */
    blockAtPos(pos) {
        if (pos.y < 0)
            return 0;
        return this.blockAtWorldIPos(new IVec3(Math.floor(pos.x), Math.floor(pos.y), Math.floor(pos.z)));
        // this.blockLocation(tmpBlockLocation, pos);
        // const chunkPos = tmpBlockLocation.chunkPos;
        // const blockPos = tmpBlockLocation.blockInChunkPos;
        // const chunk = this.#chunks.get(posToKey(chunkPos.x, chunkPos.y)).chunk;
        // return chunk.data.get(blockPos.y, blockPos.x, blockPos.z);
    }
}

