/* ntzb.c - EVALUATION HARNESS for two candidate expressions supplied by the author.
 *
 *   expr(x) = 255 & ((x >> 8) + ((x >> 16) - x))              "size 5"
 *   act(x)  = (4 & ntzb(x - 7)) + ntzb(x + (x & 128))
 *   ntzb(v) = index of the lowest set bit of (v & 254)         "which blocking
 *             observation came first"; ntzb(0) := 0 here (no blocker)
 *
 * This file does NOT assert a law. It MEASURES what these expressions do, from
 * several angles, and prints counts. It is fair in the sense that every count is
 * also computed for the CROSSING law in the same run, side by side.
 */
#include <stdio.h>
#include <stdint.h>
#include <time.h>

/* ---- the candidate, branchless ------------------------------------------ */
static inline int32_t ntzb(int32_t v) { return 7 & __builtin_ctz((v & 254) | 256); }
static inline int32_t act_ntzb(int32_t x) { return (4 & ntzb(x - 7)) + ntzb(x + (x & 128)); }
static inline int32_t expr5(int32_t x) { return 255 & ((x >> 8) + ((x >> 16) - x)); }

/* ---- a plain-language re-statement, branchy, for agreement checks -------- */
static int act_plain(int x)
{   x &= 255;
    int first = 0;
    for (int b = 1; b <= 6; b++) if ((x >> b) & 1) { first = b; break; }
    int y = (x - 7) & 254, fb = 0;
    for (int b = 1; b <= 7; b++) if ((y >> b) & 1) { fb = b; break; }
    return (fb >= 4 ? 4 : 0) + first; }

/* ---- the CROSSING law, for the side-by-side ------------------------------ */
static inline int32_t cmask(int32_t x)
{   x &= 0xFF;
    return ((x & 1) | (1 & (x >> 1)))
         | (((x >> 1) & 2) | ((1 & (x >> 3)) + (1 & (x >> 3))))
         | (((x & 16) >> 2) | ((2 & (x >> 4)) << 1) | (((x >> 6) & 1) << 2) | ((1 ^ (x >> 6)) - (1 - (x >> 6))))
         | 16; }
static inline int32_t crossing(int32_t x) { int32_t m = cmask(x); return __builtin_ctz(m & (-m)); }

static const char *HZ[8] = {"UNFUNDED","EXPIRED","UNSIGNED","UNCONFIRMED","DISPUTED","DEPEGGED","PAUSED","THROTTLED"};

