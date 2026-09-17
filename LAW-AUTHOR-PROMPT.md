# LAW AUTHOR — superoptimizer prompt

You are the AUTHOR of a LAW: a total, branchless, self-proving decision
function in C, in the exact form of the reference file `crossing.c`
(attached).  You produce ONE file, `<name>.c`, from the SPEC below.

You do not design the policy.  The SPEC fixes it.  You author exactly
five things and copy everything else from the reference verbatim:

  1. the eight lane expressions          (found by SEARCH, then CERTIFIED)
  2. the names                           (law, acts, hazards)
  3. the header prose                    (same voice, same sections)
  4. the TAUGHT and HELD-OUT tables
  5. the three-level BATCH example

Nothing else changes.  Not the act numbering, not FLOOR, not the gap,
not EMIT, not ctz, not the fold, not one check in the harness.

---------------------------------------------------------------- SPEC ----

LAW        : <NAME>                         e.g. BURN
FILE       : <name>.c                       e.g. burn.c
UNIT       : one <thing ruled>              e.g. one slashing proof
TRIGGER    : <the fact ruled UPSTREAM, never a bit>
                                            e.g. "the evidence VERIFIES"
QUESTION   : <one line>  "the <trigger>.  How much of what it proves can
              still be <undone / a lie / not its fault>, and therefore
              how much <value / stake / payload> may <cross / burn / run>?"
CONSTANT   : <what production hand-writes instead, and what it cannot see>

ACTS
  4 <IRREVERSIBLE>   <one line>   the FLOOR.  Earned by 0x00 and no other.
  3 RESERVED         no lane today.  Returning 3 is a violation.
  2 <REVERSIBLE>     <one line>   an undo exists (escrow, jail, auction,
                                  challenge window, cold storage)
  1 <PENDING>        <one line>   record it, release NOTHING, re-rule when
                                  a measurement completes
  0 <REFUSE>         <one line>   it never enters

HAZARDS   observation bit -> NAME -> tier.  Exactly 2 veto, 2 attest,
          4 degrade.  Positions 0..7 are yours to assign.  Every line
          ends with the failure clause: "..., or <it> could not be
          measured / read / reached".
  bit 0  <NAME>   <tier>   <finding>, or <it> could not be measured
  bit 1  <NAME>   <tier>   ...
  bit 2  <NAME>   <tier>   ...
  bit 3  <NAME>   <tier>   ...
  bit 4  <NAME>   <tier>   ...
  bit 5  <NAME>   <tier>   ...
  bit 6  <NAME>   <tier>   ...
  bit 7  <NAME>   <tier>   ...

TIERS     veto    -> mask bit 0 -> act 0    lane coefficient c = 1
          attest  -> mask bit 1 -> act 1    lane coefficient c = 2
          degrade -> mask bit 2 -> act 2    lane coefficient c = 4
          (nothing)  mask bit 3            RESERVED, no lane
          FLOOR      mask bit 4 -> act 4    the constant bit, always set

WHY       one line each, in the reference's words:
          R1 why a veto refuses          (POSITION: nothing below mask bit 0)
          R3 why attest releases NOTHING, not even into <REVERSIBLE>
             (POSITION: the undo would have nothing to act against)
          R4 why degrade never refuses   (POSITION: slows, never closes)

FOLD UNIT : <what nests>  e.g. a slashing bundle; bundles nest
NOT DECIDED : <amounts, identities, windows, fees, the trigger itself>
FORBIDDEN IN THE FILE : <chain names, contract addresses, block counts,
                        confirmation depths, tokens, prices, epochs, ...>

TAUGHT (5, the harness checks these):
  0x00 -> 4    <veto byte> -> 0    <veto byte> -> 0
  <attest byte> -> 1    <degrade byte> -> 2
HELD-OUT (7, scored apart, must include):
  one attest-only byte -> 1        one degrade-only byte -> 2   (x2)
  one attest+degrade byte -> 1     (narrower outranks wider)
  one veto+anything byte -> 0      0xFF -> 0
  plus the landing pair: crossing(<attest byte>)==1 && crossing(0x00)==4

---------------------------------------------------------- THE FORM ----

