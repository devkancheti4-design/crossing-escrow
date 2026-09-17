/**
 * CORS + Private Network Access proxy for the local Hardhat node.
 *
 * Why this exists: Hardhat's JSON-RPC server answers a CORS preflight with
 * `Access-Control-Allow-Methods: OPTIONS, GET` and sends no
 * `Access-Control-Allow-Private-Network` header. A page served over https
 * (the GitHub Pages build of this dApp) therefore cannot POST to it — Chrome
 * rejects the preflight, and Private Network Access blocks a public page from
 * reaching a loopback address without that opt-in.
 *
 * This proxy sits in front of the node and supplies both. It is a LOCAL DEV
 * CONVENIENCE: it accepts any origin, so run it only against a throwaway
 * development chain, never against a node holding real keys.
 *
 *   node scripts/rpc-proxy.mjs                 # :8547 -> http://127.0.0.1:8545
 *   PORT=9000 RPC_TARGET=http://127.0.0.1:8545 node scripts/rpc-proxy.mjs
 */
import http from "node:http";

const TARGET = process.env.RPC_TARGET ?? "http://127.0.0.1:8545";
const PORT = Number(process.env.PORT ?? 8547);

const corsHeaders = (req) => ({
  "Access-Control-Allow-Origin": req.headers.origin ?? "*",
  Vary: "Origin",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": req.headers["access-control-request-headers"] ?? "content-type",
  "Access-Control-Allow-Private-Network": "true",
  "Access-Control-Max-Age": "600",
});

const server = http.createServer((req, res) => {
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") {
    res.writeHead(204, cors);
    res.end();
    return;
  }
  if (req.method !== "POST") {
    res.writeHead(200, { ...cors, "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, proxying: TARGET }));
    return;
  }
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", async () => {
    try {
      const upstream = await fetch(TARGET, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: Buffer.concat(chunks),
      });
      const text = await upstream.text();
      res.writeHead(upstream.status, { ...cors, "content-type": "application/json" });
      res.end(text);
    } catch (err) {
      res.writeHead(502, { ...cors, "content-type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32603, message: `proxy could not reach ${TARGET}: ${err.message}` } }));
    }
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`RPC proxy  http://127.0.0.1:${PORT}  ->  ${TARGET}`);
  console.log("CORS: any origin · Private Network Access: allowed · local development only");
});
