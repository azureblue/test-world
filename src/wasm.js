import { Precondition } from "./precondition.js";

const PAGE_SIZE = 64 * 1024;
export const WASM = {

    /**
     * @param {number} bytes 
     * @returns {number} The number of pages required to hold the given number of bytes.
     */
    bytesToPages: function(bytes) {
        return (bytes + PAGE_SIZE - 1) >>> 16;
    },

    /**
     * Aligns the given number up to the nearest multiple of the given alignment.
     * @param {number} x The number to align.
     * @param {number} alignment The alignment to use (must be a power of 2).
     * @returns {number} The aligned number.
     */
    alignUp: function(x, alignment) {
        Precondition.check((alignment & (alignment - 1)) === 0, "Alignment must be a power of 2");
        return (x + (alignment - 1)) & ~(alignment - 1);
    }

}
Object.freeze(WASM);