# Architecture

## 1. Roles and powers

| role | can | cannot |
|---|---|---|
| Payer | `open` (funds), `dispute`, `refund` after the deadline (and after the hold window if Held) | refund early, touch other escrows |
| Payee | `dispute`, `refund` = cancel at any time (funds return to the payer) | pull funds |
| Approvers (n, quorum m) | `approve` once each | revoke, move funds |
| Oracle contract (optional, per escrow) | answer `isConfirmed(id)` when pulled | push funds, revert the crossing (a revert only sets UNCONFIRMED) |
| Price feed (optional, per escrow) | answer `latestRoundData()` when pulled | same |
| Arbiter (optional, per escrow) | while **Held**: `Release`, `Refund`; while disputed: `Dismiss` | act on an Open or final escrow |
| Guardian (protocol owner) | `pause`/`unpause` (raises PAUSED, blocks `open`), `setThrottle` (raises THROTTLED) | move funds, block a refund, refuse a crossing (degrade never refuses) |
| Anyone | `rule` — crank the law; funds move only on SETTLE and only to the payee | anything else |

## 2. State machine

```
                        approve / dispute / rule  →  _rule()
        ┌──────────────────────────────────────────────────────────┐
        │                                                          │
 open ─►│  OPEN  ├── act 4 SETTLE ───────────────────────────────► SETTLED (final)
        │        ├── act 2 ESCROW ──► HELD ── re-rule after window: act 4 ─┘
        │        │                    │  │ ── arbiter Release ─────────────┘
        │        │                    │  │ ── arbiter Refund ─────────────► REFUNDED (final)
        │        │                    │  └── payer refund (deadline & window passed) ─┘
        │        │                    └── re-rule after window: act 2 → HELD again (window extended)
        │        ├── payer refund (deadline passed) ────────────────────────┘
        │        └── payee cancel (any time) ───────────────────────────────┘
        └──────────────────────────────────────────────────────────┘
 act 1 ATTEST and act 0 REJECT: recorded (lastObs/lastAct, Ruled event); nothing moves; state unchanged.
```

Rules the state machine adds around the law:

- `_rule` is invoked by `approve` and `dispute` (only while Open), by `rule` (anyone; while Held
  only after `heldUntil`), and by the arbiter's `Dismiss` (bypasses the window: the arbiter is the
  party authorised during it).
- Entering Held sets `heldUntil = now + holdWindow`; re-holding extends it. During the window the
  law cannot settle — an undo exists (the arbiter). That is what "act 2 is reversible" means here.
- The payer's refund needs `now > deadline` and, if Held, `now >= heldUntil`, so the arbiter always
  keeps the full window.
- `act 3` is unreachable by construction; the contract reverts `ReservedAct()` if it ever appears.

## 3. The measurement (`observe`) — where policy lives

| bit | hazard | set when (positive finding **or** failure to measure) | tier |
|---|---|---|---|
| 0 | UNFUNDED | `funded < amount`; or `token.balanceOf(escrow)` has no code / reverts / `< funded` | veto |
| 1 | EXPIRED | `deadline == 0` or `block.timestamp > deadline` | veto |
| 2 | UNSIGNED | `approvalCount < quorum` | attest |
| 3 | UNCONFIRMED | `oracle != 0` and (`isConfirmed(id)` is false, reverts, exceeds the gas cap, or the address has no code) | attest |
| 4 | DISPUTED | `disputed` | degrade |
| 5 | DEPEGGED | `priceFeed != 0` and (no code / reverts / `answer <= 0` / `updatedAt == 0` or in the future / older than `FEED_HEARTBEAT` / `|answer − 10^dec|·10000 > PEG_BAND_BPS·10^dec`) | degrade |
| 6 | PAUSED | `paused()` | degrade |
| 7 | THROTTLED | `cap != 0` and `volumeThisWindow + amount > cap` | degrade |

Every external read is `try … {gas: 100_000} … catch` on a `view` function (a `STATICCALL`), so a
dependency can only set its own bit. `funded` is the **measured** balance delta at `open`, so
fee-on-transfer tokens produce an honest UNFUNDED instead of an insolvent escrow.

## 4. The law (`CrossingLaw`)

