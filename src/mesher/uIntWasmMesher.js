import { Resources } from "../utils.js";
import { UIntMesher } from "./mesher.js";

export class UIntWasmMesher extends UIntMesher {

    #quick = false;
    #mesherWasmFunction;
    #heapBase;

    constructor({ quick = false } = {}) {
        super();
        this.#quick = quick;
        this.#mesherWasmFunction = quick ? UIntWasmMesher.wasmCreateMeshQ : UIntWasmMesher.wasmCreateMesh;
        this.#heapBase = quick ? UIntWasmMesher._heap_baseQ : UIntWasmMesher._heap_base;
    }

    mesh(chunkData) {
        const MAX_FACES = 32 * 32 * 32 * 3;
        const OUTPUT_SIZE = MAX_FACES * 6 * 4 * 2;
        const input = new Uint32Array(UIntWasmMesher.mem.buffer, this.#heapBase, chunkData.data.length);
        input.set(chunkData.data);
        const len = this.#mesherWasmFunction(
            this.#heapBase,
            this.#heapBase + input.byteLength
        )
        const output = new Uint32Array(UIntWasmMesher.mem.buffer, this.#heapBase + input.byteLength, OUTPUT_SIZE / 4);
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

        // UIntWasmMesher.#outputSize = OUTPUT_SIZE;

        const uIntWasmMesherQResult = await WebAssembly.instantiateStreaming(
            await fetch(Resources.relativeToRoot("./mesher/uIntWasmMesherQ.wasm")),
            {
                env: {
                    memory: mem
                }
            }
        );

        const uIntWasmMesherResult = await WebAssembly.instantiateStreaming(
            await fetch(Resources.relativeToRoot("./mesher/uIntWasmMesher.wasm")),
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
    }
}