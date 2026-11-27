#include "int.h"

// The light of a chunk's cells (docs/proposals/lighting.md): sky light and block light, 0..15 each, computed from the
// chunk and a margin around it (its region) as far as it travels: MARGIN blocks for the sky light (compute),
// BLOCK_MARGIN for the block light (compute_block, only near emitters). The result is the light of the mesher's input:
// the chunk with a 1 block border (src/world/lighting.js writes it in).
//
// - Sky light: 15 in the cells that see the sky straight up (from their column's sky_from up), however deep. Then
//   spread, 1 less per block (it reaches 15 blocks), a step sideways into a cell under a block twice that (a low gap
//   darkens faster).
// - Block light: the emitters' level (up to 15) in the open cells next to them (a lamp is solid; its faces are as
//   bright as it), then spread, 1 less per block (a lamp reaches 15 blocks).
// - The spread is in thirds of a level (units): a step to an edge neighbour (diagonal, past 2 open cells) costs 4/3
//   of a step to a face neighbour (about sqrt 2), so light spreads round, not in diamonds. The output is the level,
//   rounded up.
// Solid cells stop both; their own light stays 0 (the mesher counts them as such). A shaped block's cell (a slab) is
// lit, and light crosses a face between two cells where a quarter of it is open on both sides (shape_open: a bottom
// slab's open upper half against a top slab's open lower half is closed); the steps to edge neighbours only go
// between cells without shapes (no corners of shapes to slip past).

#define export_name(name) __attribute__((export_name(name)))
#define inline_always __attribute__((always_inline)) inline

constexpr uint MARGIN = 15;
constexpr uint CHUNK_SIZE = 32;
// the region: the chunk and the margin around it, index (h * SIZE + y) * SIZE + x
constexpr uint SIZE = CHUNK_SIZE + 2 * MARGIN;
constexpr uint PLANE = SIZE * SIZE;
constexpr uint VOLUME = PLANE * SIZE;
// the output: the mesher's input, the chunk with a 1 block border
constexpr uint OUT_SIZE = CHUNK_SIZE + 2;
constexpr uint OUT_VOLUME = OUT_SIZE * OUT_SIZE * OUT_SIZE;
// the output's first cell in the region
constexpr uint OUT_START = MARGIN - 1;

// light in units: a level is UNITS; the steps' costs (a face neighbour, an edge one), 1 level a block
constexpr uint UNITS = 3;
constexpr uint SKY_STEP = 3;
constexpr uint SKY_DIAGONAL_STEP = 4;
constexpr uint BLOCK_STEP = 3;
constexpr uint BLOCK_DIAGONAL_STEP = 4;

// a cell (cells, block_cells): bit 0 solid; a solid one's bits 1..4 the block light it gives (block_cells), an open
// one's bits 1..7 its shape (src/blocks.js) + 1, 0 none. Emitters are cubes, shaped blocks aren't solid: the bits are
// one or the other (a solid cell's are never read as a shape: no step goes into it).
constexpr uint SOLID = 1;
constexpr uint SHAPE_SHIFT = 1;
constexpr uint SHAPE_BITS = 0x7fu << SHAPE_SHIFT;
constexpr uint MAX_SHAPES = 64;
// faces: -x, +x, -y, +y, -h, +h (a face's opposite: face ^ 1)
constexpr uint FACE_XM = 0, FACE_XP = 1, FACE_YM = 2, FACE_YP = 3, FACE_HM = 4, FACE_HP = 5;
// above a cell, something that covers it (a sideways step into it is dearer): solid or shaped
constexpr uint COVERS = SOLID | SHAPE_BITS;

// input, written once by the JS side (Lighting): by shape + 1 (0: no shape) and face, the quarters of the face its
// octants leave open, bit qa | qb << 1 over the face's two other axes (in axis order), the same for a face and its
// opposite: light crosses between two cells where the two faces have an open quarter in common
static uint8 shape_open[MAX_SHAPES + 1][6];

inline_always static uint cell_shape(uint cell) {
    return (cell & SHAPE_BITS) >> SHAPE_SHIFT;
}