```
mask(obs) = (L_UNFUNDED|L_EXPIRED) | (L_UNSIGNED|L_UNCONFIRMED) | (L_DISPUTED|L_DEPEGGED|L_PAUSED|L_THROTTLED) | 16
rule(obs) = ctz(mask & -mask)            // 0 REJECT · 1 ATTEST · 2 ESCROW · 3 RESERVED · 4 SETTLE
```

- veto lanes emit `1·bit` (mask bit 0), attest lanes `2·bit` (mask bit 1), degrade lanes `4·bit`
  (mask bit 2), FLOOR is mask bit 4, mask bit 3 is the reserved gap.
- POSITION does the precedence: the lowest set mask bit wins, so REJECT > ATTEST > ESCROW > SETTLE
  with no comparison anywhere.
- The fold is OR: `previewBatch(ids)` ORs the masks of many escrows and returns the batch act
  (= the minimum), with an early exit the moment a veto appears.
- Extensibility: a ninth hazard gets observation bit 8 and, if it needs a new tier, mask bit 3;
  the harness's `G1`/`G1b` checks prove that occupying the gap disturbs no existing ruling.

## 5. Sequence diagrams

**Multisig settle**
```
Payer            Escrow                 Approver A        Approver B
  │ open(terms) ──►│ pull token, funded=Δ
  │                │◄── approve(id) ────────│
  │                │ observe=0x04 rule=1 ATTEST (Ruled)
  │                │◄──────────────────────────────────────── approve(id)
  │                │ observe=0x00 rule=4 SETTLE: state=Settled, Settled event, safeTransfer(payee)
```

**Dispute → Held → arbiter**
```
Payer ── dispute ─►│ observe=0x14 → ATTEST (still unsigned; narrower outranks wider)
A, B ── approve ──►│ observe=0x10 → ESCROW: state=Held, heldUntil=now+window (HeldFor)
anyone ── rule ───►│ HoldActive() until heldUntil
Arbiter ─ resolve(Release|Refund|Dismiss) ─►│ Settled | Refunded | disputed=false + re-rule
```

**Oracle path**
```
open(oracle=O) ─►│ observe has UNCONFIRMED until O.isConfirmed(id) is true
O.setConfirmed(id,true)   (any off-chain proof pipeline: Chainlink Functions, API3, a signer)
anyone ── rule ───►│ observe=0x00 → SETTLE
```

**Timeout**
```
deadline passes ─►│ observe has EXPIRED → REJECT (even with quorum + oracle)
Payer ── refund ──►│ Refunded, safeTransfer(payer, funded)      (payee may cancel at any time)
```

## 6. Storage and gas

One escrow is 8 slots: `[payer, deadline, heldUntil, state, quorum]`, `[payee, holdWindow,
approvals bitmap, approvalCount, disputed, lastObs, lastAct]`, `token`, `[amount, funded]`,
`oracle`, `priceFeed`, `arbiter`, `termsHash`, plus the approvers array. The hot path of a ruling
touches two slots. See `contracts/GAS.md`.

## 7. Trust model

- Funds are held by code; the only outflows are `safeTransfer(payee, funded)` in `_settle` and
  `safeTransfer(payer, funded)` in `_refund`, both after state and events (CEI), both behind
  `nonReentrant`.
- The measurement fails closed: an unreachable oracle, a stale feed, an unreadable token each
  *lower* the act. The guardian's powers only lower the act to ESCROW, never to REJECT, and never
  touch refunds.
- The residual trust is the **content** of the measurement — who the approvers are, which oracle,
  which feed — chosen by the payer in the terms and visible on-chain from `open` onward.

## 8. Frontend data flow

`deployment.json` + `abis.ts` (generated by the deploy script) → wagmi `useReadContract`
(`getEscrow`, `preview` on the **pending** block so `block.timestamp` is live, balances,
`throttle`, `paused`) polled every 1.5 s, and `getContractEvents` for the timeline and token
flow → components: `StateMachine`, `HazardPanel`, `LawTrace` (TypeScript port, cross-checked
against `CrossingLawHarness.rule`), `Actions` (role-aware; decodes custom errors), `TokenFlow`,
`Timeline`, `LawExplorer`. Writes go through one `useTx` hook: sign → wait for receipt →
invalidate every query.
