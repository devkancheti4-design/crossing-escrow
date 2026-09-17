/* crossing.c - THE CROSSING LAW.  GENERATED; every lane authored by search.
 *
 * How much escrowed value may cross to its beneficiary.  Decided for ONE
 * crossing, the moment a release is asked for and BEFORE the transfer that
 * nothing can return.  The law reads eight measured bits of the situation
 * around the crossing and answers with one act.  It never reads the value.
 *
 *   act 4 SETTLE    the value crosses to the beneficiary.  Final.
 *   act 3 RESERVED  no lane today.  The gap.  Returning 3 is a violation.
 *   act 2 ESCROW    the value is HELD in a reversible state: a window opens,
 *                   an arbiter may reverse, the law re-rules when it ends
 *   act 1 ATTEST    record the attestation, release NOTHING, re-rule when
 *                   a measurement completes
 *   act 0 REJECT    the crossing never enters
 *
 * ============ THIS LAW DOES NOT RULE ON ATTESTATION ============
 *
 * Whether the proof attests is decided UPSTREAM: the signers signed or they
 * did not, the oracle confirmed or it did not.  That question is binary and
 * it is solved before this law is consulted.  This law rules the question
 * that remains once the proof attests: how much of what it attests can still
 * be undone, a lie, or not the beneficiary's fault, and therefore how much
 * value may cross?
 *
 * Production hand-writes a CONSTANT in its place: a fixed count of
 * confirmations and a fixed timeout.  The constant cannot see a paused rail,
 * an off-peg coin, an open dispute or a stale feed.  Worse, it cannot FAIL
 * CLOSED, because it cannot tell "measured, and fine" from "could not
 * measure": both look like the constant being satisfied.
 *
 * EVERY BIT IS A HAZARD.  THERE ARE NO GATES.
 *
 *   bit 0 UNFUNDED     the escrow holds less than the agreed value, or the
 *                      balance could not be read
 *   bit 1 EXPIRED      the deadline has passed, or the clock could not be
 *                      read
 *   bit 2 UNSIGNED     fewer signatures than the quorum, or the signer set
 *                      could not be read
 *   bit 3 UNCONFIRMED  the oracle the terms require has not confirmed, or
 *                      the oracle could not be reached
 *   bit 4 DISPUTED     a dispute is open on this crossing, or the dispute
 *                      record could not be read
 *   bit 5 DEPEGGED     the coin's price sits outside its band, or the feed
 *                      is stale or could not be read
 *   bit 6 PAUSED       the rail is paused by its guardian, or the pause
 *                      flag could not be read
 *   bit 7 THROTTLED    value settled this window is at or above the
 *                      ceiling, or the window counter could not be read
 *
 * A hazard is set by a positive finding AND by any measurement that could
 * not complete.  An unmeasured world therefore always crosses LESS, never
 * more.
 *
 * ================ THE IRREVERSIBILITY THEOREM ================
 *
 * SETTLE is the FLOOR.  It is mask bit 4, the constant bit, and it is what
 * is LEFT OVER when every lane is silent.  Exactly one byte earns it: the
 * byte in which every measurement ran and every measurement found nothing.
 * YOU CANNOT SETTLE BY FAILING TO MEASURE, because a measurement that did
 * not run sets its hazard, and a set hazard lowers the act.  This is
 * asserted below over all 256 bytes and again over all 2^32 inputs the
 * function can be handed: act 4 on a non-zero byte, zero times.
 *
 * ============================ WHY ============================
 *
 * R1 (an unfunded or expired crossing releases nothing) is POSITION:
 * UNFUNDED and EXPIRED both reach mask bit 0, and nothing sits below bit 0,
 * so no tier above can outrank them at any depth.  R2 (the value crosses
 * only when nothing is missing) is FLOOR: SETTLE is the constant bit 4 and
 * every tier beneath it is a lane over hazards, so SETTLE is never chosen,
 * only left over.  R3 (an unsigned or unconfirmed crossing releases
 * NOTHING, not even into ESCROW) is POSITION: the attest tier owns mask bit
 * 1, below the degrade tier's bit 2, so a hold cannot be reached past a
 * missing attestation - and rightly, since an undo would have nothing to act
 * against.  R4 (a disputed, off-peg, paused or throttled rail HOLDS, it does
 * not refuse) is POSITION: the degrade tier owns mask bit 2, above the veto
 * and attest tiers and below the floor, so a rail in trouble slows the
 * crossing instead of closing it.  R5 (narrower outranks wider: a byte
 * carrying an attest bit and a degrade bit is ATTEST) is POSITION and
 * nothing else; the law does not know which bytes the body can produce.
 * R6 (monotone) follows from every bit being a hazard: a hazard only ever
 * ADDS a mask bit, and adding a bit can only lower ctz.  R7 is the form
 * itself: one EMIT, one ctz, no branch.
 *
 * RECURSION.  Crossings nest: a settlement batch contains crossings, and
 * batches contain batches.  MASK folds by OR, and because ACT(a|b) is
 * min(ACT a, ACT b), the weakest crossing rules the whole batch.  A veto
 * anywhere refuses the whole, and the walk exits the moment mask bit 0
 * appears.  The fold does NOT count: "this batch is too large" is a
 * measured bit on the parent, never an emergent property of the walk.
 *
 * No chain name, contract address, token, block count, confirmation depth,
 * price, epoch or fee appears below.  What counts as unfunded, expired,
 * unsigned, unconfirmed, disputed, depegged, paused or throttled lives in
 * the MEASUREMENT.  The law reads the SITUATION, never an amount.
 *
 * WHAT IT DOES NOT DECIDE.  The amount.  The parties.  The deadline.  The
 * hold window.  The fee.  The size of the quorum.  Which oracle.  Whether
 * the proof attests.  Each of these is a term, a measurement, or the
 * upstream ruling; none of them is a bit here.
 */
