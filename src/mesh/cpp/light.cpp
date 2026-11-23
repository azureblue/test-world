#include "int.h"

// The light of a chunk's cells (docs/proposals/lighting.md): sky light 0..7 and block light 0..15, each computed from
// the chunk and a margin around it (its region) as far as it travels: MARGIN blocks for the sky light (compute),
// BLOCK_MARGIN for the block light (compute_block, only near emitters). The result is the light of the mesher's input:
// the chunk with a 1 block border (src/world/lighting.js writes it in).
//
// - Sky light: 7 in the cells that see the sky straight up (from their column's sky_from up). Angled sky light under
//   overhangs, in the cells that see the sky at 45°: from a sky lit cell diagonally above them (one block to a side),
//   past the cell beside them or the one above them, passed on straight down, at most MAX_ANGLED_STEPS diagonal steps
//   from the open sky (a 45° staircase would carry it down forever); by the gap (the open cells from the cell up to
//   the block above): less directly under a block, full SHADOWLESS_GAP or more under it. Then spread, 1 less per
//   block, 2 less for a step sideways into a cell under a block (a low gap darkens faster).
// - Block light: the emitters' level (up to 15) in the open cells next to them (a lamp is solid; its faces are as
//   bright as it), spread 1 less per block: twice as many levels as the sky's, so a lamp reaches about 15 blocks.
// Solid cells stop both; their own light stays 0 (the mesher counts them as such).

#define export_name(name) __attribute__((export_name(name)))
#define inline_always __attribute__((always_inline)) inline

constexpr uint MARGIN = 7;
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

constexpr uint MAX_LIGHT = 7;
constexpr uint MAX_BLOCK_LIGHT = 15;
// the block light's region: the chunk and the margin its light can come from (15 next to an emitter, 1 at 15 blocks)
constexpr uint BLOCK_MARGIN = MAX_BLOCK_LIGHT;
constexpr uint BLOCK_SIZE = CHUNK_SIZE + 2 * BLOCK_MARGIN;
constexpr uint BLOCK_PLANE = BLOCK_SIZE * BLOCK_SIZE;
constexpr uint BLOCK_VOLUME = BLOCK_PLANE * BLOCK_SIZE;
constexpr uint BLOCK_OUT_START = BLOCK_MARGIN - 1;
constexpr uint ANGLED_SKY = 6;
constexpr uint SHADOWLESS_GAP = 6;
constexpr uint MAX_ANGLED_STEPS = 4;

// input, per region cell: bit 0 solid (stops light)
static uint8 cells[VOLUME];
// input, per block light region cell: bit 0 solid, bits 1..4 the block light it gives
static uint8 block_cells[BLOCK_VOLUME];
// input, per region column (y * SIZE + x): the lowest h of the cells that see the sky straight up (SIZE: none)
static uint8 sky_from[PLANE];
// output, per cell of the mesher's input ((h * OUT_SIZE + y) * OUT_SIZE + x): bits 0..2 the sky darkness (7 - sky
// light), bits 3..6 the block light; 0 for solid cells
static uint8 out[OUT_VOLUME];

static uint8 sky[VOLUME];
static uint8 block[BLOCK_VOLUME];
// the block light's spread, a level at a time: the cells at this level, the ones at the next; the emitters
static uint block_level[BLOCK_VOLUME];
static uint block_next[BLOCK_VOLUME];
static uint emitters[BLOCK_VOLUME];
// the open cells from a cell up to the block above it, itself included (up to 255)
static uint8 gap[VOLUME];
// the diagonal steps angled sky light took to a cell from the open sky
static uint8 angled_steps[VOLUME];

// the cells to spread from, by their light: a cell's light only grows, so it's in each list at most once
static uint queue[MAX_LIGHT + 1][VOLUME];
static uint queue_length[MAX_LIGHT + 1];

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
    return cells[i] & 1;
}

