import { useQueryClient } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { chain } from "../config/wagmi";

/** evm_increaseTime + evm_mine on the local Hardhat node, so hold windows and deadlines can be demonstrated. */
export function useChainTravel() {
  const client = usePublicClient();
  const qc = useQueryClient();
  const available = chain.id === 31337 && !!client;
  const skip = async (seconds: number) => {
    if (!client) return;
    await client.request({ method: "evm_increaseTime" as never, params: [seconds] as never });
    await client.request({ method: "evm_mine" as never, params: [] as never });
    await qc.invalidateQueries();
  };
  return { available, skip };
}
