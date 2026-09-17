# Evaluation of two extra candidate expressions (fair, multi-angle)

The author supplied two expressions and asked for them to be used and tested "in the real
world, fairly, from multiple angles":

```
expr(x) = 255 & ((x >> 8) + ((x >> 16) - x))          size 5
act(x)  = (4 & ntzb(x - 7)) + ntzb(x + (x & 128))
ntzb(v) = index of the lowest set bit of (v & 254)     "which blocking observation came first"
```

No spec came with them, so this evaluation first establishes what they compute, then measures
them next to the CROSSING law under identical checks, then gives the `act` kernel its best
possible chance on the escrow by searching every hazard-to-bit assignment. Nothing in the
delivered core was changed; the candidate lives in `law/experiments/`,
`contracts/contracts/experimental/NtzbLaw.sol` and `frontend/src/law/ntzb.ts`, with its own
tests (C harness, 4 Solidity tests incl. a 256-run fuzz, 3 vitest tests) and a Law Explorer row.

One convention had to be chosen: `ntzb(0)`. The lowest set bit of zero is undefined, so
`ntzb(0) := 0` ("no blocker"), implemented branchlessly as `7 & ctz((v & 254) | 256)`. The
choice affects exactly four bytes (0x00, 0x01, 0x80, 0x81) and is stated wherever it matters.

## Angle A — what the expressions compute (exhaustive over 0..255 / 2^24)

- `act(x)` is **the index of the first set bit among bits 1..6**, plus **4** whenever `x − 7` has
  its first set bit (among bits 1..7) at index ≥ 4, i.e. when `x mod 16` is 7 or 8 and `x ≥ 16`.
  Bits 0 and 7 are never blockers: `x + (x & 128)` moves bit 7 into bit 8 and `& 254` drops it.
  It agrees with this plain-language restatement on all 256 bytes (C, Solidity, TypeScript).
- Partition over 256 bytes: act0 = 4, act1 = 113, act2 = 64, act3 = 17, act4 = 16, act5 = 23,
  act6 = 4, act7 = 15. Bytes ruled "no blocker": 0x00, 0x01, 0x80, 0x81.
- `expr(x)` equals `(byte1 + byte2 − byte0) mod 256` on every 32-bit input tested (20,000
  random plus the 2^24 sweep below). On a single byte it is negation: `(256 − x) & 255`.

## Angle B — law-core obligations, side by side (violation counts)

| obligation | ntzb candidate | CROSSING |
|---|---:|---:|
| top act only on the clean byte (the irreversibility theorem) | 3 (0x01, 0x80, 0x81) | 0 |
| monotone: a new hazard never weakens the ruling (256 × 8 lifts) | 67 | 0 |
| bits the ruling never reads as a blocker | bit 0, bit 7 | none |
| fold by OR: act(a\|b) is the stricter of the parts (65,536 pairs) | 9,060 | 0 |
| total on all 2^32 inputs, agrees with own low byte | 0 / 0 | 0 / 0 |
| branchless, no table, no loop | yes | yes |

The 67 monotonicity failures come from the `(x − 7)` term: it turns a byte whose first blocker
is bit 1 into act 5, and bits 3+4 into act 7, so adding a hazard can move the ruling to a
*later* blocker (e.g. 0x08 → 3 but 0x18 → 7; 0x07 → 1 but 0x17 → 5).

## Angle C — the escrow's own situations (crossing bit layout)

| situation | byte | CROSSING | ntzb | note |
|---|---|---|---|---|
| clean | 0x00 | 4 SETTLE | 0 no blocker | agree |
| unsigned | 0x04 | 1 ATTEST | 2 | first blocker = bit 2 |
| unconfirmed + disputed | 0x18 | 1 ATTEST | 7 | escalation |
| UNFUNDED | 0x01 | 0 REJECT | **0 no blocker** | proceeds on a veto |
| THROTTLED | 0x80 | 2 ESCROW | **0 no blocker** | proceeds on a hazard |
| unfunded + throttled | 0x81 | 0 REJECT | **0 no blocker** | proceeds on two |
| depegged + UNFUNDED | 0x21 | 0 REJECT | 5 | veto escalated to a late blocker |
| everything | 0xFF | 0 REJECT | 1 | |

