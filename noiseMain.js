import { SimplexNoise } from "./src/noise/opensimplex2.js";

export function main() {
    const w = 4000;
    const h = 4000;

    const canvas = document.createElement("canvas")
    document.body.append(canvas);
    canvas.width = w;
    canvas.height = h;
    canvas.style.width = "1000px";
    canvas.style.height = "1000px";
    const ctx = canvas.getContext('2d');
    const image = ctx.createImageData(canvas.width, canvas.height);
    const seed = 1234;


    const buf = new Float64Array(1000 * 1000);
    const now = performance.now();
    let sum = 0;
    let count = 0;
    for (let y = 0; y < h; y += 1000) {
        for (let x = 0; x < w; x += 1000) {
            SimplexNoise.fill(seed, x, y, 1000, 1000, 1, buf);
            const tileW = 1000;
            const tileH = 1000;
            const data = image.data;

            let n = 0;
            for (let dy = 0; dy < tileH; dy++) {
                // start indeksu w ImageData dla (x, y+dy)
                let i = ((y + dy) * w + x) * 4;

                for (let dx = 0; dx < tileW; dx++, n++, i += 4) {
                    const c = (buf[n] * 256) | 0; // szybkie int (opcjonalnie clamp)
                    data[i] = c;
                    data[i + 1] = c;
                    data[i + 2] = c;
                    data[i + 3] = 255;
                }
            }
        }
    }

    // console.log(sum / count);
    console.log((performance.now() - now).toFixed(2));
    ctx.putImageData(image, 0, 0);
}