import { useState } from "react";
import { EscrowDetail } from "./components/EscrowDetail";
import { EscrowList } from "./components/EscrowList";
import { Header, type Page } from "./components/Header";
import { LawExplorer } from "./components/LawExplorer";
import { NodeBanner } from "./components/NodeBanner";
import { OpenEscrowForm } from "./components/OpenEscrowForm";
import { useSigner } from "./signer/SignerContext";

export default function App() {
  const [page, setPage] = useState<Page>("escrows");
  const [selected, setSelected] = useState<bigint | undefined>(undefined);
  const { demoUnavailable, mode } = useSigner();
  return (
    <div className="app">
      <Header page={page} setPage={(p) => { setPage(p); setSelected(undefined); }} />
      <NodeBanner />
      {mode === "demo" && demoUnavailable && <div className="banner red">{demoUnavailable}</div>}
      <main>
        {page === "escrows" && (selected === undefined ? <EscrowList onOpen={setSelected} /> : <EscrowDetail id={selected} onBack={() => setSelected(undefined)} />)}
        {page === "open" && <OpenEscrowForm onOpened={() => { setPage("escrows"); setSelected(undefined); }} />}
        {page === "law" && <LawExplorer />}
      </main>
      <footer className="muted small">
        Demo roles use the public Hardhat dev keys on a local node only. Non-custodial: funds move only to the payee or the payer, and only through the law (SETTLE), an arbiter during a Held window, the payer's deadline refund, or the payee's cancel.
      </footer>
    </div>
  );
}
