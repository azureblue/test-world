#include "int.h"

// The light of a chunk's cells (docs/proposals/lighting.md): sky light and block light, 0..7 each, computed from the
// chunk and a margin of MARGIN blocks around it (the region), as light travels at most 8 blocks (a lamp's, see block
// light). Its result is the
// light of the mesher's input: the chunk with a 1 block border (src/world/lighting.js writes it in).
//
// - Sky light: 7 in the cells that see the sky straight up (from their column's sky_from up). Angled sky light under
//   overhangs, in the cells that see the sky at 45°: from a sky lit cell diagonally above them (one block to a side),
//   past the cell beside them or the one above them, passed on straight down, at most MAX_ANGLED_STEPS diagonal steps
//   from the open sky (a 45° staircase would carry it down forever); by the gap (the open cells from the cell up to
//   the block above): less directly under a block, full SHADOWLESS_GAP or more under it. Then spread, 1 less per
//   block, 2 less for a step sideways into a cell under a block (a low gap darkens faster).
// - Block light: the emitters' level in the open cells next to them (a lamp is solid; its faces are as bright as it),
//   spread 1 less per block.
// Solid cells stop both; their own light stays 0 (the mesher counts them as such).

#define export_name(name) __attribute__((export_name(name)))
#define inline_always __attribute__((always_inline)) inline

constexpr uint MARGIN = 8;
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
constexpr uint ANGLED_SKY = 6;
constexpr uint SHADOWLESS_GAP = 6;
constexpr uint MAX_ANGLED_STEPS = 4;

// input, per region cell: bit 0 solid (stops light), bits 1..3 the block light it gives
static uint8 cells[VOLUME];
// input, per region column (y * SIZE + x): the lowest h of the cells that see the sky straight up (SIZE: none)
static uint8 sky_from[PLANE];
// output, per cell of the mesher's input ((h * OUT_SIZE + y) * OUT_SIZE + x): bits 0..2 the sky darkness (7 - sky
// light), bits 3..5 the block light; 0 for solid cells
static uint8 out[OUT_VOLUME];

static uint8 sky[VOLUME];
static uint8 block[VOLUME];
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

// Computes the light from cells and sky_from into out. Returns whether there is any: 0 when all is full sky light
// and no block light (out isn't written then, data without light means that).
extern "C" export_name("compute") uint compute() {
    clear_queues();
    seed_sky();
    spread(sky, 2);

    clear_queues();
    bool any_block_light = false;
    for (uint i = 0; i < VOLUME; i++)
        block[i] = 0;
    for (uint i = 0; i < VOLUME; i++) {
        const uint emits = cells[i] >> 1 & 7;
        if (emits == 0)
            continue;
        any_block_light = true;
        const uint x = i % SIZE, y = i / SIZE % SIZE, h = i / PLANE;
        auto seed = [&](uint j) {
            if (!is_solid(j))
                raise(block, j, emits);
        };
        if (x > 0)
            seed(i - 1);
        if (x < SIZE - 1)
            seed(i + 1);
        if (y > 0)
            seed(i - SIZE);
        if (y < SIZE - 1)
            seed(i + SIZE);
        if (h > 0)
            seed(i - PLANE);
        if (h < SIZE - 1)
            seed(i + PLANE);
    }
    if (any_block_light)
        spread(block, 1);

    uint any = 0;
    for (uint h = 0; h < OUT_SIZE; h++) {
        for (uint y = 0; y < OUT_SIZE; y++) {
            uint i = ((h + OUT_START) * SIZE + y + OUT_START) * SIZE + OUT_START;
            uint o = (h * OUT_SIZE + y) * OUT_SIZE;
            for (uint x = 0; x < OUT_SIZE; x++, i++, o++) {
                // a lamp's own cell is solid: 0, like every solid cell
                const uint light = is_solid(i) ? 0 : (MAX_LIGHT - sky[i]) | block[i] << 3;
                out[o] = light;
                any |= light;
            }
        }
    }
    return any != 0;
}
