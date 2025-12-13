function posToKey(x, y) {
    return (x + 32767) << 16 | (y + 32767);
}

function keyToX(key) {
    return (key >>> 16) - 32767;
}

function keyToY(key) {
    return (key & 0xFFFF) - 32767;
}

const len = 2000000000;
const ar = new Uint32Array(len);
const ar2 = new Uint32Array(len);
let a = 0;
let b = 0;
let res = 0;
for (let i = 0; i < len; i++) {  
    [a, b] = [i + 2, i* 123];
    res += (a + b);
}

console.log(res)
