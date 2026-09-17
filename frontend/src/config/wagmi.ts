import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { injectedWallet, metaMaskWallet, rainbowWallet } from "@rainbow-me/rainbowkit/wallets";
import { http } from "viem";
import { hardhat } from "viem/chains";
import { deployment } from "./deployment";

export const chain = { ...hardhat, rpcUrls: { default: { http: [deployment.rpcUrl] } } };

export const wagmiConfig = getDefaultConfig({
  appName: "Crossing — settlement escrow",
  projectId: (import.meta.env.VITE_WC_PROJECT_ID as string | undefined) ?? "crossing-local-demo",
  chains: [chain],
  transports: { [chain.id]: http(deployment.rpcUrl) },
  wallets: [{ groupName: "Wallets", wallets: [injectedWallet, metaMaskWallet, rainbowWallet] }],
  ssr: false,
});
