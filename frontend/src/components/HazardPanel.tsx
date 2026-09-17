import { ACT_MEANING, ACT_NAMES, HAZARDS, bin, hex } from "../law/crossing";

const TIER_LABEL = { veto: "veto → REJECT", attest: "attest → ATTEST", degrade: "degrade → ESCROW" } as const;

export function HazardPanel({ obs, act, reasons, title }: { obs: number; act: number; reasons?: Record<number, string>; title?: string }) {
  return (
    <div className="card">
      <div className="card-h">
        <h3>{title ?? "The situation byte"}</h3>
        <span className="mono">obs {hex(obs)} · {bin(obs)}</span>
      </div>
      <div className="leds">
        {HAZARDS.map((h) => {
          const set = ((obs >> h.bit) & 1) === 1;
          return (
            <div key={h.bit} className={`led ${h.tier} ${set ? "set" : ""}`} title={h.meaning}>
              <div className="led-dot" />
              <div className="led-body">
                <div className="led-name">bit {h.bit} · {h.name}</div>
                <div className="led-tier">{TIER_LABEL[h.tier]}</div>
                <div className="led-reason">{set ? (reasons?.[h.bit] ?? h.meaning) : "clear"}</div>
              </div>
            </div>
          );
        })}
      </div>
      <div className={`act act-${act}`}>
        <span className="act-num">act {act}</span>
        <span className="act-name">{ACT_NAMES[act]}</span>
        <span className="act-meaning">{ACT_MEANING[act]}</span>
      </div>
    </div>
  );
}
