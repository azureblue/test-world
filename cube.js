import { Float32Buffer, UInt16Buffer } from "./utils.js";
import { Vec2, Vec3 } from "./geom.js";
import { Float32Vector3, Vector3 } from "./matrixgl/float32vector.js";

class Face {    
    static FRONT = new Face(
        [
            -1.0, -1.0, 1.0, 1.0, -1.0, 1.0, 1.0, 1.0, 1.0, -1.0, 1.0, 1.0
            // 0, 0, 1, // 0
            // 0, 1, 1, // 1
            // 1, 1, 1, // 2
            // 1, 0, 1, // 3
        ],
        [
            0, 0, 1, // 0
            0, 0, 1, // 1
            0, 0, 1, // 2
            0, 0, 1, // 3
        ],
        [
            0, 0,
            0, 1,
            1, 1,
            1, 0
        ],
        [0, 1, 2, 0, 2, 3]
    );

    static LEFT = new Face(
        [
            -1.0, -1.0, -1.0, -1.0, -1.0, 1.0, -1.0, 1.0, 1.0, -1.0, 1.0, -1.0,
            // 0, 0, 1, // 0
            // 0, 1, 1, // 1
            // 0, 1, 0, // 2
            // 0, 0, 0, // 3
        ],
        [
            -1, 0, -1,
            -1, 0, -1,
            -1, 0, -1,
            -1, 0, -1
        ],
        [
            0, 0,
            0, 1,
            1, 1,
            1, 0
        ],
        [0, 1, 2, 0, 2, 3]
    );

    static BACK = new Face(
        [
            1.0, -1.0, -1.0, -1.0, -1.0, -1.0, -1.0, 1.0, -1.0, 1.0, 1.0, -1.0
            // 1, 0, 1, // 3
            // 1, 1, 1, // 2
            // 0, 1, 1, // 1
            // 0, 0, 1, // 0
        ],
        [
            0, 0, 1, // 0
            0, 0, 1, // 1
            0, 0, 1, // 2
            0, 0, 1, // 3
        ],
        [
            0, 0,
            0, 1,
            1, 1,
            1, 0
        ],
        [0, 1, 2, 0, 2, 3]
    );

    static RIGHT = new Face(
        [
            1.0, -1.0, 1.0, 1.0, -1.0, -1.0, 1.0, 1.0, -1.0, 1.0, 1.0, 1.0,
            // 1, 0, 0, // 3
            // 1, 1, 0, // 2
            // 1, 1, 1, // 1
            // 1, 0, 1, // 0
        ],
        [
            1, 0, -1,
            1, 0, -1,
            1, 0, -1,
            1, 0, -1
        ],
        [
            0, 0,
            0, 1,
            1, 1,
            1, 0
        ],
        [0, 1, 2, 0, 2, 3]
    );

    static UP = new Face(
        [
            -1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, -1.0, -1.0, 1.0, -1.0,

            // 0, 1, 0, // 0
            // 0, 1, 1, // 1
            // 1, 1, 1, // 2
            // 1, 1, 0, // 3
        ],
        [
            0, 0, -1, // 0
            0, 0, -1, // 1
            0, 0, -1, // 2
            0, 0, -1, // 3
        ],
        [
            0, 0,
            0, 1,
            1, 1,
            1, 0
        ],
        [0, 1, 2, 0, 2, 3]
    );

    static DOWN = new Face(
        [
            -1.0, -1.0, -1.0, 1.0, -1.0, -1.0, 1.0, -1.0, 1.0, -1.0, -1.0, 1.0,
            // 1, 0, 0, // 3
            // 1, 0, 1, // 2
            // 0, 0, 1, // 1
            // 0, 0, 0, // 0
        ],
        [
            0, 0, -1, // 0
            0, 0, -1, // 1
            0, 0, -1, // 2
            0, 0, -1, // 3
        ],
        [
            0, 0,
            0, 1,
            1, 1,
            1, 0
        ],
        [0, 1, 2, 0, 2, 3]
    );


    /**
     * 
     * @param {Array<number>} vertices 
     * @param {*} normals 
     * @param {*} uvs 
     * @param {*} idxs 
     */
    constructor(vertices, normals, uvs, idxs) {
        this.vertices = new Float32Array(vertices);
        this.normals = new Float32Array(normals);
        this.uvs = new Float32Array(uvs);
        this.idxs = new Float32Array(idxs);
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
    /**
     * 
     * @param {Vec3} offset 
     * @param {number} size 
     */
    constructor(offset, size) {
        this.offset = offset;
        this.size = size
    }

    /**
     * 
     * @param {number} direction 
     * @param {Float32Buffer} [outVertices]
     * @param {Float32Buffer} [outNormals]
     * @param {UInt16Buffer} [outUVs]
     * @param {UInt16Buffer} [outIdxs]
     * @param {Vec3} cubePos 
     * @param {Float32Array} uvs 8 element array
     * 
     */
    genFace(direction, outVertices, outNormals, outUVs, outIdxs, cubePos, uvs) {
        const face = CubeGen.#faces[direction];
        const indexed = (outIdxs !== undefined);
        if (indexed) {            
            const vn = outVertices.length / 3;
            if (outVertices !== undefined) {                                
                outVertices.addTranslated(face.vertices, cubePos.x, cubePos.y, cubePos.z);
            }
            if (outNormals !== undefined) {
                outNormals.add(face.normals)
            }
            if (outUVs !== undefined) {
                outUVs.add(uvs);
            }
            outIdxs.add(face.idxs.map(x => x + vn));
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

export {
    Face, Direction, CubeGen, CubeSpec
}