Copy from the reference, in this order, changing only names and the
tier-membership literals that the SPEC's bit assignment dictates:

  #include <stdio.h> <stdint.h> <time.h>
  static inline int32_t L_<HAZARD>(int32_t x)   x8, one per hazard
  EMIT(m) = m & (-m)
  #define FLOOR 16   RESERVED 8   GATES 0x00   HAZARDS 0xFF
  MASK(x): x &= 0xFF; return (veto lanes) | (attest lanes) | (degrade
           lanes) | FLOOR;   -- grouped by tier, in tier order
  int32_t <name>(int32_t obs) { return __builtin_ctz(EMIT(MASK(obs))); }
  bracket / lift(o, u)         unchanged
  fold(a, b) = a | b           unchanged
  node / walk                  unchanged, early exit on mask bit 0
  oracle(x)                    the independent branchy if-chain: unpack
                               all 8 bits by the SPEC's positions, test
                               veto bits first, then attest, then degrade,
                               return 4 last.  It shares NO expression
                               with any lane.
  <name>2(x)                   the gap probe, unchanged
  main()                       the harness, unchanged except the veto /
                               att / esc membership literals and the
                               R5 pair (one attest bit AND one degrade
                               bit), the TAUGHT / HELD-OUT tables, the
                               lane-pointer table and its name table,
                               the BATCH example, and the print labels

------------------------------------------------------------ SEARCH ----

Each lane is an expression over x found by search, subject to:

  operators     & | ^ + - << >>  and integer literals only
  forbidden     branches, ?:, comparisons, function calls, tables,
                casts, anything reading a bit the lane does not own
  depth         at most 4 operators
  domain        x is already masked to 0..255 when the lane runs; the
                lane need only be correct there
  certificate   there exist i in 0..7 and c in {1,2,4} such that for
                ALL x in 0..255:   L(x) == c * ((x >> i) & 1)
                with c fixed by the hazard's tier and i by its position
  variety       no two lanes in one file may be the same expression
                shape with only the shift changed; the reference's
                (t)+(t) doubling and its (1^(x>>6))-(1-(x>>6)) are the
                kind of thing search is for
  proof         certify by exhaustive evaluation over 0..255 BEFORE
                emitting the file; the harness re-certifies and prints
                "<NAME> = c * bit_i" for every lane, and counts any lane
                "NO CERTIFICATE" as a violation

--------------------------------------------------- PROOF OBLIGATIONS ----

The harness must compute and print EVERY count below, and TOTAL them.
A non-zero anywhere means the LAW is wrong.  Fix the lane or the table.
Never weaken a check.  Never edit the oracle to agree with the law.

  over / under vs oracle          both 0 over 0..255
  R1  veto -> act 0               R2  act 4 iff byte == 0x00
  R3  attest, no veto -> act 1    R4  degrade only -> act 2
  R5  attest+degrade -> act 1     R6  monotone, 256 x 8 single-bit lifts
  R7  every act in 0..4           RESERVED never returned
  THE THEOREM  act 4 on a non-zero byte: 0
  PARTITION    exactly  SETTLE 1  RESV 0  ESCROW 15  ATTEST 48  REJECT 192
               (this is forced by 2/2/4; any other count is a wrong tier)
  TAUGHT 0     HELD-OUT 0
  L1  lift brackets the truth over all 2^24 (o, u, v)     L2  lift(o,0) == law
  G1  gap unused disturbs nothing    G1b  gap occupied returns 3 on 0x00 only
  F1  ACT(a|b) == min(ACT a, ACT b)  F2 idempotent  F3 commutative+associative
  F4  fold(m, FLOOR) == m            F5 veto anywhere -> 0   F6 ACT(a|b) <= ACT(a)
  BATCH  root 0x00 -> child 0x00 -> leaf carrying one veto bit: act 0
  CERTIFICATE  8 lanes, 0 without
  TOTALITY over all 2^32   acts outside {0,1,2,4}: 0
                           disagreeing with own low byte: 0
                           act 4 on a non-zero low byte: 0
  timing        one ruling in ns (informational, not a violation)
  TOTAL         sum of all counts; return total != 0

ACCEPTANCE
  cc -O2 -Wall -Wextra -Werror -o <name> <name>.c     zero warnings
  ./<name>                                             prints "TOTAL  0 violations", exit 0

------------------------------------------------------------ HEADER ----

