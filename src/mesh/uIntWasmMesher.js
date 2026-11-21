import { MAX_BLOCK_ID, MAX_TEXTURES, meshTextureTable } from "../blocks.js";
import { CHUNK_EXT_DATA_SIZE, ChunkDataExt } from "../chunk/extChunk.js";
import { copyData, Resources } from "../utils.js";
import { WASM } from "../wasm.js";
import { UIntMesher } from "./uIntMesh.js";

const HEADER_SIZE_IN_UINT32 = 8;
const HEADER_SIZE_IN_BYTES = HEADER_SIZE_IN_UINT32 * 4;
const CHUNK_EXT_DATA_SIZE_IN_BYTES = CHUNK_EXT_DATA_SIZE * 4;


const MAX_VOXELS = 32 * 32 * 32;
const MAX_FACES = MAX_VOXELS * 3;

const CHUNK_SIZE_EXTENDED = 32 + 2;
const INPUT_SIZE_BYTES = CHUNK_SIZE_EXTENDED ** 3 * 4;
const UINTS_PER_FACE = 6 * 2;
const UINTS_PER_CUTOFF_X_FACE = 6;
const OUTPUT_SIZE_BYTES_SOLID = MAX_FACES * UINTS_PER_FACE * 4;
const OUTPUT_SIZE_BYTES_CUTOFF_X = MAX_VOXELS * UINTS_PER_CUTOFF_X_FACE * 2 * 4;

// scratch area after the cutout output, used by the mesher to sort solid faces front-to-back
const SORT_SCRATCH_BYTES = OUTPUT_SIZE_BYTES_SOLID;
// cutout cube faces (leaves with holes), after the scratch: up to twice the solid faces (the faces between them too)
const OUTPUT_SIZE_BYTES_CUTOUT = OUTPUT_SIZE_BYTES_SOLID * 2;

const BUFFERS_BYTES = INPUT_SIZE_BYTES + OUTPUT_SIZE_BYTES_SOLID * 2 + OUTPUT_SIZE_BYTES_CUTOFF_X + SORT_SCRATCH_BYTES +
    OUTPUT_SIZE_BYTES_CUTOUT;

const STACK_BYTES = 512 * 1024;
const STATIC_BYTES = 128 * 1024;

const TOTAL_BYTES = BUFFERS_BYTES + STACK_BYTES + STATIC_BYTES;
const INITIAL_PAGES = WASM.bytesToPages(TOTAL_BYTES);

/**
 * Writes the blocks' face textures (src/blocks.json) into a mesher's memory, where its block_table() points
 * (block_table_t in mesh/cpp/blocks.hpp: the water texture, the cutout flag, MAX_BLOCK_ID * 6 face textures, as many
 * opaque ones, then a byte per texture: cutout or not).
 * @param {WebAssembly.Exports} exports
 * @param {WebAssembly.Memory} mem
 * @param {boolean} cutout whether blocks with cutout textures use them (meshTextureTable)
 */
function writeTextureTable(exports, mem, cutout) {
    if (exports.max_block_id() !== MAX_BLOCK_ID)
        throw new Error(`mesher: MAX_BLOCK_ID ${exports.max_block_id()}, blocks.js has ${MAX_BLOCK_ID}`);
    const { waterTexture, cutoutFlag, faces, opaqueFaces, cutoutTextures } = meshTextureTable(cutout);
    const base = exports.block_table();
    const table = new Uint32Array(mem.buffer, base, 2 + faces.length + opaqueFaces.length);
    table[0] = waterTexture;
    table[1] = cutoutFlag;
    table.set(faces, 2);
    table.set(opaqueFaces, 2 + faces.length);
    new Uint8Array(mem.buffer, base + table.byteLength, MAX_TEXTURES).set(cutoutTextures);
}

// a cell's sky darkness (7 - sky light) in the mesher's input (LIGHT_BITS in mesh/cpp/common.hpp)
const SKY_DARKNESS_SHIFT = 11;

