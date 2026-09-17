import { explain } from "../law/crossing";

/** mask bits → EMIT → ctz, and the WHY in the law's own words. */
export function LawTrace({ obs, onChainAct }: { obs: number; onChainAct?: number }) {
  const e = explain(obs);
  const maskBits = [4, 3, 2, 1, 0].map((b) => ({ b, set: ((e.mask >> b) & 1) === 1, emit: e.emit === 1 << b }));
  const names: Record<number, string> = { 0: "REJECT", 1: "ATTEST", 2: "ESCROW", 3: "RESERVED", 4: "SETTLE (FLOOR)" };
  return (
    <div className="card">
      <div className="card-h">
        <h3>The law's trace</h3>
        <span className="mono">act = ctz(EMIT(MASK(obs)))</span>
      </div>
      <div className="lanes">
        {e.bits.map((b) => (
          <div key={b.bit} className={`lane ${b.set ? "set" : ""}`}>
            <span className="mono">L_{b.name}</span>
            <span className="mono">= {b.lane}</span>
          </div>
        ))}
      </div>
      <div className="maskrow">
        {maskBits.map((m) => (
          <div key={m.b} className={`maskbit ${m.set ? "set" : ""} ${m.emit ? "emit" : ""}`}>
            <div className="mb-num">bit {m.b}</div>
            <div className="mb-val">{m.set ? 1 : 0}</div>
            <div className="mb-name">{names[m.b]}</div>
            {m.emit && <div className="mb-emit">EMIT ← lowest set bit</div>}
          </div>
        ))}
      </div>
      <p className="why">
        <b>MASK</b> = {e.mask} (0b{e.mask.toString(2).padStart(5, "0")}) · <b>EMIT</b> = {e.emit} · <b>ctz</b> = {e.act} → <b>{e.actName}</b>
        {onChainAct !== undefined && (
          <span className={onChainAct === e.act ? "pill ok" : "pill red"}>
            on-chain act {onChainAct} {onChainAct === e.act ? "✓ agrees" : "✗ MISMATCH"}
          </span>
        )}
      </p>
      <p className="why">{e.why}</p>
    </div>
  );
}