## Angle D — the best case: remap the hazards to suit the kernel

`law/experiments/bestfit.py` tries all 28 × 720 = 20,160 ways to put six hazards on blocker
bits 1..6 and two on the non-blocking bits 0 and 7, maps each act to an escrow action by the
tier of the first blocker, and scores against CROSSING over all 256 situations.

Best layout: bit0 DISPUTED · bit1 UNFUNDED · bit2 EXPIRED · bit3 UNSIGNED · bit4 PAUSED ·
bit5 UNCONFIRMED · bit6 THROTTLED · bit7 DEPEGGED. Residue: 26 disagreements, **3 of them
SETTLE on a hazard**, 0 held-where-reject. The two hazards the kernel can never block in its best
case are **DISPUTED and DEPEGGED**. Real flows under that best layout:

| flow | CROSSING | ntzb-derived |
|---|---|---|
| 0/2 → 1/2 → 2/2 signatures | ATTEST → ATTEST → SETTLE | same |
| 2/2 and the payer disputes | ESCROW (Held, arbiter) | **SETTLE — funds move despite the dispute** |
| guardian pause, throttle cap | ESCROW | ESCROW |
| feed off-peg | ESCROW | **SETTLE — funds move on a depegged coin** |
| deadline passed, unfunded, unfunded+throttled | REJECT | REJECT |

Any other assignment is worse (more unsafe settlements or more disagreements).

## Angle E — the size-5 expression

- As a **lane** over one byte: no certificate exists (it is not `c · bit_i`; it is negation).
- As a **fold** of three observation bytes `(b1 + b2 − b0)`, over all 2^24 triples: 65,535 triples
  carry hazards yet fold to a clean byte ("vanish"; e.g. two THROTTLED observations 0x80 + 0x80 → 0x00,
  or 0x01 in b1 and b0 cancel), 4,075,139 triples produce a bit no input had ("phantom"), and only
  174,001 equal the OR fold. Arithmetic carries between bit positions, so hazards cancel and
  invent each other; a fold used for safety must be OR (idempotent, order-free, veto-absorbing).
- What it *is* good for: a difference detector (`later − earlier`) or a wrap-around negation,
  both content operations, not rulings.

## Angle F — on-chain and timing

| | ntzb candidate | CROSSING |
|---|---:|---:|
| C, one ruling | 0.97 ns | 1.36 ns |
| Solidity via harness call (gas) | 5,985 | 6,198 |
| Solidity fuzz over uint256 (256 runs) | total, byte-determined | total, byte-determined |

Both are branchless and equally cheap; cost is not what separates them.

## Verdict

**What the `act` kernel can do:** name, in one branchless expression, *which of six blocking
observations came first* (bits 1..6), total over every input, deterministic, ~1 ns / ~6k gas via a
call. As a *diagnostic* ("why is this blocked?") over six observations it works, and the Law
Explorer shows it next to the law for any byte.

**What it cannot do:** rule the release of escrowed value. It has no FLOOR (its top act is a
convention on `ntzb(0)`, not what is left over when every lane is silent), it reads only six of
eight observations as blockers, the `(x − 7)` term makes it non-monotone, and OR does not fold it,
so a batch has no ruling. Given its best possible hazard assignment it still settles into an open
dispute and onto a depegged coin, the two situations an escrow exists to stop. The CROSSING law
rules every one of those bytes correctly with zero violations on every obligation, on three ports.

**What `expr` can do:** arithmetic on packed bytes (difference / negation). It is neither a lane nor
a safe fold, and folding hazards with it makes them cancel.

Reproduce: `cd law/experiments && cc -O2 -Wall -Wextra -Werror -o ntzb ntzb.c && ./ntzb`,
`python3 law/experiments/bestfit.py`, `cd contracts && npx hardhat test` (NtzbLawTest),
`cd frontend && npm test`.
