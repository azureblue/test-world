#![crate_type = "cdylib"]
#![no_std]
use core::slice;

const DIRECTION_UP: u32 = 0;
const DIRECTION_FRONT: u32 = 1;
const DIRECTION_LEFT: u32 = 2;
const DIRECTION_BACK: u32 = 3;
const DIRECTION_RIGHT: u32 = 4;
const DIRECTION_DOWN: u32 = 5;
const DIRECTION_DIAGONAL0: u32 = 6;
const DIRECTION_DIAGONAL1: u32 = 7;

const CHUNK_SIZE: u32 = 32;
const CHUNK_SIZE_E: u32 = CHUNK_SIZE + 2;
const MAX_VISIBLE_FACES: u32 = CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE * 3;
const PLANE_SIZE_E: u32 = CHUNK_SIZE_E * CHUNK_SIZE_E;

const X: usize = 0;
const Y: usize = 1;
const Z: usize = 2;
const UP: u32 = 0;
const BLOCK_WATER: u32 = 6;
const BLOCK_EMPTY: u32 = 0;
const VERTEX_OFFSETS: [[i32; 3]; 8] = [
    [0, 0, 1],
    [0, 0, 0],
    [0, 1, 0],
    [1, 1, 0],
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 0],
    [0, 1, 0],
];
const MERGE_VECTOR_W: [[i32; 3]; 8] = [
    [1, 0, 0],
    [1, 0, 0],
    [0, -1, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [1, 0, 0],
    [1, 1, 0],
    [1, -1, 0],
];
const MERGE_VECTOR_H: [[i32; 3]; 8] = [
    [0, 1, 0],
    [0, 0, 1],
    [0, 0, 1],
    [0, 0, 1],
    [0, 0, 1],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, 1],
];
const WINDING: [[i32; 6]; 4] = [
    [0, 1, 2, 0, 2, 3],
    [3, 2, 0, 2, 1, 0],
    [1, 2, 3, 1, 3, 0],
    [0, 3, 1, 3, 2, 1],
];
const MERGE_MASKS_W: [i32; 4] = [0, 1, 1, 0];
const MERGE_MASKS_H: [i32; 4] = [0, 0, 1, 1];
const BLOCKS_TEXTURES: [[u32; 6]; 9] = [
    [0, 0, 0, 0, 0, 0],
    [1, 1, 1, 1, 1, 1],
    [3, 2, 2, 2, 2, 1],
    [3, 3, 3, 3, 3, 3],
    [4, 4, 4, 4, 4, 4],
    [5, 5, 5, 5, 5, 5],
    [6, 6, 6, 6, 6, 6],
    [7, 7, 7, 7, 7, 7],
    [0, 8, 8, 8, 8, 0],
];

#[inline(always)]
fn is_solid(block: u32) -> bool {
    return (block >> 31 & 1) != 0;
}

#[inline(always)]
fn is_solid_int(block: u32) -> u32 {
    return block >> 31 & 1;
}

#[inline(always)]
fn decode_block_id(id: u32) -> u32 {
    return id & 0x7FFFFFFF;
}

struct DirXY {
    x: i32,
    y: i32,
}

impl DirXY {
    fn set(&mut self, x: i32, y: i32) {
        self.x = x;
        self.y = y;
    }

    fn rotate_ccw(&mut self) {
        self.set(-self.y, self.x);
    }
}

struct FaceBuffer {
    mesh_data_solid: *mut u32,
    mesh_data_solid_idx: usize,
    mesh_data_water: *mut u32,
    mesh_data_water_idx: usize,
}

#[inline(always)]
fn us(i: u32) -> usize {
    i as usize
}

#[inline(always)]
fn get_hxy(data: *mut u32, h: u32, x: u32, y: u32) -> u32 {
    return unsafe { *data.add((PLANE_SIZE_E * h + y * CHUNK_SIZE_E + x) as usize) };
}

impl FaceBuffer {
   
