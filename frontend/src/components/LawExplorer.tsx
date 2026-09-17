import { useState } from "react";
import { useReadContract } from "wagmi";
import { deployment } from "../config/deployment";
import { crossingLawHarnessAbi } from "../generated/abis";
import { HAZARDS, HELD_OUT, TAUGHT, hex, oracle, rule } from "../law/crossing";
import { HazardPanel } from "./HazardPanel";
import { LawTrace } from "./LawTrace";

export function LawExplorer() {
  const [obs, setObs] = useState(0x04);
  const onchain = useReadContract({ address: deployment.contracts.harness, abi: crossingLawHarnessAbi, functionName: "rule", args: [BigInt(obs)] });
  const toggle = (b: number) => setObs((o) => o ^ (1 << b));
  const partition = [0, 0, 0, 0, 0];
  for (let x = 0; x < 256; x++) partition[rule(x)]++;
  let agree = 0;
  for (let x = 0; x < 256; x++) if (rule(x) === oracle(x)) agree++;
  return (
    <div>
      <div className="page-h"><h2>The CROSSING law</h2><span className="muted">toggle hazards; the TypeScript port and the on-chain kernel rule side by side</span></div>
      <div className="cols">
        <div className="col">
          <div className="card">
            <div className="card-h"><h3>Toggle the situation</h3><span className="mono">{hex(obs)}</span></div>
            <div className="toggles">
              {HAZARDS.map((h) => (
                <button key={h.bit} className={`tg ${h.tier} ${((obs >> h.bit) & 1) ? "on" : ""}`} onClick={() => toggle(h.bit)}>
                  <span className="mono">bit {h.bit}</span> {h.name}<small>{h.tier}</small>
                </button>
              ))}
            </div>
            <div className="row">
              <button className="btn ghost" onClick={() => setObs(0)}>0x00 (SETTLE)</button>
              <button className="btn ghost" onClick={() => setObs(0x04)}>0x04 (ATTEST)</button>
              <button className="btn ghost" onClick={() => setObs(0x10)}>0x10 (ESCROW)</button>
              <button className="btn ghost" onClick={() => setObs(0x18)}>0x18 (attest+degrade)</button>
              <button className="btn ghost" onClick={() => setObs(0xff)}>0xFF (REJECT)</button>
            </div>
          </div>
          <HazardPanel obs={obs} act={rule(obs)} title="Situation byte" />
        </div>
        <div className="col">
          <LawTrace obs={obs} onChainAct={onchain.data === undefined ? undefined : Number(onchain.data)} />
          <div className="card">
            <div className="card-h"><h3>Three ports, one certificate</h3><span className="mono">C · Solidity · TypeScript</span></div>
            <table className="tbl">
              <tbody>
                <tr><td>Partition over 256 bytes</td><td className="mono">SETTLE {partition[4]} · RESV {partition[3]} · ESCROW {partition[2]} · ATTEST {partition[1]} · REJECT {partition[0]}</td></tr>
                <tr><td>Agreement with the branchy oracle</td><td className="mono">{agree} / 256</td></tr>
                <tr><td>TAUGHT (the optimizer saw these)</td><td className="mono">{TAUGHT.map(([b, a]) => `${hex(b)}→${a}${rule(b) === a ? "✓" : "✗"}`).join("  ")}</td></tr>
                <tr><td>HELD-OUT (scored apart)</td><td className="mono">{HELD_OUT.map(([b, a]) => `${hex(b)}→${a}${rule(b) === a ? "✓" : "✗"}`).join("  ")}</td></tr>
                <tr><td>Landing pair</td><td className="mono">rule(0x04)={rule(4)} · rule(0x00)={rule(0)}</td></tr>
                <tr><td>Form</td><td>one MASK, one EMIT, one ctz — no branch, no table, no loop; every bit a hazard; SETTLE is the FLOOR, earned by 0x00 and no other byte</td></tr>
                <tr><td>The fold</td><td>ACT(a|b) = min(ACT a, ACT b): a batch of crossings is ruled by its weakest member (see <span className="mono">previewBatch</span>)</td></tr>
              </tbody>
            </table>
            <p className="muted small">The C kernel (<span className="mono">law/crossing.c</span>) proves the same obligations exhaustively over 0..255, the lift over 2^24, and totality over all 2^32 inputs: <b>TOTAL 0 violations</b>.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
