#pragma once
typedef unsigned int uint;
typedef unsigned long long uint64;
typedef long long int64;
static_assert(sizeof(uint) == 4, "uint must be 32-bit");
static_assert(sizeof(uint64) == 8, "uint64 must be 64-bit");
static_assert(sizeof(int64) == 8, "int64 must be 64-bit");