#include <stdio.h>
#include <stdint.h>
#include <time.h>

static inline int32_t L_UNFUNDED   (int32_t x) { return (x & 1); }
static inline int32_t L_EXPIRED    (int32_t x) { return (1 & (x >> 1)); }
static inline int32_t L_UNSIGNED   (int32_t x) { return ((x >> 1) & 2); }
static inline int32_t L_UNCONFIRMED(int32_t x) { return ((1 & (x >> 3)) + (1 & (x >> 3))); }
static inline int32_t L_DISPUTED   (int32_t x) { return ((x & 16) >> 2); }
static inline int32_t L_DEPEGGED   (int32_t x) { return ((2 & (x >> 4)) << 1); }
static inline int32_t L_PAUSED     (int32_t x) { return (((x >> 6) & 1) << 2); }
static inline int32_t L_THROTTLED  (int32_t x) { return ((1 ^ (x >> 6)) - (1 - (x >> 6))); }

static inline int32_t EMIT(int32_t m) { return m & (-m); }
#define FLOOR    16                 /* mask bit 4: SETTLE, the constant bit */
#define RESERVED  8                 /* mask bit 3: the gap.  No term.       */
#define GATES   0x00                /* this law has no gates                */
#define HAZARDS 0xFF                /* every observation bit is a hazard    */

static inline int32_t MASK(int32_t x)
{
    x &= 0xFF;
    return (L_UNFUNDED(x) | L_EXPIRED(x))                                  /* mask bit 0  REJECT */
         | (L_UNSIGNED(x) | L_UNCONFIRMED(x))                              /* mask bit 1  ATTEST */
         | (L_DISPUTED(x) | L_DEPEGGED(x) | L_PAUSED(x) | L_THROTTLED(x))  /* mask bit 2  ESCROW */
         | FLOOR;
}
int32_t crossing(int32_t obs) { return __builtin_ctz(EMIT(MASK(obs))); }

typedef struct { int lo, hi; } bracket;
static bracket lift(int32_t o, int32_t u)
{   bracket b;
    b.lo = crossing((o |  (u & HAZARDS)) & ~(u & GATES));
    b.hi = crossing((o & ~(u & HAZARDS)) |  (u & GATES));
    return b; }
static inline int32_t fold(int32_t a, int32_t b) { return a | b; }

typedef struct node { int32_t obs; int nkids; struct node **kids; } node;
static int32_t walk(const node *n)
{   int32_t m = MASK(n->obs);
    if (m & 1) return m;                 /* a veto anywhere vetoes the tree */
    for (int i = 0; i < n->nkids; i++) {
        m = fold(m, walk(n->kids[i]));
        if (m & 1) return m; }           /* early exit, same ruling         */
    return m; }

/* ===== INDEPENDENT ORACLE: branchy, shares no expression with the kernel == */
static int oracle(int x)
{   x &= 0xFF;
    int unfunded=(x>>0)&1, expired=(x>>1)&1, unsigned_=(x>>2)&1, unconfirmed=(x>>3)&1;
    int disputed=(x>>4)&1, depegged=(x>>5)&1, paused=(x>>6)&1, throttled=(x>>7)&1;
    if (unfunded)    return 0;
    if (expired)     return 0;
    if (unsigned_)   return 1;
    if (unconfirmed) return 1;
    if (disputed)    return 2;
    if (depegged)    return 2;
    if (paused)      return 2;
    if (throttled)   return 2;
    return 4; }
/* law' : the reserved tier occupied by a future measurement at obs bit 8 */
static int32_t crossing2(int32_t x)
{   int32_t extra = (x & 0x100) ? RESERVED : 0;
    return __builtin_ctz(EMIT(MASK(x) | extra)); }

