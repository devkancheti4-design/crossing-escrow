/**
 * Scripted demo driver.
 *
 *   npm run demo                      # the full story, paced for narration
 *   SCENARIO=settle  npm run demo     # just the multisig settle
 *   SCENARIO=dispute npm run demo     # dispute -> Held -> arbiter release
 *   SCENARIO=depeg   npm run demo     # a depegging coin holds the crossing
 *   SCENARIO=timeout npm run demo     # deadline passes -> REJECT -> refund
 *   SCENARIO=pause   npm run demo     # guardian pause holds, never blocks a refund
 *   SPEED=0 npm run demo              # no pauses — use it as a smoke test
 *   SPEED=2 npm run demo              # slower, for narrating over
 *
 * (Options are environment variables because Hardhat 3 does not forward unknown
 *  CLI flags through `hardhat run` to the script.)
 *
 * Every step prints the situation byte the contract measured and the act the law returned,
 * so the terminal narrates itself while the dApp animates alongside it.
 */
import { network } from "hardhat";
import { keccak256, parseUnits, toBytes, zeroAddress, type Address } from "viem";

const SCENARIO = process.env.SCENARIO ?? "all";
const SPEED = Number(process.env.SPEED ?? "1");
const pause = (s: number) => new Promise((r) => setTimeout(r, s * 1000 * SPEED));

const ACTS = ["REJECT", "ATTEST", "ESCROW", "RESERVED", "SETTLE"] as const;
const STATES = ["None", "Open", "Held", "Settled", "Refunded"] as const;
const HAZARDS = ["UNFUNDED", "EXPIRED", "UNSIGNED", "UNCONFIRMED", "DISPUTED", "DEPEGGED", "PAUSED", "THROTTLED"];

const { viem, networkHelpers } = await network.connect();
const pub = await viem.getPublicClient();
const wallets = await viem.getWalletClients();
const [guardian, payer, payee, a1, a2, a3, oracleOp, arbiter, feedOp] = wallets;

const { default: dep } = await import("../../frontend/src/generated/deployment.json", { with: { type: "json" } });
const escrow = await viem.getContractAt("SettlementEscrow", dep.contracts.escrow as Address);
const usd = await viem.getContractAt("MockUSD", dep.contracts.usd as Address);
const oracle = await viem.getContractAt("MockSettlementOracle", dep.contracts.oracle as Address);
const feed = await viem.getContractAt("MockPriceFeed", dep.contracts.feed as Address);

const say = (line: string) => console.log(line);
const head = (n: string) => { console.log(`\n\x1b[1;36m${"─".repeat(72)}\n  ${n}\n${"─".repeat(72)}\x1b[0m`); };

function bits(obs: number): string {
  const set = HAZARDS.filter((_, i) => (obs >> i) & 1);
  return set.length ? set.join(" + ") : "every lane silent";
}

async function report(id: bigint, note = ""): Promise<number> {
  const [obs, act] = (await escrow.read.preview([id], { blockTag: "pending" })) as [number, number];
  const e = (await escrow.read.getEscrow([id])) as { state: number };
  const colour = act === 4 ? "\x1b[32m" : act === 2 ? "\x1b[34m" : act === 1 ? "\x1b[33m" : "\x1b[31m";
  say(`   obs 0x${obs.toString(16).padStart(2, "0").toUpperCase()}  ${colour}act ${act} ${ACTS[act]}\x1b[0m  · state ${STATES[e.state]}  · ${bits(obs)}${note ? `  · ${note}` : ""}`);
  return act;
}

async function send(label: string, hash: Promise<`0x${string}`> | `0x${string}`) {
  const h = await hash;
  await pub.waitForTransactionReceipt({ hash: h });
  say(`\x1b[2m   ✓ ${label}\x1b[0m`);
}

async function open(opts: { amount: string; quorum: number; oracle?: boolean; peg?: boolean; days?: number; holdMin?: number; memo: string }) {
  const now = Number((await pub.getBlock()).timestamp);
  const amount = parseUnits(opts.amount, 6);
  await send("payer funds the escrow", usd.write.mint([payer.account.address, amount], { account: payer.account }));
  await send("payer approves the escrow contract", usd.write.approve([escrow.address, amount], { account: payer.account }));
  const before = (await escrow.read.escrowCount()) as bigint;
  await send(`open: ${opts.amount} mUSD, quorum ${opts.quorum}${opts.oracle ? " + oracle" : ""}${opts.peg ? " + peg check" : ""}`,
    escrow.write.open([{
      payee: payee.account.address, token: usd.address, amount,
      deadline: now + (opts.days ?? 7) * 86400, holdWindow: (opts.holdMin ?? 10) * 60,
      quorum: opts.quorum, approvers: [a1.account.address, a2.account.address, a3.account.address],
      oracle: opts.oracle ? oracle.address : zeroAddress,
      priceFeed: opts.peg ? feed.address : zeroAddress,
      arbiter: arbiter.account.address, termsHash: keccak256(toBytes(opts.memo)),
    }], { account: payer.account }));
  return before + 1n;
}

const balances = async () => {
  const [p, e, y] = await Promise.all([
    usd.read.balanceOf([payer.account.address]), usd.read.balanceOf([escrow.address]), usd.read.balanceOf([payee.account.address]),
  ]) as [bigint, bigint, bigint];
  say(`\x1b[2m   balances  payer ${Number(p) / 1e6} · escrow ${Number(e) / 1e6} · payee ${Number(y) / 1e6}\x1b[0m`);
};

