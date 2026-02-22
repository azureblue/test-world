#include "int.h"
const uint N_GRADS_2D_SHIFT = 58;
const uint N_GRADS_2D_MASK = 254;

static double GRADIENTS_2D[256] = {
    6.980896610132626, 16.853375273706543, 16.853375273706543, 6.980896610132626,
    16.853375273706543, -6.980896610132626, 6.980896610132626, -16.853375273706543,
    -6.980896610132626, -16.853375273706543, -16.853375273706543, -6.980896610132626,
    -16.853375273706543, 6.980896610132626, -6.980896610132626, 16.853375273706543,
    2.3810538312857545, 18.085899431608684, 11.105002821476075, 14.472321442420789,
    14.472321442420789, 11.105002821476075, 18.085899431608684, 2.3810538312857363,
    18.085899431608684, -2.3810538312857363, 14.472321442420789, -11.105002821476058,
    11.105002821476075, -14.472321442420789, 2.3810538312857545, -18.085899431608684,
    -2.3810538312857545, -18.085899431608684, -11.105002821476075, -14.472321442420789,
    -14.472321442420789, -11.105002821476075, -18.085899431608684, -2.3810538312857545,
    -18.085899431608684, 2.3810538312857363, -14.472321442420789, 11.105002821476075,
    -11.105002821476075, 14.472321442420789, -2.3810538312857545, 18.085899431608684,
    6.980896610132626, 16.853375273706543, 16.853375273706543, 6.980896610132626,
    16.853375273706543, -6.980896610132626, 6.980896610132626, -16.853375273706543,
    -6.980896610132626, -16.853375273706543, -16.853375273706543, -6.980896610132626,
    -16.853375273706543, 6.980896610132626, -6.980896610132626, 16.853375273706543,
    2.3810538312857545, 18.085899431608684, 11.105002821476075, 14.472321442420789,
    14.472321442420789, 11.105002821476075, 18.085899431608684, 2.3810538312857363,
    18.085899431608684, -2.3810538312857363, 14.472321442420789, -11.105002821476058,
    11.105002821476075, -14.472321442420789, 2.3810538312857545, -18.085899431608684,
    -2.3810538312857545, -18.085899431608684, -11.105002821476075, -14.472321442420789,
    -14.472321442420789, -11.105002821476075, -18.085899431608684, -2.3810538312857545,
    -18.085899431608684, 2.3810538312857363, -14.472321442420789, 11.105002821476075,
    -11.105002821476075, 14.472321442420789, -2.3810538312857545, 18.085899431608684,
    6.980896610132626, 16.853375273706543, 16.853375273706543, 6.980896610132626,
    16.853375273706543, -6.980896610132626, 6.980896610132626, -16.853375273706543,
    -6.980896610132626, -16.853375273706543, -16.853375273706543, -6.980896610132626,
    -16.853375273706543, 6.980896610132626, -6.980896610132626, 16.853375273706543,
    2.3810538312857545, 18.085899431608684, 11.105002821476075, 14.472321442420789,
    14.472321442420789, 11.105002821476075, 18.085899431608684, 2.3810538312857363,
    18.085899431608684, -2.3810538312857363, 14.472321442420789, -11.105002821476058,
    11.105002821476075, -14.472321442420789, 2.3810538312857545, -18.085899431608684,
    -2.3810538312857545, -18.085899431608684, -11.105002821476075, -14.472321442420789,
    -14.472321442420789, -11.105002821476075, -18.085899431608684, -2.3810538312857545,
    -18.085899431608684, 2.3810538312857363, -14.472321442420789, 11.105002821476075,
    -11.105002821476075, 14.472321442420789, -2.3810538312857545, 18.085899431608684,
    6.980896610132626, 16.853375273706543, 16.853375273706543, 6.980896610132626,
    16.853375273706543, -6.980896610132626, 6.980896610132626, -16.853375273706543,
    -6.980896610132626, -16.853375273706543, -16.853375273706543, -6.980896610132626,
    -16.853375273706543, 6.980896610132626, -6.980896610132626, 16.853375273706543,
    2.3810538312857545, 18.085899431608684, 11.105002821476075, 14.472321442420789,
    14.472321442420789, 11.105002821476075, 18.085899431608684, 2.3810538312857363,
    18.085899431608684, -2.3810538312857363, 14.472321442420789, -11.105002821476058,
    11.105002821476075, -14.472321442420789, 2.3810538312857545, -18.085899431608684,
    -2.3810538312857545, -18.085899431608684, -11.105002821476075, -14.472321442420789,
    -14.472321442420789, -11.105002821476075, -18.085899431608684, -2.3810538312857545,
    -18.085899431608684, 2.3810538312857363, -14.472321442420789, 11.105002821476075,
    -11.105002821476075, 14.472321442420789, -2.3810538312857545, 18.085899431608684,
    6.980896610132626, 16.853375273706543, 16.853375273706543, 6.980896610132626,
    16.853375273706543, -6.980896610132626, 6.980896610132626, -16.853375273706543,
    -6.980896610132626, -16.853375273706543, -16.853375273706543, -6.980896610132626,
    -16.853375273706543, 6.980896610132626, -6.980896610132626, 16.853375273706543,
    2.3810538312857545, 18.085899431608684, 11.105002821476075, 14.472321442420789,
    14.472321442420789, 11.105002821476075, 18.085899431608684, 2.3810538312857363,
    18.085899431608684, -2.3810538312857363, 14.472321442420789, -11.105002821476058,
    11.105002821476075, -14.472321442420789, 2.3810538312857545, -18.085899431608684,
    -2.3810538312857545, -18.085899431608684, -11.105002821476075, -14.472321442420789,
    -14.472321442420789, -11.105002821476075, -18.085899431608684, -2.3810538312857545,
    -18.085899431608684, 2.3810538312857363, -14.472321442420789, 11.105002821476075,
    -11.105002821476075, 14.472321442420789, -2.3810538312857545, 18.085899431608684,
    6.980896610132626, 16.853375273706543, 16.853375273706543, 6.980896610132626,
    16.853375273706543, -6.980896610132626, 6.980896610132626, -16.853375273706543,
    -6.980896610132626, -16.853375273706543, -16.853375273706543, -6.980896610132626,
    -16.853375273706543, 6.980896610132626, -6.980896610132626, 16.853375273706543};

