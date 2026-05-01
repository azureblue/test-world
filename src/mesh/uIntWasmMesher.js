import { ChunkData } from "../chunk/chunk.js";
import { copyData, Resources } from "../utils.js";
import { UIntMesher } from "./uIntMesh.js";

const HEADER_SIZE_IN_UINT32 = 8;
const alignUp = (x, a) => (x + (a - 1)) & ~(a - 1);
const PAGE = 64 * 1024;
const bytesToPages = (b) => (b + PAGE - 1) >>> 16;

const MAX_VOXELS = 32 * 32 * 32;
const MAX_FACES = MAX_VOXELS * 3;

const CHUNK_SIZE_EXTENDED = 32 + 2;
const INPUT_SIZE_BYTES = CHUNK_SIZE_EXTENDED ** 3 * 4;
const UINTS_PER_FACE = 6 * 2;
const UINTS_PER_CUTOFF_X_FACE = 6;
const OUTPUT_SIZE_BYTES_SOLID = MAX_FACES * UINTS_PER_FACE * 4;
const OUTPUT_SIZE_BYTES_CUTOFF_X = MAX_VOXELS * UINTS_PER_CUTOFF_X_FACE * 2 * 4;

// const buffersBytes = INPUT_SIZE_BYTES + OUTPUT_SIZE_BYTES_SOLID * 2 + OUTPUT_SIZE_BYTES_CUTOFF_X;
const buffersBytes = INPUT_SIZE_BYTES + OUTPUT_SIZE_BYTES_SOLID * 3;

const STACK_BYTES = 512 * 1024;
const STATIC_BYTES = 128 * 1024;

const totalBytes = buffersBytes + STACK_BYTES + STATIC_BYTES;
const initialPages = bytesToPages(totalBytes);

export class UIntExtWasmMesher extends UIntMesher {

    #mesherWasmFunction;
    #heapBase;
    /** @type {WebAssembly.Memory} */
    #mem;

    constructor(mesherWasmFunction, heapBase, mem) {
        super();
        this.#mesherWasmFunction = mesherWasmFunction;
        this.#heapBase = heapBase;
        this.#mem = mem;
    }

    /**
     * @param {ChunkData} chunkData
     * @return {{data: Uint32Array, solidEnd: number, liquidEnd: number, xQuadEnd: number}}     
     */
    mesh(chunkData) {
        const rawData = chunkData.rawData();
        const dataByteLen = rawData.byteLength;

        const MAX_FACES = 32 * 32 * 32 * 3;
        const OUTPUT_SIZE = MAX_FACES * 6 * 4 * 2;
        copyData(rawData, this.#mem.buffer, this.#heapBase);
        const len = this.#mesherWasmFunction(
            this.#heapBase,
            this.#heapBase + dataByteLen,
        )
        const output = new Uint32Array(this.#mem.buffer, this.#heapBase + dataByteLen, OUTPUT_SIZE / 4);
        const solidEnd = output[0];
        const liquidEnd = output[1];
        const xQuadEnd = output[2];
        const trimmedOutput = new Uint32Array(len - HEADER_SIZE_IN_UINT32);
        trimmedOutput.set(output.subarray(HEADER_SIZE_IN_UINT32, len));
        return {
            data: trimmedOutput,
            solidEnd: solidEnd,
            liquidEnd: liquidEnd,
            xQuadEnd: xQuadEnd
            
        };
    }

    static async createMesher() {
        const mem = new WebAssembly.Memory({
            initial: initialPages,
            maximum: initialPages,
        });

        const uIntWasmMesherResult = await WebAssembly.instantiateStreaming(
            await fetch(Resources.relativeToRoot("./mesh/uIntWasmMesher.wasm")),
            {
                env: {
                    memory: mem
                }
            }
        );

        const heap_base = alignUp(uIntWasmMesherResult.instance.exports.__heap_base.value, 16);
        const wasmCreateMesh = uIntWasmMesherResult.instance.exports.create_mesh;
        return new UIntExtWasmMesher(wasmCreateMesh, heap_base, mem);        
    }

    static async createFastkMesher() {
        const mem = new WebAssembly.Memory({
            initial: initialPages,
            maximum: initialPages,
        });

        const uIntWasmMesherResult = await WebAssembly.instantiateStreaming(
            await fetch(Resources.relativeToRoot("./mesh/uIntWasmMesherQ.wasm")),
            {
                env: {
                    memory: mem
                }
            }
        );

        const heap_base = alignUp(uIntWasmMesherResult.instance.exports.__heap_base.value, 16);
        const wasmCreateMesh = uIntWasmMesherResult.instance.exports.create_mesh;
        return new UIntExtWasmMesher(wasmCreateMesh, heap_base, mem);        
    }
}
