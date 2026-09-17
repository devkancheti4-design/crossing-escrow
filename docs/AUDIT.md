# Self-audit against the mentor evaluation guidelines

Scope: `contracts/contracts/SettlementEscrow.sol`, `CrossingLaw.sol`, the mocks used in tests,
and the dApp. Evidence is the test suite (`npx hardhat test`, 46 passing), the C harness
(`TOTAL 0 violations`) and the measured gas (`contracts/GAS.md`). This is a hackathon
self-audit, not an external audit.

## 1. Reentrancy

| control | where | evidence |
|---|---|---|
| `ReentrancyGuard.nonReentrant` on every state-changing external function (`open`, `approve`, `dispute`, `rule`, `resolve`, `refund`) | `SettlementEscrow.sol` | `test_Reentrancy_OnSettle_IsBlocked`, `test_Reentrancy_OnRefund_IsBlocked`: a token that re-enters during `transfer` records `attempts == 1`, `successes == 0`; balances are exactly right |
| Only two outflows exist, `_settle` and `_refund`, each with a single `safeTransfer` as the last statement | `_settle`, `_refund` | code inspection; both are reached only from guarded externals |
| Measurement calls are `view` → `STATICCALL`: a malicious oracle/feed/token cannot write state or re-enter | `_balanceCovers`, `_oracleConfirmed`, `_pegged` | `test_RevertingOracle_*`, `test_GasGuzzlerOracle_IsContainedByTheGasCap` (rule costs < 400k even against an infinite loop) |
| No ETH paths (no `receive`/`fallback`), no `delegatecall`, no `selfdestruct` | whole contract | code inspection |

## 2. Checks-Effects-Interactions

- `open`: validate → write every field and `state = Open` → **then** `safeTransferFrom` and
  the two `balanceOf` reads that *measure* `funded`. The one effect written after the
  interaction (`funded`) is derived from the interaction's result; the guard prevents any
  re-entrant observer from acting on the half-written escrow, and a re-entrant `observe`
  merely sees `UNFUNDED`.
- `_settle`: `state = Settled` → volume recorded → `Settled` event → `safeTransfer`.
- `_refund`: `state = Refunded` → `Refunded` event → `safeTransfer`.
- `_rule`: measurement (staticcalls) → law → record + `Ruled` → act. The act's only
  interaction is the transfer at the end of `_settle`.
- `resolve`: emits `Resolved` before delegating to `_settle`/`_refund`.

## 3. Gas efficiency under high-frequency execution

Measured (warm, excluding the 21k base): approve+rule 19.3k, rule 11.1k, approve+SETTLE
44.0k, refund 10.9k, open 318k (`contracts/GAS.md`). Design choices:

- The law is ~40 gas of pure arithmetic: no branch, no loop, no table, no storage.
- Eight packed slots per escrow; a ruling reads/writes two of them.
- Approvals are a 16-bit bitmap (one SSTORE per approval); approver lookup scans ≤16 addresses.
- Custom errors only; no revert strings.
- Optional dependencies (oracle, feed) cost a gas-capped staticcall each and only when configured.
- `previewBatch` rules N escrows with one OR-fold and exits on the first veto.
- Trade-off acknowledged: `open` is expensive because it stores full terms (five addresses, a
  hash, an approver array). A production variant would store `keccak256(terms)` and pass the
  terms as calldata on every call (~100k saved at open, more calldata per call), or use
  EIP-712 signatures for approvals so a relayer submits m signatures in one transaction.

## 4. Dispute / timeout logic

| scenario | expected | test |
|---|---|---|
| quorum reached, nothing else | SETTLE, funds to payee | `test_Multisig_HappyPath_SettlesOnQuorum` |
| dispute before quorum | ATTEST (narrower outranks wider), stays Open | `test_Dispute_NarrowerOutranksWider_ThenHolds` |
| dispute with quorum | ESCROW → Held, window opens, `rule` reverts `HoldActive` | same |
| arbiter Release / Refund / Dismiss | Settled / Refunded / re-rule → SETTLE | `test_Dispute_Arbiter*`, `test_Dismiss_InOpen_ClearsDisputeOnly` |
| arbiter outside Held or wrong caller | `BadState` / `NotArbiter` | `test_Arbiter_AccessAndScope` |
| window over, still disputed | re-hold, window extended | `test_Held_ReRuleAfterWindow_ReHoldsWhileDisputed` |
| deadline passed | REJECT even with full quorum; payer refund works | `test_Timeout_PayerRefund` |
| deadline passed while Held | payer must wait for the window (arbiter keeps it) | `test_Timeout_WhileHeld_WaitsForWindow` |
| payee cancels | Refunded any time | `test_Payee_CancelAnyTime` |
| paused | ESCROW never REJECT; refund still works; `open` blocked | `test_Pause_HoldsThenUnpauseSettles_RefundStillWorks`, `test_Open_WhenPaused_Reverts` |
| off-peg / stale / codeless feed | DEPEGGED → Held; clears on re-peg | `test_Depeg_*`, `test_StaleFeed_*`, `test_FeedWithoutCode_*` |
| throttle cap reached | THROTTLED → Held; next window settles | `test_Throttle_HoldsThenNextWindowSettles` |
| fee-on-transfer token | UNFUNDED → REJECT; refund returns what was funded | `test_FeeOnTransfer_Unfunded_*` |
| unknown id | views revert `BadState` | `test_Views_RevertOnUnknownId` |
| invariant | live `funded` ≤ contract balance | `test_Invariant_BalanceCoversLiveEscrows` |

