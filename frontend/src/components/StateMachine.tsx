import { STATE_NAMES } from "../hooks/useEscrow";

/** Open -> Held -> Settled / Refunded, with the live state lit. */
export function StateMachine({ state, lastAct }: { state: number; lastAct: number }) {
  const on = (s: number) => (state === s ? "sm-node on" : "sm-node");
  const edge = (_from: number, to: number, viaAct?: number) => {
    const active = state === to && (viaAct === undefined || lastAct === viaAct);
    return active ? "sm-edge on" : "sm-edge";
  };
  return (
    <svg viewBox="0 0 640 220" className="sm" role="img" aria-label="escrow state machine">
      <defs>
        <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
        </marker>
      </defs>
      {/* edges */}
      <path className={edge(1, 2, 2)} d="M150,110 C220,110 240,60 320,60" markerEnd="url(#arr)" />
      <text className="sm-lbl" x="215" y="66">ESCROW (act 2)</text>
      <path className={edge(1, 3, 4)} d="M150,124 C260,160 360,150 470,110" markerEnd="url(#arr)" />
      <text className="sm-lbl" x="250" y="152">SETTLE (act 4)</text>
      <path className={edge(2, 3)} d="M400,60 C440,60 460,80 470,98" markerEnd="url(#arr)" />
      <text className="sm-lbl" x="395" y="46">re-rule SETTLE · arbiter Release</text>
      <path className={edge(2, 4)} d="M360,84 C360,140 420,180 470,190" markerEnd="url(#arr)" />
      <text className="sm-lbl" x="300" y="200">arbiter Refund · payer after deadline+window</text>
      <path className={edge(1, 4)} d="M110,140 C120,210 300,215 470,204" markerEnd="url(#arr)" />
      <text className="sm-lbl" x="130" y="212">payer after deadline · payee cancel</text>
      <path className={state === 2 ? "sm-edge loop on" : "sm-edge loop"} d="M345,38 C330,10 390,10 375,38" markerEnd="url(#arr)" />
      <text className="sm-lbl" x="322" y="14">re-hold</text>
      {/* nodes */}
      <g className={on(1)}><rect x="40" y="90" width="110" height="44" rx="10" /><text x="95" y="118">Open</text></g>
      <g className={on(2)}><rect x="305" y="38" width="100" height="44" rx="10" /><text x="355" y="66">Held</text></g>
      <g className={on(3) + " ok"}><rect x="470" y="88" width="130" height="44" rx="10" /><text x="535" y="116">Settled</text></g>
      <g className={on(4) + " back"}><rect x="470" y="172" width="130" height="44" rx="10" /><text x="535" y="200">Refunded</text></g>
      <text className="sm-state" x="20" y="30">state: {STATE_NAMES[state]}</text>
    </svg>
  );
}