// the sky light of a cell that sees the sky only at an angle (fakeSkyLight), by the gap (the open cells from it up to
// the block above): one level less than open sky, one more less directly under a block (a 1 block gap is darker than
// a higher one), full from SHADOWLESS_GAP up (a high roof casts no shadow)
const ANGLED_SKY = 6;
const SHADOWLESS_GAP = 6;
const angledSky = (gap) => gap >= SHADOWLESS_GAP ? 7 : Math.min(ANGLED_SKY, 4 + gap);

/**
 * Test light until the light is computed (Settings.light.debugFake), within the chunk's data (its border included)
 * only. Solid cells keep 0, as the mesher expects.
 * - Sky light 7 in every cell open to the top of the data. Angled sky light (angledSky: by the gap, the open cells
 *   from this one up to the block above) in the cells that see the sky at 45°: a cell gets it from a sky lit cell
 *   diagonally above it (one block to a side), past the cell beside it or the one above it, and passes it on down.
 *   Under a roof it reaches as far in as the roof is high: a low roof darkens further in, a high one shades lightly,
 *   SHADOWLESS_GAP or more above not at all as far as the angled light reaches.
 * - Spread from there through the cells that aren't solid, 1 less per block, 2 less for a step sideways into a cell
 *   under a solid block (a low gap darkens faster). Bucket queue by light level, highest first.
 * @param {Uint32Array} data the mesher's input, CHUNK_SIZE_EXTENDED^3, index (h * size + y) * size + x
 */
function fakeSkyLight(data) {
    const size = CHUNK_SIZE_EXTENDED, plane = size * size;
    const open = (i) => (data[i] >>> 31) === 0;
    const light = new Uint8Array(data.length);
    // open cells from each cell up to the block above it (itself included)
    const gap = new Uint8Array(data.length);
    /** @type {number[][]} cells by the light they got (stale entries skipped) */
    const buckets = [[], [], [], [], [], [], [], []];
    for (let h = size - 1; h >= 0; h--) {
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const i = (h * size + y) * size + x;
                if (!open(i))
                    continue;
                let sky = h === size - 1 ? 7 : 0;
                if (sky === 0) {
                    const above = i + plane;
                    gap[i] = open(above) ? gap[above] + 1 : 1;
                    const skyLit = (j) => light[j] >= angledSky(1);
                    // straight up: open sky stays 7 down its column
                    if (light[above] === 7)
                        sky = 7;
                    // straight up angled, or diagonally above, one block to a side: past the cell beside this one or
                    // the one above this one
                    else if ((open(above) && skyLit(above)) || [x > 0 && -1, x < size - 1 && 1, y > 0 && -size, y < size - 1 && size]
                        .some((d) => d !== false && skyLit(above + d) && (open(i + d) || open(above))))
                        sky = angledSky(gap[i]);
                } else {
                    gap[i] = 1;
                }
                if (sky > 0) {
                    light[i] = sky;
                    buckets[sky].push(i);
                }
            }
        }
    }
    const reach = (j, level) => {
        if (level > 0 && light[j] < level && open(j)) {
            light[j] = level;
            buckets[level].push(j);
        }
    };
    for (let level = 7; level > 1; level--) {
        for (const i of buckets[level]) {
            if (light[i] !== level)
                continue;
            const x = i % size, y = Math.floor(i / size) % size, h = Math.floor(i / plane);
            // sideways: 2 less into a cell under a solid block
            const side = (j) => reach(j, level - (h < size - 1 && !open(j + plane) ? 2 : 1));
            if (x > 0) side(i - 1);
            if (x < size - 1) side(i + 1);
            if (y > 0) side(i - size);
            if (y < size - 1) side(i + size);
            if (h > 0) reach(i - plane, level - 1);
            if (h < size - 1) reach(i + plane, level - 1);
        }
    }
    for (let i = 0; i < data.length; i++)
        if (open(i))
            data[i] |= (7 - light[i]) << SKY_DARKNESS_SHIFT;
}

