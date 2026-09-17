/* clock_gettime shim for NATIVE Windows builds of the law harness (MSVC-target clang).
 *
 * The law files are unchanged: this header is injected with `-include` so that
 * <time.h>'s missing clock_gettime / CLOCK_MONOTONIC (used only by the timing line)
 * resolve to QueryPerformanceCounter. On Linux, macOS, WSL, MinGW and Cygwin it
 * compiles to nothing.
 *
 *   clang -O2 -Wall -Wextra -Werror -include law\win32\clock_gettime_shim.h -o crossing.exe law\crossing.c
 */
#ifndef CROSSING_WIN32_SHIM_H
#define CROSSING_WIN32_SHIM_H
#if defined(_WIN32) && !defined(__MINGW32__) && !defined(__CYGWIN__)
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <time.h>
#ifndef CLOCK_MONOTONIC
#define CLOCK_MONOTONIC 1
#endif
static inline int clock_gettime(int clk, struct timespec *ts)
{
    LARGE_INTEGER f, c;
    (void)clk;
    QueryPerformanceFrequency(&f);
    QueryPerformanceCounter(&c);
    ts->tv_sec = (time_t)(c.QuadPart / f.QuadPart);
    ts->tv_nsec = (long)((c.QuadPart % f.QuadPart) * 1000000000LL / f.QuadPart);
    return 0;
}
#endif
#endif
