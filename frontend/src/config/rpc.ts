import { deployment } from "./deployment";

const KEY = "crossing.rpcUrl";

/** The proxy port used when this page is served over https (see contracts/scripts/rpc-proxy.mjs). */
export const PROXY_URL = "http://127.0.0.1:8547";

/**
 * Which RPC endpoint this page talks to.
 *
 * A page served over https (the GitHub Pages build) cannot call the Hardhat node
 * directly: the node answers a CORS preflight with `Access-Control-Allow-Methods:
 * OPTIONS, GET` — no POST — and sends no `Access-Control-Allow-Private-Network`
 * header, which Chrome now requires before a public page may reach a loopback
 * address. `npm run rpc:proxy` in contracts/ supplies both on 8547.
 */
export function resolveRpcUrl(): string {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) return saved;
  } catch {
    /* private mode / blocked storage: fall through to the defaults */
  }
  if (typeof location !== "undefined" && location.protocol === "https:") return PROXY_URL;
  return deployment.rpcUrl;
}

export function setRpcUrl(url: string): void {
  try {
    localStorage.setItem(KEY, url.trim());
  } catch {
    /* ignore */
  }
  location.reload();
}

export function clearRpcUrl(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  location.reload();
}

export const isHttps = typeof location !== "undefined" && location.protocol === "https:";
