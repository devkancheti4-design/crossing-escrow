# Gas report — SettlementEscrow

Measured inside `test/SettlementEscrow.t.sol::test_Gas_Report` (Hardhat 3 Solidity
test runner, solc 0.8.34, optimizer 1000 runs, evm cancun). Numbers are execution
gas measured around the call in a warm context: they exclude the 21,000 base
transaction cost and calldata, so add ~23–26k for a real transaction.

| operation | gas | notes |
|---|---:|---|
| `open` (3 approvers, no oracle, no feed) | 317,892 | 8 packed slots + approvers array + `safeTransferFrom` + two `balanceOf` reads (funded is measured) |
| `approve` → `_rule` → ATTEST | 19,330 | one SSTORE to the approvals bitmap + one `balanceOf` staticcall + the law |
| `rule` (no-op ATTEST crank) | 11,131 | measurement + law + `Ruled` event |
| `approve` → `_rule` → SETTLE | 43,967 | includes the ERC20 `transfer` to the payee and terminal state |
| `refund` (payee cancel) | 10,900 | plus the ERC20 transfer inside `safeTransfer` |

The law itself (`CrossingLaw.rule`) is ~40 gas: eight shifts/ands, three ORs,
one `m & (~m + 1)`, four shifts and adds. There is no branch, no loop and no
storage read in it. The cost of a ruling is dominated by the MEASUREMENT: each
optional external dependency (oracle, price feed) adds one gas-capped
staticcall (`MEASURE_GAS = 100_000` cap, typical ~3–5k warm).

Why this shape under high-frequency execution:

- One escrow = one storage layout of 8 slots; hot fields (state, approvals,
  counts, timestamps) share two slots, so a ruling touches 2–3 slots.
- Approvals are a 16-bit bitmap, so `approve` is one SSTORE regardless of quorum.
- Rulings are recorded (`lastObs`, `lastAct`) in the same slot as the counters.
- Custom errors, no revert strings; no dynamic arrays read on the hot path except
  the approver lookup (≤16 addresses, linear scan, ~2.1k gas per slot).
- `previewBatch` folds N escrows by OR with early exit on a veto: a batch
  ruling costs N measurements and zero extra logic.
