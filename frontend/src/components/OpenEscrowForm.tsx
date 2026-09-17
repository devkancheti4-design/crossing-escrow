import { useState } from "react";
import { keccak256, parseUnits, toBytes, zeroAddress, type Address } from "viem";
import { ROLES, deployment } from "../config/deployment";
import { chain } from "../config/wagmi";
import { mockUsdAbi, settlementEscrowAbi } from "../generated/abis";
import { useBalances, useChainTime } from "../hooks/useEscrow";
import { useTx } from "../hooks/useTx";
import { useSigner } from "../signer/SignerContext";
import { fmtUsd } from "../lib/format";

const approverRoles = ROLES.filter((r) => r.key.startsWith("approver"));

export function OpenEscrowForm({ onOpened }: { onOpened: (id?: bigint) => void }) {
  const { address } = useSigner();
  const { state, send, canSend } = useTx();
  const chainTime = useChainTime();
  const bal = useBalances(deployment.contracts.usd, [address]);
  const [payee, setPayee] = useState<string>(deployment.roles.payee);
  const [amount, setAmount] = useState("25000");
  const [days, setDays] = useState("7");
  const [holdMin, setHoldMin] = useState("10");
  const [approvers, setApprovers] = useState<string[]>(approverRoles.map((r) => r.address));
  const [quorum, setQuorum] = useState("2");
  const [oracle, setOracle] = useState(false);
  const [peg, setPeg] = useState(false);
  const [arbiter, setArbiter] = useState(true);
  const [terms, setTerms] = useState("INV-2026-0917-003: goods per contract, FOB, net 7 days");

  const toggleApprover = (a: string) => setApprovers((xs) => (xs.includes(a) ? xs.filter((x) => x !== a) : [...xs, a]));
  const myBal = address ? bal[address.toLowerCase()] : undefined;

  const submit = async () => {
    const now = chainTime.data ?? Math.floor(Date.now() / 1000);
    const amt = parseUnits(amount || "0", 6);
    await send("mint + approve + open", async (wc) => {
      // demo convenience: top up and approve the escrow first (three txs; the last hash is awaited)
      const acct = wc.account!;
      if (myBal === undefined || myBal < amt) {
        await wc.writeContract({ address: deployment.contracts.usd, abi: mockUsdAbi, functionName: "mint", args: [acct.address, amt], account: acct, chain });
      }
      await wc.writeContract({ address: deployment.contracts.usd, abi: mockUsdAbi, functionName: "approve", args: [deployment.contracts.escrow, amt], account: acct, chain });
      return wc.writeContract({
        address: deployment.contracts.escrow,
        abi: settlementEscrowAbi,
        functionName: "open",
        args: [{
          payee: payee as Address,
          token: deployment.contracts.usd,
          amount: amt,
          deadline: now + Math.max(1, Math.round(Number(days) * 86400)),
          holdWindow: Math.max(1, Math.round(Number(holdMin) * 60)),
          quorum: Number(quorum),
          approvers: approvers as Address[],
          oracle: oracle ? deployment.contracts.oracle : zeroAddress,
          priceFeed: peg ? deployment.contracts.feed : zeroAddress,
          arbiter: arbiter ? deployment.roles.arbiter : zeroAddress,
          termsHash: keccak256(toBytes(terms)),
        }],
        account: acct,
        chain,
      });
    });
    onOpened();
  };

  return (
    <div className="form card">
      <div className="page-h"><h2>Open an escrow</h2><span className="muted">you are the payer · balance {fmtUsd(myBal)}</span></div>
      <label>Payee<select value={payee} onChange={(e) => setPayee(e.target.value)}>{ROLES.map((r) => <option key={r.key} value={r.address}>{r.label} · {r.address.slice(0, 8)}…</option>)}</select></label>
      <div className="row">
        <label>Amount (mUSD)<input value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
        <label>Deadline (days)<input value={days} onChange={(e) => setDays(e.target.value)} /></label>
        <label>Hold window (minutes)<input value={holdMin} onChange={(e) => setHoldMin(e.target.value)} /></label>
        <label>Quorum<input value={quorum} onChange={(e) => setQuorum(e.target.value)} /></label>
      </div>
      <div className="row">
        <span className="lbl">Approvers</span>
        {approverRoles.map((r) => <label key={r.key} className="chk"><input type="checkbox" checked={approvers.includes(r.address)} onChange={() => toggleApprover(r.address)} />{r.label}</label>)}
      </div>
      <div className="row">
        <label className="chk"><input type="checkbox" checked={oracle} onChange={(e) => setOracle(e.target.checked)} />Require oracle confirmation of the off-chain proof</label>
        <label className="chk"><input type="checkbox" checked={peg} onChange={(e) => setPeg(e.target.checked)} />Peg check via price feed (2% band, 1h heartbeat)</label>
        <label className="chk"><input type="checkbox" checked={arbiter} onChange={(e) => setArbiter(e.target.checked)} />Arbiter for disputes</label>
      </div>
      <label>Terms (hashed on-chain as termsHash)<textarea value={terms} onChange={(e) => setTerms(e.target.value)} rows={2} /></label>
      <div className="row">
        <button className="btn primary" disabled={!canSend || state.status === "signing" || state.status === "mining"} onClick={submit}>Fund & open escrow</button>
        {state.status !== "idle" && <span className={`txs ${state.status}`}>{state.status === "done" ? "opened ✓" : state.status === "error" ? `reverted: ${state.error}` : `${state.status}…`}</span>}
      </div>
      <p className="muted small">The contract measures what actually arrived (fee-on-transfer safe). Nothing is ruled at open; the first approval or a manual "rule" runs the law.</p>
    </div>
  );
}
