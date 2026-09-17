import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { BaseError, ContractFunctionRevertedError, type Hash, type WalletClient } from "viem";
import { usePublicClient } from "wagmi";
import { useSigner } from "../signer/SignerContext";

export interface TxState {
  status: "idle" | "signing" | "mining" | "done" | "error";
  hash?: Hash;
  error?: string;
  label?: string;
}

export function decodeError(e: unknown): string {
  if (e instanceof BaseError) {
    const revert = e.walk((err) => err instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName ?? revert.reason ?? "reverted";
      const args = revert.data?.args?.length ? `(${revert.data.args.map(String).join(", ")})` : "()";
      return `${name}${args}`;
    }
    return e.shortMessage;
  }
  return e instanceof Error ? e.message : String(e);
}

/** Sends one transaction with the active signer, waits for the receipt and refreshes every query. */
export function useTx() {
  const { walletClient, address } = useSigner();
  const publicClient = usePublicClient();
  const qc = useQueryClient();
  const [state, setState] = useState<TxState>({ status: "idle" });

  const send = useCallback(
    async (label: string, fn: (wc: WalletClient) => Promise<Hash>) => {
      if (!walletClient || !address || !publicClient) {
        setState({ status: "error", error: "No signer. Connect a wallet or pick a demo role.", label });
        return;
      }
      setState({ status: "signing", label });
      try {
        const hash = await fn(walletClient);
        setState({ status: "mining", hash, label });
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        await qc.invalidateQueries();
        setState({ status: receipt.status === "success" ? "done" : "error", hash, label, error: receipt.status === "success" ? undefined : "transaction reverted" });
      } catch (e) {
        setState({ status: "error", error: decodeError(e), label });
        await qc.invalidateQueries();
      }
    },
    [walletClient, address, publicClient, qc],
  );

  const reset = useCallback(() => setState({ status: "idle" }), []);
  return { state, send, reset, canSend: !!walletClient && !!address };
}
