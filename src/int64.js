
export class Int64 {
    static ZERO = Int64.fromNumber(0);
    constructor(low = 0, high = 0) {
        this.low = low | 0;
        this.high = high | 0;
    }

    static fromNumber(n) {
        const low = n | 0;
        const high = Math.floor(n / 4294967296); // handles negative values correctly
        return new Int64(low, high);
    }

    static fromBits(low, high) {
        return new Int64(low, high);
    }

    static fromBigInt(b) {
        const l = Number(b & 0xFFFFFFFFn);
        const h = Number((b >> 32n) & 0xFFFFFFFFn);
        return new Int64(l, h << 0); // << 0 forces signed, but may not be enough
    }

    set(low, high) {
        this.low = low | 0;
        this.high = high | 0;
        return this;
    }

    toNumber() {
        return this.high * 4294967296 + (this.low >>> 0);
    }

    toBigInt() {
        return (BigInt(this.high) << 32n) | BigInt(this.low >>> 0);
    }

    toString() {
        return this.toBigInt().toString();
    }

    toBinaryString() {
        const high = this.high >>> 0; // force unsigned
        const low = this.low >>> 0;
        return high.toString(2).padStart(32, '0') + low.toString(2).padStart(32, '0');
    }

    isZero() {
        return (this.low | this.high) === 0;
    }

    clone() {
        return new Int64(this.low, this.high);
    }

    neg() {
        const low = (~this.low + 1) | 0;
        const high = (~this.high + (low === 0 ? 1 : 0)) | 0;
        return new Int64(low, high);
    }

    add(b) {
        const a = this;
        const l = (a.low >>> 0) + (b.low >>> 0);
        const carry = l > 0xFFFFFFFF ? 1 : 0;
        const h = (a.high + b.high + carry) | 0;
        return new Int64(l | 0, h);
    }

    and(b) {
        return new Int64(this.low & b.low, this.high & b.high);
    }


    or(b) {
        return new Int64(this.low | b.low, this.high | b.high);
    }

    xor(b) {
        return new Int64(this.low ^ b.low, this.high ^ b.high);
    }

    shiftLeft(n) {
        n &= 63;
        if (n === 0) return this.clone();
        if (n < 32) {
            const low = this.low << n;
            const high = (this.high << n) | (this.low >>> (32 - n));
            return new Int64(low, high);
        }
        return new Int64(0, this.low << (n - 32));
    }

    shiftRight(n) {
        n &= 63;
        if (n === 0) return this.clone();
        if (n < 32) {
            const low = (this.low >>> n) | (this.high << (32 - n));
            const high = this.high >> n;
            return new Int64(low, high);
        }
        const high = this.high >> 31;
        return new Int64(this.high >> (n - 32), high);
    }


    equals(b) {
        return this.low === b.low && this.high === b.high;
    }

    compare(b) {
        return this.high === b.high
            ? (this.low >>> 0) - (b.low >>> 0)
            : this.high - b.high;
    }

    /**
     * @license
     * Copyright The Closure Library Authors.
     * SPDX-License-Identifier: Apache-2.0
     */

    mul(other) {
        const a48 = this.high >>> 16;
        const a32 = this.high & 0xFFFF;
        const a16 = this.low >>> 16;
        const a00 = this.low & 0xFFFF;
    
        const b48 = other.high >>> 16;
        const b32 = other.high & 0xFFFF;
        const b16 = other.low >>> 16;
        const b00 = other.low & 0xFFFF;
    
        let c48 = 0, c32 = 0, c16 = 0, c00 = 0;
        c00 += a00 * b00;
        c16 += c00 >>> 16;
        c00 &= 0xFFFF;
        c16 += a16 * b00;
        c32 += c16 >>> 16;
        c16 &= 0xFFFF;
        c16 += a00 * b16;
        c32 += c16 >>> 16;
        c16 &= 0xFFFF;
        c32 += a32 * b00;
        c48 += c32 >>> 16;
        c32 &= 0xFFFF;
        c32 += a16 * b16;
        c48 += c32 >>> 16;
        c32 &= 0xFFFF;
        c32 += a00 * b32;
        c48 += c32 >>> 16;
        c32 &= 0xFFFF;
        c48 += a48 * b00 + a32 * b16 + a16 * b32 + a00 * b48;
        c48 &= 0xFFFF;
    
        return new Int64((c16 << 16) | c00, (c48 << 16) | c32);
    }
    mul_safe(b) {
        const an = this.toBigInt();
        const bn = b.toBigInt();
        return Int64.fromBigInt(an * bn);
    }
}
