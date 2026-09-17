import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { injectedWallet, metaMaskWallet, rainbowWallet } from "@rainbow-me/rainbowkit/wallets";
import { http } from "viem";
import { hardhat } from "viem/chains";
import { resolveRpcUrl } from "./rpc";

export const RPC_URL = resolveRpcUrl();
export const chain = { ...hardhat, rpcUrls: { default: { http: [RPC_URL] } } };

export const wagmiConfig = getDefaultConfig({
  appName: "Crossing — settlement escrow",
  projectId: (import.meta.env.VITE_WC_PROJECT_ID as string | undefined) ?? "crossing-local-demo",
  chains: [chain],
  transports: { [chain.id]: http(RPC_URL) },
  wallets: [{ groupName: "Wallets", wallets: [injectedWallet, metaMaskWallet, rainbowWallet] }],
  ssr: false,
});
