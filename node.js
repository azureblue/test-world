import { Mat4, vec3 } from "./geom.js";


// let m = new Mat4(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
// let now = performance.now();
// let ar = new Float32Array(16);
// ar.set([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
// for (let t = 0; t < 10; t++) {
//     for (let i = 0; i < 10000000; i++) {
//         m._values.set(ar);
//     }
// }
// console.log(performance.now() - now);
// console.log(m);
let a = 0;
let obj = {
    a: 1,
    b: 2, 
    c: 3,
    dasadfasdfasdf1: 4,
    d2: 4,
    d3: 4,
    d4: 4,
    d5: 4,
    d6: 4,
}
for (let i = 0; i < 1e7; i++) {    
    obj["dasadfasdfasdf1"] += i;
}
console.log(obj.c);