    fn complete(&mut self) -> u32 {
        unsafe {
            for i in 0..self.mesh_data_water_idx {
                *self.mesh_data_solid.add(self.mesh_data_solid_idx + i) = *self.mesh_data_water.add(i);
            }
        }
        return (self.mesh_data_solid_idx + self.mesh_data_water_idx) as u32;
    }

    fn add_face(&mut self, dir: u32, h: u32, x: u32, y: u32, data: u32, reverse_winding: bool) {
        let texture_id = data >> 8;
        let shadows = data & 0b11111111;
        let corner0_shadow = shadows & 0b11;
        let corner1_shadow = (shadows >> 2) & 0b11;
        let corner2_shadow = (shadows >> 4) & 0b11;
        let corner3_shadow = (shadows >> 6) & 0b11;
        let merge_bits_width = 1u32;
        let merge_bits_height = 1u32 << 7;
        let flip: u32 = if corner0_shadow + corner2_shadow > corner1_shadow + corner3_shadow {
            1
        } else {
            0
        };

        let reversed: u32 = if reverse_winding { 1 } else { 0 };
        let corner_shadows = [
            corner0_shadow,
            corner1_shadow,
            corner2_shadow,
            corner3_shadow,
        ];
        let mut lower = 0;
        if (texture_id == BLOCK_WATER && dir == UP) {
            lower = 2;
        }
        //  else if (textureId == getBlockById(BLOCK_IDS.GRASS_SHORT).textureIds[1]) {
        //     lower = 1;
        // }

        let bits =
            0u32 | (lower << 29) | ((texture_id & 0b0_1111_1111) << 19) | ((dir & 0b111) << 16);

        let vns = WINDING[(flip * 2 + reversed) as usize];

        for i in 0..6 {
            let vn = vns[i] as usize;
            let xb = x
                + (VERTEX_OFFSETS[dir as usize][X]
                    + MERGE_VECTOR_W[dir as usize][X] * MERGE_MASKS_W[vn]
                    + MERGE_VECTOR_H[dir as usize][X] * MERGE_MASKS_H[vn]) as u32;
            let yb = y
                + (VERTEX_OFFSETS[dir as usize][Y]
                    + MERGE_VECTOR_W[dir as usize][Y] * MERGE_MASKS_W[vn]
                    + MERGE_VECTOR_H[dir as usize][Y] * MERGE_MASKS_H[vn]) as u32;
            let zb = h
                + (VERTEX_OFFSETS[dir as usize][Z]
                    + MERGE_VECTOR_W[dir as usize][Z] * MERGE_MASKS_W[vn]
                    + MERGE_VECTOR_H[dir as usize][Z] * MERGE_MASKS_H[vn]) as u32;
            let pos_bits = zb << 14 | yb << 7 | xb;
            if (texture_id == BLOCK_WATER) {
                unsafe {
                    *self.mesh_data_water.add(self.mesh_data_water_idx) = pos_bits;
                    *self.mesh_data_water.add(self.mesh_data_water_idx + 1) = bits
                        | (merge_bits_width * MERGE_MASKS_W[vn] as u32)
                        | (merge_bits_height * MERGE_MASKS_H[vn] as u32)
                        | (corner_shadows[vn] << 27);
                }
                self.mesh_data_water_idx += 2;
                continue;
            } else {
                unsafe {
                    *self.mesh_data_solid.add(self.mesh_data_solid_idx) = pos_bits;
                    *self.mesh_data_solid.add(self.mesh_data_solid_idx + 1) = bits
                        | (merge_bits_width * MERGE_MASKS_W[vn] as u32)
                        | (merge_bits_height * MERGE_MASKS_H[vn] as u32)
                        | (corner_shadows[vn] << 27);
                }
                self.mesh_data_solid_idx += 2;
            }
        }
    }
}

