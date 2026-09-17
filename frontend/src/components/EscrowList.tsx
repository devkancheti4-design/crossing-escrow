import { labelFor } from "../config/deployment";
import { STATE_NAMES, useEscrowCount, useEscrowList } from "../hooks/useEscrow";
import { ACT_NAMES } from "../law/crossing";
import { fmtUsd } from "../lib/format";

export function EscrowList({ onOpen }: { onOpen: (id: bigint) => void }) {
  const count = useEscrowCount();
  const list = useEscrowList(count.data);
  return (
    <div>
      <div className="page-h"><h2>Escrows</h2><span className="muted">{count.data?.toString() ?? "…"} on this rail · polling live</span></div>
      <div className="grid">
        {list.items.map(({ id, escrow: e }) => e && (
          <div key={id.toString()} className={`ecard st-${e.state}`} onClick={() => onOpen(id)}>
            <div className="ecard-h"><b>#{id.toString()}</b><span className={`pill st-${e.state}`}>{STATE_NAMES[e.state]}</span>{e.disputed && <span className="pill red">disputed</span>}</div>
            <div className="ecard-amt">{fmtUsd(e.amount)}</div>
            <div className="muted">{labelFor(e.payer)} → {labelFor(e.payee)}</div>
            <div className="muted small">quorum {e.quorum}/{e.approvers.length} · approvals {e.approvalCount}{e.oracle !== "0x0000000000000000000000000000000000000000" && " · oracle"}{e.priceFeed !== "0x0000000000000000000000000000000000000000" && " · peg"}</div>
            <div className="muted small mono">{e.lastObs === 0 && e.lastAct === 0 ? "not ruled yet" : `last act: ${e.lastAct} ${ACT_NAMES[e.lastAct]} (obs 0x${e.lastObs.toString(16).padStart(2, "0").toUpperCase()})`}</div>
          </div>
        ))}
        {list.items.length === 0 && !list.isLoading && <div className="muted">No escrows yet. Open one.</div>}
      </div>
    </div>
  );
}
