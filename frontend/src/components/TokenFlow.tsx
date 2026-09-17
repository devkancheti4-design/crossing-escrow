import type { Address } from "viem";
import { deployment, labelFor } from "../config/deployment";
import { useBalances, useTokenTransfers } from "../hooks/useEscrow";
import { fmtUsd } from "../lib/format";

export function TokenFlow({ token, payer, payee }: { token: Address; payer: Address; payee: Address }) {
  const escrow = deployment.contracts.escrow;
  const bal = useBalances(token, [payer, escrow, payee]);
  const transfers = useTokenTransfers(token);
  const b = (a: Address) => bal[a.toLowerCase()];
  return (
    <div className="card">
      <div className="card-h"><h3>Token flow</h3><span className="mono">{token.slice(0, 10)}… (mUSD)</span></div>
      <div className="flow">
        <div className="flow-node"><div className="flow-lbl">Payer</div><div className="flow-val">{fmtUsd(b(payer))}</div><div className="mono small">{labelFor(payer)}</div></div>
        <div className="flow-arrow">⟶</div>
        <div className="flow-node escrow"><div className="flow-lbl">Escrow contract</div><div className="flow-val">{fmtUsd(b(escrow))}</div><div className="mono small">all live escrows</div></div>
        <div className="flow-arrow">⟶</div>
        <div className="flow-node"><div className="flow-lbl">Payee</div><div className="flow-val">{fmtUsd(b(payee))}</div><div className="mono small">{labelFor(payee)}</div></div>
      </div>
      <div className="transfers">
        {(transfers.data ?? []).slice(0, 8).map((t) => (
          <div key={t.txHash + t.logIndex} className="transfer">
            <span className="mono small">#{t.blockNumber.toString()}</span>
            <span>{labelFor(t.from)} → {labelFor(t.to)}</span>
            <span className={t.to.toLowerCase() === escrow.toLowerCase() ? "in" : "out"}>{t.to.toLowerCase() === escrow.toLowerCase() ? "+" : "−"}{fmtUsd(t.value)}</span>
          </div>
        ))}
        {transfers.data && transfers.data.length === 0 && <div className="muted">no transfers yet</div>}
      </div>
    </div>
  );
}