constexpr uint MAX_LIGHT = 15;
constexpr uint MAX_BLOCK_LIGHT = 15;
// the block light's region: the chunk and the margin its light can come from (15 next to an emitter, 1 at 15 blocks)
constexpr uint BLOCK_MARGIN = MAX_BLOCK_LIGHT;
constexpr uint BLOCK_SIZE = CHUNK_SIZE + 2 * BLOCK_MARGIN;
constexpr uint BLOCK_OUT_START = BLOCK_MARGIN - 1;
// A light spread over a region of size SZ (index (h * SZ + y) * SZ + x), in units, up to MAX_UNITS; a step to a face
// neighbour costs STEP, to an edge neighbour DIAGONAL. The seeds are set first (seed), then spread, highest first, from
// a list per light value: a step costs at least STEP, so a list gets no more cells while it's spread from; the lists
// are a ring of RING (more than the dearest step), each emptied before its slot is the next value's.
template <uint SZ, uint MAX_UNITS, uint STEP, uint DIAGONAL>
struct light_field {
    // the dearest step: diagonal, under a block
    static constexpr uint RING = 2 * DIAGONAL + 1;
    static constexpr uint PL = SZ * SZ;
    static constexpr uint VOL = PL * SZ;
    uint8 light[VOL];
    uint lists[RING][VOL];
    uint lengths[RING];
    // the cells to spread from first, ordered by their light (seed_start: where each value's start)
    uint seeds[VOL];
    uint n_seeds;
    uint seeds_by_light[VOL];
    uint seed_start[MAX_UNITS + 2];

    inline_always void seed(uint i, uint units) {
        if (light[i] < units) {
            if (light[i] == 0)
                seeds[n_seeds++] = i;
            light[i] = units;
        }
    }

    inline_always void raise(uint j, uint units) {
        if (light[j] < units) {
            light[j] = units;
            const uint slot = units % RING;
            lists[slot][lengths[slot]++] = j;
        }
    }

    // spreads the seeds' light through the open cells (bit 0 of cells: solid) and their open faces; steps sideways
    // into a cell under a block cost twice as much with under_block. SHAPED: some cells have a shape (without, the
    // steps don't look for them)
    template <bool SHAPED>
    void spread(const uint8* cells, bool under_block) {
        for (uint u = 0; u < MAX_UNITS + 2; u++)
            seed_start[u] = 0;
        for (uint s = 0; s < n_seeds; s++)
            seed_start[light[seeds[s]] + 1]++;
        for (uint u = 1; u < MAX_UNITS + 2; u++)
            seed_start[u] += seed_start[u - 1];
        for (uint s = 0; s < n_seeds; s++)
            seeds_by_light[seed_start[light[seeds[s]]]++] = seeds[s];
        // seed_start[u] is now where u + 1's seeds start
        for (uint r = 0; r < RING; r++)
            lengths[r] = 0;

        for (uint level = MAX_UNITS; level > STEP; level--) {
            const uint slot = level % RING;
            for (uint s = level > 0 ? seed_start[level - 1] : 0; s < seed_start[level]; s++)
                lists[slot][lengths[slot]++] = seeds_by_light[s];
            for (uint q = 0; q < lengths[slot]; q++) {
                const uint i = lists[slot][q];
                if (light[i] == level)
                    spread_from<SHAPED>(cells, under_block, i, level);
            }
            lengths[slot] = 0;
        }
    }

