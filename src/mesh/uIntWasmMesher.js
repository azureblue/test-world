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
 * (block_table_t in mesh/cpp/blocks.hpp: the water texture, MAX_BLOCK_ID * 6 face textures, then a byte per block id
 * and per texture: cutout or not).
 * @param {WebAssembly.Exports} exports
 * @param {WebAssembly.Memory} mem
 * @param {boolean} cutout whether blocks with cutout textures use them (meshTextureTable)
 */
function writeTextureTable(exports, mem, cutout) {
    if (exports.max_block_id() !== MAX_BLOCK_ID)
        throw new Error(`mesher: MAX_BLOCK_ID ${exports.max_block_id()}, blocks.js has ${MAX_BLOCK_ID}`);
    const { waterTexture, faces, cutoutBlocks, cutoutTextures } = meshTextureTable(cutout);
    const base = exports.block_table();
    const table = new Uint32Array(mem.buffer, base, 1 + faces.length);
    table[0] = waterTexture;
    table.set(faces, 1);
    const bytes = new Uint8Array(mem.buffer, base + table.byteLength, MAX_BLOCK_ID + MAX_TEXTURES);
    bytes.set(cutoutBlocks);
    bytes.set(cutoutTextures, MAX_BLOCK_ID);
}

export class UIntExtWasmMesher extends UIntMesher {

    #mesherWasmFunction;
    #heapBase;
    #byteOutputOffset;
    #byteHeaderOffset;
    #byteOutputDataOffset;

    /** @type {WebAssembly.Memory} */
    #mem;

    constructor(mesherWasmFunction, heapBase, mem) {
        super();
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
     * @param {{cutout?: boolean}} [options] cutout: blocks with cutout textures use them (Settings.render.cutoutLeaves)
     */
    static async createMesher({ cutout = false } = {}) {
        return UIntExtWasmMesher.#create("./mesh/uIntWasmMesher.wasm", cutout);
    }

    /**
     * The fast, unoptimized mesher: a quad per face.
     * @param {{cutout?: boolean}} [options] see {@link UIntExtWasmMesher.createMesher}
     */
    static async createFastMesher({ cutout = false } = {}) {
        return UIntExtWasmMesher.#create("./mesh/uIntWasmMesherQ.wasm", cutout);
    }

    static async #create(path, cutout) {
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
        return new UIntExtWasmMesher(result.instance.exports.create_mesh, heapBase, mem);
    }
}
