import { IVec3 } from "../geom.js";
import { TransferObject } from "../transfer.js";

export class ChunkMesh {
}

export class MeshData {

    isEmpty() {
    }
}

export class MeshDataTransfer {
    /**
     * @param {MeshData} meshData
     * @returns {TransferObject}
     */
    transfer(meshData) {
    }

    createFrom(data) {
    }
}

export class MeshHandler {

    /**
     * @param {MeshData} meshData
     */
    upload(meshData) {
    }

    /**
     * @param {ChunkMesh} meshData
     */
    dispose(mesh) {
    }
}

export class ChunkMesher {
    /**
     * @param {IVec3} position
     * @param {ChunkData} chunkData
     * @returns {MeshData}
     */
    createMesh(position, chunkData) {
        throw new Error("Not implemented");
    }
}