inline_always static uint angled_sky(uint g) {
    return g >= SHADOWLESS_GAP ? MAX_LIGHT : (4 + g < ANGLED_SKY ? 4 + g : ANGLED_SKY);
}

// sky lit enough to pass angled light on: at least the angled light directly under a block
inline_always static bool sky_lit(uint i) {
    return sky[i] >= angled_sky(1);
}

inline_always static void raise(uint8* light, uint i, uint level) {
    if (light[i] < level) {
        light[i] = level;
        queue[level][queue_length[level]++] = i;
    }
}

// whether a column beside (x, y) doesn't see the sky straight up at height h
inline_always static bool covered_beside(uint x, uint y, uint h) {
    const uint c = y * SIZE + x;
    return (x > 0 && sky_from[c - 1] > h) || (x < SIZE - 1 && sky_from[c + 1] > h) ||
           (y > 0 && sky_from[c - SIZE] > h) || (y < SIZE - 1 && sky_from[c + SIZE] > h);
}

static void seed_sky() {
    for (uint h = SIZE; h-- > 0;) {
        for (uint y = 0; y < SIZE; y++) {
            for (uint x = 0; x < SIZE; x++) {
                const uint i = (h * SIZE + y) * SIZE + x;
                sky[i] = 0;
                if (is_solid(i)) {
                    gap[i] = 0;
                    continue;
                }
                const uint above = i + PLANE;
                const bool top = h == SIZE - 1;
                gap[i] = top || is_solid(above) ? 1 : (gap[above] < 255 ? gap[above] + 1 : 255);
                if (h >= sky_from[y * SIZE + x]) {
                    // open sky: spread from it only where a column beside is covered at this height (all its other
                    // neighbours are open sky too, or solid)
                    sky[i] = MAX_LIGHT;
                    if (covered_beside(x, y, h))
                        queue[MAX_LIGHT][queue_length[MAX_LIGHT]++] = i;
                    continue;
                }
                if (top)
                    continue;
                // angled light straight from above (the same steps), or diagonally from above past the cell beside
                // this one or the one above it (one step more; the open sky's: the first); the fewest steps
                const bool above_open = !is_solid(above);
                uint steps = above_open && sky_lit(above) ? angled_steps[above] : MAX_ANGLED_STEPS + 1;
                auto from_side = [&](int d) {
                    const uint j = above + d;
                    if (sky_lit(j) && (!is_solid(i + d) || above_open)) {
                        const uint s = sky[j] == MAX_LIGHT ? 1 : angled_steps[j] + 1;
                        steps = s < steps ? s : steps;
                    }
                };
                if (x > 0)
                    from_side(-1);
                if (x < SIZE - 1)
                    from_side(1);
                if (y > 0)
                    from_side(-static_cast<int>(SIZE));
                if (y < SIZE - 1)
                    from_side(SIZE);
                if (steps <= MAX_ANGLED_STEPS) {
                    angled_steps[i] = steps;
                    raise(sky, i, angled_sky(gap[i]));
                }
            }
        }
    }
}

// spreads the queued light, highest first; sideways steps into a cell under a block cost under_block_cost
static void spread(uint8* light, uint under_block_cost) {
    for (uint level = MAX_LIGHT; level > 1; level--) {
        // a step costs 1 or 2: it only adds to lower lists, never to this one
        for (uint q = 0; q < queue_length[level]; q++) {
            const uint i = queue[level][q];
            if (light[i] != level)
                continue;
            const uint x = i % SIZE, y = i / SIZE % SIZE, h = i / PLANE;
            auto reach = [&](uint j, uint cost) {
                if (level > cost && !is_solid(j))
                    raise(light, j, level - cost);
            };
            auto side = [&](uint j) { reach(j, h < SIZE - 1 && is_solid(j + PLANE) ? under_block_cost : 1); };
            if (x > 0)
                side(i - 1);
            if (x < SIZE - 1)
                side(i + 1);
            if (y > 0)
                side(i - SIZE);
            if (y < SIZE - 1)
                side(i + SIZE);
            if (h > 0)
                reach(i - PLANE, 1);
            if (h < SIZE - 1)
                reach(i + PLANE, 1);
        }
    }
}

