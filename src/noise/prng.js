export class Mulberry32 {
    constructor(seed) {
        this.t = seed >>> 0;
    }

    nextRand() {
        this.t += 0x6D2B79F5;
        let x = this.t;
        x = Math.imul(x ^ (x >>> 15), x | 1);
        x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
        return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    }

    nextRandInt(min, max) {
        return min + Math.floor(this.nextRand() * (max - min + 1));
    }
}
