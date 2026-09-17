import { deployment, labelFor } from "../config/deployment";
import { STATE_NAMES, useChainTime, useEscrow, useProtocol } from "../hooks/useEscrow";
import { rule } from "../law/crossing";
import { fmtDuration, fmtTime, fmtUsd } from "../lib/format";
import { Actions } from "./Actions";
import { HazardPanel } from "./HazardPanel";
import { LawTrace } from "./LawTrace";
import { StateMachine } from "./StateMachine";
import { Timeline } from "./Timeline";
import { TokenFlow } from "./TokenFlow";

export function EscrowDetail({ id, onBack }: { id: bigint; onBack: () => void }) {
  const { escrow: e, preview, isLoading } = useEscrow(id);
  const chainTime = useChainTime();
  const proto = useProtocol();
  if (isLoading || !e) return <div className="muted">loading escrow #{id.toString()}…</div>;
  if (e.state === 0) return <div className="muted">escrow #{id.toString()} does not exist</div>;
  const now = chainTime.data ?? Math.floor(Date.now() / 1000);
  const live = e.state === 1 || e.state === 2;
  // for a final escrow, show the last recorded ruling; for a live one, the live measurement
  const obs = live && preview ? preview[0] : e.lastObs;
  const act = live && preview ? preview[1] : e.lastAct;
  const reasons: Record<number, string> = {
    0: e.funded < e.amount ? `funded ${fmtUsd(e.funded)} < agreed ${fmtUsd(e.amount)}` : "contract balance below funded, or token unreadable",
    1: `deadline ${fmtTime(e.deadline)} has passed`,
    2: `${e.approvalCount} of ${e.quorum} required signatures`,
    3: "the oracle has not confirmed the off-chain proof (or could not be reached)",
    4: "a party opened a dispute",
    5: "price feed off its band or stale",
    6: "the guardian paused the rail",
    7: "settled volume this window is at the ceiling",
  };
  return (
    <div className="detail">
      <div className="detail-h">
        <button className="btn ghost" onClick={onBack}>← all escrows</button>
        <h2>Escrow #{id.toString()} <span className={`pill st-${e.state}`}>{STATE_NAMES[e.state]}</span>{e.disputed && <span className="pill red">disputed</span>}</h2>
        <div className="terms">
          <span><b>{fmtUsd(e.amount)}</b> {e.funded !== e.amount && <em>(funded {fmtUsd(e.funded)})</em>}</span>
          <span>{labelFor(e.payer)} → {labelFor(e.payee)}</span>
          <span>quorum {e.quorum} of {e.approvers.length} · approvals {e.approvalCount}</span>
          <span>oracle {e.oracle === "0x0000000000000000000000000000000000000000" ? "none" : "required"}</span>
          <span>peg check {e.priceFeed === "0x0000000000000000000000000000000000000000" ? "none" : "on"}</span>
          <span>arbiter {e.arbiter === "0x0000000000000000000000000000000000000000" ? "none" : labelFor(e.arbiter)}</span>
          <span>deadline {fmtTime(e.deadline)} ({now > e.deadline ? "passed" : `in ${fmtDuration(e.deadline - now)}`})</span>
          <span>hold window {fmtDuration(e.holdWindow)}{e.state === 2 && <> · held until {fmtTime(e.heldUntil)} ({now < e.heldUntil ? `${fmtDuration(e.heldUntil - now)} left` : "window over — re-rule allowed"})</>}</span>
          {proto.throttle && proto.throttle[0] > 0n && <span className="warn">throttle cap {fmtUsd(proto.throttle[0])} / {fmtDuration(proto.throttle[1])} · used {fmtUsd(proto.throttle[2])}</span>}
        </div>
      </div>
      <div className="cols">
        <div className="col">
          <div className="card"><div className="card-h"><h3>Contract state</h3><span className="mono">{e.lastObs === 0 && e.lastAct === 0 ? "not ruled yet" : `last ruling: obs 0x${e.lastObs.toString(16).padStart(2, "0").toUpperCase()} → act ${e.lastAct}`}</span></div><StateMachine state={e.state} lastAct={e.lastAct} /></div>
          <HazardPanel obs={obs} act={act} reasons={reasons} title={live ? "Live measurement (observe)" : "Last recorded measurement"} />
          <LawTrace obs={obs} onChainAct={live && preview ? preview[1] : undefined} />
        </div>
        <div className="col">
          <Actions id={id} e={e} now={now} act={live ? rule(obs) : undefined} />
          <TokenFlow token={e.token} payer={e.payer} payee={e.payee} />
          <Timeline id={id} />
        </div>
      </div>
      <div className="muted small">escrow {deployment.contracts.escrow} · terms hash {e.termsHash.slice(0, 18)}…</div>
    </div>
  );
}
