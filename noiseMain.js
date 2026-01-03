// import { Noise } from "./src/noise_old.js";
import { OpenSimplex2Noise } from "./src/noise/noise.js";
import { Generator02, NoiseChunkGenerator } from "./src/gen/generator.js";

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
    const noise = new OpenSimplex2Noise({
        
        frequency: 0.002,
        octaves: 1,
        lacunarity: 2,
        gain: 0.5
        
        
    });


    const now = performance.now();
    let sum = 0;
    let count = 0;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            let n = noise.octaveNoise(x, y);

            let c = n * 256
            // n = noise2.fractalNoise2(x, y);
            // c = Math.floor((c + (n + 1) * 127.5) / 2);
            // c = Math.min(255, c)
            // c = Math.max(0, c)
            sum += c;
            count++;
            const i = (y * w + x) * 4;
            image.data[i + 0] = c;
            image.data[i + 1] = c;
            image.data[i + 2] = c;
            image.data[i + 3] = 255;
        }
    }
    
    console.log(sum / count);
    console.log((performance.now() - now).toFixed(2));
    ctx.putImageData(image, 0, 0);
}