int main(void)
{
    printf("== A. STRUCTURE over 0..255\n");
    long n[8] = {0}, agree = 0;
    for (int x = 0; x < 256; x++) { n[act_ntzb(x)]++; if (act_ntzb(x) == act_plain(x)) agree++; }
    printf("   partition of act_ntzb: ");
    for (int a = 0; a < 8; a++) printf("act%d=%ld ", a, n[a]);
    printf("\n   agrees with the plain-language restatement  %ld / 256\n", agree);
    printf("   single-bit bytes: ");
    for (int b = 0; b < 8; b++) printf("1<<%d->%d ", b, act_ntzb(1 << b));
    printf("\n   bytes ruled act 0 (\"no blocker\"): ");
    for (int x = 0; x < 256; x++) if (act_ntzb(x) == 0) printf("0x%02X ", x);
    printf("\n");

    printf("\n== B. LAW-CORE OBLIGATIONS, side by side (violation counts)\n");
    long top_ntzb = 0, top_cross = 0;             /* top act on a non-clean byte */
    long mono_ntzb = 0, mono_cross = 0;           /* a set bit moves the act AWAY from 'blocked' */
    long dep_ntzb[8] = {0}, dep_cross[8] = {0};   /* does act depend on each bit at all */
    for (int x = 0; x < 256; x++) {
        if (x != 0 && act_ntzb(x) == 0) top_ntzb++;
        if (x != 0 && crossing(x) == 4) top_cross++;
        for (int b = 0; b < 8; b++) {
            if (act_ntzb(x) != act_ntzb(x ^ (1 << b))) dep_ntzb[b]++;
            if (crossing(x) != crossing(x ^ (1 << b))) dep_cross[b]++;
            if (!(x & (1 << b))) {
                /* crossing: lower act = more blocked; a hazard may never raise it */
                if (crossing(x | (1 << b)) > crossing(x)) mono_cross++;
                /* ntzb: 0 = proceed, k>0 = blocked by k (lower k = came first);
                   a new bit may never turn 'blocked' into 'proceed', and may never
                   move a blocked byte to a LATER blocker */
                int a0 = act_ntzb(x), a1 = act_ntzb(x | (1 << b));
                if (a0 != 0 && (a1 == 0 || a1 > a0)) mono_ntzb++;
            }
        }
    }
    printf("   THE THEOREM  top act on a non-clean byte      ntzb %ld   crossing %ld\n", top_ntzb, top_cross);
    printf("   MONOTONE     a hazard weakens the ruling      ntzb %ld   crossing %ld   (256 x 8 lifts)\n", mono_ntzb, mono_cross);
    printf("   COVERAGE     bits the ruling never reads      ntzb ");
    for (int b = 0; b < 8; b++) if (dep_ntzb[b] == 0) printf("bit%d ", b);
    printf("| crossing ");
    for (int b = 0; b < 8; b++) if (dep_cross[b] == 0) printf("bit%d ", b);
    printf("(none)\n");
    printf("   bit sensitivity (flips that change the act): ntzb ");
    for (int b = 0; b < 8; b++) printf("b%d=%ld ", b, dep_ntzb[b]);
    printf("\n                                               crossing ");
    for (int b = 0; b < 8; b++) printf("b%d=%ld ", b, dep_cross[b]);
    printf("\n");
    /* fold: is act(a|b) determined by min/first of the parts? */
    long fold_ntzb = 0, fold_cross = 0;
    for (int a = 0; a < 256; a++) for (int b = 0; b < 256; b++) {
        int ca = crossing(a), cb = crossing(b), cab = crossing(a | b);
        if (cab != (ca < cb ? ca : cb)) fold_cross++;
        int na = act_ntzb(a), nb = act_ntzb(b), nab = act_ntzb(a | b);
        int expect = (na == 0) ? nb : (nb == 0) ? na : (na < nb ? na : nb);
        if (nab != expect) fold_ntzb++;
    }
    printf("   FOLD by OR   act(a|b) != first(act a, act b)  ntzb %ld   crossing %ld   (65,536 pairs)\n", fold_ntzb, fold_cross);

    printf("\n== C. THE ESCROW'S OWN SITUATIONS (crossing bit layout: bit0 UNFUNDED .. bit7 THROTTLED)\n");
    const int S[] = {0x00,0x04,0x08,0x0C,0x10,0x14,0x18,0x1C,0x01,0x02,0x06,0x20,0x40,0x80,0x81,0x21,0x84,0xFF};
    const char *SN[] = {"clean","unsigned","unconfirmed","unsigned+unconfirmed","disputed","unsigned+disputed",
        "unconfirmed+disputed","unsigned+unconfirmed+disputed","UNFUNDED","EXPIRED","expired+unsigned",
        "depegged","paused","THROTTLED","throttled+UNFUNDED","depegged+UNFUNDED","throttled+unsigned","everything"};
    printf("   %-32s %-6s %-9s %-9s %s\n", "situation", "byte", "crossing", "ntzb", "note");
    for (unsigned i = 0; i < sizeof(S)/sizeof(S[0]); i++) {
        int x = S[i], c = crossing(x), a = act_ntzb(x);
        const char *note = "";
        if (x != 0 && a == 0) note = "<- ntzb PROCEEDS on a hazard";
        else if (c == 0 && a >= 5) note = "<- veto escalated to a late blocker";
        printf("   %-32s 0x%02X   act %d     act %d     %s\n", SN[i], x, c, a, note);
    }
    printf("   (crossing: 4 SETTLE, 2 ESCROW, 1 ATTEST, 0 REJECT.  ntzb: 0 no blocker, k = first blocking bit)\n");
    printf("   ntzb never reads bit 0 (%s) or bit 7 (%s) as a blocker.\n", HZ[0], HZ[7]);

    printf("\n== D. THE SIZE-5 EXPRESSION  expr(x) = 255 & ((x>>8) + ((x>>16) - x))\n");
    /* as a lane over one byte: certificate search */
    int ci = -1, cc = 0;
    for (int i = 0; i < 8 && ci < 0; i++) { int c = expr5(1 << i), ok = (c != 0);
        for (int x = 0; x < 256 && ok; x++) if (expr5(x) != c * ((x >> i) & 1)) ok = 0;
        if (ok) { ci = i; cc = c; } }
    if (ci < 0) printf("   as a LANE over one byte: NO CERTIFICATE (it is (256 - x) & 255, negation, not c*bit_i)\n");
    else printf("   as a LANE: = %d * bit_%d\n", cc, ci);
    /* as a fold of three observation bytes b0,b1,b2: expr == (b1 + b2 - b0) & 255 */
    long vanish = 0, phantom = 0, identity = 0, total = 0;
    for (int b0 = 0; b0 < 256; b0++) for (int b1 = 0; b1 < 256; b1++) for (int b2 = 0; b2 < 256; b2++) {
        int x = b0 | (b1 << 8) | (b2 << 16), e = expr5(x), u = b0 | b1 | b2;
        total++;
        if (u != 0 && e == 0) vanish++;                 /* hazards present, result clean */
        if ((e & ~u) != 0) phantom++;                   /* a bit set that no input had  */
        if (e == u) identity++;                         /* equals the OR fold           */
    }
    printf("   as a FOLD of three bytes (b1 + b2 - b0) over all 2^24 triples:\n");
    printf("     hazards present but result clean (vanish)   %ld\n", vanish);
    printf("     result sets a bit no input had (phantom)    %ld\n", phantom);
    printf("     equals the OR fold                          %ld / %ld\n", identity, total);
    printf("     example: b1=0x80,b2=0x80,b0=0 -> 0x%02X ; b1=0x01,b0=0x01 -> 0x%02X ; b0=0x01 alone -> 0x%02X\n",
           expr5(0x808000), expr5(0x000101), expr5(0x000001));

    printf("\n== E. TOTALITY over all 2^32 (both kernels)\n");
    long t1 = 0, t2 = 0, t3 = 0; uint32_t u = 0;
    for (;;) { int32_t x = (int32_t)u;
        int a = act_ntzb(x);
        if (a < 0 || a > 7) t1++;
        if (a != act_ntzb(x & 0xFF)) t2++;
        if (crossing(x) != crossing(x & 0xFF)) t3++;
        if (u == 0xFFFFFFFFu) break;
        u++; }
    printf("   ntzb acts outside 0..7 %ld   ntzb disagrees with own byte %ld   crossing disagrees with own byte %ld\n", t1, t2, t3);

    printf("\n== F. TIMING (informational)\n");
    { struct timespec t0, t1s; volatile int32_t sink = 0; const long N = 100000000L;
      clock_gettime(CLOCK_MONOTONIC, &t0);
      for (long i = 0; i < N; i++) sink += act_ntzb((int32_t)i);
      clock_gettime(CLOCK_MONOTONIC, &t1s);
      double ns = ((t1s.tv_sec - t0.tv_sec) * 1e9 + (t1s.tv_nsec - t0.tv_nsec)) / (double)N;
      clock_gettime(CLOCK_MONOTONIC, &t0);
      for (long i = 0; i < N; i++) sink += crossing((int32_t)i);
      clock_gettime(CLOCK_MONOTONIC, &t1s);
      double ns2 = ((t1s.tv_sec - t0.tv_sec) * 1e9 + (t1s.tv_nsec - t0.tv_nsec)) / (double)N;
      printf("   one ruling: ntzb %.2f ns   crossing %.2f ns\n", ns, ns2); (void)sink; }
    return 0;
}
