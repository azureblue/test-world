import {Face, Direction} from "./cube.js"

for (let dir of Direction.directions) {
    let current = Face.faces[dir.id].vertices;
    let line = "/* " + dir.bits.toString(2).padStart(3, "0") + " */ ";
    for (let v = 0; v < 4; v++) line = line.concat(`vec3(${current[v * 3]}, ${current[v * 3 + 1]}, ${current[v * 3 + 2]}),`);
    console.log(line);
        
}