   private:
    template <bool SHAPED>
    inline_always void spread_from(const uint8* cells, bool under_block, uint i, uint level) {
        const uint x = i % SZ, y = i / SZ % SZ, h = i / PL;
        const bool xm = x > 0, xp = x < SZ - 1, ym = y > 0, yp = y < SZ - 1, hm = h > 0, hp = h < SZ - 1;
        auto open = [&](uint j) { return !(cells[j] & SOLID); };
        // no solid block, no shape: what an edge step passes and goes between
        auto clear = [&](uint j) { return !(cells[j] & (SOLID | SHAPE_BITS)); };
        auto reach = [&](uint j, uint cost) {
            if (level > cost && open(j))
                raise(j, level - cost);
        };
        // a step with a sideways part: dearer into a cell under a block (nothing above the region's top)
        auto sideways = [&](uint j, uint cost, bool below_top) {
            reach(j, under_block && below_top && (cells[j + PL] & COVERS) ? cost * 2 : cost);
        };
        // through the face of the cell and the neighbour's opposite one: a quarter open in both
        auto through = [&](uint face, uint j) {
            return !SHAPED || (shape_open[cell_shape(cells[i])][face] & shape_open[cell_shape(cells[j])][face ^ 1]) != 0;
        };
        // to an edge neighbour past both cells beside the way (no light through two blocks touching at an edge)
        const bool from_clear = !SHAPED || !(cells[i] & SHAPE_BITS);
        auto diagonal = [&](int a, int b, bool side, bool below_top) {
            const uint j = i + a + b;
            if (SHAPED ? from_clear && clear(i + a) && clear(i + b) && !(cells[j] & SHAPE_BITS) : open(i + a) && open(i + b)) {
                if (side)
                    sideways(j, DIAGONAL, below_top);
                else
                    reach(j, DIAGONAL);
            }
        };
        constexpr int X = 1, Y = SZ, H = PL;
        if (xm && through(FACE_XM, i - X))
            sideways(i - X, STEP, hp);
        if (xp && through(FACE_XP, i + X))
            sideways(i + X, STEP, hp);
        if (ym && through(FACE_YM, i - Y))
            sideways(i - Y, STEP, hp);
        if (yp && through(FACE_YP, i + Y))
            sideways(i + Y, STEP, hp);
        if (hm && through(FACE_HM, i - H))
            reach(i - H, STEP);
        if (hp && through(FACE_HP, i + H))
            reach(i + H, STEP);
        if (xm && ym)
            diagonal(-X, -Y, true, hp);
        if (xp && ym)
            diagonal(X, -Y, true, hp);
        if (xm && yp)
            diagonal(-X, Y, true, hp);
        if (xp && yp)
            diagonal(X, Y, true, hp);
        if (xm && hm)
            diagonal(-X, -H, true, true);
        if (xp && hm)
            diagonal(X, -H, true, true);
        if (ym && hm)
            diagonal(-Y, -H, true, true);
        if (yp && hm)
            diagonal(Y, -H, true, true);
        // up and to a side: the cell above the target (2 up) may be past the region's top
        const bool two_below_top = h + 2 < SZ;
        if (xm && hp)
            diagonal(-X, H, true, two_below_top);
        if (xp && hp)
            diagonal(X, H, true, two_below_top);
        if (ym && hp)
            diagonal(-Y, H, true, two_below_top);
        if (yp && hp)
            diagonal(Y, H, true, two_below_top);
    }
};

// input, per region cell: bit 0 solid (stops light), the shape (SHAPE_SHIFT)
static uint8 cells[VOLUME];
// input, per block light region cell: bit 0 solid, then the block light it gives or the shape
static uint8 block_cells[BLOCK_SIZE * BLOCK_SIZE * BLOCK_SIZE];
// input, per region column (y * SIZE + x): the lowest h of the cells that see the sky straight up (SIZE: none)
static uint8 sky_from[PLANE];
// output, per cell of the mesher's input ((h * OUT_SIZE + y) * OUT_SIZE + x): bits 0..3 the sky darkness (15 - sky
// light), bits 4..7 the block light; 0 for solid cells
static uint8 out[OUT_VOLUME];

static light_field<SIZE, MAX_LIGHT * UNITS, SKY_STEP, SKY_DIAGONAL_STEP> sky;
static light_field<BLOCK_SIZE, MAX_BLOCK_LIGHT * UNITS, BLOCK_STEP, BLOCK_DIAGONAL_STEP> block;
extern "C" export_name("shape_open") uint8* get_shape_open() {
    return &shape_open[0][0];
}

extern "C" export_name("cells") uint8* get_cells() {
    return cells;
}

extern "C" export_name("block_cells") uint8* get_block_cells() {
    return block_cells;
}

extern "C" export_name("block_region_size") uint get_block_region_size() {
    return BLOCK_SIZE;
}

extern "C" export_name("sky_from") uint8* get_sky_from() {
    return sky_from;
}

extern "C" export_name("out") uint8* get_out() {
    return out;
}

extern "C" export_name("region_size") uint get_region_size() {
    return SIZE;
}

inline_always static bool is_solid(uint i) {
    return cells[i] & SOLID;
}

// whether a column beside (x, y) doesn't see the sky straight up at height h
inline_always static bool covered_beside(uint x, uint y, uint h) {
    const uint c = y * SIZE + x;
    return (x > 0 && sky_from[c - 1] > h) || (x < SIZE - 1 && sky_from[c + 1] > h) ||
           (y > 0 && sky_from[c - SIZE] > h) || (y < SIZE - 1 && sky_from[c + SIZE] > h);
}

