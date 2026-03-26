import { ChunkData } from "../chunk/chunk.js";
import { copyData, Resources } from "../utils.js";
import { UIntMesher } from "./uIntMesh.js";

export class UIntWasmMesher extends UIntMesher {

    #quick = false;
    #mesherWasmFunction;
    #heapBase;
    /** @type {WebAssembly.Memory} */
    #mem;

    constructor({ quick = false } = {}) {
        super();
        this.#quick = true;
        this.#mesherWasmFunction = quick ? UIntWasmMesher.wasmCreateMeshQ : UIntWasmMesher.wasmCreateMesh;
        this.#heapBase = quick ? UIntWasmMesher._heap_baseQ : UIntWasmMesher._heap_base;
        this.#mem = quick ? UIntWasmMesher.memQ : UIntWasmMesher.mem;
    }

    /**
     * @param {ChunkData} chunkData
     * @returns {Uint32Array}
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
        const trimmedOutput = new Uint32Array(len)
        trimmedOutput.set(output.subarray(0, len));
        return trimmedOutput;
    }


    static wasmCreateMesh;
    static wasmCreateMeshQ;

    static async init() {
        const alignUp = (x, a) => (x + (a - 1)) & ~(a - 1);

        const PAGE = 64 * 1024;
        const bytesToPages = (b) => (b + PAGE - 1) >>> 16; // ceil(b/65536)

        const MAX_FACES = 32 * 32 * 32 * 3;

        const CHUNK_SIZE_EXTENDED = 32 + 2;
        const INPUT_SIZE = CHUNK_SIZE_EXTENDED ** 3 * 2 * 4;
        const OUTPUT_SIZE = MAX_FACES * 6 * 4 * 2;

        const buffersBytes = INPUT_SIZE + OUTPUT_SIZE * 2;

        const STACK_BYTES = 2 * 1024 * 1024;
        const SLACK_BYTES = 1024 * 1024;

        const totalBytes = buffersBytes + STACK_BYTES + SLACK_BYTES;
        const initialPages = bytesToPages(totalBytes);


        const mem = new WebAssembly.Memory({
            initial: initialPages,
            maximum: initialPages,
        });

        const memQ = new WebAssembly.Memory({
            initial: initialPages,
            maximum: initialPages,
        });

        // UIntWasmMesher.#outputSize = OUTPUT_SIZE;

        const uIntWasmMesherQResult = await WebAssembly.instantiateStreaming(
            await fetch(Resources.relativeToRoot("./mesh/uIntWasmMesherQ.wasm")),
            {
                env: {
                    memory: memQ
                }
            }
        );

        const uIntWasmMesherResult = await WebAssembly.instantiateStreaming(
            await fetch(Resources.relativeToRoot("./mesh/uIntWasmMesher.wasm")),
            {
                env: {
                    memory: mem
                }
            }
        );


        UIntWasmMesher._heap_base = alignUp(uIntWasmMesherResult.instance.exports.__heap_base.value, 16);
        UIntWasmMesher._heap_baseQ = alignUp(uIntWasmMesherQResult.instance.exports.__heap_base.value, 16);
        UIntWasmMesher.wasmCreateMesh = uIntWasmMesherResult.instance.exports.create_mesh;
        UIntWasmMesher.wasmCreateMeshQ = uIntWasmMesherQResult.instance.exports.create_mesh;
        UIntWasmMesher.mem = mem;
        UIntWasmMesher.memQ = memQ;
    }
}