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
const PLANE_SIZE: u32 = CHUNK_SIZE * CHUNK_SIZE;
const CHUNK_SIZE_E: u32 = CHUNK_SIZE + 2;
const MAX_VISIBLE_FACES: u32 = CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE * 3;
const PLANE_SIZE_E: u32 = CHUNK_SIZE_E * CHUNK_SIZE_E;

static mut BUF: [u32; (CHUNK_SIZE * CHUNK_SIZE * 12) as usize] = [0; (CHUNK_SIZE * CHUNK_SIZE * 12) as usize];

const X: usize = 0;
const Y: usize = 1;
const Z: usize = 2;
const UP: u32 = 0;
const BLOCK_WATER: u32 = 6;
const BLOCK_EMPTY: u32 = 0;
const VERTEX_OFFSETS: [[i32; 3]; 8] = [[0, 0, 1], [0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0], [0, 1, 0], [0, 0, 0], [0, 1, 0]];
const MERGE_VECTOR_W: [[i32; 3]; 8] = [[1, 0, 0], [1, 0, 0], [0, -1, 0], [-1, 0, 0], [0, 1, 0], [1, 0, 0], [1, 1, 0], [1, -1, 0]];
const MERGE_VECTOR_H: [[i32; 3]; 8] = [[0, 1, 0], [0, 0, 1], [0, 0, 1], [0, 0, 1], [0, 0, 1], [0, -1, 0], [0, 0, 1], [0, 0, 1]];
const WINDING: [[i32; 6]; 4] = [[0, 1, 2, 0, 2, 3], [3, 2, 0, 2, 1, 0], [1, 2, 3, 1, 3, 0], [0, 3, 1, 3, 2, 1]];
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

#[rustfmt::skip]
const DIRECTION_ENCODE: [i32; 40] = [
    0, 0, 0, 0, 0, 0, 0, 0,
    1, 0, 0, 0, 1, 0, 0, 0,
    0, 1, 0, -1, 0, CHUNK_SIZE as i32 - 1, 0, 0,
    -1, 0, CHUNK_SIZE as i32 - 1, 0, -1, CHUNK_SIZE as i32 - 1, 0, 0,
    0, -1, CHUNK_SIZE as i32 - 1, 1, 0, 0, 0, 0
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
    y: i32
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

struct Array3D<'a> {
    data: &'a mut [u32],
    plane_size: u32,
    sy: u32
}

impl<'a> Array3D<'a> {
    pub unsafe fn from_raw(data: *mut u32, sx: u32, sy: u32, sz: u32) -> Self {
        let plane_size = sx * sy;
        Self {
            data: core::slice::from_raw_parts_mut(data, (plane_size * sz) as usize),
            plane_size,
            sy
        }
    }

    #[inline(always)]
    pub fn get_xyz(&self, x: u32, y: u32, z: u32) -> u32 {
        self.data[(z * self.plane_size + y * self.sy + x) as usize]
    }

    #[inline(always)]
    pub fn get_hxy(&self, h: u32, x: u32, y: u32) -> u32 {
        self.data[(h * self.plane_size + y * self.sy + x) as usize]
    }

    #[inline(always)]
    pub fn set_xyz(&mut self, x: u32, y: u32, z: u32, value: u32) {
        self.data[(z * self.plane_size + y * self.sy + x) as usize] = value;
    }

    #[inline(always)]
    pub fn set_hxy(&mut self, h: u32, x: u32, y: u32, value: u32) {
        self.data[(h * self.plane_size + y * self.sy + x) as usize] = value;
    }

    #[inline(always)]
    pub fn plane_idx(&self, plane: u32) -> usize {
        (plane * self.plane_size) as usize
    }

    pub fn row_idx(&self, plane: u32, row: u32) -> usize {
        (plane * self.plane_size + row * self.sy) as usize
    }

    pub fn set_idx(&mut self, idx: u32, value: u32) {
        self.data[idx as usize] = value;
    }

    pub fn get_idx(&self, idx: u32) -> u32 {
        self.data[idx as usize]
    }

