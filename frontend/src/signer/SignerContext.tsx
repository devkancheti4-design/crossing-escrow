import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { createWalletClient, http, type WalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { useAccount, useWalletClient } from "wagmi";
import { DEV_ACCOUNTS, findDevAccount } from "../config/accounts";
import { ROLES, type Address } from "../config/deployment";
import { RPC_URL, chain } from "../config/wagmi";

export type Mode = "demo" | "wallet";

interface SignerState {
  mode: Mode;
  setMode: (m: Mode) => void;
  /** demo mode: the selected role key */
  roleKey: string;
  setRoleKey: (k: string) => void;
  /** the active signer address in either mode */
  address?: Address;
  /** a viem wallet client for the active signer, if any */
  walletClient?: WalletClient;
  demoUnavailable?: string;
}

const Ctx = createContext<SignerState | null>(null);

export function SignerProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>("demo");
  const [roleKey, setRoleKey] = useState<string>("payer");
  const wagmiAccount = useAccount();
  const { data: wagmiWallet } = useWalletClient();

  const demo = useMemo(() => {
    const role = ROLES.find((r) => r.key === roleKey) ?? ROLES[0];
    const dev = findDevAccount(role.address);
    if (!dev) {
      return { address: role.address, error: `No known dev key for ${role.label} (${role.address}). Redeploy with the default Hardhat accounts.` };
    }
    const wc = createWalletClient({
      account: privateKeyToAccount(dev.privateKey),
      chain,
      transport: http(RPC_URL),
    });
    return { address: role.address, walletClient: wc as WalletClient };
  }, [roleKey]);

  const value: SignerState = useMemo(() => {
    if (mode === "demo") {
      return { mode, setMode, roleKey, setRoleKey, address: demo.address, walletClient: demo.walletClient, demoUnavailable: demo.error };
    }
    return { mode, setMode, roleKey, setRoleKey, address: wagmiAccount.address as Address | undefined, walletClient: wagmiWallet as WalletClient | undefined };
  }, [mode, roleKey, demo, wagmiAccount.address, wagmiWallet]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSigner(): SignerState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSigner outside SignerProvider");
  return v;
}

export const DEV_ACCOUNT_COUNT = DEV_ACCOUNTS.length;
