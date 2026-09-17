import { labelFor } from "../config/deployment";
import { useEscrowEvents } from "../hooks/useEscrow";
import { ACT_NAMES, hex } from "../law/crossing";
import { fmtTime, fmtUsd } from "../lib/format";

const VERDICT = ["Dismiss", "Release", "Refund"];

function describe(name: string, a: Record<string, unknown>): string {
  switch (name) {
    case "Opened": return `opened by ${labelFor(String(a.payer))} for ${labelFor(String(a.payee))} · ${fmtUsd(a.amount as bigint)} (funded ${fmtUsd(a.funded as bigint)})`;
    case "Approved": return `${labelFor(String(a.approver))} approved · ${String(a.approvalCount)}/${String(a.quorum)} of quorum`;
    case "Disputed": return `dispute opened by ${labelFor(String(a.by))}`;
    case "Ruled": return `the law ruled: obs ${hex(Number(a.obs))} → act ${String(a.act)} ${ACT_NAMES[Number(a.act)]}`;
    case "HeldFor": return `held until ${fmtTime(Number(a.heldUntil))}`;
    case "Resolved": return `arbiter ${labelFor(String(a.arbiter))}: ${VERDICT[Number(a.verdict)]}`;
    case "Settled": return `SETTLED · ${fmtUsd(a.amount as bigint)} → ${labelFor(String(a.to))}`;
    case "Refunded": return `REFUNDED · ${fmtUsd(a.amount as bigint)} → ${labelFor(String(a.to))}`;
    default: return JSON.stringify(a, (_, v) => (typeof v === "bigint" ? v.toString() : v));
  }
}

export function Timeline({ id }: { id: bigint }) {
  const ev = useEscrowEvents(id);
  return (
    <div className="card">
      <div className="card-h"><h3>Timeline</h3><span className="mono">{ev.data?.length ?? 0} events</span></div>
      <ol className="timeline">
        {(ev.data ?? []).map((e) => (
          <li key={e.txHash + e.logIndex} className={`ev ev-${e.name}`}>
            <span className="ev-name">{e.name}</span>
            <span className="ev-desc">{describe(e.name, e.args)}</span>
            <span className="mono small">blk {e.blockNumber.toString()}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
