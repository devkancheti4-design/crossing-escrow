# Presenting CROSSING

A runbook for demoing this project: what to set up, what to click, what to say, and exactly
what to run when someone asks "how do you know?". Every number and byte value below was
observed in the running app, not estimated.

---

## 0. Before the judges arrive (5 minutes)

> Tooling for all of this lives in [DEMO.md](DEMO.md): `npm run demo` drives every scenario from
> the terminal, and `npm run record` in `tools/` renders an MP4 of the app being used.

Three terminals from the repository root. Leave all three running.

```bash
cd contracts && npx hardhat node
```

```bash
cd contracts && npm run deploy:local
```

```bash
cd frontend && npm run dev
```

Open **http://localhost:5173**. Use this local URL for the demo, not the hosted one — a page
served over https cannot call the Hardhat node directly (details in §6). You should see two
escrows: **#1, 25,000 mUSD** (quorum 2 of 3) and **#2, 120,000 mUSD** (quorum 2 of 3, plus an
oracle and a peg check).

Check before you start:

- Top-right says **Demo roles**, and the role dropdown lists Payer, Payee, Approver A/B/C,
  Oracle operator, Arbiter, Guardian, Feed operator. That dropdown is how you play every party
  without switching wallets.
- The clock next to it is the chain's time, not your laptop's.
- Have a second tab on the **Law explorer** page, and a terminal ready in `law/`.

If you want a clean slate mid-event: stop the node, restart it, re-run `npm run deploy:local`,
and reload. Contract addresses are deterministic, so nothing else needs changing.

---

## 1. The 60-second version

> Cross-border settlement pays intermediary fees, waits days, and needs somebody to go first.
> The usual fix is an escrow agent, which just renames counterparty risk as custodian risk.
>
> We built a non-custodial escrow where funds can only ever reach the payee or the payer. What
> makes it different is the release decision. It is not an if-chain someone wrote by hand. It is
> a **law**: a branchless decision function over eight measured hazards, proved total, monotone
> and fail-closed on all 4.3 billion inputs it can be handed, authored three times over — in C,
> in Solidity and in TypeScript — with all three agreeing byte for byte.
>
> The rule that matters: every hazard bit is set both by a positive finding *and* by any
> measurement that could not complete. So a dead oracle, a stale price feed and an unreadable
> token balance all lower what may cross. **You cannot settle by failing to measure.**

---

## 2. The five-minute demo

### Act 1 — a settlement that should succeed (60s)

1. Open **escrow #1**. Point at the **live measurement** panel: one amber light, `UNSIGNED`,
   because 0 of 2 signatures are in. The byte is `0x04` and the law returns **act 1 ATTEST**.
2. Say: *"ATTEST means recorded, nothing moves. Watch the payee balance stay at zero."*
3. Switch the role dropdown to **Approver A**, click **Approve (sign)**.
   The timeline gains `Ruled obs 0x04 → act 1 ATTEST`. Still nothing has moved.
4. Switch to **Approver B**, click **Approve (sign)**.
   The byte falls to `0x00`, the law returns **act 4 SETTLE**, the state machine lights
   *Settled*, and 25,000 mUSD lands with the payee.

The line to land: *"Nobody authorised that release. The quorum completed, every hazard read
clear, and SETTLE was what was left over."*

### Act 2 — a settlement that should not succeed yet (90s)

Open **escrow #2** (oracle and peg check both on).

1. As **Payer**, click **Open dispute**. The byte becomes `0x1C` and the act is still **1
   ATTEST** — not a hold. Explain: *"Two hazards are set, a missing signature and a dispute. The
   missing signature owns a lower bit, so it wins. Narrower outranks wider, and we never wrote a
   rule for that — it is bit position."*
2. Approve as **Approver A** and **Approver B**: the byte drops to `0x18`, still **ATTEST**,
   because the oracle has not confirmed.
3. Switch to **Oracle operator**, click **Confirm off-chain proof**.
4. Click **Run the law**. Byte `0x10`, act **2 ESCROW**: the escrow moves to **Held** with a
   countdown, and *Run the law* is now disabled for the length of the window.
   Say: *"Act 2 is the reversible act. While the window is open an undo exists, and that undo is
   the arbiter."*
5. Switch to **Arbiter** and click **Release → payee**. 120,000 mUSD moves; the state machine
   lights *Settled*.

### Act 3 — the failure modes (90s)

Pick two of these; they are quick and each makes a different point.

| Do this | What they see | The point |
|---|---|---|
| As **Feed operator**, click **Price 0.97 (depeg)**, then open a live escrow | `DEPEGGED` lights, act **2 ESCROW** | A depegging stablecoin holds the crossing instead of settling into it |
| As **Feed operator**, click **Mark stale (2 days old)** | `DEPEGGED` lights again | A feed that cannot be *trusted* and a feed that is *wrong* are treated the same way |
| As **Guardian**, click **Pause rail** | `PAUSED` lights, act **2 ESCROW** — never REJECT | The guardian can slow the rail and can never block a refund |
| Click **⏩ +8 days (past deadline)** | `EXPIRED` lights, act **0 REJECT** even at full quorum | Expiry sits below attestation, so no number of signatures outranks it. Then refund as **Payer** |

### Act 4 — the law itself (60s)

Open the **Law explorer** tab. Toggle hazard bits directly and show:

