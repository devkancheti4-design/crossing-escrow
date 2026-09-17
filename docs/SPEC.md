# CROSSING — non-custodial stablecoin settlement escrow ruled by a LAW

This is the build specification. Every agent building a part of this project
reads this file first and treats it as the contract between parts. Paths are
relative to the project root `/Users/kanchetidevieswar/hackathon 17,18`
(note the space and comma: always quote the path).

## 0. What is being built

A non-custodial escrow protocol for cross-border settlements in stablecoins.
Funds are locked in a smart contract by a PAYER for a PAYEE. Release is
programmatic: multi-signature consensus (m-of-n approvers) and/or an on-chain
oracle confirmation of an off-chain proof. Safety: a deadline with payer
refund, a reversible HOLD with an arbiter, a guardian pause, a peg check via
a Chainlink-style price feed, and a volume throttle.

The release decision is NOT written as an if-chain. It is a LAW: a total,
branchless, monotone, self-proving decision function in the exact form of the
user's law family (reference kernels: `~/neos/miner.c`, `~/neo/phone/route.c`,
generator prompt: `LAW-AUTHOR-PROMPT.md` in the project root). The law reads
an 8-bit SITUATION byte measured by the contract and returns one of five
acts. The same law is authored three times, byte-identical in behaviour:

1. `law/crossing.c` — the C kernel with its self-proving harness (the
   deliverable the LAW-AUTHOR-PROMPT asks for).
2. `contracts/contracts/CrossingLaw.sol` — the Solidity port used on-chain.
3. `frontend/src/law/crossing.ts` — the TypeScript port used by the dApp to
   explain rulings client-side.

Three ports, one certificate: every port is checked exhaustively over 0..255
against an independent branchy oracle and against the same TAUGHT/HELD-OUT
tables.

Deliverables also include a Hardhat 3 project with Solidity tests, a React +
wagmi + viem + RainbowKit dApp, and docs (README, ARCHITECTURE, AUDIT,
LAW-EVALUATION: "does the law work for escrow?").

## 1. THE CROSSING LAW