#[no_mangle]
pub fn create_mesh(
    in_chunk_data_ptr: *mut u32,
    out_mesh_ptr: *mut u32,
    tmp_mesh_ptr: *mut u32,
) -> u32 {
    let mut side_dir0 = DirXY { x: 0, y: 0 };
    let mut side_dir1 = DirXY { x: 0, y: 0 };
    let mut corner_dir = DirXY { x: 0, y: 0 };
    let mut buffer = FaceBuffer {
        mesh_data_solid: out_mesh_ptr,
        mesh_data_solid_idx: 0,
        mesh_data_water: tmp_mesh_ptr,
        mesh_data_water_idx: 0,
    };

    for h in 1..CHUNK_SIZE + 1 {
        for y in 1..CHUNK_SIZE + 1 {
            for x in 1..CHUNK_SIZE + 1 {
                let real_x = x - 1;
                let real_y = y - 1;
                let real_h = h - 1;
                let block_id = get_hxy(in_chunk_data_ptr, h, x, y);
                if (block_id == BLOCK_EMPTY) {
                    continue;
                }

                // if (blockId == 8) {
                //     this.#grasslike.put(blockId << 15 | h << 10 | y << 5 | x);
                //     continue;
                // }
                let block_textures = BLOCKS_TEXTURES[decode_block_id(block_id) as usize];
                let is_water = block_id == BLOCK_WATER;
                let above = get_hxy(in_chunk_data_ptr, h + 1, x, y);
                if (!is_solid(above)) {
                    if (is_water && above == BLOCK_WATER) {
                        continue;
                    }
                    side_dir0.set(-1, 0);
                    side_dir1.set(0, -1);
                    corner_dir.set(-1, -1);
                    let mut shadows = 0u32;
                    if (!is_water) {
                        for v in 0..4 {
                            let s0 = is_solid_int(get_hxy(
                                in_chunk_data_ptr,
                                (h + 1) as u32,
                                (x as i32 + side_dir0.x) as u32,
                                (y as i32 + side_dir0.y) as u32,
                            ));
                            let s1 = is_solid_int(get_hxy(
                                in_chunk_data_ptr,
                                (h + 1) as u32,
                                (x as i32 + side_dir1.x) as u32,
                                (y as i32 + side_dir1.y) as u32,
                            ));
                            let c = is_solid_int(get_hxy(
                                in_chunk_data_ptr,
                                (h + 1) as u32,
                                (x as i32 + corner_dir.x) as u32,
                                (y as i32 + corner_dir.y) as u32,
                            ));
                            shadows |= if (s0 + s1 == 2) { 3 } else { s0 + s1 + c } << (v * 2);
                            side_dir0.rotate_ccw();
                            side_dir1.rotate_ccw();
                            corner_dir.rotate_ccw();
                        }
                    }
                    buffer.add_face(
                        DIRECTION_UP,
                        real_h,
                        real_x,
                        real_y,
                        (block_textures[0] << 8) | (shadows),
                        false,
                    );
                }

                if (is_water) {
                    continue;
                }

                if (!is_solid(get_hxy(in_chunk_data_ptr, h - 1, x, y))) {
                    side_dir0.set(-1, 0);
                    side_dir1.set(0, -1);
                    corner_dir.set(-1, -1);
                    let mut shadows = 0;
                    for v in 0..4 {
                        let s0 = is_solid_int(get_hxy(
                            in_chunk_data_ptr,
                            (h - 1) as u32,
                            (x as i32 + side_dir0.x) as u32,
                            (y as i32 - side_dir0.y) as u32,
                        ));
                        let s1 = is_solid_int(get_hxy(
                            in_chunk_data_ptr,
                            (h - 1) as u32,
                            (x as i32 + side_dir1.x) as u32,
                            (y as i32 - side_dir1.y) as u32,
                        ));
                        let c = is_solid_int(get_hxy(
                            in_chunk_data_ptr,
                            (h - 1) as u32,
                            (x as i32 + corner_dir.x) as u32,
                            (y as i32 - corner_dir.y) as u32,
                        ));
                        shadows |= if (s0 + s1 == 2) { 3 } else { s0 + s1 + c } << (v * 2);
                        side_dir0.rotate_ccw();
                        side_dir1.rotate_ccw();
                        corner_dir.rotate_ccw();
                    }

                    buffer.add_face(
                        DIRECTION_DOWN,
                        real_h,
                        real_x,
                        real_y,
                        (block_textures[5] << 8) | (shadows),
                        false,
                    );
                }

                if (!is_solid(get_hxy(in_chunk_data_ptr, h, x, y - 1))) {
                    side_dir0.set(-1, 0);
                    side_dir1.set(0, -1);
                    corner_dir.set(-1, -1);
                    let mut shadows = 0;
                    for v in 0..4 {
                        let s0 = is_solid_int(get_hxy(
                            in_chunk_data_ptr,
                            (h as i32 + side_dir0.y) as u32,
                            (x as i32 + side_dir0.x) as u32,
                            (y - 1) as u32,
                        ));
                        let s1 = is_solid_int(get_hxy(
                            in_chunk_data_ptr,
                            (h as i32 + side_dir1.y) as u32,
                            (x as i32 + side_dir1.x) as u32,
                            (y - 1) as u32,
                        ));
                        let c = is_solid_int(get_hxy(
                            in_chunk_data_ptr,
                            (h as i32 + corner_dir.y) as u32,
                            (x as i32 + corner_dir.x) as u32,
                            (y - 1) as u32,
                        ));
                        shadows |= if (s0 + s1 == 2) { 3 } else { s0 + s1 + c } << (v * 2);
                        side_dir0.rotate_ccw();
                        side_dir1.rotate_ccw();
                        corner_dir.rotate_ccw();
                    }
                    buffer.add_face(
                        DIRECTION_FRONT,
                        real_h,
                        real_x,
                        real_y,
                        (block_textures[1] << 8) | (shadows),
                        false,
                    );
                }

                if (!is_solid(get_hxy(in_chunk_data_ptr, h, x - 1, y))) {
                    side_dir0.set(-1, 0);
                    side_dir1.set(0, -1);
                    corner_dir.set(-1, -1);
                    let mut shadows = 0;
                    for v in 0..4 {
                        let s0 = is_solid_int(get_hxy(
                            in_chunk_data_ptr,
                            (h as i32 + side_dir0.y) as u32,
                            (x - 1) as u32,
                            (y as i32 - side_dir0.x) as u32,
                        ));
                        let s1 = is_solid_int(get_hxy(
                            in_chunk_data_ptr,
                            (h as i32 + side_dir1.y) as u32,
                            (x - 1) as u32,
                            (y as i32 - side_dir1.x) as u32,
                        ));
                        let c = is_solid_int(get_hxy(
                            in_chunk_data_ptr,
                            (h as i32 + corner_dir.y) as u32,
                            (x - 1) as u32,
                            (y as i32 - corner_dir.x) as u32,
                        ));
                        shadows |= if (s0 + s1 == 2) { 3 } else { s0 + s1 + c } << (v * 2);
                        side_dir0.rotate_ccw();
                        side_dir1.rotate_ccw();
                        corner_dir.rotate_ccw();
                    }
                    buffer.add_face(
                        DIRECTION_LEFT,
                        real_h,
                        real_x,
                        real_y,
                        (block_textures[2] << 8) | (shadows),
                        false,
                    );
                }

                if (!is_solid(get_hxy(in_chunk_data_ptr, h, x, y + 1))) {
                    side_dir0.set(-1, 0);
                    side_dir1.set(0, -1);
                    corner_dir.set(-1, -1);
                    let mut shadows = 0;
                    for v in 0..4 {
                        let s0 = is_solid_int(get_hxy(
                            in_chunk_data_ptr,
                            (h as i32 + side_dir0.y) as u32,
                            (x as i32 - side_dir0.x) as u32,
                            (y + 1) as u32,
                        ));
                        let s1 = is_solid_int(get_hxy(
                            in_chunk_data_ptr,
                            (h as i32 + side_dir1.y) as u32,
                            (x as i32 - side_dir1.x) as u32,
                            (y + 1) as u32,
                        ));
                        let c = is_solid_int(get_hxy(
                            in_chunk_data_ptr,
                            (h as i32 + corner_dir.y) as u32,
                            (x as i32 - corner_dir.x) as u32,
                            (y + 1) as u32,
                        ));
                        shadows |= if (s0 + s1 == 2) { 3 } else { s0 + s1 + c } << (v * 2);
                        side_dir0.rotate_ccw();
                        side_dir1.rotate_ccw();
                        corner_dir.rotate_ccw();
                    }
                    buffer.add_face(
                        DIRECTION_BACK,
                        real_h,
                        real_x,
                        real_y,
                        (block_textures[3] << 8) | (shadows),
                        false,
                    );
                }

                if (!is_solid(get_hxy(in_chunk_data_ptr, h, x + 1, y))) {
                    side_dir0.set(-1, 0);
                    side_dir1.set(0, -1);
                    corner_dir.set(-1, -1);
                    let mut shadows = 0;
                    for v in 0..4 {
                        let s0 = is_solid_int(get_hxy(
                            in_chunk_data_ptr,
                            (h as i32 + side_dir0.y) as u32,
                            (x + 1) as u32,
                            (y as i32 + side_dir0.x) as u32,
                        ));
                        let s1 = is_solid_int(get_hxy(
                            in_chunk_data_ptr,
                            (h as i32 + side_dir1.y) as u32,
                            (x + 1) as u32,
                            (y as i32 + side_dir1.x) as u32,
                        ));
                        let c = is_solid_int(get_hxy(
                            in_chunk_data_ptr,
                            (h as i32 + corner_dir.y) as u32,
                            (x + 1) as u32,
                            (y as i32 + corner_dir.x) as u32,
                        ));
                        shadows |= if (s0 + s1 == 2) { 3 } else { s0 + s1 + c } << (v * 2);
                        side_dir0.rotate_ccw();
                        side_dir1.rotate_ccw();
                        corner_dir.rotate_ccw();
                    }
                    buffer.add_face(
                        DIRECTION_RIGHT,
                        real_h,
                        real_x,
                        real_y,
                        (block_textures[4] << 8) | (shadows),
                        false,
                    );
                }
            }

            // for (let g of this.#grasslike) {
            //     //blockId << 16 | h << 8 | y << 4 | x
            //     const x = g & 0x1F;
            //     const y = (g >> 5) & 0x1F;
            //     const h = (g >> 10) & 0x1F;
            //     const blockId = (g >> 16) & 0xFFFF;
            //     buffer.add_face(blockId << 8, h, x, y, Direction.DIAGONAL_0, 1, 1);
            //     buffer.add_face(blockId << 8, h, x, y, Direction.DIAGONAL_0, 1, 1, true);
            //     buffer.add_face(blockId << 8, h, x, y, Direction.DIAGONAL_1, 1, 1);
            //     buffer.add_face(blockId << 8, h, x, y, Direction.DIAGONAL_1, 1, 1, true);
            // }
            // const solids = this.#bufferSolid.trimmed();
            // const waters = this.#bufferWater.trimmed();
            // const resultData = new Uint32Array(waters.length + solids.length);

            // resultData.set(solids);
            // resultData.set(waters, solids.length);
            // return new UIntMeshData(vec3(position.x * CHUNK_SIZE + 0.5, position.z * CHUNK_SIZE + 0.5, -position.y * CHUNK_SIZE - 0.5),
            // resultData);
        }
    }
    return buffer.complete();
}

#[panic_handler]
fn panic(_info: &core::panic::PanicInfo) -> ! {
    core::arch::wasm32::unreachable()
}
