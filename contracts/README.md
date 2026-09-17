# contracts — Hardhat 3 project

```bash
npm install                    # once
npx hardhat compile
npx hardhat test               # 46 Solidity tests (forge-std style, incl. fuzz)
npx hardhat node               # local JSON-RPC on :8545 (terminal 1)
npm run deploy:local           # deploy + seed + write frontend/src/generated/* (terminal 2)
```

Layout:

- `contracts/CrossingLaw.sol` — the law (library) + `CrossingLawHarness` (external pure surface)
- `contracts/SettlementEscrow.sol` — the escrow: measurement, state machine, funds
- `contracts/interfaces/ISettlementEscrow.sol` — the public interface, events, errors
- `contracts/mocks/*` — stablecoin, fee-on-transfer token, re-entrant token, oracles, price feed
- `test/CrossingLaw.t.sol` — the law's proof obligations in Solidity (exhaustive 0..255 + fuzz over uint256)
- `test/SettlementEscrow.t.sol` — every transition, every failure clause, reentrancy, invariants, gas
- `scripts/deploy-local.ts` — local deployment + demo seeding; `scripts/export-abis.ts` — ABIs only
- `GAS.md` — measured gas
