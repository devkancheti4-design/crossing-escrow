# CROSSING — a non-custodial stablecoin settlement escrow ruled by a LAW

[![ci](https://github.com/devkancheti4-design/crossing-escrow/actions/workflows/ci.yml/badge.svg)](https://github.com/devkancheti4-design/crossing-escrow/actions/workflows/ci.yml)

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
| `law/experiments/` + `docs/LAW-NTZB-EVALUATION.md` | fair, multi-angle evaluation of two extra candidate expressions supplied by the author (`expr` size 5 and the `ntzb` act): structure, law-core obligations, escrow situations, best-case remap, on-chain gas, 2^32 totality |
| `docs/PRESENTING.md` | a runbook for demoing this: setup, a five-minute script with the exact bytes each step produces, what to run as proof, and honest answers to the questions a reviewer will ask |
| `docs/LAW-EVALUATION.md` | "use the laws and see will it work": what the law form buys and does not buy for escrow, with the evidence and a verdict |

## Live demo (GitHub Pages)

**https://devkancheti4-design.github.io/crossing-escrow/** — a static build of the dApp,
deployed by `.github/workflows/pages.yml` on every push to `main`.

There is no public chain behind it: the site talks to a Hardhat node **on your machine**, using
the canonical addresses a fresh node produces (`MockUSD 0x5FbD…0aa3`, `SettlementEscrow
0xCf7E…0fc9`, …).

**For the interactive demo, run the dApp locally — that path has no browser restrictions:**

```bash
cd contracts && npm ci && npx hardhat node          # terminal 1
```

```bash
cd contracts && npm run deploy:local                 # terminal 2
```

```bash
cd frontend && npm ci && npm run dev                 # terminal 3 → http://localhost:5173
```

**If you want the hosted page itself to drive your local chain**, it needs one more process. A
page served over https cannot call the Hardhat node directly: the node answers a CORS preflight
with `Access-Control-Allow-Methods: OPTIONS, GET` — POST is not allowed — and sends no
`Access-Control-Allow-Private-Network` header, which Chrome requires before a public page may
reach a loopback address. This proxy supplies both:

```bash
cd contracts && npm run rpc:proxy                    # terminal 3 → 127.0.0.1:8547
```

The hosted page defaults to that proxy, and its banner has a field for any other RPC URL. The
proxy accepts every origin, so run it only against a throwaway development chain. Without a node
the site shows the banner; the **Law explorer** tab works regardless, because the TypeScript port
of the law runs client-side.

## Install dependencies

Works on macOS, Linux and Windows. Foundry is **not** required (Hardhat 3 runs the
forge-std style Solidity tests). CI runs the full suite on all three OSes: see
`.github/workflows/ci.yml`.

| requirement | macOS | Linux (Debian/Ubuntu, Fedora) | Windows |
|---|---|---|---|
| Git | `xcode-select --install` or Homebrew | `sudo apt install git` / `sudo dnf install git` | [git-scm.com](https://git-scm.com) (Git Bash included) |
| Node.js **22 LTS** + npm (Vite needs ≥ 20.19 or ≥ 22.12; Hardhat 3 targets 22) | [nodejs.org](https://nodejs.org) or `brew install node@22` | [nodejs.org](https://nodejs.org) or `nvm install 22` | [nodejs.org](https://nodejs.org) installer or `winget install OpenJS.NodeJS.LTS` |
| C compiler for the law (`gcc` or `clang`) | `xcode-select --install` | `sudo apt install build-essential` / `sudo dnf install gcc` | **WSL2** (recommended), or LLVM clang + the shim in `law/win32/` — see **Windows: read this first**. MSVC `cl.exe` is not supported |

Then, from the repository root:

```bash
git clone https://github.com/devkancheti4-design/crossing-escrow.git
cd crossing-escrow
```

```bash
cd contracts && npm ci     # Hardhat 3, OpenZeppelin 5, viem, forge-std (fetched from GitHub over https)
```

```bash
cd frontend && npm ci      # React 19, Vite, wagmi 2, viem 2, RainbowKit, vitest
```

`npm ci` installs exactly the locked versions; `npm install` also works. On Windows use
PowerShell or Git Bash; every command below is identical. Hardhat 3 downloads the Solidity
compiler (`solc 0.8.34`) on first compile, so the first run needs network access.

## Windows: read this first

Two things on a locked-down Windows machine will block the default commands, and both have a
clean way around:

| symptom | cause | fix |
|---|---|---|
| `npx hardhat test` / `npx hardhat node` stops before anything runs, mentioning **Windows Application Control**, Smart App Control, or a blocked `edr.node` | Hardhat 3's network/test engine (EDR) is a native Node add-on; Application Control refuses to load unsigned binaries | use **WSL2** (option 1) or **Docker** (option 2), or have an administrator allow `contracts\node_modules\@nomicfoundation\edr-win32-x64-msvc\edr.node` (Smart App Control cannot be re-enabled once turned off, so prefer the allow-list) |
| `'cc' is not recognized` | Windows ships no C compiler | **WSL2** (option 1), or install the signed LLVM clang and use the shim (option 3) |

The frontend (`npm test`, `npm run build`, `npm run dev`) is pure JavaScript and works natively.

### Option 1 (recommended): WSL2 — everything runs exactly like Linux

Open PowerShell **as administrator** once:

```powershell
wsl --install -d Ubuntu
```

Reboot, open the **Ubuntu** app, then inside it:

```bash
sudo apt update && sudo apt install -y build-essential git curl
```

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash && source ~/.bashrc && nvm install 22
```

```bash
git clone https://github.com/devkancheti4-design/crossing-escrow.git && cd crossing-escrow
```

From here every command in this README is the Linux command. `npx hardhat node` inside WSL is
reachable from a Windows browser at `http://localhost:8545`, and the dApp at
`http://localhost:5173`, so the demo works unchanged. Keep the clone inside the Linux file
system (`~/crossing-escrow`, not `/mnt/c/...`) for speed.

### Option 2: Docker Desktop (no WSL setup of your own)

```powershell
docker run --rm -it -v ${PWD}:/w -w /w node:22 bash
```

Inside the container: `apt-get update && apt-get install -y build-essential`, then the Linux
commands. Publish ports with `-p 8545:8545 -p 5173:5173` if you want the demo from Windows.

### Option 3: native Windows, no WSL — what works and how

1. **Frontend** (PowerShell, works as-is):
   ```powershell
   cd frontend; npm ci; npm test; npm run build
   ```
2. **The law harness** with the signed LLVM toolchain. Install clang:
   ```powershell
   winget install LLVM.LLVM
   ```
   Open a new PowerShell, then from the repository root compile with the shim (the law file
   itself is untouched; the shim only supplies `clock_gettime` for the timing line):
   ```powershell
   clang -O2 -Wall -Wextra -Werror -include law\win32\clock_gettime_shim.h -o law\crossing.exe law\crossing.c
   ```
   ```powershell
   .\law\crossing.exe
   ```
   Expect `TOTAL  0 violations`. This exact sequence runs in CI on `windows-latest`. MSVC `cl.exe`
   is not supported (no `__builtin_ctz`). If Application Control also refuses the freshly built
   `crossing.exe`, that policy applies to every locally built program; use option 1.
3. **Contracts**: `npx hardhat test` needs the EDR native add-on. Without an allow-list entry for
   `edr.node` this cannot run natively; use option 1, 2 or 4. The Solidity suite (50 tests) is
   executed on Windows in CI; see the badge above or
   https://github.com/devkancheti4-design/crossing-escrow/actions.

### Option 4: nothing to install — GitHub Codespaces

On the repository page: **Code → Codespaces → Create codespace on main**. The browser-based
VS Code gives you a Linux shell with Node and gcc; run the Linux commands there.

## Quickstart (three terminals)

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

On Windows without WSL, from an MSYS2 UCRT64 shell: `gcc -O2 -Wall -Wextra -Werror -o crossing.exe crossing.c && ./crossing.exe`.
The harness sweeps all 2^32 inputs, so it takes 5–30 s depending on the machine.

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
