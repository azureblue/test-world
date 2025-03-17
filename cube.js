import { Vec3 } from "./geom.js";
import { Float32Buffer, UInt16Buffer } from "./utils.js";

class Face {

    static TEXTURE_COORDS = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
    static VERTEX_INDICES = new Float32Array([0, 1, 2, 0, 2, 3]);
    static FRONT = new Face(
        [-1.0, -1.0, 1.0, 1.0, -1.0, 1.0, 1.0, 1.0, 1.0, -1.0, 1.0, 1.0].map(v => v * 0.5),
        [0, 0, 1],
    );

    static LEFT = new Face(
        [-1.0, -1.0, -1.0, -1.0, -1.0, 1.0, -1.0, 1.0, 1.0, -1.0, 1.0, -1.0].map(v => v * 0.5),
        [1, 0, 0],
    );

    static BACK = new Face(
        [1.0, -1.0, -1.0, -1.0, -1.0, -1.0, -1.0, 1.0, -1.0, 1.0, 1.0, -1.0].map(v => v * 0.5),
        [0, 0, -1],
    );

    static RIGHT = new Face(
        [1.0, -1.0, 1.0, 1.0, -1.0, -1.0, 1.0, 1.0, -1.0, 1.0, 1.0, 1.0].map(v => v * 0.5),
        [1, 0, 0],
    );

    static UP = new Face(
        [-1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, -1.0, -1.0, 1.0, -1.0].map(v => v * 0.5),
        [0, 1, 0],
    );

    static DOWN = new Face(
        [-1.0, -1.0, -1.0, 1.0, -1.0, -1.0, 1.0, -1.0, 1.0, -1.0, -1.0, 1.0].map(v => v * 0.5),
        [0, -1, 0],
    );


    /**
     * 
     * @param {Array<number>} vertices 
     * @param {*} normal 
     */
    constructor(vertices, normal) {
        this.vertices = new Float32Array(vertices);
        this.normal = new Float32Array(normal);
    }
}

class Direction {
    static FRONT = 0;
    static LEFT = 1;
    static BACK = 2;
    static RIGHT = 3;
    static UP = 4;
    static DOWN = 5;
    static vectors = [
        new Direction(new Vec3(0, 0, 1)), //front
        new Direction(new Vec3(-1, 0, 0)), //left
        new Direction(new Vec3(0, 0, -1)), //back
        new Direction(new Vec3(1, 0, 0)), //right
        new Direction(new Vec3(0, 1, 0)), //up
        new Direction(new Vec3(0, -1, 0)) //down
    ];

    /**
     * 
     * @param {Vec3} direction 
     */
    constructor(direction) {
        this.v = direction;
    }
}

class CubeGen {

    static #faces = [Face.FRONT, Face.LEFT, Face.BACK, Face.RIGHT, Face.UP, Face.DOWN];
    #workBuffer = new ArrayBuffer(32 * 32)
    #workBufferUInt6 = new Uint16Array(this.#workBuffer, 0, 6);
    #workBufferFloat8 = new Float32Array(this.#workBuffer, 0, 8);
    #workBufferFloat12 = new Float32Array(this.#workBuffer, 0, 12);
    #workBufferFloat18 = new Float32Array(this.#workBuffer, 0, 18);
    constructor() {
    }