- `0x00` → SETTLE, `0x04` → ATTEST, `0x10` → ESCROW, `0x18` → ATTEST, `0xFF` → REJECT.
- The trace: the mask, `EMIT` picking the lowest set bit, `ctz` turning it into the act.
- The badge reading **on-chain act ✓ agrees** — the TypeScript in the browser and the Solidity
  on the chain are being compared live, for whatever byte is on screen.
- The partition line: of 256 possible situations, **192 refuse, 48 record, 15 hold, exactly 1
  settles**.

---

## 3. What counts as proof

Run these in front of them; each finishes in seconds.

```bash
cd law && cc -O2 -Wall -Wextra -Werror -o crossing crossing.c && ./crossing
```

Expect the final line **`TOTAL  0 violations`**. Point at four lines in the output:

| Line | Why it matters |
|---|---|
| `THE THEOREM act 4 on a non-zero byte  0` | Exactly one byte out of 256 can settle. Missing a measurement can never produce it |
| `R6 monotone: every bit is a hazard  0` | Over 256 × 8 single-bit lifts, adding a hazard never let more value cross |
| `THE CERTIFICATE ... 8 lanes, 0 without` | Each of the eight lanes was proved to equal `c · bitᵢ` over the whole domain, not spot-checked |
| `TOTALITY OVER ALL 2^32` | The function was run on every input it can ever receive, and compared against an independently written branchy oracle |

```bash
cd contracts && npx hardhat test
```

**50 passing.** The ones worth naming out loud: a token that re-enters during transfer is
blocked on both settle and refund; a fee-on-transfer token is measured, reported `UNFUNDED` and
refused; an oracle that reverts, an oracle that burns all its gas, and an address with no code
at all each set `UNCONFIRMED` without breaking the ruling.

```bash
cd frontend && npm test
```

**12 passing** — the browser's copy of the law is held to the same tables as the other two.

And the repository badge: the whole suite runs on **Ubuntu, Windows and macOS** on every push.

If someone asks what the strongest single claim is:

> The release decision has been checked on every input it can ever be given — 4,294,967,296 of
> them — against an independently written implementation, and it disagreed zero times. Three
> separate ports of it agree byte for byte. That is not a test suite; it is enumeration.

---

## 4. Questions you should expect, and honest answers

Do not defend these. The fact that they are written down is the strongest thing about them —
they all live in `docs/AUDIT.md` with a named fix.

| Question | Answer |
|---|---|
| "Can the arbiter just take the money?" | No. It can only act while an escrow is Held, and only to the payee or the payer. But it is not time-limited once Held — that is a real gap, and the fix is a `heldUntil` check in `resolve`. |
| "What if I set quorum to zero?" | Then it settles without approval. It is your own money and your own terms, but it is a foot-gun and the first thing we would close: require `quorum >= 1 || oracle != 0`. |
| "The oracle is still a trusted party." | Yes. The law fails closed on an oracle that is silent, broken or absent. It cannot see one that lies. That is why the oracle is named in the signed terms, and why a decentralised oracle is the production answer. |
| "Can the guardian freeze my funds?" | It can hold a crossing, never block a refund and never move funds. Availability risk, not custody risk. Deploy it behind a multisig. |
| "What about a weird ERC-20?" | Fee-on-transfer is handled correctly — we measure what arrived. Rebasing, pausing or blacklisting tokens can strand a crossing in a hold. The fix is an allowlist. |
| "Has it been audited?" | No, and it has never moved real money. What it has is exhaustive verification of the decision, 50 contract tests including adversarial ones, and a written self-audit. |
| "Why not just write if-statements?" | Because an if-chain cannot distinguish a measurement that succeeded from one that failed — both look like the condition being unmet. Show them slide 3 of the deck, or the two code blocks in the README. |

If you have time, the sharpest move is to mention that we **tried to beat our own kernel**: a
rival branchless function was proposed, we searched all 20,160 ways of assigning the eight
hazards to its bits, and even its best layout still releases funds into an open dispute and onto
a depegged coin. It is written up in `docs/LAW-NTZB-EVALUATION.md`.

---

## 5. If something breaks mid-demo

| Symptom | Fix |
|---|---|
| Banner says no chain reachable | The node died. Restart `npx hardhat node`, re-run `npm run deploy:local`, reload |
| An escrow is already Settled from a rehearsal | Open a new one from the **Open escrow** tab; it takes about 20 seconds |
| A button is greyed out | You are in the wrong role, or a hold window is still running. The tooltip says which |
| The hold window is too long to wait through | Use the **⏩ +10 min** chain-clock button, then click **Run the law** |
| Everything is confusing | Fall back to the **Law explorer** tab. It needs no chain at all and still shows the whole decision |

---

## 6. About the hosted link

**https://devkancheti4-design.github.io/crossing-escrow/** is a real build of the dApp, but it
has no public chain behind it — it expects a Hardhat node on the viewer's own machine.

A page served over https cannot call that node directly: Hardhat answers a CORS preflight with
`Access-Control-Allow-Methods: OPTIONS, GET`, so POST is refused, and it sends no
`Access-Control-Allow-Private-Network` header, which Chrome requires before a public page may
reach a loopback address. Running `npm run rpc:proxy` in `contracts/` supplies both on port
8547, and the hosted page defaults to it.

For a live demo in front of people, **use http://localhost:5173** and avoid the question
entirely. Send the hosted link afterwards, for the Law explorer and the code.

---

## 7. One-line summary to leave them with

> The law does not make the escrow trustworthy. It makes exactly one thing impossible: settling
> because nobody looked.
