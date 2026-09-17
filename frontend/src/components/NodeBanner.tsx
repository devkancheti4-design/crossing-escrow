import { deployment } from "../config/deployment";
import { useChainTime } from "../hooks/useEscrow";

/** Shown when no chain answers at the configured RPC (e.g. the GitHub Pages build without a local node). */
export function NodeBanner() {
  const t = useChainTime();
  if (!t.isError) return null;
  return (
    <div className="banner red">
      <b>No chain reachable at {deployment.rpcUrl}.</b> This dApp talks to a local Hardhat node on your machine
      (contracts at the canonical first-deploy addresses). In the repository run
      <code> cd contracts &amp;&amp; npx hardhat node </code> in one terminal and
      <code> npm run deploy:local </code> in another, then reload. Chrome or Firefox recommended: they allow an
      https page to reach localhost. The <b>Law explorer</b> works without a chain.
    </div>
  );
}
