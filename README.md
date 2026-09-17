# CROSSING — a non-custodial stablecoin settlement escrow ruled by a LAW

Cross-border settlements today pay intermediaries, wait days, and trust a counterparty.
CROSSING locks a stablecoin payment in a smart contract and releases it **programmatically**
when the settlement proof attests (m-of-n approver signatures and/or an on-chain oracle
confirmation), with built-in timeout refunds, a reversible hold with arbitration, a guardian
pause, a Chainlink-style peg check and a volume throttle.

What is different: the release decision is **not an if-chain**. It is a LAW — a total,
branchless, monotone, self-proving decision function (`law/crossing.c`) in the exact form of
the user's law family (`LAW-AUTHOR-PROMPT.md`). The contract *measures* eight hazard bits;
the law *rules*. The same law is authored three times (C, Solidity, TypeScript) and every
port is checked against the same oracle and tables. The C harness proves it exhaustively
over all 256 bytes, 2^24 lift brackets and all 2^32 inputs: **TOTAL 0 violations**.

```
                 ┌────────────────────── SITUATION BYTE (measured on-chain) ──────────────────────┐
  bit 0 UNFUNDED   veto     bit 2 UNSIGNED    attest    bit 4 DISPUTED  degrade   bit 6 PAUSED    degrade
  bit 1 EXPIRED    veto     bit 3 UNCONFIRMED attest    bit 5 DEPEGGED  degrade   bit 7 THROTTLED degrade
                 └───────────────────────────────┬───────────────────────────────────────────────┘
                                                 ▼
             MASK = (veto lanes) | (attest lanes) | (degrade lanes) | FLOOR      act = ctz(MASK & -MASK)
                                                 ▼
   act 4 SETTLE  → funds cross to the payee (final)            act 1 ATTEST → recorded, nothing moves
   act 2 ESCROW  → Held: reversible, arbiter may act, re-rule  act 0 REJECT → the crossing never enters
```

## What is in the box

| path | what |
|---|---|
| `law/crossing.c` | THE CROSSING LAW: 8 searched lanes, the kernel, the fold/lift/walk, an independent oracle, and a harness that prints every proof obligation and `TOTAL 0 violations` |
| `contracts/` | Hardhat 3 project: `CrossingLaw.sol` (the law, ported lane-for-lane), `SettlementEscrow.sol` (measurement + state machine + funds), mocks, 46 Solidity tests incl. fuzz, deploy script, `GAS.md` |
| `frontend/` | React 19 + Vite + wagmi 2 + viem 2 + RainbowKit dApp: live state machine, the hazard byte as LEDs, the law's trace, token flow, event timeline, role-aware actions, and a Law Explorer that cross-checks the client port against the on-chain kernel |
| `docs/SPEC.md` | the build specification (law, protocol, interface, tests, UI) |
| `docs/ARCHITECTURE.md` | roles, state machine, measurement table, sequence diagrams, trust model |
| `docs/AUDIT.md` | self-audit against the mentor guidelines (reentrancy, CEI, gas, dispute/timeout logic, wallet UX) with evidence and known limitations |
| `docs/LAW-EVALUATION.md` | "use the laws and see will it work": what the law form buys and does not buy for escrow, with the evidence and a verdict |

## Quickstart (three terminals)

Requirements: Node 20+, npm, a C compiler (clang/gcc). Foundry is **not** required.

```bash
# terminal 1 — local chain
cd contracts && npm install && npx hardhat node
```

```bash
# terminal 2 — deploy + seed two demo escrows, writes frontend/src/generated/{deployment.json,abis.ts}
cd contracts && npm run deploy:local
```

```bash
# terminal 3 — the dApp on http://localhost:5173
cd frontend && npm install && npm run dev
```

