import { deployment, roleOf } from "../config/deployment";
import { mockPriceFeedAbi, mockSettlementOracleAbi, settlementEscrowAbi } from "../generated/abis";
import { type EscrowView, useOracleConfirmed } from "../hooks/useEscrow";
import { useTx } from "../hooks/useTx";
import { useSigner } from "../signer/SignerContext";
import { chain } from "../config/wagmi";
import { fmtDuration } from "../lib/format";
import { useChainTravel } from "../hooks/useChainTravel";

const ESCROW = deployment.contracts.escrow;

export function Actions({ id, e, now, act }: { id: bigint; e: EscrowView; now: number; act?: number }) {
  const { address } = useSigner();
  const { state, send, reset, canSend } = useTx();
  const oracleConfirmed = useOracleConfirmed(id, e.oracle);
  const travel = useChainTravel();
  const me = address?.toLowerCase();
  const role = roleOf(address);
  const live = e.state === 1 || e.state === 2;
  const isPayer = me === e.payer.toLowerCase();
  const isPayee = me === e.payee.toLowerCase();
  const approverIdx = e.approvers.findIndex((a) => a.toLowerCase() === me);
  const hasApproved = approverIdx >= 0 && ((e.approvals >> approverIdx) & 1) === 1;
  const isArbiter = !!me && me === e.arbiter.toLowerCase() && e.arbiter !== "0x0000000000000000000000000000000000000000";
  const isGuardian = me === deployment.roles.guardian.toLowerCase();
  const isOracleOp = me === deployment.roles.oracleOperator.toLowerCase() && e.oracle.toLowerCase() === deployment.contracts.oracle.toLowerCase();
  const isFeedOp = me === deployment.roles.feedOperator.toLowerCase() && e.priceFeed.toLowerCase() === deployment.contracts.feed.toLowerCase();
  const holdActive = e.state === 2 && now < e.heldUntil;
  const pastDeadline = now > e.deadline;

  const w = (label: string, fn: "approve" | "dispute" | "rule" | "refund") =>
    send(label, (wc) => wc.writeContract({ address: ESCROW, abi: settlementEscrowAbi, functionName: fn, args: [id], account: wc.account!, chain }));
  const resolve = (v: 0 | 1 | 2, label: string) =>
    send(label, (wc) => wc.writeContract({ address: ESCROW, abi: settlementEscrowAbi, functionName: "resolve", args: [id, v], account: wc.account!, chain }));

  const btn = (label: string, on: () => void, opts: { enabled?: boolean; hint?: string; kind?: string } = {}) => (
    <button key={label} className={`btn ${opts.kind ?? ""}`} disabled={!canSend || opts.enabled === false || state.status === "signing" || state.status === "mining"} onClick={on} title={opts.hint}>
      {label}
    </button>
  );

  const groups: Array<{ title: string; items: React.ReactNode[] }> = [];

  if (live) {
    const anyone: React.ReactNode[] = [
      btn(act === 4 ? "Run the law → SETTLE" : "Run the law (rule)", () => w("rule", "rule"), {
        enabled: !holdActive,
        hint: holdActive ? `hold window active for ${fmtDuration(e.heldUntil - now)}` : "anyone may crank the law; funds move only on SETTLE",
        kind: act === 4 ? "primary" : "",
      }),
    ];
    groups.push({ title: "Anyone", items: anyone });
  }

  if (live && approverIdx >= 0) {
    groups.push({ title: `Approver ${["A", "B", "C"][approverIdx] ?? approverIdx + 1}`, items: [btn(hasApproved ? "Approved ✓" : "Approve (sign)", () => w("approve", "approve"), { enabled: !hasApproved, kind: "primary" })] });
  }
  if (live && (isPayer || isPayee)) {
    const items: React.ReactNode[] = [btn(e.disputed ? "Disputed ✓" : "Open dispute", () => w("dispute", "dispute"), { enabled: !e.disputed, kind: "warn" })];
    if (isPayee) items.push(btn("Cancel → refund payer", () => w("refund (cancel)", "refund"), { kind: "warn" }));
    if (isPayer) items.push(btn("Refund (after deadline)", () => w("refund", "refund"), { enabled: pastDeadline && !holdActive, hint: !pastDeadline ? `deadline in ${fmtDuration(e.deadline - now)}` : holdActive ? "hold window still active" : "" }));
    groups.push({ title: isPayer ? "Payer" : "Payee", items });
  }
  if (isArbiter && live) {
    groups.push({
      title: "Arbiter (only while Held)",
      items: [
        btn("Dismiss dispute", () => resolve(0, "resolve: Dismiss"), { enabled: e.disputed }),
        btn("Release → payee", () => resolve(1, "resolve: Release"), { enabled: e.state === 2, kind: "primary" }),
        btn("Refund → payer", () => resolve(2, "resolve: Refund"), { enabled: e.state === 2, kind: "warn" }),
      ],
    });
  }
  if (isOracleOp) {
    const c = !!oracleConfirmed.data;
    groups.push({
      title: "Oracle operator",
      items: [btn(c ? "Revoke confirmation" : "Confirm off-chain proof", () => send(c ? "oracle: revoke" : "oracle: confirm", (wc) => wc.writeContract({ address: deployment.contracts.oracle, abi: mockSettlementOracleAbi, functionName: "setConfirmed", args: [id, !c], account: wc.account!, chain })), { kind: c ? "warn" : "primary" })],
    });
  }
  if (isFeedOp) {
    const setPrice = (p: bigint, label: string) => send(label, (wc) => wc.writeContract({ address: deployment.contracts.feed, abi: mockPriceFeedAbi, functionName: "setAnswer", args: [p], account: wc.account!, chain }));
    const setAge = (ts: bigint, label: string) => send(label, (wc) => wc.writeContract({ address: deployment.contracts.feed, abi: mockPriceFeedAbi, functionName: "setUpdatedAt", args: [ts], account: wc.account!, chain }));
    groups.push({
      title: "Feed operator",
      items: [
        btn("Price 1.00 (pegged)", () => setPrice(100_000_000n, "feed: 1.00")),
        btn("Price 0.97 (depeg)", () => setPrice(97_000_000n, "feed: 0.97"), { kind: "warn" }),
        btn("Mark stale (2 days old)", () => setAge(BigInt(Math.max(1, now - 2 * 86400)), "feed: stale"), { kind: "warn" }),
        btn("Mark fresh", () => setAge(0n, "feed: fresh")),
      ],
    });
  }
  if (isGuardian) {
    groups.push({
      title: "Guardian",
      items: [
        btn("Pause rail", () => send("pause", (wc) => wc.writeContract({ address: ESCROW, abi: settlementEscrowAbi, functionName: "pause", account: wc.account!, chain })), { kind: "warn" }),
        btn("Unpause", () => send("unpause", (wc) => wc.writeContract({ address: ESCROW, abi: settlementEscrowAbi, functionName: "unpause", account: wc.account!, chain }))),
        btn("Throttle: cap 30k / 1h", () => send("setThrottle", (wc) => wc.writeContract({ address: ESCROW, abi: settlementEscrowAbi, functionName: "setThrottle", args: [30_000_000_000n, 3600], account: wc.account!, chain })), { kind: "warn" }),
        btn("Throttle off", () => send("setThrottle(0)", (wc) => wc.writeContract({ address: ESCROW, abi: settlementEscrowAbi, functionName: "setThrottle", args: [0n, 0], account: wc.account!, chain }))),
      ],
    });
  }
  if (travel.available && live) {
    groups.push({
      title: "Local chain clock (Hardhat only)",
      items: [
        btn("⏩ +10 min", () => travel.skip(600)),
        btn("⏩ +1 day", () => travel.skip(86400)),
        btn("⏩ +8 days (past deadline)", () => travel.skip(8 * 86400), { kind: "warn" }),
      ],
    });
  }

  return (
    <div className="card">
      <div className="card-h"><h3>Actions</h3><span className="pill">{role ? role.label : address ? "unknown address" : "no signer"}</span></div>
      {!live && <div className="muted">This escrow is final ({e.state === 3 ? "Settled" : "Refunded"}). Nothing further can happen to it.</div>}
      {groups.map((g) => (
        <div key={g.title} className="agroup">
          <div className="agroup-t">{g.title}</div>
          <div className="agroup-b">{g.items}</div>
        </div>
      ))}
      {live && groups.length <= 1 && <div className="muted">Switch role (top right) to act as a party of this escrow.</div>}
      {state.status !== "idle" && (
        <div className={`txs ${state.status}`} onClick={reset}>
          <b>{state.label}</b> · {state.status === "signing" ? "signing…" : state.status === "mining" ? "mining…" : state.status === "done" ? "confirmed ✓" : `reverted: ${state.error}`}
          {state.hash && <span className="mono small"> {state.hash.slice(0, 12)}…</span>}
        </div>
      )}
    </div>
  );
}
