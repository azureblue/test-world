import { Mat4 } from "./geom.js";


let m = new Mat4(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
let now = performance.now();
let ar = new Float32Array(16);
ar.set([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
for (let t = 0; t < 10; t++) {
    for (let i = 0; i < 10000000; i++) {
        m._values.set(ar);
    }
}
console.log(performance.now() - now);
console.log(m);