```
LAW        : CROSSING
FILE       : crossing.c
UNIT       : one crossing (one release of escrowed value to its beneficiary)
TRIGGER    : the settlement proof ATTESTS   (ruled upstream: signers signed,
             the oracle confirmed. Binary, solved, never a bit here)
QUESTION   : the proof ATTESTS.  How much of what it attests can still be
             undone, a lie, or not the beneficiary's fault, and therefore how
             much value may cross?
CONSTANT   : production hand-writes a fixed confirmation count and a fixed
             timeout; it cannot see a paused rail, an off-peg coin, an open
             dispute or a stale feed, and it cannot FAIL CLOSED because it
             cannot tell "measured, fine" from "could not measure".

ACTS
  4 SETTLE    the value crosses to the beneficiary.  Final.  The FLOOR;
              earned by 0x00 and no other byte.
  3 RESERVED  no lane today.  Returning 3 is a violation.
  2 ESCROW    the value is HELD in a reversible state: a hold window opens,
              an arbiter may reverse, the law re-rules when the window ends.
  1 ATTEST    record the attestation, release NOTHING, re-rule when a
              measurement completes (another signature, the oracle).
  0 REJECT    the crossing never enters.

HAZARDS  (exactly 2 veto, 2 attest, 4 degrade; every line ends with its
          failure clause; positions are tier-ordered bottom-up)
  bit 0  UNFUNDED     veto     the escrow holds less than the agreed value,
                               or the balance could not be read
  bit 1  EXPIRED      veto     the deadline has passed, or the clock could
                               not be read
  bit 2  UNSIGNED     attest   fewer signatures than the quorum, or the
                               signer set could not be read
  bit 3  UNCONFIRMED  attest   the oracle the terms require has not
                               confirmed, or the oracle could not be reached
  bit 4  DISPUTED     degrade  a dispute is open on this crossing, or the
                               dispute record could not be read
  bit 5  DEPEGGED     degrade  the coin's price sits outside its band, or
                               the feed is stale or could not be read
  bit 6  PAUSED       degrade  the rail is paused by its guardian, or the
                               pause flag could not be read
  bit 7  THROTTLED    degrade  value settled this window is at or above the
                               ceiling, or the window counter could not be read

TIERS    veto    -> mask bit 0 -> act 0   c = 1
         attest  -> mask bit 1 -> act 1   c = 2
         degrade -> mask bit 2 -> act 2   c = 4
         (nothing)  mask bit 3            RESERVED, no lane
         FLOOR      mask bit 4 -> act 4   the constant bit, always set

WHY
  R1 an unfunded or expired crossing releases nothing: nothing sits below
     mask bit 0.                                                 (POSITION)
  R3 an unsigned or unconfirmed crossing releases NOTHING, not even into
     ESCROW: a hold is worthless when there is no attestation for the undo
     to act against.                                             (POSITION)
  R4 a disputed, off-peg, paused or throttled rail HOLDS, it does not
     refuse: a rail in trouble slows the crossing instead of closing it.
                                                                 (POSITION)
FOLD UNIT   : a settlement batch; batches nest
NOT DECIDED : the amount, the parties, the deadline, the hold window, the
              fee, the quorum size, which oracle, whether the proof attests
FORBIDDEN IN THE FILE : chain names, contract addresses, token names,
              block counts, confirmation depths, prices, epochs, fees

TAUGHT (5)   0x00->4   0x01->0   0x02->0   0x04->1   0x10->2
HELD-OUT (7) 0x08->1 (attest-only)   0x20->2  0x40->2 (degrade-only x2)
             0x18->1 (attest+degrade: narrower outranks wider)
             0x21->0 (veto+anything)   0xFF->0
             landing pair: crossing(0x04)==1 && crossing(0x00)==4
PARTITION    SETTLE 1  RESV 0  ESCROW 15  ATTEST 48  REJECT 192
R5 pair      (x & 0x04) && (x & 0x10) && no veto  -> act 1
```

### 1.1 The eight lanes (already certified exhaustively over 0..255)

Each lane is branchless, uses only `& | ^ + - << >>` and integer literals,
depth <= 4, and every lane has a DISTINCT expression shape (not the same
shape with only the shift changed):

```c
static inline int32_t L_UNFUNDED   (int32_t x) { return (x & 1); }
static inline int32_t L_EXPIRED    (int32_t x) { return (1 & (x >> 1)); }
static inline int32_t L_UNSIGNED   (int32_t x) { return ((x >> 1) & 2); }
static inline int32_t L_UNCONFIRMED(int32_t x) { return ((1 & (x >> 3)) + (1 & (x >> 3))); }
static inline int32_t L_DISPUTED   (int32_t x) { return ((x & 16) >> 2); }
static inline int32_t L_DEPEGGED   (int32_t x) { return ((2 & (x >> 4)) << 1); }
static inline int32_t L_PAUSED     (int32_t x) { return (((x >> 6) & 1) << 2); }
static inline int32_t L_THROTTLED  (int32_t x) { return ((1 ^ (x >> 6)) - (1 - (x >> 6))); }
```
Certificates: UNFUNDED = 1*bit_0, EXPIRED = 1*bit_1, UNSIGNED = 2*bit_2,
UNCONFIRMED = 2*bit_3, DISPUTED = 4*bit_4, DEPEGGED = 4*bit_5,
PAUSED = 4*bit_6, THROTTLED = 4*bit_7.