const uint64 PRIME_X = 0x5205402B9270C86Full;
const uint64 PRIME_Y = 0x598CD327003817B5ull;
const uint64 HASH_MULTIPLIER = 0x53A3F72DEEC546F5ull;
const double SKEW_2D = 0.366025403784439;
const double UNSKEW_2D = -0.21132486540518713;
const double RSQUARED_2D = 2.0 / 3.0;   

double grad2(uint64 seed, uint64 xsvp, uint64 ysvp, double dx, double dy) {
    uint64 hash = seed ^ xsvp ^ ysvp;
    hash = hash * HASH_MULTIPLIER;
    hash = hash ^ (hash >> N_GRADS_2D_SHIFT);
    uint gi = hash & N_GRADS_2D_MASK;
    return GRADIENTS_2D[gi | 0] * dx + GRADIENTS_2D[gi | 1] * dy;
}

/**
    2D  OpenSimplex2S/SuperSimplex noise base.
*/
double open_simplex_2_noise_unskewed_base(uint64 seed, double xs, double ys) {
    // Get base points and offsets.
    int64 xsb = __builtin_floor(xs);
    int64 ysb = __builtin_floor(ys);
    double xi = xs - xsb;
    double yi = ys - ysb;

    // Prime pre-multiplication for hash.
    uint64 xsbp = static_cast<uint64>(xsb) * PRIME_X;
    uint64 ysbp = static_cast<uint64>(ysb) * PRIME_Y;
    // Unskew.
    double t = (xi + yi) * UNSKEW_2D;
    double dx0 = xi + t;
    double dy0 = yi + t;

    // First vertex.
    double a0 = 2.0 / 3.0 - dx0 * dx0 - dy0 * dy0;
    double value = (a0 * a0) * (a0 * a0) * grad2(seed, xsbp, ysbp, dx0, dy0);

    // Second vertex.

    const double K1 = 2.0 * (1.0 + 2.0 * UNSKEW_2D) * (1.0 / UNSKEW_2D + 2.0);
    const double K2 = -2.0 * (1.0 + 2.0 * UNSKEW_2D) * (1.0 + 2.0 * UNSKEW_2D);
    const double DX1DY1 = 1.0 + 2.0 * UNSKEW_2D;
    double a1 = K1 * t + (K2 + a0);
    double dx1 = dx0 - DX1DY1;
    double dy1 = dy0 - DX1DY1;

    value += (a1 * a1) * (a1 * a1) * grad2(seed, xsbp + PRIME_X, ysbp + PRIME_Y, dx1, dy1);

    // Third and fourth vertices.
    // Nested conditionals were faster than compact bit logic/arithmetic.
    double xmyi = xi - yi;
    if (t < UNSKEW_2D) {
        if (xi + xmyi > 1.0) {
            double dx2 = dx0 - (3.0 * UNSKEW_2D + 2.0);
            double dy2 = dy0 - (3.0 * UNSKEW_2D + 1.0);
            double a2 = RSQUARED_2D - dx2 * dx2 - dy2 * dy2;
            if (a2 > 0.0) {
                value += (a2 * a2) * (a2 * a2) * grad2(seed, xsbp + (PRIME_X << 1), ysbp + PRIME_Y, dx2, dy2);
            }
        } else {
            double dx2 = dx0 - UNSKEW_2D;
            double dy2 = dy0 - (UNSKEW_2D + 1.0);
            double a2 = RSQUARED_2D - dx2 * dx2 - dy2 * dy2;
            if (a2 > 0.0) {
                value += (a2 * a2) * (a2 * a2) * grad2(seed, xsbp, ysbp + PRIME_Y, dx2, dy2);
            }
        }

        if (yi - xmyi > 1.0) {
            double dx3 = dx0 - (3.0 * UNSKEW_2D + 1.0);
            double dy3 = dy0 - (3.0 * UNSKEW_2D + 2.0);
            double a3 = RSQUARED_2D - dx3 * dx3 - dy3 * dy3;
            if (a3 > 0.0) {
                value += (a3 * a3) * (a3 * a3) * grad2(seed, xsbp + PRIME_X, ysbp + (PRIME_Y << 1), dx3, dy3);
            }
        } else {
            double dx3 = dx0 - (UNSKEW_2D + 1.0);
            double dy3 = dy0 - UNSKEW_2D;
            double a3 = RSQUARED_2D - dx3 * dx3 - dy3 * dy3;
            if (a3 > 0.0) {
                value += (a3 * a3) * (a3 * a3) * grad2(seed, xsbp + PRIME_X, ysbp, dx3, dy3);
            }
        }
    } else {
        if (xi + xmyi < 0.0) {
            double dx2 = dx0 + (1.0 + UNSKEW_2D);
            double dy2 = dy0 + UNSKEW_2D;
            double a2 = RSQUARED_2D - dx2 * dx2 - dy2 * dy2;
            if (a2 > 0.0) {
                value += (a2 * a2) * (a2 * a2) * grad2(seed, xsbp - PRIME_X, ysbp, dx2, dy2);
            }
        } else {
            double dx2 = dx0 - (UNSKEW_2D + 1.0);
            double dy2 = dy0 - UNSKEW_2D;
            double a2 = RSQUARED_2D - dx2 * dx2 - dy2 * dy2;
            if (a2 > 0.0) {
                value += (a2 * a2) * (a2 * a2) * grad2(seed, xsbp + PRIME_X, ysbp, dx2, dy2);
            }
        }
        if (yi < xmyi) {
            double dx2 = dx0 + UNSKEW_2D;
            double dy2 = dy0 + (UNSKEW_2D + 1.0);
            double a2 = RSQUARED_2D - dx2 * dx2 - dy2 * dy2;
            if (a2 > 0.0) {
                value += (a2 * a2) * (a2 * a2) * grad2(seed, xsbp, ysbp - PRIME_Y, dx2, dy2);
            }
        } else {
            double dx2 = dx0 - UNSKEW_2D;
            double dy2 = dy0 - (UNSKEW_2D + 1.0);
            double a2 = RSQUARED_2D - dx2 * dx2 - dy2 * dy2;
            if (a2 > 0.0) {
                value += (a2 * a2) * (a2 * a2) * grad2(seed, xsbp, ysbp + PRIME_Y, dx2, dy2);
            }
        }
    }
    return value;
}

