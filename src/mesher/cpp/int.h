#pragma once
typedef unsigned int uint;
// typedef int i32;
static_assert(sizeof(uint) == 4, "uint must be 32-bit");
static_assert(sizeof(int) == 4, "i32 must be 32-bit");