```c
static inline int32_t EMIT(int32_t m) { return m & (-m); }
#define FLOOR 16
#define RESERVED 8
#define GATES 0x00
#define HAZARDS 0xFF
static inline int32_t MASK(int32_t x) {
    x &= 0xFF;
    return (L_UNFUNDED(x) | L_EXPIRED(x))
         | (L_UNSIGNED(x) | L_UNCONFIRMED(x))
         | (L_DISPUTED(x) | L_DEPEGGED(x) | L_PAUSED(x) | L_THROTTLED(x))
         | FLOOR;
}
int32_t crossing(int32_t obs) { return __builtin_ctz(EMIT(MASK(obs))); }
```

### 1.2 `law/crossing.c` — the form

Copy the form of `~/neos/miner.c` (which is the closest reference to the
prompt's crossing form) and add what `LAW-AUTHOR-PROMPT.md` requires:

- `#include <stdio.h> <stdint.h> <time.h>`
- the header block comment in the voice of `~/neo/phone/route.c`, with the
  sections and order listed under HEADER in `LAW-AUTHOR-PROMPT.md`
  (title line; one paragraph; the five acts; `===== THIS LAW DOES NOT RULE
  ON ATTESTATION =====`; the CONSTANT paragraph; `EVERY BIT IS A HAZARD.
  THERE ARE NO GATES.` with the eight bits; `===== THE IRREVERSIBILITY
  THEOREM =====`; `===== WHY =====` R1..R7; RECURSION; the "No ... appears
  below" line; WHAT IT DOES NOT DECIDE). Prose rules: no chain, contract,
  token, validator or vendor name; no number except mask bits, act numbers,
  256, 2^32.
- the eight lanes exactly as in 1.1, `EMIT`, `FLOOR 16`, `RESERVED 8`,
  `GATES 0x00`, `HAZARDS 0xFF`, `MASK` grouped by tier, `crossing()`.
- `bracket`/`lift`, `fold`, `node`/`walk` unchanged from the reference.
- `oracle(x)`: an independent branchy if-chain, unpack all 8 bits, veto
  first, then attest, then degrade, return 4 last. Shares no expression with
  any lane.
- `crossing2(x)`: the gap probe (bit 8 occupies RESERVED).
- `main()`: the harness, printing EVERY count below and a TOTAL:
  over/under vs oracle; R1 veto->0; R2 act 4 iff byte==0x00; R3 attest, no
  veto ->1; R4 degrade only ->2; R5 attest+degrade ->1; R6 monotone
  (256 x 8 single-bit lifts); R7 every act in 0..4; RESERVED never
  returned; THE THEOREM (act 4 on a non-zero byte: 0); PARTITION exact
  (SETTLE 1 RESV 0 ESCROW 15 ATTEST 48 REJECT 192); TAUGHT; HELD-OUT
  (scored apart); L1 (2^24 evals); L2; G1; G1b; F1..F6 (plus F7/F8 as the
  reference prints them); BATCH (root 0x00 -> child 0x00 -> leaf carrying
  one veto bit: act 0, three levels); CERTIFICATE (8 lanes, prints
  `NAME = c * bit_i`, counts NO CERTIFICATE); TOTALITY over all 2^32 (acts
  outside {0,1,2,4}: 0; disagreeing with own low byte: 0; act 4 on a
  non-zero low byte: 0); timing (one ruling in ns, informational); TOTAL.
- Acceptance: `cc -O2 -Wall -Wextra -Werror -o crossing crossing.c` with
  zero warnings, `./crossing` prints `TOTAL  0 violations` and exits 0.
  The 2^32 sweep must be written so -O2 cannot elide it (accumulate into
  the printed counters; it takes a few seconds, which is fine).

## 2. Protocol design (smart contracts)

### 2.1 Roles

| Role | Power |
|---|---|
| Payer | opens and funds an escrow; may dispute; may refund after the deadline |
| Payee | beneficiary; may dispute; may cancel (refund the payer) at any time before finality |
| Approvers (n, quorum m) | each may `approve(id)` once; approvals are recorded and the law re-rules |
| Oracle (per escrow, optional) | an external contract implementing `ISettlementOracle.isConfirmed(id)`; the escrow PULLS it during measurement |
| Price feed (per escrow, optional) | Chainlink `AggregatorV3Interface`; pulled during measurement |
| Arbiter (per escrow, optional) | may act ONLY while the escrow is Held: Release, Refund, or Dismiss a dispute |
| Guardian (protocol owner) | may pause/unpause and set the throttle. Can NEVER move funds, and can never block a payer refund. Pause only raises a hazard bit and blocks `open()` |

Non-custodial: no role can move funds except to the two addresses fixed at
open (payee or payer), and only through the law (SETTLE), the arbiter during
a Held window, the deadline refund, or the payee's cancel.

### 2.2 State machine

```
State { None, Open, Held, Settled, Refunded }

open(terms)             -> Open        msg.sender is the payer; pulls `amount` of `token`;
                                       funded = balance delta (fee-on-transfer safe); no rule yet
approve(id)             Open|Held      approver not yet approved; sets bit; count++;
                                       if Open: _rule(id); if Held: record only
dispute(id)             Open|Held      payer or payee; !disputed; disputed = true;
                                       if Open: _rule(id); if Held: record only
rule(id)                Open|Held      ANYONE (permissionless crank); in Held requires
                                       block.timestamp >= heldUntil; _rule(id)
resolve(id, Dismiss)    Open|Held      arbiter; requires disputed; disputed=false; _rule(id)
                                       (bypasses the heldUntil check: the arbiter is the
                                       party authorised during the window)
resolve(id, Release)    Held           arbiter; -> Settled; transfer `funded` to payee
resolve(id, Refund)     Held           arbiter; -> Refunded; transfer `funded` to payer
refund(id)              Open|Held      payee at any time (cancel), OR payer when
                                       block.timestamp > deadline AND (state==Open OR
                                       block.timestamp >= heldUntil); -> Refunded;
                                       transfer `funded` to payer. Works while paused.
```

`_rule(id)`:
```
obs = observe(id); act = CrossingLaw.rule(obs)
e.lastObs = obs; e.lastAct = act; emit Ruled(id, obs, act)
act == 4 (SETTLE): state = Settled; windowVolume += amount; emit Settled; transfer funded to payee (last)
act == 2 (ESCROW): state = Held; heldUntil = block.timestamp + holdWindow (extends if already Held); emit HeldFor
act == 1 (ATTEST): nothing moves; recorded
act == 0 (REJECT): nothing moves; recorded (no revert: the crank is informational)
act == 3: impossible by construction; if it ever occurred, revert (defensive)
```
Rationale for the Held window: during the window the crossing is reversible
by the arbiter only; the law cannot settle mid-window, so an "undo exists".
After the window, anyone may re-rule; a still-degraded situation re-holds.

Griefing note (document in AUDIT.md): a payer may dispute near the deadline;
the arbiter has the hold window to resolve; after it, the payer can refund.
This is the designed default ("funds return to their owner when the rail
cannot prove otherwise"). Mitigations for production: a dispute bond and an
arbiter SLA. Not implemented here.

### 2.3 The measurement `observe(id) -> uint8 obs` (this is where policy lives)

Each bit is set by a positive finding AND by any failure to measure:

| bit | name | set when |
|---|---|---|
| 0 | UNFUNDED | `funded < amount`, OR `token.balanceOf(escrow)` reverts, OR that balance `< funded` |
| 1 | EXPIRED | `block.timestamp > deadline` (deadline == 0 counts as unreadable and sets the bit) |
| 2 | UNSIGNED | `approvalCount < quorum` (quorum 0 = no signatures required, bit clear) |
| 3 | UNCONFIRMED | `oracle != 0` AND (`oracle.isConfirmed(id)` returns false OR reverts OR runs out of the capped gas) |
| 4 | DISPUTED | `disputed == true` |
| 5 | DEPEGGED | `priceFeed != 0` AND (`latestRoundData()` or `decimals()` reverts, OR `answer <= 0`, OR `updatedAt == 0`, OR `block.timestamp - updatedAt > FEED_HEARTBEAT`, OR `|answer - 10^dec| * 10000 > PEG_BAND_BPS * 10^dec`) |
| 6 | PAUSED | `paused()` |
| 7 | THROTTLED | `throttleCap != 0` AND `currentWindowVolume + amount > throttleCap` (window rolls every `throttleWindow` seconds; a volume from a past window counts as 0) |

External measurement calls (`balanceOf`, `isConfirmed`, `latestRoundData`,
`decimals`) are `view` staticcalls wrapped in `try/catch` with an explicit
gas cap (e.g. `{gas: 100_000}`) so a malicious or broken dependency can only
SET its hazard, never revert or grief the crossing. `observe`/`preview` are
`view` and used by the dApp for real-time display without a transaction.

### 2.4 Exact Solidity interface (both the contracts agent and the frontend agent use this verbatim)

Solidity `^0.8.28`, OpenZeppelin Contracts `5.6.x`.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface ISettlementOracle {
    /// @notice true once the off-chain proof for escrow `id` has been validated
    function isConfirmed(uint256 id) external view returns (bool);
}

/// Chainlink AggregatorV3Interface subset used for the peg check
interface IAggregatorV3 {
    function decimals() external view returns (uint8);
    function latestRoundData() external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
}

interface ISettlementEscrow {
    enum State { None, Open, Held, Settled, Refunded }
    enum Verdict { Dismiss, Release, Refund }

    struct Terms {
        address   payee;
        address   token;
        uint128   amount;
        uint40    deadline;     // unix seconds, > block.timestamp
        uint32    holdWindow;   // seconds, > 0
        uint8     quorum;       // 0..approvers.length
        address[] approvers;    // <= 16, unique, non-zero
        address   oracle;       // 0 = no oracle required
        address   priceFeed;    // 0 = no peg check
        address   arbiter;      // 0 = no arbiter
        bytes32   termsHash;    // hash of the off-chain invoice / contract
    }

    struct EscrowView {
        address   payer;
        address   payee;
        address   token;
        uint128   amount;
        uint128   funded;
        uint40    deadline;
        uint32    holdWindow;
        uint40    heldUntil;
        uint8     quorum;
        uint8     approvalCount;
        uint16    approvals;    // bitmap over approvers[]
        address[] approvers;
        address   oracle;
        address   priceFeed;
        address   arbiter;
        bytes32   termsHash;
        State     state;
        bool      disputed;
        uint8     lastObs;
        uint8     lastAct;
    }

    event Opened(uint256 indexed id, address indexed payer, address indexed payee, address token, uint128 amount, uint128 funded, uint40 deadline);
    event Approved(uint256 indexed id, address indexed approver, uint8 approvalCount, uint8 quorum);
    event Disputed(uint256 indexed id, address indexed by);
    event Ruled(uint256 indexed id, uint8 obs, uint8 act);
    event HeldFor(uint256 indexed id, uint40 heldUntil);
    event Resolved(uint256 indexed id, address indexed arbiter, Verdict verdict);
    event Settled(uint256 indexed id, address indexed to, uint128 amount);
    event Refunded(uint256 indexed id, address indexed to, uint128 amount);
    event ThrottleSet(uint128 cap, uint32 window);

    error NotPayer(); error NotParty(); error NotApprover(); error NotArbiter();
    error AlreadyApproved(); error AlreadyDisputed(); error NotDisputed();
    error BadState(); error HoldActive(); error DeadlineNotPassed();
    error BadTerms(string reason); error ReservedAct();

    function open(Terms calldata t) external returns (uint256 id);
    function approve(uint256 id) external;
    function dispute(uint256 id) external;
    function rule(uint256 id) external returns (uint8 act);
    function resolve(uint256 id, Verdict v) external;
    function refund(uint256 id) external;

    function observe(uint256 id) external view returns (uint8 obs);
    function preview(uint256 id) external view returns (uint8 obs, uint8 act);
    function getEscrow(uint256 id) external view returns (EscrowView memory);
    function escrowCount() external view returns (uint256);

    function pause() external;
    function unpause() external;
    function paused() external view returns (bool);
    function setThrottle(uint128 cap, uint32 window) external;
    function throttle() external view returns (uint128 cap, uint32 window, uint128 windowVolume, uint40 windowStart);
    function PEG_BAND_BPS() external view returns (uint256);
    function FEED_HEARTBEAT() external view returns (uint256);
}
```

`SettlementEscrow is ISettlementEscrow, Ownable (guardian), Pausable, ReentrancyGuard`.
Constructor: `(address guardian, uint256 pegBandBps, uint256 feedHeartbeat)`.
`open()` is `whenNotPaused`; nothing else is. Escrow ids start at 1.

`CrossingLaw` library (`contracts/contracts/CrossingLaw.sol`):
```solidity
library CrossingLaw {
    uint8 internal constant UNFUNDED = 1; EXPIRED = 2; UNSIGNED = 4; UNCONFIRMED = 8;
    uint8 internal constant DISPUTED = 16; DEPEGGED = 32; PAUSED = 64; THROTTLED = 128;
    uint8 internal constant ACT_REJECT = 0; ACT_ATTEST = 1; ACT_ESCROW = 2; ACT_RESERVED = 3; ACT_SETTLE = 4;
    uint256 internal constant FLOOR = 16;
    function mask(uint256 obs) internal pure returns (uint256);  // the 8 lanes, ported 1:1, tier-grouped OR, | FLOOR
    function rule(uint256 obs) internal pure returns (uint8 act); // low = m & (~m + 1); act = ctz(low) branchless:
    // act = ((low >> 1) & 1) + (((low >> 2) & 1) << 1) + ((low >> 3) & 1) * 3 + (((low >> 4) & 1) << 2)
}
```
No branch, no lookup table, no loop. Also expose a thin `CrossingLawHarness`
contract (external pure `rule`, `mask`, and the 8 lanes) for tests and for
the dApp to call the on-chain law directly.

### 2.5 Mocks (in `contracts/contracts/mocks/`)

- `MockUSD` — ERC20, 6 decimals, public `mint(to, amount)`.
- `FeeOnTransferToken` — ERC20 taking 1% on transfer (tests UNFUNDED).
- `ReentrantToken` — ERC20 whose `transfer` calls back into the escrow
  (tests the reentrancy guard / CEI).
- `MockSettlementOracle` — `Ownable`; `setConfirmed(uint256 id, bool)`;
  `isConfirmed(id)`.
- `RevertingOracle`, `GasGuzzlerOracle` — for UNCONFIRMED failure clauses.
- `MockPriceFeed` — `Ownable`; `decimals()=8`; `setAnswer(int256)`,
  `setUpdatedAt(uint256)` (0 = use block.timestamp at each read); `latestRoundData()`.

### 2.6 Security requirements (mentor guidelines)

- Checks-Effects-Interactions everywhere: state and events BEFORE
  `safeTransfer`. `nonReentrant` on every state-changing external function.
- `SafeERC20`. No ETH handling (no `receive`/`fallback`).
- Custom errors, no revert strings (gas).
- Measurement calls are staticcalls with gas caps and try/catch.
- Terms validation at open: payee != 0, token != 0, amount > 0,
  deadline > now, holdWindow > 0, approvers <= 16, unique & non-zero,
  quorum <= approvers.length, payer != payee.
- Storage packing: target <= 8 slots per escrow plus the approvers array.
- Gas: `approve` + auto-rule with no oracle/feed must stay under ~90k gas
  warm; report actual numbers in AUDIT.md.
- Invariants (assert in tests): (a) funds leave only to payee or payer;
  (b) each escrow reaches a terminal state at most once; (c) transfer amount
  == funded; (d) the guardian can never move funds; (e) the arbiter can never
  act outside Held; (f) `sum(funded of non-terminal escrows) <= balanceOf(escrow)`.

## 3. Hardhat 3 project (`contracts/`)

- `package.json` `"type": "module"`, deps: `hardhat@^3.16`,
  `@nomicfoundation/hardhat-toolbox-viem@^5`, `@openzeppelin/contracts@^5.6`,
  `forge-std@^1.1` (Solidity tests), `viem@^2`, `typescript`.
- `hardhat.config.ts`: solc `0.8.28`, optimizer on (runs 1000),
  `networks.localhost = { type: "http", url: "http://127.0.0.1:8545", chainId: 31337 }`
  (the default `npx hardhat node` chain). Use `hardhatMainnet`
  (`type: "edr-simulated"`) for in-process tests.
- Tests: Solidity tests in `test/*.t.sol` using `forge-std/Test.sol`
  (`npx hardhat test solidity`). If Hardhat 3's Solidity runner does not
  support a feature (e.g. fuzzing), fall back to TypeScript tests
  (`test/*.ts`, `node:test` + `hardhat-viem`) for that check and say so in
  `contracts/README.md`.
  - `CrossingLaw.t.sol`: exhaustive 0..255 vs an independent branchy oracle
    written in Solidity; partition counts; R1..R7; monotone 256x8; lane
    certificates; act 4 iff byte == 0; fuzz over uint256 obs:
    `rule(obs) == rule(obs & 0xFF)` and act in {0,1,2,4}; TAUGHT/HELD-OUT
    tables identical to the C file.
  - `SettlementEscrow.t.sol`: every transition in 2.2 (happy path multisig;
    oracle path; both; dispute -> Held -> Release / Refund / Dismiss; hold
    window enforced; re-rule after window; deadline refund; payee cancel;
    pause -> Held -> unpause -> settle; depeg -> Held; stale feed -> Held;
    throttle -> Held -> next window settles; fee-on-transfer -> UNFUNDED ->
    REJECT -> refund returns `funded`; reverting / gas-guzzling oracle sets
    UNCONFIRMED without reverting; reentrant token cannot double-spend;
    access control on every function; events; invariants (2.6)).
  - A gas report table (open / approve / rule / settle / refund) written to
    `contracts/GAS.md` from actual test measurements.
- `scripts/deploy-local.ts` (`npx hardhat run scripts/deploy-local.ts --network localhost`):
  deploys `MockUSD`, `MockSettlementOracle` (owner = account[6]),
  `MockPriceFeed` (owner = account[8], answer 1e8), `SettlementEscrow`
  (guardian = account[0], pegBandBps = 200, feedHeartbeat = 3600),
  `CrossingLawHarness`; mints 1,000,000 USD to the payer (account[1]) and
  approves the escrow; seeds two example escrows (one multisig 2-of-3, one
  multisig + oracle + feed); writes
  `frontend/src/generated/deployment.json` and
  `frontend/src/generated/abis.ts` (ABIs `as const` for viem typing).
  Role map (Hardhat default accounts): 0 guardian, 1 payer, 2 payee,
  3/4/5 approvers, 6 oracle operator, 7 arbiter, 8 feed operator.

## 4. dApp (`frontend/`)

- Vite + React 19 + TypeScript. `wagmi@^2.19`, `viem@^2`,
  `@rainbow-me/rainbowkit@^2.2`, `@tanstack/react-query@^5`. Keep other
  deps minimal (plain CSS or CSS modules is fine).
- Chain: `hardhat` from `viem/chains` (id 31337, http://127.0.0.1:8545).
  Reads addresses/ABIs from `src/generated/deployment.json` and
  `src/generated/abis.ts` (the frontend agent writes an initial version of
  `abis.ts` by hand from the interface in 2.4 using viem's human-readable ABI
  format via `parseAbi`; the deploy script later overwrites it).
- Two wallet modes:
  1. Wallet mode: RainbowKit connect (MetaMask etc.) — real wallet UX.
  2. Demo mode: a role switcher over the 10 well-known Hardhat accounts
     (private keys are public dev keys; label clearly "local demo only"),
     implemented with viem `privateKeyToAccount` wallet clients so a judge can
     act as Payer / Payee / Approver A,B,C / Oracle / Arbiter / Guardian /
     Feed operator without switching MetaMask accounts.
- Screens:
  1. Header: connection status, chain, mode switch, role switch.
  2. Open Escrow form: payee, amount, deadline (duration), hold window,
     approvers (multi-select of demo accounts or addresses) + quorum, oracle
     toggle, peg-check toggle, arbiter toggle, terms text (hashed with
     keccak256 -> termsHash).
  3. Escrow list: cards with id, parties, amount, state badge, last act.
  4. Escrow detail (the core "real-time contract state transitions" view):
     - State machine diagram Open -> Held -> Settled / Refunded with the
       live state highlighted and the last transition animated.
     - Hazard byte panel: 8 LEDs (name, tier colour: veto red, attest amber,
       degrade blue), set/clear, and a one-line reason each; obs shown as hex
       and binary; the act shown as SETTLE/ESCROW/ATTEST/REJECT.
     - Law trace: mask bits, EMIT (lowest set bit), ctz -> act; text
       explaining "why" via POSITION/FLOOR (e.g. "UNSIGNED owns mask bit 1,
       below DISPUTED's bit 2, so ATTEST outranks ESCROW").
     - Token flow: live balances of payer, payee, escrow contract; and a
       list of transfers from `Transfer` events.
     - Actions (enabled per current role and state): Approve, Confirm (oracle
       operator -> MockSettlementOracle.setConfirmed), Dispute, Rule/Settle,
       Resolve (Dismiss/Release/Refund), Refund/Cancel, Pause/Unpause,
       Set throttle, Set feed price (feed operator).
     - Event timeline from contract logs (Opened, Approved, Disputed, Ruled,
       HeldFor, Resolved, Settled, Refunded).
     - Live updates: poll `preview(id)`, `getEscrow(id)` and balances every
       ~1.5 s and on new blocks (`useWatchBlockNumber`).
  5. Law Explorer: 8 toggles -> act, computed by the TS port
     (`src/law/crossing.ts`) and cross-checked against the on-chain
     `CrossingLawHarness.rule` (shows both, flags any mismatch).
- `src/law/crossing.ts` ports the 8 lanes 1:1 and includes a self-check
  (exhaustive 0..255 vs a branchy TS oracle, the TAUGHT/HELD-OUT tables) run
  in a unit test (`vitest`, `npm test`).

## 5. Docs (project root)

- `README.md`: what it is, the law in one paragraph, architecture diagram
  (ASCII), quickstart (3 terminals: `npx hardhat node`, deploy script, `npm
  run dev`), how to demo each transition, how to run every check
  (`cc ... && ./crossing`, `npx hardhat test`, `npm test`).
- `docs/ARCHITECTURE.md`: state machine, measurement table, law mapping,
  sequence diagrams for the 4 acts, trust model.
- `docs/AUDIT.md`: self-audit against the mentor guidelines with evidence
  (reentrancy/CEI, gas numbers, dispute/timeout logic table, wallet UX);
  known limitations and griefing vectors.
- `docs/LAW-EVALUATION.md`: "use the laws and see will it work": what the
  law form buys for escrow (fail-closed, monotone, branchless, composable
  batches by OR, three ports one certificate, ~constant gas), what it does
  not (amounts, partial releases, counting, the measurement is still code,
  the oracle is still the trust root), the evidence (harness output, test
  counts, gas), and the verdict.