export class UIntExtWasmMesher extends UIntMesher {

    #mesherWasmFunction;
    #heapBase;
    #byteOutputOffset;
    #byteHeaderOffset;
    #byteOutputDataOffset;

    /** @type {WebAssembly.Memory} */
    #mem;
    #fakeLight;

    constructor(mesherWasmFunction, heapBase, mem, fakeLight) {
        super();
        this.#fakeLight = fakeLight;
        this.#mesherWasmFunction = mesherWasmFunction;
        this.#heapBase = heapBase;
        this.#byteOutputOffset = this.#heapBase + CHUNK_EXT_DATA_SIZE_IN_BYTES;
        this.#byteHeaderOffset = this.#byteOutputOffset;
        this.#byteOutputDataOffset = this.#byteOutputOffset + HEADER_SIZE_IN_BYTES;
        this.#mem = mem;
    }

    /**
     * @param {ChunkDataExt} chunkData
     * @param {Uint32Array} [destData] Optional pre-allocated array to store the result data.
     * @return {{data: Uint32Array, solidEnd: number, liquidEnd: number, xQuadEnd: number, cutoutEnd: number}}
     */
    mesh(chunkData, destData = null) {
        const rawData = chunkData.rawData();
        copyData(rawData, this.#mem.buffer, 0, this.#heapBase);
        if (this.#fakeLight)
            fakeSkyLight(new Uint32Array(this.#mem.buffer, this.#heapBase, CHUNK_EXT_DATA_SIZE));
        const dataLength = this.#mesherWasmFunction(
            this.#heapBase,
            this.#byteOutputOffset,
        )
        const header = new Uint32Array(this.#mem.buffer, this.#byteHeaderOffset, HEADER_SIZE_IN_UINT32);
        const solidEnd = header[0];
        const liquidEnd = header[1];
        const xQuadEnd = header[2];
        const cutoutEnd = header[3];
        const outputData = new Uint32Array(this.#mem.buffer, this.#byteOutputDataOffset, dataLength);
        const resultData = destData || new Uint32Array(dataLength);
        resultData.set(outputData);

        return {
            data: resultData,
            solidEnd: solidEnd,
            liquidEnd: liquidEnd,
            xQuadEnd: xQuadEnd,
            cutoutEnd: cutoutEnd
        };
    }

    /**
     * The main mesher: merged faces, solid faces sorted front-to-back.
     * @param {{cutout?: boolean, fakeLight?: boolean}} [options] cutout: blocks with cutout textures use them
     *   (Settings.render.cutoutLeaves); fakeLight: test light (Settings.light.debugFake)
     */
    static async createMesher({ cutout = false, fakeLight = false } = {}) {
        return UIntExtWasmMesher.#create("./mesh/uIntWasmMesher.wasm", cutout, fakeLight);
    }

    /**
     * The fast, unoptimized mesher: a quad per face.
     * @param {{cutout?: boolean, fakeLight?: boolean}} [options] see {@link UIntExtWasmMesher.createMesher}
     */
    static async createFastMesher({ cutout = false, fakeLight = false } = {}) {
        return UIntExtWasmMesher.#create("./mesh/uIntWasmMesherQ.wasm", cutout, fakeLight);
    }

    static async #create(path, cutout, fakeLight) {
        const mem = new WebAssembly.Memory({
            initial: INITIAL_PAGES,
            maximum: INITIAL_PAGES,
        });
        const result = await WebAssembly.instantiateStreaming(await fetch(Resources.relativeToRoot(path)), {
            env: {
                memory: mem
            }
        });
        writeTextureTable(result.instance.exports, mem, cutout);
        const heapBase = WASM.alignUp(result.instance.exports.__heap_base.value, 16);
        return new UIntExtWasmMesher(result.instance.exports.create_mesh, heapBase, mem, fakeLight);
    }
}