    pub fn fill_planes(&mut self, from: u32, n: u32, value: u32) {
        let start = (from * self.plane_size) as usize;
        let end = ((from + n) * self.plane_size) as usize;
        for i in start..end {
            self.data[i] = value;
        }
    }
}

struct FaceBuffer {
    mesh_data_solid: *mut u32,
    mesh_data_solid_idx: usize,
    mesh_data_water: *mut u32,
    mesh_data_water_idx: usize,
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

    fn add_face(&mut self, dir: u32, h: u32, x: u32, y: u32, width: u32, height: u32, data: u32, reverse_winding: bool) {
        let texture_id = data >> 8;
        let shadows = data & 0b11111111;
        let corner0_shadow = shadows & 0b11;
        let corner1_shadow = (shadows >> 2) & 0b11;
        let corner2_shadow = (shadows >> 4) & 0b11;
        let corner3_shadow = (shadows >> 6) & 0b11;
        let merge_bits_width = width;
        let merge_bits_height = height << 7;
        let flip: u32 = if corner0_shadow + corner2_shadow > corner1_shadow + corner3_shadow {
            1
        } else {
            0
        };

        let reversed: u32 = if reverse_winding { 1 } else { 0 };
        let corner_shadows = [corner0_shadow, corner1_shadow, corner2_shadow, corner3_shadow];
        let mut lower = 0;
        if (texture_id == BLOCK_WATER && dir == UP) {
            lower = 2;
        }
        //  else if (textureId == getBlockById(BLOCK_IDS.GRASS_SHORT).textureIds[1]) {
        //     lower = 1;
        // }

        let bits = 0u32 | (lower << 29) | ((texture_id & 0b0_1111_1111) << 19) | ((dir & 0b111) << 16);

        let vns = WINDING[(flip * 2 + reversed) as usize];

        for i in 0..6 {
            let vn = vns[i] as usize;
            let xb = x
                + (VERTEX_OFFSETS[dir as usize][X]
                    + MERGE_VECTOR_W[dir as usize][X] * width as i32 * MERGE_MASKS_W[vn]
                    + MERGE_VECTOR_H[dir as usize][X] * height as i32 * MERGE_MASKS_H[vn]) as u32;
            let yb = y
                + (VERTEX_OFFSETS[dir as usize][Y]
                    + MERGE_VECTOR_W[dir as usize][Y] * width as i32 * MERGE_MASKS_W[vn]
                    + MERGE_VECTOR_H[dir as usize][Y] * height as i32 * MERGE_MASKS_H[vn]) as u32;
            let zb = h
                + (VERTEX_OFFSETS[dir as usize][Z]
                    + MERGE_VECTOR_W[dir as usize][Z] * width as i32 * MERGE_MASKS_W[vn]
                    + MERGE_VECTOR_H[dir as usize][Z] * height as i32 * MERGE_MASKS_H[vn]) as u32;
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
pub fn create_mesh(in_chunk_data_ptr: *mut u32, out_mesh_ptr: *mut u32, tmp_mesh_ptr: *mut u32) -> u32 {
    let mut side_dir0 = DirXY { x: 0, y: 0 };
    let mut side_dir1 = DirXY { x: 0, y: 0 };
    let mut corner_dir = DirXY { x: 0, y: 0 };
    let mut buffer = FaceBuffer {
        mesh_data_solid: out_mesh_ptr,
        mesh_data_solid_idx: 0,
        mesh_data_water: tmp_mesh_ptr,
        mesh_data_water_idx: 0,
    };

    let data = unsafe { Array3D::from_raw(in_chunk_data_ptr, CHUNK_SIZE_E, CHUNK_SIZE_E, CHUNK_SIZE_E) };
    let mut layers = unsafe { Array3D::from_raw(BUF.as_mut_ptr(), CHUNK_SIZE, CHUNK_SIZE, 12) };
    layers.fill_planes(6, 5, 0);

    let mut current_layer_offset = 0;
    let mut top_layer_offset = 0;

    for h in 1..CHUNK_SIZE + 1 {
        let real_h = h - 1;
        current_layer_offset = (real_h & 1) * 6;
        top_layer_offset = 6 - current_layer_offset;
        layers.fill_planes(0, 1, 0);
        layers.fill_planes(5, 1, 0);
        layers.fill_planes(current_layer_offset + 1, 5, 0);

        for y in 1..CHUNK_SIZE + 1 {
            for x in 1..CHUNK_SIZE + 1 {
                let real_x = x - 1;
                let real_y = y - 1;
                let block_id = data.get_hxy(h, x, y);
                if (block_id == BLOCK_EMPTY) {
                    continue;
                }

                // if (blockId == 8) {
                //     this.#grasslike.put(blockId << 15 | h << 10 | y << 5 | x);
                //     continue;
                // }
                let block_textures = BLOCKS_TEXTURES[decode_block_id(block_id) as usize];
                let is_water = block_id == BLOCK_WATER;
                let above = data.get_hxy(h + 1, x, y);
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
                            let s0 = is_solid_int(data.get_hxy((h + 1) as u32, (x as i32 + side_dir0.x) as u32, (y as i32 + side_dir0.y) as u32));
                            let s1 = is_solid_int(data.get_hxy((h + 1) as u32, (x as i32 + side_dir1.x) as u32, (y as i32 + side_dir1.y) as u32));
                            let c = is_solid_int(data.get_hxy((h + 1) as u32, (x as i32 + corner_dir.x) as u32, (y as i32 + corner_dir.y) as u32));
                            shadows |= if (s0 + s1 == 2) { 3 } else { s0 + s1 + c } << (v * 2);
                            side_dir0.rotate_ccw();
                            side_dir1.rotate_ccw();
                            corner_dir.rotate_ccw();
                        }
                    }
                    layers.set_hxy(0, real_x, real_y, (block_textures[0] << 8) | (shadows));
                }

                if (is_water) {
                    continue;
                }

                if (!is_solid(data.get_hxy(h - 1, x, y))) {
                    side_dir0.set(-1, 0);
                    side_dir1.set(0, -1);
                    corner_dir.set(-1, -1);
                    let mut shadows = 0;
                    for v in 0..4 {
                        let s0 = is_solid_int(data.get_hxy((h - 1) as u32, (x as i32 + side_dir0.x) as u32, (y as i32 - side_dir0.y) as u32));
                        let s1 = is_solid_int(data.get_hxy((h - 1) as u32, (x as i32 + side_dir1.x) as u32, (y as i32 - side_dir1.y) as u32));
                        let c = is_solid_int(data.get_hxy((h - 1) as u32, (x as i32 + corner_dir.x) as u32, (y as i32 - corner_dir.y) as u32));
                        shadows |= if (s0 + s1 == 2) { 3 } else { s0 + s1 + c } << (v * 2);
                        side_dir0.rotate_ccw();
                        side_dir1.rotate_ccw();
                        corner_dir.rotate_ccw();
                    }
                    layers.set_hxy(5, real_x, CHUNK_SIZE - 1 - real_y, (block_textures[5] << 8) | (shadows));
                }

                if (!is_solid(data.get_hxy(h, x, y - 1))) {
                    side_dir0.set(-1, 0);
                    side_dir1.set(0, -1);
                    corner_dir.set(-1, -1);
                    let mut shadows = 0;
                    for v in 0..4 {
                        let s0 = is_solid_int(data.get_hxy((h as i32 + side_dir0.y) as u32, (x as i32 + side_dir0.x) as u32, (y - 1) as u32));
                        let s1 = is_solid_int(data.get_hxy((h as i32 + side_dir1.y) as u32, (x as i32 + side_dir1.x) as u32, (y - 1) as u32));
                        let c = is_solid_int(data.get_hxy((h as i32 + corner_dir.y) as u32, (x as i32 + corner_dir.x) as u32, (y - 1) as u32));
                        shadows |= if (s0 + s1 == 2) { 3 } else { s0 + s1 + c } << (v * 2);
                        side_dir0.rotate_ccw();
                        side_dir1.rotate_ccw();
                        corner_dir.rotate_ccw();
                    }
                    layers.set_hxy(current_layer_offset + DIRECTION_FRONT, real_x, real_y, (block_textures[1] << 8) | shadows);
                }

                if (!is_solid(data.get_hxy(h, x - 1, y))) {
                    side_dir0.set(-1, 0);
                    side_dir1.set(0, -1);
                    corner_dir.set(-1, -1);
                    let mut shadows = 0;
                    for v in 0..4 {
                        let s0 = is_solid_int(data.get_hxy((h as i32 + side_dir0.y) as u32, (x - 1) as u32, (y as i32 - side_dir0.x) as u32));
                        let s1 = is_solid_int(data.get_hxy((h as i32 + side_dir1.y) as u32, (x - 1) as u32, (y as i32 - side_dir1.x) as u32));
                        let c = is_solid_int(data.get_hxy((h as i32 + corner_dir.y) as u32, (x - 1) as u32, (y as i32 - corner_dir.x) as u32));
                        shadows |= if (s0 + s1 == 2) { 3 } else { s0 + s1 + c } << (v * 2);
                        side_dir0.rotate_ccw();
                        side_dir1.rotate_ccw();
                        corner_dir.rotate_ccw();
                    }
                    layers.set_hxy(
                        current_layer_offset + DIRECTION_LEFT,
                        CHUNK_SIZE - 1 - real_y,
                        real_x,
                        (block_textures[2] << 8) | shadows,
                    );
                }

                if (!is_solid(data.get_hxy(h, x, y + 1))) {
                    side_dir0.set(-1, 0);
                    side_dir1.set(0, -1);
                    corner_dir.set(-1, -1);
                    let mut shadows = 0;
                    for v in 0..4 {
                        let s0 = is_solid_int(data.get_hxy((h as i32 + side_dir0.y) as u32, (x as i32 - side_dir0.x) as u32, (y + 1) as u32));
                        let s1 = is_solid_int(data.get_hxy((h as i32 + side_dir1.y) as u32, (x as i32 - side_dir1.x) as u32, (y + 1) as u32));
                        let c = is_solid_int(data.get_hxy((h as i32 + corner_dir.y) as u32, (x as i32 - corner_dir.x) as u32, (y + 1) as u32));
                        shadows |= if (s0 + s1 == 2) { 3 } else { s0 + s1 + c } << (v * 2);
                        side_dir0.rotate_ccw();
                        side_dir1.rotate_ccw();
                        corner_dir.rotate_ccw();
                    }
                    layers.set_hxy(
                        current_layer_offset + DIRECTION_BACK,
                        CHUNK_SIZE - 1 - real_x,
                        CHUNK_SIZE - 1 - real_y,
                        (block_textures[3] << 8) | shadows,
                    );
                }

                if (!is_solid(data.get_hxy(h, x + 1, y))) {
                    side_dir0.set(-1, 0);
                    side_dir1.set(0, -1);
                    corner_dir.set(-1, -1);
                    let mut shadows = 0;
                    for v in 0..4 {
                        let s0 = is_solid_int(data.get_hxy((h as i32 + side_dir0.y) as u32, (x + 1) as u32, (y as i32 + side_dir0.x) as u32));
                        let s1 = is_solid_int(data.get_hxy((h as i32 + side_dir1.y) as u32, (x + 1) as u32, (y as i32 + side_dir1.x) as u32));
                        let c = is_solid_int(data.get_hxy((h as i32 + corner_dir.y) as u32, (x + 1) as u32, (y as i32 + corner_dir.x) as u32));
                        shadows |= if (s0 + s1 == 2) { 3 } else { s0 + s1 + c } << (v * 2);
                        side_dir0.rotate_ccw();
                        side_dir1.rotate_ccw();
                        corner_dir.rotate_ccw();
                    }
                    layers.set_hxy(
                        current_layer_offset + DIRECTION_RIGHT,
                        real_y,
                        CHUNK_SIZE - 1 - real_x,
                        (block_textures[4] << 8) | shadows,
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
        let layer_len = CHUNK_SIZE * CHUNK_SIZE;

        for dir in 1..5 {
            let layer_start_current = layers.plane_idx(dir + current_layer_offset) as u32;
            let layer_start_top = layers.plane_idx(dir + top_layer_offset) as u32;
            let layer_end_idx = layer_start_current + PLANE_SIZE;
            let dir_encode_base_idx = (dir << 3) as usize;
            let dir_xx_mul = DIRECTION_ENCODE[dir_encode_base_idx + 0];
            let dir_xy_mul = DIRECTION_ENCODE[dir_encode_base_idx + 1];
            let dir_xx_add = DIRECTION_ENCODE[dir_encode_base_idx + 2];
            let dir_yx_mul = DIRECTION_ENCODE[dir_encode_base_idx + 3];
            let dir_yy_mul = DIRECTION_ENCODE[dir_encode_base_idx + 4];
            let dir_yy_add = DIRECTION_ENCODE[dir_encode_base_idx + 5];

            for y in (layer_start_current..layer_end_idx).step_by(CHUNK_SIZE as usize) {
                let row_end = y + CHUNK_SIZE;
                let mut i = y;
                while i < row_end {
                    let mut j = i + 1;
                    while j < row_end {
                        if (layers.get_idx(i as u32) != layers.get_idx(j as u32)) {
                            break;
                        }
                        layers.set_idx(j as u32, 0);
                        j += 1;
                    }
                    if (layers.get_idx(i as u32) == 0) {
                        i += 1;
                        continue;
                    }
                    layers.set_idx(i as u32, layers.get_idx(i as u32) | (1 << 25) | ((j - i) << 17));
                    i = j;
                }
            }

            for i in 0..layer_len {
                let top = layers.get_idx((layer_start_top + i) as u32);
                if (top == 0) {
                    continue;
                }
                let top_h = top >> 25;
                let cur = layers.get_idx((layer_start_current + i) as u32);
                if ((top & 0x01FFFFFF) == (cur & 0x01FFFFFF) && top_h < CHUNK_SIZE) {
                    layers.set_idx((layer_start_current + i) as u32, (cur & 0x01FFFFFF) | ((top_h + 1) << 25));
                } else {
                    let x = i & 31;
                    let y = i >> 5;
                    buffer.add_face(
                        dir,
                        real_h - top_h,
                        (dir_xx_add + dir_xx_mul * x as i32 + dir_xy_mul * y as i32) as u32,
                        (dir_yy_add + dir_yx_mul * x as i32 + dir_yy_mul * y as i32) as u32,
                        (top >> 17) & 0xFF,
                        top_h,
                        top & 0x1FFFF,
                        false,
                    );
                }
            }
        }

        let mut t_c: [u32; (CHUNK_SIZE * 2) as usize] = [0; (CHUNK_SIZE * 2) as usize];
        for up_down in 0..2 {
            let layer_idx = up_down * 5;
            t_c.fill(0);
            let mut current_row_idx = 0;
            let mut top_row_idx ;
            for y in 0..CHUNK_SIZE {
                current_row_idx = (y & 1) * CHUNK_SIZE;
                top_row_idx = (CHUNK_SIZE - current_row_idx);
                let row_idx = layers.row_idx(layer_idx, y) as u32;
                for i in 0..CHUNK_SIZE {
                    t_c[(current_row_idx + i) as usize] = layers.get_idx((row_idx + i) as u32);
                }

                let mut i = 0;
                while i < CHUNK_SIZE {
                    if (t_c[(current_row_idx + i) as usize] == 0) {
                        i += 1;
                        continue;
                    }
                    let mut j = i + 1;
                    while j < CHUNK_SIZE {
                        if (t_c[(current_row_idx + i) as usize] != t_c[(current_row_idx + j) as usize]) {
                            break;
                        }
                        t_c[(current_row_idx + j) as usize] = 0;
                        j += 1;
                    }
                    t_c[(current_row_idx + i) as usize] |= (1 << 25) | ((j - i) << 17);
                    i = j;
                }
                for i in 0..CHUNK_SIZE {
                    let top = t_c[(top_row_idx + i) as usize];
                    if (top == 0) {
                        continue;
                    }
                    let top_h = top >> 25;
                    let cur = t_c[(current_row_idx + i) as usize];
                    if ((top & 0x01FFFFFF) == (cur & 0x01FFFFFF)) {
                        t_c[(current_row_idx + i) as usize] = cur & 0x01FFFFFF | (top_h + 1) << 25;
                    } else {
                        let top_w = (top >> 17) & 0xFF;
                        let yy = if up_down == 0 { (y - top_h) } else { (CHUNK_SIZE - 1) - (y - top_h) };
                        buffer.add_face(DIRECTION_UP + up_down * 5, real_h, i, yy, top_w, top_h, top & 0x1FFFF, false);
                    }
                }
            }

            for i in 0..CHUNK_SIZE {
                let top = t_c[(current_row_idx + i) as usize];
                if (top == 0) {
                    continue;
                }
                let top_h = top >> 25;
                let top_w = top >> 17 & 0xFF;
                let y = if up_down == 0 {
                    (CHUNK_SIZE - top_h)
                } else {
                    (CHUNK_SIZE - 1) - (CHUNK_SIZE - top_h)
                };
                buffer.add_face(DIRECTION_UP + up_down * 5, real_h, i, y, top_w, top_h, top & 0x1FFFF, false);
            }
        }
    }
    let layer_len = CHUNK_SIZE * CHUNK_SIZE;

    for dir in 1..5 {
        let layer_start_current = layers.plane_idx(dir + current_layer_offset) as u32;
        let dir_encode_base_idx = (dir << 3) as usize;
        let dir_xx_mul = DIRECTION_ENCODE[dir_encode_base_idx + 0];
        let dir_xy_mul = DIRECTION_ENCODE[dir_encode_base_idx + 1];
        let dir_xx_add = DIRECTION_ENCODE[dir_encode_base_idx + 2];
        let dir_yx_mul = DIRECTION_ENCODE[dir_encode_base_idx + 3];
        let dir_yy_mul = DIRECTION_ENCODE[dir_encode_base_idx + 4];
        let dir_yy_add = DIRECTION_ENCODE[dir_encode_base_idx + 5];

        for i in 0..layer_len {
            let top = layers.get_idx((layer_start_current + i) as u32);
            if (top == 0) {
                continue;
            }
            let top_h = top >> 25;
            let x = i & 31;
            let y = i >> 5;
            buffer.add_face(
                dir,
                CHUNK_SIZE - top_h,
                (dir_xx_add + dir_xx_mul * x as i32 + dir_xy_mul * y as i32) as u32,
                (dir_yy_add + dir_yx_mul * x as i32 + dir_yy_mul * y as i32) as u32,
                (top >> 17) & 0xFF,
                top_h,
                top & 0x1FFFF,
                false,
            );
        }
    }

    return buffer.complete();
}

#[no_mangle]
pub fn create_mesh_quick(in_chunk_data_ptr: *mut u32, out_mesh_ptr: *mut u32, tmp_mesh_ptr: *mut u32) -> u32 {
    let mut side_dir0 = DirXY { x: 0, y: 0 };
    let mut side_dir1 = DirXY { x: 0, y: 0 };
    let mut corner_dir = DirXY { x: 0, y: 0 };
    let mut buffer = FaceBuffer {
        mesh_data_solid: out_mesh_ptr,
        mesh_data_solid_idx: 0,
        mesh_data_water: tmp_mesh_ptr,
        mesh_data_water_idx: 0,
    };

    let chunk_data = unsafe { Array3D::from_raw(in_chunk_data_ptr, CHUNK_SIZE_E, CHUNK_SIZE_E, CHUNK_SIZE_E) };

    for h in 1..CHUNK_SIZE + 1 {
        for y in 1..CHUNK_SIZE + 1 {
            for x in 1..CHUNK_SIZE + 1 {
                let real_x = x - 1;
                let real_y = y - 1;
                let real_h = h - 1;
                let block_id = chunk_data.get_hxy(h, x, y);
                if (block_id == BLOCK_EMPTY) {
                    continue;
                }

                // if (blockId == 8) {
                //     this.#grasslike.put(blockId << 15 | h << 10 | y << 5 | x);
                //     continue;
                // }
                let block_textures = BLOCKS_TEXTURES[decode_block_id(block_id) as usize];
                let is_water = block_id == BLOCK_WATER;
                let above = chunk_data.get_hxy(h + 1, x, y);
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
                            let s0 =
                                is_solid_int(chunk_data.get_hxy((h + 1) as u32, (x as i32 + side_dir0.x) as u32, (y as i32 + side_dir0.y) as u32));
                            let s1 =
                                is_solid_int(chunk_data.get_hxy((h + 1) as u32, (x as i32 + side_dir1.x) as u32, (y as i32 + side_dir1.y) as u32));
                            let c =
                                is_solid_int(chunk_data.get_hxy((h + 1) as u32, (x as i32 + corner_dir.x) as u32, (y as i32 + corner_dir.y) as u32));
                            shadows |= if (s0 + s1 == 2) { 3 } else { s0 + s1 + c } << (v * 2);
                            side_dir0.rotate_ccw();
                            side_dir1.rotate_ccw();
                            corner_dir.rotate_ccw();
                        }
                    }
                    buffer.add_face(DIRECTION_UP, real_h, real_x, real_y, 1, 1, (block_textures[0] << 8) | (shadows), false);
                }

                if (is_water) {
                    continue;
                }

                if (!is_solid(chunk_data.get_hxy(h - 1, x, y))) {
                    side_dir0.set(-1, 0);
                    side_dir1.set(0, -1);
                    corner_dir.set(-1, -1);
                    let mut shadows = 0;
                    for v in 0..4 {
                        let s0 = is_solid_int(chunk_data.get_hxy((h - 1) as u32, (x as i32 + side_dir0.x) as u32, (y as i32 - side_dir0.y) as u32));
                        let s1 = is_solid_int(chunk_data.get_hxy((h - 1) as u32, (x as i32 + side_dir1.x) as u32, (y as i32 - side_dir1.y) as u32));
                        let c = is_solid_int(chunk_data.get_hxy((h - 1) as u32, (x as i32 + corner_dir.x) as u32, (y as i32 - corner_dir.y) as u32));
                        shadows |= if s0 & s1 == 1 { 3 } else { s0 + s1 + c } << (v * 2);
                        side_dir0.rotate_ccw();
                        side_dir1.rotate_ccw();
                        corner_dir.rotate_ccw();
                    }

                    buffer.add_face(DIRECTION_DOWN, real_h, real_x, real_y, 1, 1, (block_textures[5] << 8) | (shadows), false);
                }

                if !is_solid(chunk_data.get_hxy(h, x, y - 1)) {
                    side_dir0.set(-1, 0);
                    side_dir1.set(0, -1);
                    corner_dir.set(-1, -1);
                    let mut shadows = 0;
                    for v in 0..4 {
                        let s0 = is_solid_int(chunk_data.get_hxy((h as i32 + side_dir0.y) as u32, (x as i32 + side_dir0.x) as u32, (y - 1) as u32));
                        let s1 = is_solid_int(chunk_data.get_hxy((h as i32 + side_dir1.y) as u32, (x as i32 + side_dir1.x) as u32, (y - 1) as u32));
                        let c = is_solid_int(chunk_data.get_hxy((h as i32 + corner_dir.y) as u32, (x as i32 + corner_dir.x) as u32, (y - 1) as u32));
                        shadows |= if (s0 + s1 == 2) { 3 } else { s0 + s1 + c } << (v * 2);
                        side_dir0.rotate_ccw();
                        side_dir1.rotate_ccw();
                        corner_dir.rotate_ccw();
                    }
                    buffer.add_face(DIRECTION_FRONT, real_h, real_x, real_y, 1, 1, (block_textures[1] << 8) | (shadows), false);
                }

                if !is_solid(chunk_data.get_hxy(h, x - 1, y)) {
                    side_dir0.set(-1, 0);
                    side_dir1.set(0, -1);
                    corner_dir.set(-1, -1);
                    let mut shadows = 0;
                    for v in 0..4 {
                        let s0 = is_solid_int(chunk_data.get_hxy((h as i32 + side_dir0.y) as u32, (x - 1) as u32, (y as i32 - side_dir0.x) as u32));
                        let s1 = is_solid_int(chunk_data.get_hxy((h as i32 + side_dir1.y) as u32, (x - 1) as u32, (y as i32 - side_dir1.x) as u32));
                        let c = is_solid_int(chunk_data.get_hxy((h as i32 + corner_dir.y) as u32, (x - 1) as u32, (y as i32 - corner_dir.x) as u32));
                        shadows |= if (s0 + s1 == 2) { 3 } else { s0 + s1 + c } << (v * 2);
                        side_dir0.rotate_ccw();
                        side_dir1.rotate_ccw();
                        corner_dir.rotate_ccw();
                    }
                    buffer.add_face(DIRECTION_LEFT, real_h, real_x, real_y, 1, 1, (block_textures[2] << 8) | (shadows), false);
                }

                if !is_solid(chunk_data.get_hxy(h, x, y + 1)) {
                    side_dir0.set(-1, 0);
                    side_dir1.set(0, -1);
                    corner_dir.set(-1, -1);
                    let mut shadows = 0;
                    for v in 0..4 {
                        let s0 = is_solid_int(chunk_data.get_hxy((h as i32 + side_dir0.y) as u32, (x as i32 - side_dir0.x) as u32, (y + 1) as u32));
                        let s1 = is_solid_int(chunk_data.get_hxy((h as i32 + side_dir1.y) as u32, (x as i32 - side_dir1.x) as u32, (y + 1) as u32));
                        let c = is_solid_int(chunk_data.get_hxy((h as i32 + corner_dir.y) as u32, (x as i32 - corner_dir.x) as u32, (y + 1) as u32));
                        shadows |= if (s0 + s1 == 2) { 3 } else { s0 + s1 + c } << (v * 2);
                        side_dir0.rotate_ccw();
                        side_dir1.rotate_ccw();
                        corner_dir.rotate_ccw();
                    }
                    buffer.add_face(DIRECTION_BACK, real_h, real_x, real_y, 1, 1, (block_textures[3] << 8) | (shadows), false);
                }

                if !is_solid(chunk_data.get_hxy(h, x + 1, y)) {
                    side_dir0.set(-1, 0);
                    side_dir1.set(0, -1);
                    corner_dir.set(-1, -1);
                    let mut shadows = 0;
                    for v in 0..4 {
                        let s0 = is_solid_int(chunk_data.get_hxy((h as i32 + side_dir0.y) as u32, (x + 1) as u32, (y as i32 + side_dir0.x) as u32));
                        let s1 = is_solid_int(chunk_data.get_hxy((h as i32 + side_dir1.y) as u32, (x + 1) as u32, (y as i32 + side_dir1.x) as u32));
                        let c = is_solid_int(chunk_data.get_hxy((h as i32 + corner_dir.y) as u32, (x + 1) as u32, (y as i32 + corner_dir.x) as u32));
                        shadows |= if s0 + s1 == 2 { 3 } else { s0 + s1 + c } << (v * 2);
                        side_dir0.rotate_ccw();
                        side_dir1.rotate_ccw();
                        corner_dir.rotate_ccw();
                    }
                    buffer.add_face(DIRECTION_RIGHT, real_h, real_x, real_y, 1, 1, (block_textures[4] << 8) | (shadows), false);
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
