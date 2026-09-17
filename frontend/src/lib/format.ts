import { formatUnits } from "viem";

export const fmtUsd = (v: bigint | undefined, decimals = 6) =>
  v === undefined ? "—" : Number(formatUnits(v, decimals)).toLocaleString("en-US", { maximumFractionDigits: 2 }) + " mUSD";

export const fmtTime = (ts: number | undefined) => (!ts ? "—" : new Date(ts * 1000).toLocaleString());

export function fmtDuration(s: number): string {
  if (!Number.isFinite(s)) return "—";
  const neg = s < 0;
  s = Math.abs(Math.round(s));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const parts = [] as string[];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (!d && !h) parts.push(`${sec}s`);
  return (neg ? "-" : "") + parts.join(" ");
}
