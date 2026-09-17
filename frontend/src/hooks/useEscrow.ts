import { useQuery } from "@tanstack/react-query";
import { erc20Abi, type Address } from "viem";
import { usePublicClient, useReadContract, useReadContracts } from "wagmi";
import { deployment } from "../config/deployment";
import { mockPriceFeedAbi, mockSettlementOracleAbi, settlementEscrowAbi } from "../generated/abis";

export const POLL = 1500;
const ESCROW = deployment.contracts.escrow;

export type EscrowView = {
  payer: Address; payee: Address; token: Address; amount: bigint; funded: bigint;
  deadline: number; holdWindow: number; heldUntil: number; quorum: number; approvalCount: number;
  approvals: number; approvers: readonly Address[]; oracle: Address; priceFeed: Address; arbiter: Address;
  termsHash: `0x${string}`; state: number; disputed: boolean; lastObs: number; lastAct: number;
};

export const STATE_NAMES = ["None", "Open", "Held", "Settled", "Refunded"] as const;

export function useEscrowCount() {
  return useReadContract({ address: ESCROW, abi: settlementEscrowAbi, functionName: "escrowCount", query: { refetchInterval: POLL } });
}

export function useEscrow(id: bigint | undefined) {
  const enabled = id !== undefined && id > 0n;
  const view = useReadContract({ address: ESCROW, abi: settlementEscrowAbi, functionName: "getEscrow", args: [id ?? 0n], query: { enabled, refetchInterval: POLL } });
  const preview = useReadContract({ address: ESCROW, abi: settlementEscrowAbi, functionName: "preview", args: [id ?? 0n], blockTag: "pending", query: { enabled: enabled && !!view.data && view.data.state !== 0, refetchInterval: POLL, retry: false } });
  return { escrow: view.data as EscrowView | undefined, preview: preview.data as readonly [number, number] | undefined, isLoading: view.isLoading, error: view.error };
}

export function useEscrowList(count: bigint | undefined) {
  const n = Number(count ?? 0n);
  const ids = Array.from({ length: n }, (_, i) => BigInt(i + 1));
  const res = useReadContracts({
    contracts: ids.map((id) => ({ address: ESCROW, abi: settlementEscrowAbi, functionName: "getEscrow" as const, args: [id] as const })),
    query: { enabled: n > 0, refetchInterval: POLL },
  });
  const items = (res.data ?? []).map((r, i) => ({ id: ids[i], escrow: r.status === "success" ? (r.result as EscrowView) : undefined }));
  return { items, isLoading: res.isLoading };
}

export function useBalances(token: Address | undefined, holders: (Address | undefined)[]) {
  const hs = holders.filter((h): h is Address => !!h);
  const res = useReadContracts({
    contracts: hs.map((h) => ({ address: token!, abi: erc20Abi, functionName: "balanceOf" as const, args: [h] as const })),
    query: { enabled: !!token && hs.length > 0, refetchInterval: POLL },
  });
  const out: Record<string, bigint> = {};
  hs.forEach((h, i) => { const r = res.data?.[i]; if (r && r.status === "success") out[h.toLowerCase()] = r.result as bigint; });
  return out;
}

export function useProtocol() {
  const paused = useReadContract({ address: ESCROW, abi: settlementEscrowAbi, functionName: "paused", query: { refetchInterval: POLL } });
  const throttle = useReadContract({ address: ESCROW, abi: settlementEscrowAbi, functionName: "throttle", query: { refetchInterval: POLL } });
  const band = useReadContract({ address: ESCROW, abi: settlementEscrowAbi, functionName: "PEG_BAND_BPS" });
  const heartbeat = useReadContract({ address: ESCROW, abi: settlementEscrowAbi, functionName: "FEED_HEARTBEAT" });
  const feed = useReadContract({ address: deployment.contracts.feed, abi: mockPriceFeedAbi, functionName: "latestRoundData", query: { refetchInterval: POLL } });
  return { paused: paused.data, throttle: throttle.data, band: band.data, heartbeat: heartbeat.data, feed: feed.data };
}

export function useOracleConfirmed(id: bigint | undefined, oracle: Address | undefined) {
  const isMock = !!oracle && oracle.toLowerCase() === deployment.contracts.oracle.toLowerCase();
  return useReadContract({ address: deployment.contracts.oracle, abi: mockSettlementOracleAbi, functionName: "isConfirmed", args: [id ?? 0n], query: { enabled: isMock && id !== undefined, refetchInterval: POLL } });
}

export interface TimelineEvent {
  blockNumber: bigint;
  logIndex: number;
  txHash: `0x${string}`;
  name: string;
  args: Record<string, unknown>;
}

export function useEscrowEvents(id: bigint | undefined) {
  const client = usePublicClient();
  return useQuery({
    queryKey: ["escrow-events", id?.toString()],
    enabled: !!client && id !== undefined,
    refetchInterval: POLL,
    queryFn: async (): Promise<TimelineEvent[]> => {
      const logs = await client!.getContractEvents({ address: ESCROW, abi: settlementEscrowAbi, fromBlock: 0n, toBlock: "latest" });
      return logs
        .filter((l) => { const a = l.args as Record<string, unknown>; return a && "id" in a ? (a.id as bigint) === id : false; })
        .map((l) => ({ blockNumber: l.blockNumber, logIndex: l.logIndex, txHash: l.transactionHash, name: l.eventName, args: l.args as Record<string, unknown> }))
        .sort((a, b) => (a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : Number(a.blockNumber - b.blockNumber)));
    },
  });
}

export function useTokenTransfers(token: Address | undefined) {
  const client = usePublicClient();
  return useQuery({
    queryKey: ["transfers", token],
    enabled: !!client && !!token,
    refetchInterval: POLL,
    queryFn: async () => {
      const [outs, ins] = await Promise.all([
        client!.getContractEvents({ address: token!, abi: erc20Abi, eventName: "Transfer", args: { from: ESCROW }, fromBlock: 0n }),
        client!.getContractEvents({ address: token!, abi: erc20Abi, eventName: "Transfer", args: { to: ESCROW }, fromBlock: 0n }),
      ]);
      return [...outs, ...ins]
        .map((l) => ({ blockNumber: l.blockNumber, logIndex: l.logIndex, from: l.args.from as Address, to: l.args.to as Address, value: l.args.value as bigint, txHash: l.transactionHash }))
        .sort((a, b) => (a.blockNumber === b.blockNumber ? b.logIndex - a.logIndex : Number(b.blockNumber - a.blockNumber)));
    },
  });
}

/** block.timestamp as the contract's measurement reads it (eth_call on the pending block). */
export function useChainTime() {
  const r = useReadContract({ address: ESCROW, abi: settlementEscrowAbi, functionName: "chainTime", blockTag: "pending", query: { refetchInterval: POLL, retry: 1 } });
  return { data: r.data === undefined ? undefined : Number(r.data), error: r.error, isError: r.isError };
}
