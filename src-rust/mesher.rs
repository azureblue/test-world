#![crate_type = "cdylib"]
#![no_std]
use core::slice;

struct FaceBuffer {
    mesh_data_solid: *mut u32,
    mesh_data_solid_idx: usize,
    mesh_data_water: *mut u32,
    mesh_data_water_idx: usize
}

#[inline(always)]
fn us(i: u32) -> usize {
    i as usize
}

impl FaceBuffer {
    fn new(mesh_data_solid: *mut u32, mesh_data_water: *mut u32) -> Self {
        FaceBuffer {
            mesh_data_solid,
            mesh_data_solid_idx: 0,
            mesh_data_water,
            mesh_data_water_idx: 0
        }
    }

    fn add_face(&mut self, data: u32, h: u32, x: u32, y: u32, dir: u32, reverse_winding: bool) {
        let texture_id = data >> 8;
        let shadows = data & 0b11111111;
        let corner0_shadow = shadows & 0b11;
        let corner1_shadow = (shadows >> 2) & 0b11;
        let corner2_shadow = (shadows >> 4) & 0b11;
        let corner3_shadow = (shadows >> 6) & 0b11;
        let merge_bits_width = 1u32;
        let merge_bits_height = 1u32 << 7;
        let flip: u32= if corner0_shadow + corner2_shadow > corner1_shadow + corner3_shadow { 1 } else { 0 };
        let reversed: u32 = if reverse_winding { 1 } else { 0 };
        let corner_shadows = [corner0_shadow, corner1_shadow, corner2_shadow, corner3_shadow];
        let lower = 0;
        if (texture_id == BLOCK_WATER && dir == UP) {
            lower = 2;
        }
        //  else if (textureId == getBlockById(BLOCK_IDS.GRASS_SHORT).textureIds[1]) {
        //     lower = 1;
        // }

        let bits = 0u32
            | (lower << 29)
            | ((texture_id & 0b0_1111_1111) << 19)
            | ((dir & 0b111) << 16);

        let vns = WINDING[(flip * 2 + reversed) as usize];

        for i in 0..6 {
            let vn = vns[i] as usize;
            let xb = x + (VERTEX_OFFSETS[dir as usize][X] + MERGE_VECTOR_W[dir as usize][X] * MERGE_MASKS_W[vn] + MERGE_VECTOR_H[dir as usize][X] * MERGE_MASKS_H[vn]) as u32;
            let yb = y + (VERTEX_OFFSETS[dir as usize][Y] + MERGE_VECTOR_W[dir as usize][Y] * MERGE_MASKS_W[vn] + MERGE_VECTOR_H[dir as usize][Y] * MERGE_MASKS_H[vn]) as u32;
            let zb = h + (VERTEX_OFFSETS[dir as usize][Z] + MERGE_VECTOR_W[dir as usize][Z] * MERGE_MASKS_W[vn] + MERGE_VECTOR_H[dir as usize][Z] * MERGE_MASKS_H[vn]) as u32;
            let pos_bits = zb << 14 | yb << 7 | xb;
            if (texture_id == BLOCK_WATER) {
                self.mesh_data_water[self.mesh_data_water_idx] = pos_bits;
                self.mesh_data_water[self.mesh_data_water_idx + 1] = bits | (merge_bits_width * MERGE_MASKS_W[vn]) | (merge_bits_height * MERGE_MASKS_H[vn]) | (corner_shadows[vn] << 27);
                self.mesh_data_water_idx += 2;
                continue;
            } else {
                self.mesh_data_solid[self.mesh_data_solid_idx] = pos_bits;
                self.mesh_data_solid[self.mesh_data_solid_idx + 1] = bits | (merge_bits_width * MERGE_MASKS_W[vn]) | (merge_bits_height * MERGE_MASKS_H[vn]) | (corner_shadows[vn] << 27);
                self.mesh_data_solid_idx += 2;
            }
        }        
    }

}

#[no_mangle]
pub fn create_mesh(
    in_chunk_data_ptr: *mut u32,
    out_mesh_ptr: *mut u32) {

}
const CHUNK_SIZE: u32 = 32;
const MAX_VISIBLE_FACES: u32 = CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE * 3;
const PLANE_SIZE: u32 = CHUNK_SIZE * CHUNK_SIZE;
static mut LAYERS: [u32; (PLANE_SIZE * CHUNK_SIZE) as usize] = [0; (PLANE_SIZE * CHUNK_SIZE) as usize];

const X: usize = 0;
const Y: usize = 1;
const Z: usize = 2;
const UP: u32 = 0;
const BLOCK_WATER: u32 = 9;
const VERTEX_OFFSETS: [[i32; 3]; 8] = [[0, 0, 1], [0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0], [0, 1, 0], [0, 0, 0], [0, 1, 0]];
const MERGE_VECTOR_W: [[i32; 3]; 8] = [[1, 0, 0], [1, 0, 0], [0, -1, 0], [-1, 0, 0], [0, 1, 0], [1, 0, 0], [1, 1, 0], [1, -1, 0]];
const MERGE_VECTOR_H: [[i32; 3]; 8] = [[0, 1, 0], [0, 0, 1], [0, 0, 1], [0, 0, 1], [0, 0, 1], [0, -1, 0], [0, 0, 1], [0, 0, 1]];
const WINDING: [[i32; 6]; 4] = [[0, 1, 2, 0, 2, 3], [3, 2, 0, 2, 1, 0], [1, 2, 3, 1, 3, 0], [0, 3, 1, 3, 2, 1]];
const MERGE_MASKS_W: [i32; 4] = [0, 1, 1, 0];
const MERGE_MASKS_H: [i32; 4] = [0, 0, 1, 1];