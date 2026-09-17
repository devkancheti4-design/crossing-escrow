import { ConnectButton } from "@rainbow-me/rainbowkit";
import { ROLES, labelFor } from "../config/deployment";
import { useChainTime, useProtocol } from "../hooks/useEscrow";
import { useSigner } from "../signer/SignerContext";
import { fmtTime } from "../lib/format";

export type Page = "escrows" | "open" | "law";

export function Header({ page, setPage }: { page: Page; setPage: (p: Page) => void }) {
  const { mode, setMode, roleKey, setRoleKey, address, demoUnavailable } = useSigner();
  const { paused } = useProtocol();
  const chainTime = useChainTime();
  return (
    <header className="hdr">
      <div className="brand" onClick={() => setPage("escrows")}>
        <span className="brand-mark">⟷</span>
        <span>
          <b>CROSSING</b>
          <small>non-custodial settlement escrow · ruled by a law</small>
        </span>
      </div>
      <nav>
        {(["escrows", "open", "law"] as Page[]).map((p) => (
          <button key={p} className={page === p ? "nav on" : "nav"} onClick={() => setPage(p)}>
            {p === "escrows" ? "Escrows" : p === "open" ? "Open escrow" : "Law explorer"}
          </button>
        ))}
      </nav>
      <div className="hdr-right">
        {paused && <span className="pill red">RAIL PAUSED</span>}
        <span className="chain-time" title="block.timestamp as the contract reads it">
          ⏱ {chainTime.data ? fmtTime(chainTime.data) : "…"}
        </span>
        <div className="mode">
          <button className={mode === "demo" ? "on" : ""} onClick={() => setMode("demo")}>Demo roles</button>
          <button className={mode === "wallet" ? "on" : ""} onClick={() => setMode("wallet")}>Wallet</button>
        </div>
        {mode === "demo" ? (
          <select className="role" value={roleKey} onChange={(e) => setRoleKey(e.target.value)} title={demoUnavailable ?? address}>
            {ROLES.map((r) => (
              <option key={r.key} value={r.key}>{r.label} · {r.address.slice(0, 6)}…</option>
            ))}
          </select>
        ) : (
          <ConnectButton chainStatus="icon" showBalance={false} accountStatus="address" />
        )}
        {mode === "wallet" && address && <span className="pill">{labelFor(address)}</span>}
      </div>
    </header>
  );
}
