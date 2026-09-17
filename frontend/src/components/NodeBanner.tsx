import { useState } from "react";
import { RPC_URL } from "../config/wagmi";
import { PROXY_URL, clearRpcUrl, isHttps, setRpcUrl } from "../config/rpc";
import { useChainTime } from "../hooks/useEscrow";

/** Shown when no chain answers at the configured RPC endpoint. */
export function NodeBanner() {
  const t = useChainTime();
  const [url, setUrl] = useState(RPC_URL);
  if (!t.isError) return null;
  return (
    <div className="banner red">
      <b>No chain reachable at {RPC_URL}.</b> This dApp talks to a Hardhat node on your own machine.
      In the repository run <code>cd contracts &amp;&amp; npx hardhat node</code> in one terminal and{" "}
      <code>npm run deploy:local</code> in another.
      {isHttps && (
        <>
          {" "}
          Because this page is served over https, it cannot call the node directly: Hardhat's preflight
          does not allow POST and sends no Private Network Access header. Also run{" "}
          <code>npm run rpc:proxy</code> in contracts/, which supplies both on {PROXY_URL}. For the
          smoothest demo, run the dApp locally instead with <code>cd frontend &amp;&amp; npm run dev</code>.
        </>
      )}
      <span className="banner-rpc">
        <input value={url} onChange={(e) => setUrl(e.target.value)} spellCheck={false} aria-label="RPC endpoint" />
        <button className="btn" onClick={() => setRpcUrl(url)}>Use this RPC</button>
        <button className="btn ghost" onClick={clearRpcUrl}>Reset</button>
      </span>
      <span className="banner-note">The Law explorer works without a chain.</span>
    </div>
  );
}