static void seed_sky() {
    sky.n_seeds = 0;
    for (uint h = 0; h < SIZE; h++) {
        for (uint y = 0; y < SIZE; y++) {
            for (uint x = 0; x < SIZE; x++) {
                const uint i = (h * SIZE + y) * SIZE + x;
                sky.light[i] = 0;
                if (is_solid(i) || h < sky_from[y * SIZE + x])
                    continue;
                // open sky: spread from it only where a column beside is covered at this height (its other neighbours
                // are open sky too, or solid; a diagonal one is reached as well from the face neighbours between)
                if (covered_beside(x, y, h))
                    sky.seed(i, MAX_LIGHT * UNITS);
                else
                    sky.light[i] = MAX_LIGHT * UNITS;
            }
        }
    }
}

// a light in units to its level, rounded up
inline_always static uint level_of(uint units) {
    return (units + UNITS - 1) / UNITS;
}

// Computes the sky light from cells and sky_from into out (no block light). Returns whether there is any light that
// isn't full sky light.
// shaped: some cells have a shape.
extern "C" export_name("compute") uint compute(uint shaped) {
    seed_sky();
    if (shaped)
        sky.spread<true>(cells, true);
    else
        sky.spread<false>(cells, true);

    uint any = 0;
    for (uint h = 0; h < OUT_SIZE; h++) {
        for (uint y = 0; y < OUT_SIZE; y++) {
            uint i = ((h + OUT_START) * SIZE + y + OUT_START) * SIZE + OUT_START;
            uint o = (h * OUT_SIZE + y) * OUT_SIZE;
            for (uint x = 0; x < OUT_SIZE; x++, i++, o++) {
                const uint light = is_solid(i) ? 0 : MAX_LIGHT - level_of(sky.light[i]);
                out[o] = light;
                any |= light;
            }
        }
    }
    return any != 0;
}

// Adds the block light from block_cells to out: to the sky light compute wrote (with_sky), or to full sky light.
// Returns whether out has any light that isn't full sky light. shaped: some cells have a shape.
extern "C" export_name("compute_block") uint compute_block(uint with_sky, uint shaped) {
    constexpr uint B = BLOCK_SIZE, BP = B * B, BV = BP * B;
    block.n_seeds = 0;
    for (uint i = 0; i < BV; i++)
        block.light[i] = 0;
    // the emitters' level in the open cells next to them (their face toward it open)
    for (uint i = 0; i < BV; i++) {
        const uint emits = block_cells[i] & SOLID ? block_cells[i] >> 1 & 15 : 0;
        if (emits == 0)
            continue;
        const uint x = i % B, y = i / B % B, h = i / BP;
        // j: at the emitter's face (its own face toward the emitter is the opposite)
        auto seed = [&](uint j, uint face) {
            if (!(block_cells[j] & SOLID) && shape_open[cell_shape(block_cells[j])][face ^ 1] != 0)
                block.seed(j, emits * UNITS);
        };
        if (x > 0)
            seed(i - 1, FACE_XM);
        if (x < B - 1)
            seed(i + 1, FACE_XP);
        if (y > 0)
            seed(i - B, FACE_YM);
        if (y < B - 1)
            seed(i + B, FACE_YP);
        if (h > 0)
            seed(i - BP, FACE_HM);
        if (h < B - 1)
            seed(i + BP, FACE_HP);
    }
    if (shaped)
        block.spread<true>(block_cells, false);
    else
        block.spread<false>(block_cells, false);

    uint any = 0;
    for (uint h = 0; h < OUT_SIZE; h++) {
        for (uint y = 0; y < OUT_SIZE; y++) {
            uint i = ((h + BLOCK_OUT_START) * B + y + BLOCK_OUT_START) * B + BLOCK_OUT_START;
            uint o = (h * OUT_SIZE + y) * OUT_SIZE;
            for (uint x = 0; x < OUT_SIZE; x++, i++, o++) {
                // solid cells stay 0, as in compute
                const uint light = (with_sky ? out[o] : 0) | level_of(block.light[i]) << 4;
                out[o] = light;
                any |= light;
            }
        }
    }
    return any != 0;
}
