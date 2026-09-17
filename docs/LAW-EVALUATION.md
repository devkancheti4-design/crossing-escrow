# "Use the laws and see will it work for it" — evaluation

The question: can a LAW in the user's form — a total, branchless, monotone, self-proving
decision function over eight measured hazard bits — serve as the release engine of a
non-custodial cross-border settlement escrow? Short answer: **yes, and it makes the escrow
better than the hand-written version**, with two honest caveats about what the law does not do.

## 1. What was done

- Authored `law/crossing.c` from the LAW-AUTHOR-PROMPT spec: 2 veto, 2 attest, 4 degrade
  hazards; SETTLE as the FLOOR; eight distinct searched lanes, each certified `c · bit_i` over
  0..255. Harness output: every count 0, partition exact (1/0/15/48/192), L1 over 2^24, totality
  over 2^32, one ruling in 1.3 ns, `TOTAL 0 violations`, zero compiler warnings.
- Ported the law lane-for-lane to Solidity (`CrossingLaw`) and TypeScript (`crossing.ts`), each
  with the same oracle, the same TAUGHT/HELD-OUT tables, the same partition; the dApp cross-checks
  the client ruling against the on-chain kernel on every render.
- Wrapped the law in a contract that only *measures* (`observe`) and *acts* (`_rule`): the state
  machine has exactly four live transitions and the law chooses among them.

## 2. What the law buys the escrow

1. **Fail-closed by construction.** Every bit is a hazard, so "could not measure" is the same as
   "found the hazard". A dead oracle, a stale feed, a token whose `balanceOf` reverts, all *lower*
   the act. The constant-based design (fixed confirmations + timeout) cannot express this. Test
   evidence: reverting, gas-guzzling and codeless oracle/feeds all produce ATTEST/ESCROW, never a
   revert, never SETTLE.
2. **Precedence without comparisons.** REJECT > ATTEST > ESCROW > SETTLE is bit geometry (POSITION).
   "A dispute cannot outrank a missing signature" is not a rule in the code; it is the fact that
   mask bit 1 sits below mask bit 2. That removed an entire class of ordering bugs from the escrow.
3. **Monotone, therefore safe to extend.** Adding a hazard can only lower rulings (R6/G1). A new
   compliance screen next month gets bit 8 and cannot accidentally open a path to SETTLE.
4. **A single sanctioned path to irreversibility.** `act 4` is the FLOOR and is earned by 0x00 only
   (THE THEOREM, checked over 2^32). The contract has one place where value moves by the law, and
   it is reachable only when every measurement ran and found nothing.
5. **Batches for free.** OR on masks is min on acts, so `previewBatch` rules a settlement batch by
   its weakest crossing, with an early exit on any veto; no accumulator, no ordering.
6. **Gas.** The law is ~40 gas and the whole ruling path is ~11k; the constant-based version is not
   cheaper and cannot be audited by exhaustive enumeration.
7. **Three ports, one certificate.** Because the law is total over 256 bytes, every port is checked
   exhaustively, and a mismatch between the UI's explanation and the chain's ruling is impossible
   without a failing test. This is what let the dApp *explain* every ruling in the law's own words.

## 3. What the law does not do (and where the risk actually lives)

1. **It reads the situation, never an amount.** Amounts, parties, deadlines, fees, quorum size,
   and "does the proof attest" are terms and measurements. Partial releases or milestones would be
   *separate units* (separate escrows) that a batch can fold, not something the law computes.
2. **The measurement is still code.** `observe` is ~60 lines of Solidity, and that is where policy
   and bugs live (what "depegged" means, what the gas cap is, when a window rolls). The law made
   this boundary explicit and testable, it did not remove it.
3. **A lying measurement is invisible.** An oracle that says "confirmed" falsely, a feed that
   reports 1.00 during a depeg, are inputs the law trusts. Decentralised sources and the quorum
   are the mitigation; the law's contribution is that a *silent* or *broken* source fails closed.
4. **The fold does not count.** "Too many held crossings" or "too much volume" must be measured
   bits at the parent (THROTTLED is exactly that); they never emerge from the walk.
5. **Reversibility needs a mechanism outside the law.** `act 2` is "an undo exists"; the escrow
   supplies the undo (a hold window plus an arbiter). The law decides *that* a crossing is held,
   the contract decides *how* it can be reversed.

## 4. Evidence table

| claim | evidence |
|---|---|
| law correct on every byte | `crossing.c`: over/under vs oracle 0; `CrossingLaw.t.sol::test_Exhaustive_AgreesWithOracle`; `crossing.test.ts` |
| SETTLE only on 0x00 | THEOREM 0 over 256 and over 2^32; Solidity fuzz `testFuzz_Totality` |
| partition 1/0/15/48/192 | all three ports |
| lanes certified | 8/8 in C, `test_Certificates_*` in Solidity, vitest certificates |
| monotone | R6 256×8 in C and Solidity and TypeScript |
| batch fold is min | F1–F6 in C; `test_Fold_*`; `test_PreviewBatch_TheFoldIsMin` |
| fail-closed measurement | reverting / gas-guzzling / codeless oracle and feed tests |
| escrow transitions | 46 Solidity tests; UI runs of SETTLE (escrow #1) and ESCROW → arbiter Release (escrow #2) |
| gas | `contracts/GAS.md` |

## 5. Verdict

The law form fits escrow release unusually well because release is a **one-way door**: the
whole design question is "what must be true before the irreversible act", and that is exactly
what a FLOOR-plus-hazard-lanes kernel encodes. It worked without a single special case in the
contract — every "but what if X and Y at once" resolved by bit position, and the tests for those
combinations were written *after* the kernel and passed unchanged.

Recommended next steps if this goes beyond a hackathon: (1) EIP-712 approvals so the quorum is
one transaction; (2) a dispute bond to close the griefing window; (3) a per-token throttle;
(4) a ninth hazard for compliance screening at observation bit 8 (the gap is reserved and
proven not to disturb existing rulings); (5) an external audit of `observe` — the one place the
law cannot protect.