The dApp opens in **Demo roles** mode: a dropdown switches the active signer between
Payer, Payee, Approver A/B/C, Oracle operator, Arbiter, Guardian and Feed operator using the
public Hardhat dev keys (local only). Switch to **Wallet** mode for RainbowKit / MetaMask on
the `localhost:8545` network (chain id 31337).

## Demo script (every transition, in about five minutes)

1. **SETTLE by multisig** — open escrow #1; as *Approver A* click *Approve*: the timeline shows
   `Ruled obs 0x04 → act 1 ATTEST` (one signature short, nothing moves). As *Approver B* click
   *Approve*: `Ruled 0x00 → act 4 SETTLE`, `Settled`, the payee balance jumps, the state
   machine lights *Settled*.
2. **ESCROW by dispute, resolved by the arbiter** — escrow #2 (quorum + oracle + peg): as
   *Payer* click *Open dispute* (`0x1C → ATTEST`: narrower outranks wider); approve as A and B
   (`0x18 → ATTEST`); as *Oracle operator* click *Confirm off-chain proof*; click *Run the law*
   (`0x10 → act 2 ESCROW`): the escrow is **Held** with a countdown, *Run the law* is disabled
   during the window, and the *Arbiter* gets *Dismiss / Release / Refund*.
3. **Guardian pause** — as *Guardian* click *Pause rail*; any clean crossing now rules ESCROW
   (Held), never REJECT; refunds still work while paused. Unpause, skip the window with
   *⏩ +10 min*, *Run the law* → SETTLE.
4. **Peg check** — on an escrow with the peg check on, as *Feed operator* click *Price 0.97* or
   *Mark stale*: DEPEGGED lights and the crossing holds; *Price 1.00* / *Mark fresh* clears it.
5. **Throttle** — as *Guardian* set *cap 30k / 1h*; a 120k crossing holds (THROTTLED).
6. **Timeout refund** — on a live escrow click *⏩ +8 days*: EXPIRED lights, the law says
   REJECT even with a full quorum, and the *Payer* can *Refund*. The *Payee* can *Cancel*
   at any time.
7. **Law Explorer** — toggle the eight bits; the TypeScript port and the on-chain kernel rule
   side by side and the trace explains each ruling by POSITION / FLOOR.

## Verify everything

```bash
cd law && cc -O2 -Wall -Wextra -Werror -o crossing crossing.c && ./crossing   # expects: TOTAL  0 violations
```

```bash
cd contracts && npx hardhat test          # 46 passing (law obligations + every escrow transition + fuzz)
```

```bash
cd frontend && npm test && npm run build   # 9 law-port tests; typed build
```

## Results snapshot

- `law/crossing.c`: zero warnings under `-Wall -Wextra -Werror`; every count 0; partition exact
  (SETTLE 1 · RESV 0 · ESCROW 15 · ATTEST 48 · REJECT 192); 8/8 lane certificates; 2^32 totality
  sweep clean; one ruling ≈ 1.3 ns.
- Solidity: 46 tests passing, including reentrancy on settle and on refund, fee-on-transfer
  (UNFUNDED), reverting / gas-guzzling / codeless oracle (UNCONFIRMED), stale and codeless feed
  (DEPEGGED), pause, throttle, every dispute verdict, hold-window enforcement, deadline refund,
  payee cancel, batch fold, and a 256-run fuzz over the full `uint256` input.
- Gas (warm, excl. 21k base): approve + rule 19.3k · rule 11.1k · approve + SETTLE 44.0k ·
  refund 10.9k · open 318k. See `contracts/GAS.md`.

## Trust model in one breath

No role can move funds anywhere but to the payee or the payer, and only through: the law
(SETTLE), an arbiter while the escrow is Held, the payer's refund after the deadline, or the
payee's cancel. The guardian can pause and throttle — both only raise a hazard bit — and can
never block a refund. Every external dependency (token, oracle, feed) is read through a
gas-capped `staticcall` in `try/catch`; when it fails, its hazard is set. **You cannot settle
by failing to measure.**