/**
    2D OpenSimplex2S/SuperSimplex noise, standard lattice orientation.
*/
extern "C"
__attribute__((export_name("open_simplex_2_noise")))
double open_simplex_2_noise(int seed, double x, double y) {
    // Get points for A2* lattice
    double s = SKEW_2D * (x + y);
    double xs = x + s;
    double ys = y + s;
    return open_simplex_2_noise_unskewed_base(seed, xs, ys);
}

extern "C"
__attribute__((export_name("open_simplex_2_noise_fbm")))
double open_simplex_2_noise_fbm(
    int seed,
    double x,
    double y,
    double frequency,
    uint octaves,
    double lacunarity,
    double gain) {
    double sum = 0.0;
    double amplitude = 1.0;
    double total_amplitude = 0.0;

    for (uint i = 0; i < octaves; i++) {
        uint64 octave_seed = seed ^ (i * 0x27D4EB2D);
        double scaled = open_simplex_2_noise(octave_seed, x * frequency, y * frequency);
        sum += scaled * amplitude;
        total_amplitude += amplitude;
        frequency *= lacunarity;
        amplitude *= gain;
    }
    return sum / total_amplitude;
}

extern "C"
__attribute__((export_name("open_simplex_2_noise_fill")))
void open_simplex_2_noise_fill(
    double* out_ptr,
    uint out_len,
    int seed, double x, double y, uint xs, uint ys, double step) {
    double* out = out_ptr;
    for (uint iy = 0; iy < ys; iy++) {
        for (uint ix = 0; ix < xs; ix++) {
            uint idx = iy * xs + ix;
            out[idx] = open_simplex_2_noise(seed, x + step * ix, y + step * iy);
        }
    }
}
