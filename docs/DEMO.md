# Running the demo, testing it, and recording the video

Three tools ship with this repo. Use them in this order: drive the protocol from the terminal,
drive it from the UI, then record it.

| I want to… | Command | Where |
|---|---|---|
| Watch every scenario run itself, narrated | `npm run demo` | `contracts/` |
| Smoke-test the whole lifecycle in seconds | `SPEED=0 npm run demo` | `contracts/` |
| Prove the law and the contracts | `./crossing`, `npx hardhat test` | `law/`, `contracts/` |
| Produce an MP4 of the app being used | `npm run record` | `tools/` |
| Present it to a human | [PRESENTING.md](PRESENTING.md) | — |

---

## 1. The scripted demo (`contracts/scripts/demo.ts`)

Runs the protocol against your local chain and narrates itself. Every step prints the situation
byte the contract measured and the act the law returned, so the terminal tells the story while
the dApp animates beside it at http://localhost:5173.

```bash
cd contracts && npm run demo
```

| Variable | Effect |
|---|---|
| `SCENARIO=settle` | Multisig settle: `0x04` ATTEST → `0x00` SETTLE |
| `SCENARIO=dispute` | Dispute → quorum → oracle → `0x10` ESCROW (Held) → arbiter release |
| `SCENARIO=depeg` | Feed reports 0.97 → `0x20` ESCROW → peg recovers → SETTLE |
| `SCENARIO=timeout` | Deadline passes → `0x02` REJECT even at full quorum → payer refund |
| `SCENARIO=pause` | Guardian pauses → `0x40` ESCROW, never REJECT; payee can still cancel |
| `SPEED=0` | No pauses. Use it as a smoke test |
| `SPEED=2` | Slower, for narrating over |

Options are environment variables because Hardhat 3 does not forward unknown CLI flags through
`hardhat run`.

**As a test tool.** `SPEED=0 npm run demo` exercises open, approve, dispute, oracle
confirmation, the permissionless crank, an arbiter release, a depeg, a deadline refund, a pause
and a payee cancel against a real chain in a few seconds. It complements `npx hardhat test`
rather than replacing it: the test suite asserts, the demo *shows*.

---

## 2. The recorder (`tools/record-demo.mjs`)

Drives the actual dApp in your installed Chrome, captures every frame, and renders an MP4 with
captions burned in. Nothing is staged: each click is one a judge could make.

```bash
cd contracts && npx hardhat node          # terminal 1
cd contracts && npm run deploy:local      # terminal 2 — reseeds escrows #1 and #2
cd frontend  && npm run dev               # terminal 3
cd tools     && npm install && npm run record
```

Output: `tools/demo.mp4`, about 66 seconds. It walks a settlement to SETTLE, a dispute through a
reversible hold to an arbiter release, and then the Law explorer comparing the browser's copy of
the law against the on-chain kernel.

| Variable | Effect |
|---|---|
| `HEADLESS=false` | Watch it happen in a visible window — good for rehearsing |
| `FPS=8` | Output frame rate |
| `OUT=demo.mp4` | Output path |
| `CHROME=…` | Path to a different Chrome/Chromium binary |

Requirements: Chrome (or any Chromium) and `ffmpeg` (`brew install ffmpeg`). Reseed with
`npm run deploy:local` before each run, or the recorder will look for escrows that are already
settled and fail with a `failure.png` showing what it saw.

---

## 3. Recording your own narrated version

The generated MP4 has no voice. Most hackathons score a narrated video higher, and it takes
about ten minutes.

**Capture.** On macOS press ⇧⌘5, choose *Record Selected Portion*, tick
*Microphone → MacBook Microphone*, and select just the browser window. On Windows use Xbox Game
Bar (⊞+G) or OBS. Record at 1440×900 or larger; do not film a phone at a screen.

**Before you hit record**

- Reseed: `cd contracts && npm run deploy:local`, then reload the page so escrows #1 and #2 are
  Open and unruled.
- Close other tabs, silence notifications, hide your bookmarks bar.
- Set the browser zoom so the hazard panel and the actions column are both fully visible.
- Have the terminal ready in a second window if you plan to show the proof.

**A three-minute structure that works**

| Time | Show | Say |
|---|---|---|
| 0:00–0:20 | The escrow list | The problem: fees, days, and somebody has to go first. An escrow agent just renames that risk as custodian risk |
| 0:20–1:00 | Escrow #1, approve as A then B | One hazard lit, act 1 ATTEST, nothing moves. Second signature, byte falls to `0x00`, act 4 SETTLE, funds cross. Nobody authorised it — SETTLE was what was left over |
| 1:00–2:00 | Escrow #2: dispute, approvals, oracle, crank, arbiter | Two hazards, the lower bit wins. Still ATTEST until the oracle confirms. Then act 2 ESCROW, a reversible hold, and the arbiter releases |
| 2:00–2:30 | Law explorer | Eight toggles, one ruling, and the on-chain kernel agreeing with the browser live |
| 2:30–3:00 | Terminal: `./crossing` | `TOTAL 0 violations` — checked on all 4.3 billion inputs against an independent implementation, not sampled |

**Narration rules that make it sound confident**

- Say what is about to happen, do it, then say what happened. Never narrate a loading spinner.
- Name the byte out loud — "the byte is `0x04`" — it makes the whole thing feel mechanical
  rather than hand-waved, which is the actual claim.
- End on the one line worth remembering: *the law does not make the escrow trustworthy; it makes
  exactly one thing impossible — settling because nobody looked.*
- Do not apologise for what is missing. Say it plainly instead: unaudited, never run with real
  money, and the weaknesses are written down in `docs/AUDIT.md`.

**If a take goes wrong**, reseed and start again rather than editing around it. A clean single
take is worth more than a cut-together one, and the whole run is only three minutes.

---

## 4. Submitting

- **Video**: the narrated recording, or `tools/demo.mp4` if you are short on time.
- **Repo**: https://github.com/devkancheti4-design/crossing-escrow
- **Live page**: https://devkancheti4-design.github.io/crossing-escrow/ — note in your submission
  that it needs a local node, or that the Law explorer tab works standalone.
- **Deck**: `CROSSING.pptx`.
- **One-liner**: a non-custodial stablecoin settlement escrow whose release decision is a proved,
  branchless law — total, monotone and fail-closed on all 4.3 billion inputs, in three languages
  that agree byte for byte.
