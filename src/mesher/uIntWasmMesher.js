import { Resources } from "../utils.js";
import { UIntMesher } from "./mesher.js";

export class UIntWasmMesher extends UIntMesher {

    #quick = false;
    #mesherWasmFunction;

    constructor({ quick = false } = {}) {
        super();
        this.#quick = quick;
        this.#mesherWasmFunction = quick ? UIntWasmMesher.wasmCreateMeshQ : UIntWasmMesher.wasmCreateMesh;
    }

    mesh(chunkData) {
        const MAX_FACES = 32 * 32 * 32 * 3;
        const MAX_OUTPUT_UINTS = MAX_FACES * 6 * 2;
        const OUTPUT_SIZE = MAX_FACES * 6 * 4 * 2;
        const input = new Uint32Array(UIntWasmMesher.mem.buffer, UIntWasmMesher._heap_base, chunkData.data.length);
        input.set(chunkData.data);
        const len = this.#mesherWasmFunction(
            UIntWasmMesher._heap_base,
            UIntWasmMesher._heap_base + input.byteLength,
            UIntWasmMesher._heap_base + input.byteLength + OUTPUT_SIZE
        )
        const output = new Uint32Array(UIntWasmMesher.mem.buffer, UIntWasmMesher._heap_base + input.byteLength, OUTPUT_SIZE / 4);
        const trimmedOutput = new Uint32Array(len)
        trimmedOutput.set(output.subarray(0, len));
        return trimmedOutput;
    }

    
    static wasmCreateMesh;
    static wasmCreateMeshQ;

    static async init() {

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

        const wasmResult = await WebAssembly.instantiateStreaming(
            await fetch(Resources.relativeToRoot("./mesher/uIntWasmMesher.wasm")),
            {
                env: {
                    memory: mem
                }
            }
        );
        const instance = wasmResult.instance;
        UIntWasmMesher._heap_base = instance.exports.__heap_base.value;
        UIntWasmMesher.wasmCreateMesh = instance.exports.create_mesh;
        UIntWasmMesher.wasmCreateMeshQ = instance.exports.create_mesh_q;
        UIntWasmMesher.mem = mem;
    }
}