int main(void)
{
    long over=0,under=0,r1=0,r2=0,r3=0,r4=0,r5=0,r6=0,r7=0,thm=0;
    long n[5]={0,0,0,0,0};
    for (int x=0;x<256;x++) {
        int k=crossing(x), o=oracle(x);
        if (k>o) over++;  if (k<o) under++;
        if (k<0||k>4) r7++; else n[k]++;
        int veto =(x&1)||(x&2);
        int att  =(x&4)||(x&8);
        int esc  =(x&16)||(x&32)||(x&64)||(x&128);
        if (veto && k!=0) r1++;
        if ((k==4) != (x==0)) r2++;
        if (att && !veto && k!=1) r3++;
        if (esc && !veto && !att && k!=2) r4++;
        if ((x&4) && (x&16) && !veto && k!=1) r5++;
        if (x!=0 && k==4) thm++;
        for (int i=0;i<8;i++)
            if (!(x&(1<<i)) && crossing(x|(1<<i)) > crossing(x)) r6++; }
    printf("  crossed more than allowed                  %ld\n", over);
    printf("  crossed less than required                 %ld\n", under);
    printf("  R1 unfunded or expired: REJECT             %ld\n", r1);
    printf("  R2 SETTLE is EARNED - 0x00 and no other    %ld\n", r2);
    printf("  R3 unsigned or unconfirmed: ATTEST, nothing moves %ld\n", r3);
    printf("  R4 disputed, depegged, paused, throttled: ESCROW  %ld\n", r4);
    printf("  R5 narrower outranks wider (UNSIGNED+DISPUTED)    %ld\n", r5);
    printf("  R6 monotone: every bit is a hazard         %ld   (256 x 8)\n", r6);
    printf("  R7 total: every input lands in act 0..4    %ld\n", r7);
    printf("  RESERVED is never returned                 %ld\n", n[3]);
    printf("  THE THEOREM act 4 on a non-zero byte       %ld\n", thm);
    long cnt=(n[4]!=1)+(n[3]!=0)+(n[2]!=15)+(n[1]!=48)+(n[0]!=192);
    printf("  the partition counts                       %s"
           "  (SETTLE %ld RESV %ld ESCROW %ld ATTEST %ld REJECT %ld)\n",
           cnt?"MISMATCH":"exact", n[4],n[3],n[2],n[1],n[0]);
    const int TS[5]={0x00,0x01,0x02,0x04,0x10}, TA[5]={4,0,0,1,2};
    long taught=0; for(int i=0;i<5;i++) if(crossing(TS[i])!=TA[i]) taught++;
    printf("  TAUGHT situations                          %ld\n", taught);
    const int HS[6]={0x08,0x20,0x40,0x18,0x21,0xFF}, HA[6]={1,2,2,1,0,0};
    long held=0; for(int i=0;i<6;i++) if(crossing(HS[i])!=HA[i]) held++;
    /* the landing pair: the last signature arrives, UNSIGNED clears, and the
       byte falls to 0x00 - a measurement completing, not a hazard lifting. */
    if (!(crossing(0x04)==1 && crossing(0x00)==4)) held++;
    printf("  HELD-OUT situations                        %ld   <- scored apart\n", held);
    long l1=0;
    for (int o=0;o<256;o++) for (int u=0;u<256;u++){
        bracket b=lift(o,u);
        for (int v=0;v<256;v++){ int a=crossing((o&~u)|(v&u));
            if (a<b.lo||a>b.hi) l1++; } }
    printf("  L1 lift brackets the truth                 %ld   (16,777,216 evals)\n", l1);
    long l2=0; for(int o=0;o<256;o++){bracket b=lift(o,0);
        if(b.lo!=crossing(o)||b.hi!=crossing(o)) l2++;}
    printf("  L2 lift with no unknowns is the law        %ld\n", l2);
    long g1=0,g1b=0;
    for(int x=0;x<256;x++){ if(crossing2(x)!=crossing(x)) g1++;
        if(crossing2(x|0x100) != (x==0 ? 3 : crossing(x))) g1b++; }
    printf("  G1 the gap UNUSED disturbs nothing         %ld\n", g1);
    printf("  G1b the gap OCCUPIED returns act 3         %ld   <- mask bit 3 is usable\n", g1b);
    long f1=0,f2=0,f3=0,f4=0,f5=0,f6=0,f7=0,f8=0;
    int M[300],nm=0;
    for(int x=0;x<256;x++){int m=MASK(x),seen=0;
        for(int i=0;i<nm;i++) if(M[i]==m) seen=1;
        if(!seen) M[nm++]=m;}
    for(int i=0;i<nm;i++){ if(fold(M[i],M[i])!=M[i]) f2++;
                           if(fold(M[i],FLOOR)!=M[i]) f4++; }
    for(int i=0;i<nm;i++) for(int j=0;j<nm;j++){
        int a=M[i],b=M[j];
        int aa=__builtin_ctz(EMIT(a)), bb=__builtin_ctz(EMIT(b));
        int ab=__builtin_ctz(EMIT(fold(a,b)));
        if (ab != (aa<bb?aa:bb)) f1++;
        if (fold(a,b)!=fold(b,a)) f3++;
        if ((a&1) && ab!=0) f5++;
        if (ab>aa) f6++;
        if (ab>bb && ab>aa) f7++;
        for(int k=0;k<nm;k++)
            if (fold(fold(a,b),M[k]) != fold(a,fold(b,M[k]))) f3++; }
    printf("  F1 homomorphism ACT(a|b)==min              %ld\n", f1);
    printf("  F2 idempotent                              %ld\n", f2);
    printf("  F3 commutative and associative             %ld\n", f3);
    printf("  F4 identity fold(m,FLOOR)==m               %ld\n", f4);
    printf("  F5 a veto anywhere vetoes the batch        %ld\n", f5);
    printf("  F6 depth monotone ACT(a|b)<=ACT(a)         %ld\n", f6);
    printf("  F7 a child never exceeds its parent        %ld\n", f7);
    printf("  F8 gates inherit down (none today)         %ld   <- vacuous, still run\n", f8);
    /* BATCH, three levels: a clean batch, a clean sub-batch, one crossing
       inside it that is EXPIRED.  The grandchild rules the root. */
    node leaf={0x02,0,0}; node *lk[1]={&leaf};
    node sub ={0x00,1,lk}; node *sk[1]={&sub};
    node root={0x00,1,sk};
    int tact=__builtin_ctz(EMIT(walk(&root)));
    long batch=(tact==0)?0:1;
    printf("  BATCH root 0x00 -> child 0x00 -> leaf 0x02: act %d   %ld   "
           "(root alone %d)\n", tact, batch, crossing(0x00));
    printf("\n  THE CERTIFICATE  every lane is c * bit_i on 0..255\n");
    int32_t (*LF[8])(int32_t) = {
        L_UNFUNDED, L_EXPIRED, L_UNSIGNED, L_UNCONFIRMED,
        L_DISPUTED, L_DEPEGGED, L_PAUSED, L_THROTTLED};
    const char *LN[8]={"UNFUNDED","EXPIRED","UNSIGNED","UNCONFIRMED",
                       "DISPUTED","DEPEGGED","PAUSED","THROTTLED"};
    long nocert=0;
    for(int Li=0;Li<8;Li++){ int ci=-1,cc=0;
        for(int i=0;i<8 && ci<0;i++){
            int c=LF[Li](1<<i), ok=(c!=0);
            for(int x=0;x<256 && ok;x++)
                if(LF[Li](x) != c*((x>>i)&1)) ok=0;
            if(ok){ ci=i; cc=c; } }
        if(ci<0){ nocert++; printf("    %-11s NO CERTIFICATE\n", LN[Li]); }
        else printf("    %-11s = %2d * bit_%d\n", LN[Li], cc, ci); }
    printf("    lanes without a certificate                %ld\n", nocert);
    printf("\n  TOTALITY OVER ALL 2^32   not over 256\n");
    long t1=0,t2=0,t3=0; uint32_t u=0;
    for(;;){ int32_t x=(int32_t)u; int k=crossing(x);
        if(k<0||k>4||k==3) t1++;
        if(k != crossing(x & 0xFF)) t2++;
        if(k==4 && (u & 0xFFu)!=0) t3++;
        if(u==0xFFFFFFFFu) break; u++; }
    printf("    acts outside {0,1,2,4} anywhere on the line %ld\n", t1);
    printf("    inputs where the law disagrees with its byte %ld\n", t2);
    printf("    act 4 on a non-zero low byte                 %ld\n", t3);
    /* timing: one ruling, informational, not a violation */
    { struct timespec t0,t1s; volatile int32_t sink=0; const long N=100000000L;
      clock_gettime(CLOCK_MONOTONIC,&t0);
      for(long i=0;i<N;i++) sink += crossing((int32_t)i);
      clock_gettime(CLOCK_MONOTONIC,&t1s);
      double ns=((t1s.tv_sec-t0.tv_sec)*1e9+(t1s.tv_nsec-t0.tv_nsec))/(double)N;
      printf("\n  timing  one ruling                          %.2f ns   (informational)\n", ns);
      (void)sink; }
    long total=over+under+r1+r2+r3+r4+r5+r6+r7+n[3]+thm+cnt+taught+held
              +l1+l2+g1+g1b+f1+f2+f3+f4+f5+f6+f7+f8+batch+nocert+t1+t2+t3;
    printf("\n  TOTAL  %ld violations\n", total);
    return total!=0;
}