The block comment at the top, in the reference's voice, these sections
in this order, no others:

  <name>.c - THE <NAME> LAW.  GENERATED; every lane authored by search.
  one paragraph: what is decided, for ONE <unit>, before <the irreversible act>
  the five acts, 4 down to 0, one line each
  ===== THIS LAW DOES NOT RULE ON <TRIGGER> =====
      what is upstream, that it is binary and solved, and the QUESTION
      this law rules instead
  the CONSTANT production uses, what it cannot see, and that it cannot
      FAIL CLOSED because it cannot tell "measured, fine" from "could
      not measure"
  EVERY BIT IS A HAZARD.  THERE ARE NO GATES.  the eight bits, each with
      its failure clause
  ===== THE IRREVERSIBILITY THEOREM =====  act 4 is the FLOOR, the
      residue of every lane silent, exactly one byte earns it, YOU
      CANNOT <ACT> BY FAILING TO MEASURE, asserted over 256 and 2^32
  ===== WHY =====  R1 POSITION, R2 FLOOR, R3 POSITION, R4 POSITION,
      R5 POSITION and nothing else, R6 from every bit being a hazard,
      R7 the form: one EMIT, one ctz, no branch
  RECURSION.  <units> nest, MASK folds by OR, the weakest rules, a veto
      anywhere refuses the whole, the walk exits at mask bit 0, the
      fold does NOT count - size is a measured bit on the parent
  "No <forbidden list> appears below.  What counts as <each hazard>
      lives in the MEASUREMENT.  The law reads the SITUATION, never
      an amount."
  WHAT IT DOES NOT DECIDE.  <the NOT DECIDED list>

Prose rules: no chain, contract, token, validator or vendor name; no
number except mask bits, act numbers, 256, 2^32; every hazard carries
its failure clause; the trigger is named as upstream exactly once in
the title of its section.

------------------------------------------------------------ OUTPUT ----

Emit only the C file.  Then, after it, on separate lines:
  the compile command
  the run command
  the expected final line:  TOTAL  0 violations

If you cannot certify a lane, do not emit the file.  Say which lane and
why, and stop.

======================================================================
FILLED EXAMPLE SPEC  (BURN)

LAW        : BURN
FILE       : burn.c
UNIT       : one slashing proof
TRIGGER    : the evidence VERIFIES
QUESTION   : the evidence VERIFIES.  How much of what it proves is the
             validator's fault rather than the network's, and therefore
             how much stake may be destroyed?
CONSTANT   : a fixed penalty and a fixed correlation multiplier, chosen
             offline; cannot tell a client-bug mass event from an attack

ACTS
  4 BURN      destroy the stake.  Final.  Nothing returns it.
  3 RESERVED
  2 JAIL      eject from the active set into a state an unjail can reverse
  1 FLAG      record the evidence, the validator stays active, re-rule
  0 REJECT    the proof never enters the queue

HAZARDS
  bit 0 UNVERIFIED  veto     proof did not verify, or could not be checked
  bit 1 UNFINAL     attest   an offending block is not past its chain's
                             own finality marker, or the marker unreadable
  bit 2 FORKED      attest   both headers sit on one observed fork, or the
                             fork view could not be rebuilt
  bit 3 CORRELATED  degrade  slashings this window at or above ceiling, or
                             the window could not be counted
  bit 4 SPLIT       degrade  a consensus-client split is observed, or client
                             diversity could not be measured
  bit 5 DUPLICATE   veto     this offence already ruled, or the ruled-set
                             unreadable
  bit 6 CLOCK       degrade  evidence timestamps and local clock disagree
                             past tolerance, or the drift unmeasured
  bit 7 QUEUE       degrade  exit/slash churn at or above ceiling, or the
                             queue depth unreadable

WHY
  R1 an unverified or duplicate proof destroys nothing: nothing sits
     below mask bit 0
  R3 a proof whose blocks can still be reorged away releases NOTHING,
     not even into JAIL: an unjail is worthless against a reorg that
     deletes the offence the proof was about
  R4 a correlated, split, drifted or queued situation JAILS, it does not
     refuse: a network in trouble slows the burn instead of closing

FOLD UNIT   : a slashing bundle; bundles nest
NOT DECIDED : the penalty amount, the correlation coefficient, the
              evidence window, which validator, whether the proof verifies
FORBIDDEN   : chain names, epoch counts, penalty fractions, validator
              identities, client names

TAUGHT   0x00->4  0x01->0  0x20->0  0x02->1  0x08->2
HELD-OUT 0x04->1  0x10->2  0x40->2  0x80->2  0x84->1  0x21->0  0xFF->0
         landing: crossing(0x02)==1 && crossing(0x00)==4
