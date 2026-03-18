import { Logger } from "../logging.js";
import { Resources } from "../utils.js";
import { UIntMesher } from "./mesher.js";

export class UIntWasmMesher extends UIntMesher {

    #quick = false;
    #mesherWasmFunction;
    #heapBase;
    #mem;

    constructor({ quick = false } = {}) {
        super();
        quick = false;
        this.#quick;
        this.#mesherWasmFunction = quick ? UIntWasmMesher.wasmCreateMeshQ : UIntWasmMesher.wasmCreateMesh;
        this.#heapBase = quick ? UIntWasmMesher._heap_baseQ : UIntWasmMesher._heap_base;
        this.#mem = quick ? UIntWasmMesher.memQ : UIntWasmMesher.mem;
    }

    mesh(chunkData) {
        const MAX_FACES = 32 * 32 * 32 * 3;
        const OUTPUT_SIZE = MAX_FACES * 6 * 4 * 2;
        const input = new Uint32Array(this.#mem.buffer, this.#heapBase, chunkData.data.length);
        input.set(chunkData.data);
        const len = this.#mesherWasmFunction(
            this.#heapBase,
            this.#heapBase + input.byteLength
        )
        const output = new Uint32Array(this.#mem.buffer, this.#heapBase + input.byteLength, OUTPUT_SIZE / 4);
        const trimmedOutput = new Uint32Array(len)
        trimmedOutput.set(output.subarray(0, len));
        return trimmedOutput;
    }


    static wasmCreateMesh;
    static wasmCreateMeshQ;
    static wasmCreateMeshQ2;

    static async init() {
        const alignUp = (x, a) => (x + (a - 1)) & ~(a - 1);

        const PAGE = 64 * 1024;
        const bytesToPages = (b) => (b + PAGE - 1) >>> 16; // ceil(b/65536)

        const MAX_FACES = 32 * 32 * 32 * 3;

        const CHUNK_SIZE_EXTENDED = 32 + 2;
        const INPUT_SIZE = CHUNK_SIZE_EXTENDED ** 3 * 2 * 4 * 2;
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
            await fetch(Resources.relativeToRoot("./mesher/uIntWasmMesherQ.wasm")),
            {
                env: {
                    memory: memQ
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
        UIntWasmMesher.wasmCreateMeshQ2 = uIntWasmMesherQResult.instance.exports.create_mesh_2;
        UIntWasmMesher.mem = mem;
        UIntWasmMesher.memQ = memQ;
    }
}

export class UIntWasmMesher2 extends UIntMesher {

    #mesherWasmFunction;
    #heapBase;
    #mem;

    constructor() {
        super();
        this.#mesherWasmFunction = UIntWasmMesher.wasmCreateMeshQ2;
        this.#heapBase = UIntWasmMesher._heap_baseQ;
        this.#mem = UIntWasmMesher.memQ;
    }

    /**
     * 
     * @param {ChunkData} chunkData 
     * @returns 
     */
    mesh(chunkData) {
        const MAX_FACES = 32 * 32 * 32 * 3;
        const OUTPUT_SIZE = MAX_FACES * 6 * 4 * 2;
        const input = new Uint32Array(this.#mem.buffer, this.#heapBase, chunkData.data.length);
        const inputAdj = new Uint32Array(this.#mem.buffer, this.#heapBase + input.byteLength, chunkData.adjData.data.length);
        input.set(chunkData.data);
        inputAdj.set(chunkData.adjData.data);

        const len = this.#mesherWasmFunction(
            this.#heapBase,
            this.#heapBase + input.byteLength,
            this.#heapBase + input.byteLength + inputAdj.byteLength
        )
        const output = new Uint32Array(this.#mem.buffer, this.#heapBase + input.byteLength + inputAdj.byteLength, OUTPUT_SIZE / 4);
        const trimmedOutput = new Uint32Array(len)
        // if (len > 0)
        //     Logger.log(() => `meshing produced ${len} bytes of output`);
        trimmedOutput.set(output.subarray(0, len));
        return trimmedOutput;
    }
}
