import raw from "../generated/deployment.json";

export type Address = `0x${string}`;

export interface Deployment {
  chainId: number;
  rpcUrl: string;
  deployedAt: string;
  contracts: { escrow: Address; usd: Address; oracle: Address; feed: Address; harness: Address };
  roles: {
    guardian: Address;
    payer: Address;
    payee: Address;
    approvers: Address[];
    oracleOperator: Address;
    arbiter: Address;
    feedOperator: Address;
  };
  seededEscrowIds: number[];
}

export const deployment = raw as Deployment;

export interface RoleDef {
  key: string;
  label: string;
  address: Address;
  blurb: string;
}

export const ROLES: RoleDef[] = [
  { key: "payer", label: "Payer", address: deployment.roles.payer, blurb: "opens and funds; may dispute; refunds after the deadline" },
  { key: "payee", label: "Payee", address: deployment.roles.payee, blurb: "beneficiary; may dispute; may cancel at any time" },
  { key: "approver1", label: "Approver A", address: deployment.roles.approvers[0], blurb: "one signature of the quorum" },
  { key: "approver2", label: "Approver B", address: deployment.roles.approvers[1], blurb: "one signature of the quorum" },
  { key: "approver3", label: "Approver C", address: deployment.roles.approvers[2], blurb: "one signature of the quorum" },
  { key: "oracle", label: "Oracle operator", address: deployment.roles.oracleOperator, blurb: "validates the off-chain proof on the oracle contract" },
  { key: "arbiter", label: "Arbiter", address: deployment.roles.arbiter, blurb: "may act only while an escrow is Held" },
  { key: "guardian", label: "Guardian", address: deployment.roles.guardian, blurb: "pause / throttle; can never move funds" },
  { key: "feed", label: "Feed operator", address: deployment.roles.feedOperator, blurb: "publishes the stablecoin price" },
];

export function roleOf(address?: string): RoleDef | undefined {
  if (!address) return undefined;
  return ROLES.find((r) => r.address.toLowerCase() === address.toLowerCase());
}

export function shortAddr(a?: string): string {
  if (!a) return "—";
  return a.slice(0, 6) + "…" + a.slice(-4);
}

export function labelFor(address?: string): string {
  if (address && address.toLowerCase() === deployment.contracts.escrow.toLowerCase()) return "Escrow";
  const r = roleOf(address);
  return r ? r.label : shortAddr(address);
}