    /**
     * 
     * @param {number} direction 
     * @param {Float32Buffer} outVertices
     * @param {Float32Buffer} [outNormals]
     * @param {UInt16Buffer} [outUVs]
     * @param {UInt16Buffer} [outIdxs]
     * @param {Vec3} cubePos 
     * @param {Float32Array} uvs 8 element array
     * 
     */
    genFace(direction, outVertices, outNormals, outUVs, outIdxs, cubePos) {
        const face = CubeGen.#faces[direction];
        const indexed = (outIdxs !== undefined);
        if (indexed) {
            const vn = outVertices.length / 3;
            outVertices.addTranslated(face.vertices, cubePos.x, cubePos.y, cubePos.z);

            if (outNormals !== undefined) {
                this.#workBufferFloat12.set(face.normal, 0);
                this.#workBufferFloat12.set(face.normal, 3);
                this.#workBufferFloat12.set(face.normal, 6);
                this.#workBufferFloat12.set(face.normal, 9);
                outNormals.add(this.#workBufferFloat12);
            }
            if (outUVs !== undefined) {
                outUVs.add(Face.TEXTURE_COORDS);
            }
            this.#workBufferUInt6.set(Face.VERTEX_INDICES);
            for (let i = 0; i < 6; i++)
                this.#workBufferUInt6[i] += vn;
            outIdxs.add(this.#workBufferUInt6);
        } else {
            const verts = face.vertices;
            const texCoords = Face.TEXTURE_COORDS;
            const idxs = Face.VERTEX_INDICES;
            this.#workBufferFloat18[0] = verts[idxs[0] * 3]
            this.#workBufferFloat18[1] = verts[idxs[0] * 3 + 1]
            this.#workBufferFloat18[2] = verts[idxs[0] * 3 + 2]

            this.#workBufferFloat18[3] = verts[idxs[1] * 3]
            this.#workBufferFloat18[4] = verts[idxs[1] * 3 + 1]
            this.#workBufferFloat18[5] = verts[idxs[1] * 3 + 2]

            this.#workBufferFloat18[6] = verts[idxs[2] * 3]
            this.#workBufferFloat18[7] = verts[idxs[2] * 3 + 1]
            this.#workBufferFloat18[8] = verts[idxs[2] * 3 + 2]

            this.#workBufferFloat18[9] = verts[idxs[3] * 3]
            this.#workBufferFloat18[10] = verts[idxs[3] * 3 + 1]
            this.#workBufferFloat18[11] = verts[idxs[3] * 3 + 2]

            this.#workBufferFloat18[12] = verts[idxs[4] * 3]
            this.#workBufferFloat18[13] = verts[idxs[4] * 3 + 1]
            this.#workBufferFloat18[14] = verts[idxs[4] * 3 + 2]

            this.#workBufferFloat18[15] = verts[idxs[5] * 3]
            this.#workBufferFloat18[16] = verts[idxs[5] * 3 + 1]
            this.#workBufferFloat18[17] = verts[idxs[5] * 3 + 2]

            outVertices.addTranslated(this.#workBufferFloat18, cubePos.x, cubePos.y, cubePos.z);
            if (outUVs !== undefined) {

                this.#workBufferFloat12[0] = texCoords[idxs[0] * 2]
                this.#workBufferFloat12[1] = texCoords[idxs[0] * 2 + 1]

                this.#workBufferFloat12[2] = texCoords[idxs[1] * 2]
                this.#workBufferFloat12[3] = texCoords[idxs[1] * 2 + 1]

                this.#workBufferFloat12[4] = texCoords[idxs[2] * 2]
                this.#workBufferFloat12[5] = texCoords[idxs[2] * 2 + 1]

                this.#workBufferFloat12[6] = texCoords[idxs[3] * 2]
                this.#workBufferFloat12[7] = texCoords[idxs[3] * 2 + 1]

                this.#workBufferFloat12[8] = texCoords[idxs[4] * 2]
                this.#workBufferFloat12[9] = texCoords[idxs[4] * 2 + 1]

                this.#workBufferFloat12[10] = texCoords[idxs[5] * 2]
                this.#workBufferFloat12[11] = texCoords[idxs[5] * 2 + 1]
                outUVs.add(this.#workBufferFloat12);
            }
        }
    }

}
class CubeSpec {

    static vertices = new Float32Array([
        //front face
        0, 0, 0, // 0
        0, 1, 0, // 1
        1, 1, 0, // 2
        1, 0, 0, // 3
        //back face
        0, 0, 1, // 4
        0, 1, 1, // 5
        1, 1, 1, // 6
        1, 0, 1  // 7
    ]);
    static frontFaceIds = new Uint16Array([
        0, 1, 2, 0, 2, 3
    ]);
    static backFaceIds = new Uint16Array([
        4, 6, 5, 4, 7, 6
    ]);
    static leftFaceIds = new Uint16Array([
        0, 4, 5, 0, 5, 1
    ]);
    static rightFaceIds = new Uint16Array([
        3, 2, 6, 3, 6, 7
    ]);
    static colors = new Float32Array([
        0, 0, 0, // 0
        0, 1, 0, // 1
        1, 1, 0, // 2
        1, 0, 0, // 3
        //back face
        0, 0, 1, // 4
        0, 1, 1, // 5
        1, 1, 1, // 6
        1, 0, 1  // 7
    ]);
}

export { CubeGen, CubeSpec, Direction, Face };