The law's own obligations (R1–R7, partition, monotone, certificates, fold, totality) are
asserted in `test/CrossingLaw.t.sol` and, exhaustively over 2^32, in `law/crossing.c`.

## 5. Web3 wallet UX

- RainbowKit connect (injected / MetaMask / Rainbow) on the local chain; plus a **demo-role
  switcher** so every party can be exercised without switching wallet accounts.
- Every action button is enabled only when the current signer has that power in the current
  state, with a tooltip explaining why not (hold window remaining, deadline not passed).
- Transactions decode custom errors (`HoldActive()`, `NotArbiter()`, …) into the UI.
- Live state: the state machine, the hazard byte as LEDs with reasons, the law's trace, token
  balances and transfers, and the event timeline all poll the chain (pending block, so the
  clock is the contract's clock) — including while the tab is in the background.
- Local-chain time travel buttons make windows and deadlines demonstrable in seconds.

## 6. Known limitations and vectors (documented, not hidden)

1. **Dispute griefing.** A payer can dispute near the deadline; after the hold window the payer
   may refund. Mitigations for production: a dispute bond, an arbiter SLA, or a rule that a
   dispute extends the deadline by one window. Not implemented.
2. **Arbiter power.** While Held the arbiter can release or refund. It can never act on an Open
   escrow and never bypass attestation (Held requires the attest bits clear), but a compromised
   arbiter can steer a held crossing either way. Choose the arbiter in the terms (or none).
3. **Oracle is the trust root of "proof".** The law fails closed on an unreachable oracle, but a
   lying oracle that says "confirmed" is a measurement error the law cannot see. Use a decentralised
   oracle (Chainlink Functions / API3) and a quorum on top; the terms allow both at once.
4. **`block.timestamp`** is used for EXPIRED and the hold window; validators can skew it by
   seconds, which is immaterial at day-scale windows.
5. **Throttle is global**, not per token: a multi-token deployment should key the window per
   token (the fix is a mapping).
6. **Approver revocation** is not supported by design (monotone attestation); a wrong approval is
   handled by dispute.
7. **Upgradeability**: none; a new version is a new deployment. Immutable is a feature for an
   escrow.
8. Solidity `0.8.34` with `evmVersion: cancun`; the contracts use no transient storage or
   Cancun-only opcodes, so they compile for older targets too.

## 7. External review findings, classified (core vs measurement vs environment)

"Core" = the law and the escrow state machine (`CrossingLaw.sol`, `SettlementEscrow.sol` outside
`observe`). "Measurement" = `observe` and the dependencies it reads (oracle, price feed, token).
None of these change the law; they are policy choices around it.

| finding | where | assessment | recommended fix (not applied — core left as delivered) |
|---|---|---|---|
| Arbiter power is not time-limited once Held; `resolve` does not check `heldUntil` | core (state machine) | By design: after the window anyone may re-rule, and a still-degraded byte re-holds, so the arbiter remains the undo while the hazard persists. Real but bounded: the arbiter can never act on Open or final escrows, and never bypass attestation. | `resolve(Release/Refund)` requires `block.timestamp < heldUntil`, or a re-rule after the window exits Held when the byte is clean |
| Single guardian | core (governance) | Availability only: pause/throttle degrade to ESCROW, never REJECT, and never block refunds. | Deploy with a multisig + timelock as owner (no code change) |
| No enforced minimum attestation: `quorum = 0`, no oracle | core (terms validation) | A foot-gun, not an exploit: the payer chooses it for their own funds; the law still fails closed on every other hazard. | `_validateTerms`: require `quorum >= 1 || oracle != 0` |
| Trust delegated to payer-chosen oracle / feed / arbiter / token | measurement | Inherent: the law rules on the situation the measurement reports; a lying source is invisible. Fail-closed covers *silent* and *broken* sources only. | Curated oracle/feed registries; decentralised oracle networks; a payee-side veto on terms at open |
| No role rotation / recovery for an existing escrow | core | Recovery is the refund path (deadline, payee cancel, arbiter). Acceptable for escrow-sized windows. | Optional `rotate` with both parties' consent |
| Repeated dispute cycles | core | Delay only: each dispute → Held → arbiter; funds never leave to a third party. | Dispute bond, or one dispute per party per escrow |
| Any ERC-20 accepted | measurement + terms | Fee-on-transfer is measured (UNFUNDED → REJECT, refund returns what was funded); rebasing, pausing or blacklisting tokens can leave funds Held or a transfer reverting. | Token allowlist at the protocol or terms level; treat a reverting transfer as a documented failure mode |
| Solidity tests not run by the reviewer on Windows (policy blocked Hardhat's native runtime) | environment | Not a code finding. The GitHub Actions matrix runs the full suite on `windows-latest`, `ubuntu-latest` and `macos-latest`; see the ci badge. | Allow the EDR binary, or use WSL2 |