static void clear_queues() {
    for (uint level = 0; level <= MAX_LIGHT; level++)
        queue_length[level] = 0;
}

// Computes the sky light from cells and sky_from into out (no block light). Returns whether there is any light that
// isn't full sky light.
extern "C" export_name("compute") uint compute() {
    clear_queues();
    seed_sky();
    spread(sky, 2);

    uint any = 0;
    for (uint h = 0; h < OUT_SIZE; h++) {
        for (uint y = 0; y < OUT_SIZE; y++) {
            uint i = ((h + OUT_START) * SIZE + y + OUT_START) * SIZE + OUT_START;
            uint o = (h * OUT_SIZE + y) * OUT_SIZE;
            for (uint x = 0; x < OUT_SIZE; x++, i++, o++) {
                const uint light = is_solid(i) ? 0 : MAX_LIGHT - sky[i];
                out[o] = light;
                any |= light;
            }
        }
    }
    return any != 0;
}

// Adds the block light from block_cells to out: to the sky light compute wrote (with_sky), or to full sky light.
// Returns whether out has any light that isn't full sky light.
extern "C" export_name("compute_block") uint compute_block(uint with_sky) {
    uint n_emitters = 0;
    for (uint i = 0; i < BLOCK_VOLUME; i++) {
        block[i] = 0;
        if (block_cells[i] >> 1)
            emitters[n_emitters++] = i;
    }
    // a level at a time, the brightest first: the emitters' neighbours at this level, then the cells reached from the
    // previous one; each cell's light is final when it's set (the levels only go down), so it's in one list
    uint n_level = 0;
    for (uint level = MAX_BLOCK_LIGHT; level > 0; level--) {
        auto reach = [&](uint j, uint* list, uint& n, uint to) {
            if (!(block_cells[j] & 1) && block[j] < to) {
                block[j] = to;
                list[n++] = j;
            }
        };
        auto around = [&](uint i, uint* list, uint& n, uint to) {
            const uint x = i % BLOCK_SIZE, y = i / BLOCK_SIZE % BLOCK_SIZE, h = i / BLOCK_PLANE;
            if (x > 0)
                reach(i - 1, list, n, to);
            if (x < BLOCK_SIZE - 1)
                reach(i + 1, list, n, to);
            if (y > 0)
                reach(i - BLOCK_SIZE, list, n, to);
            if (y < BLOCK_SIZE - 1)
                reach(i + BLOCK_SIZE, list, n, to);
            if (h > 0)
                reach(i - BLOCK_PLANE, list, n, to);
            if (h < BLOCK_SIZE - 1)
                reach(i + BLOCK_PLANE, list, n, to);
        };
        for (uint e = 0; e < n_emitters; e++)
            if ((block_cells[emitters[e]] >> 1) == level)
                around(emitters[e], block_level, n_level, level);
        uint n_next = 0;
        if (level > 1)
            for (uint q = 0; q < n_level; q++)
                around(block_level[q], block_next, n_next, level - 1);
        for (uint q = 0; q < n_next; q++)
            block_level[q] = block_next[q];
        n_level = n_next;
    }

    uint any = 0;
    for (uint h = 0; h < OUT_SIZE; h++) {
        for (uint y = 0; y < OUT_SIZE; y++) {
            uint i = ((h + BLOCK_OUT_START) * BLOCK_SIZE + y + BLOCK_OUT_START) * BLOCK_SIZE + BLOCK_OUT_START;
            uint o = (h * OUT_SIZE + y) * OUT_SIZE;
            for (uint x = 0; x < OUT_SIZE; x++, i++, o++) {
                // solid cells stay 0, as in compute
                const uint light = (with_sky ? out[o] : 0) | block[i] << 3;
                out[o] = light;
                any |= light;
            }
        }
    }
    return any != 0;
}