/* ------------------------------------------------------------------ scenarios */
async function settle() {
  head("1. A settlement that should succeed");
  say("A payer locks 25,000 mUSD for a payee. Two of three approvers must sign.");
  const id = await open({ amount: "25000", quorum: 2, memo: "INV-DEMO-001" });
  await pause(1.5);
  say("\n   Nothing has been ruled yet. One signature short:");
  await report(id);
  await balances();
  await pause(2.5);

  say("\n   Approver A signs. The law runs, and releases nothing.");
  await send("approver A signs", escrow.write.approve([id], { account: a1.account }));
  await report(id, "recorded, nothing moved");
  await pause(2.5);

  say("\n   Approver B signs. Every measurement now reads clear.");
  await send("approver B signs", escrow.write.approve([id], { account: a2.account }));
  await report(id, "the value crossed");
  await balances();
  say("\n   \x1b[1mNobody authorised that release. SETTLE is what was left over.\x1b[0m");
  await pause(2);
  return id;
}

async function dispute() {
  head("2. A dispute, a reversible hold, and an arbiter");
  const id = await open({ amount: "120000", quorum: 2, oracle: true, peg: true, holdMin: 10, memo: "INV-DEMO-002" });
  await pause(1.5);

  say("\n   The payer disputes before anyone has signed.");
  await send("payer opens a dispute", escrow.write.dispute([id], { account: payer.account }));
  await report(id, "two hazards set, the LOWER bit rules: narrower outranks wider");
  await pause(3);

  say("\n   Both approvers sign. The dispute is still there, and so is the oracle.");
  await send("approver A signs", escrow.write.approve([id], { account: a1.account }));
  await send("approver B signs", escrow.write.approve([id], { account: a2.account }));
  await report(id, "still ATTEST: the oracle has not confirmed");
  await pause(3);

  say("\n   The oracle operator validates the off-chain proof.");
  await send("oracle confirms", oracle.write.setConfirmed([id, true], { account: oracleOp.account }));
  await report(id, "only the dispute remains");
  await pause(2);

  say("\n   Anyone may now run the law. It holds, reversibly.");
  await send("crank the law", escrow.write.rule([id], { account: guardian.account }));
  await report(id, "Held: a window is open and the arbiter may reverse it");
  await pause(3);

  say("\n   The arbiter finds for the payee.");
  await send("arbiter releases", escrow.write.resolve([id, 1], { account: arbiter.account }));
  await report(id);
  await balances();
  await pause(2);
  return id;
}

async function depeg() {
  head("3. The stablecoin depegs mid-settlement");
  const id = await open({ amount: "40000", quorum: 1, peg: true, memo: "INV-DEMO-003" });
  say("\n   The price feed reports 0.97 — outside the 2% band.");
  await send("feed reports 0.97", feed.write.setAnswer([97_000_000n], { account: feedOp.account }));
  await send("approver A signs", escrow.write.approve([id], { account: a1.account }));
  await report(id, "a depegging coin holds the crossing instead of settling into it");
  await pause(3);

  say("\n   The peg recovers, the hold window ends, and the law is re-run.");
  await send("feed reports 1.00", feed.write.setAnswer([100_000_000n], { account: feedOp.account }));
  await networkHelpers.time.increase(11 * 60);
  await send("crank the law", escrow.write.rule([id], { account: guardian.account }));
  await report(id);
  await pause(2);
  return id;
}

async function timeout() {
  head("4. Nobody shows up before the deadline");
  const id = await open({ amount: "15000", quorum: 2, days: 1, memo: "INV-DEMO-004" });
  say("\n   Time passes. Eight days, in one line.");
  await networkHelpers.time.increase(8 * 86400);
  await report(id, "expired");
  await pause(2);

  say("\n   A full quorum arrives anyway. It changes nothing.");
  await send("approver A signs", escrow.write.approve([id], { account: a1.account }));
  await send("approver B signs", escrow.write.approve([id], { account: a2.account }));
  await report(id, "expiry sits BELOW attestation, so signatures cannot outrank it");
  await pause(3);

  say("\n   The payer takes their money back.");
  await send("payer refunds", escrow.write.refund([id], { account: payer.account }));
  await report(id);
  await balances();
  await pause(2);
  return id;
}

async function pauseRail() {
  head("5. The guardian turns hostile");
  const id = await open({ amount: "30000", quorum: 1, memo: "INV-DEMO-005" });
  await send("guardian pauses the rail", escrow.write.pause({ account: guardian.account }));
  await send("approver A signs", escrow.write.approve([id], { account: a1.account }));
  await report(id, "paused: the crossing is HELD, never refused");
  await pause(2.5);

  say("\n   The guardian cannot trap the money: the payee can still cancel while paused.");
  const id2 = await open({ amount: "5000", quorum: 1, memo: "INV-DEMO-006" }).catch(() => null);
  if (id2 === null) say("\x1b[2m   (opening new escrows is blocked while paused — as designed)\x1b[0m");
  await send("payee cancels, funds return to the payer", escrow.write.refund([id], { account: payee.account }));
  await report(id);
  await send("guardian unpauses", escrow.write.unpause({ account: guardian.account }));
  await pause(2);
  return id;
}

/* ---------------------------------------------------------------------- main */
console.log(`\n\x1b[1mCROSSING — scripted demo\x1b[0m   escrow ${escrow.address}`);
console.log(`\x1b[2mwatch it at http://localhost:5173 while this runs\x1b[0m`);
const run: Record<string, () => Promise<bigint>> = { settle, dispute, depeg, timeout, pause: pauseRail };
if (SCENARIO === "all") { for (const k of ["settle", "dispute", "depeg", "timeout", "pause"]) await run[k](); }
else if (run[SCENARIO]) await run[SCENARIO]();
else { console.error(`unknown scenario "${SCENARIO}" — try: all settle dispute depeg timeout pause`); process.exit(1); }
head("Done");
console.log("Every act above came from one branchless function: act = ctz(MASK & -MASK).\n");
