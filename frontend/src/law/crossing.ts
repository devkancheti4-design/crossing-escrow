/**
 * THE CROSSING LAW — TypeScript port, lane-for-lane from law/crossing.c.
 * A total, branchless, monotone decision function over an 8-bit situation byte.
 * Every observation bit is a HAZARD; there are no gates. act = ctz(mask & -mask).
 */

export type Tier = "veto" | "attest" | "degrade";

export interface HazardBit {
  bit: number;
  name: string;
  tier: Tier;
  /** the finding, with its failure clause */
  meaning: string;
  /** what the escrow contract measures for this bit */
  measured: string;
}

export const HAZARDS: HazardBit[] = [
  { bit: 0, name: "UNFUNDED", tier: "veto", meaning: "the escrow holds less than the agreed value, or the balance could not be read", measured: "funded < amount, or token.balanceOf(escrow) reverts / < funded" },
  { bit: 1, name: "EXPIRED", tier: "veto", meaning: "the deadline has passed, or the clock could not be read", measured: "block.timestamp > deadline" },
  { bit: 2, name: "UNSIGNED", tier: "attest", meaning: "fewer signatures than the quorum, or the signer set could not be read", measured: "approvalCount < quorum" },
  { bit: 3, name: "UNCONFIRMED", tier: "attest", meaning: "the oracle the terms require has not confirmed, or the oracle could not be reached", measured: "oracle set and isConfirmed(id) is false, reverts, or has no code" },
  { bit: 4, name: "DISPUTED", tier: "degrade", meaning: "a dispute is open on this crossing, or the dispute record could not be read", measured: "disputed == true" },
  { bit: 5, name: "DEPEGGED", tier: "degrade", meaning: "the coin's price sits outside its band, or the feed is stale or could not be read", measured: "feed set and |answer-1| > band, or updatedAt older than heartbeat, or feed reverts" },
  { bit: 6, name: "PAUSED", tier: "degrade", meaning: "the rail is paused by its guardian, or the pause flag could not be read", measured: "paused() == true" },
  { bit: 7, name: "THROTTLED", tier: "degrade", meaning: "value settled this window is at or above the ceiling, or the window counter could not be read", measured: "cap set and windowVolume + amount > cap" },
];

export const ACT_NAMES = ["REJECT", "ATTEST", "ESCROW", "RESERVED", "SETTLE"] as const;
export type ActName = (typeof ACT_NAMES)[number];

export const ACT_MEANING: Record<number, string> = {
  4: "SETTLE — the value crosses to the beneficiary. Final. Earned by 0x00 and no other byte.",
  3: "RESERVED — no lane today. Returning 3 is a violation.",
  2: "ESCROW — held in a reversible state: a hold window opens, the arbiter may reverse, the law re-rules when it ends.",
  1: "ATTEST — recorded, nothing moves, re-rule when a measurement completes.",
  0: "REJECT — the crossing never enters.",
};

export const FLOOR = 16;
export const RESERVED = 8;

// ---- the eight lanes, exactly as authored by search in crossing.c ----
export const L_UNFUNDED = (x: number) => x & 1;
export const L_EXPIRED = (x: number) => 1 & (x >> 1);
export const L_UNSIGNED = (x: number) => (x >> 1) & 2;
export const L_UNCONFIRMED = (x: number) => (1 & (x >> 3)) + (1 & (x >> 3));
export const L_DISPUTED = (x: number) => (x & 16) >> 2;
export const L_DEPEGGED = (x: number) => (2 & (x >> 4)) << 1;
export const L_PAUSED = (x: number) => ((x >> 6) & 1) << 2;
export const L_THROTTLED = (x: number) => (1 ^ (x >> 6)) - (1 - (x >> 6));

export const LANES = [L_UNFUNDED, L_EXPIRED, L_UNSIGNED, L_UNCONFIRMED, L_DISPUTED, L_DEPEGGED, L_PAUSED, L_THROTTLED];

export function lanes(obs: number): number[] {
  const x = obs & 0xff;
  return LANES.map((l) => l(x));
}

/** MASK: lanes OR-ed within their tier, tiers OR-ed, FLOOR always set. */
export function mask(obs: number): number {
  const x = obs & 0xff;
  return (
    (L_UNFUNDED(x) | L_EXPIRED(x)) |
    (L_UNSIGNED(x) | L_UNCONFIRMED(x)) |
    (L_DISPUTED(x) | L_DEPEGGED(x) | L_PAUSED(x) | L_THROTTLED(x)) |
    FLOOR
  );
}

/** EMIT: the lowest set bit. */
export const emit = (m: number) => m & -m;

/** ctz of a one-hot value. */
export const ctz = (v: number) => 31 - Math.clz32(v);

/** THE LAW: one MASK, one EMIT, one ctz, no branch. */
export function rule(obs: number): number {
  return ctz(emit(mask(obs)));
}

/** fold for batches: OR on masks is min on acts. */
export const fold = (a: number, b: number) => a | b;
export const actOf = (m: number) => ctz(emit(m));

/** INDEPENDENT ORACLE: branchy, shares no expression with the law. Used only for self-checks. */
export function oracle(obs: number): number {
  const x = obs & 0xff;
  if (x & 1) return 0;
  if (x & 2) return 0;
  if (x & 4) return 1;
  if (x & 8) return 1;
  if (x & 16) return 2;
  if (x & 32) return 2;
  if (x & 64) return 2;
  if (x & 128) return 2;
  return 4;
}

export const TAUGHT: Array<[number, number]> = [
  [0x00, 4],
  [0x01, 0],
  [0x02, 0],
  [0x04, 1],
  [0x10, 2],
];
export const HELD_OUT: Array<[number, number]> = [
  [0x08, 1],
  [0x20, 2],
  [0x40, 2],
  [0x18, 1],
  [0x21, 0],
  [0xff, 0],
];

export interface Explanation {
  obs: number;
  bits: Array<HazardBit & { set: boolean; lane: number }>;
  mask: number;
  emit: number;
  act: number;
  actName: ActName;
  why: string;
}

/** A human-readable trace of one ruling, in the law's own words (POSITION / FLOOR). */
export function explain(obs: number): Explanation {
  const x = obs & 0xff;
  const l = lanes(x);
  const m = mask(x);
  const e = emit(m);
  const act = ctz(e);
  const bits = HAZARDS.map((h) => ({ ...h, set: ((x >> h.bit) & 1) === 1, lane: l[h.bit] }));
  const set = bits.filter((b) => b.set);
  let why: string;
  if (act === 4) {
    why = "Every lane is silent. SETTLE is the FLOOR (mask bit 4): it is not chosen, it is what is left over when every measurement ran and found nothing.";
  } else if (act === 0) {
    const v = set.filter((b) => b.tier === "veto").map((b) => b.name).join(", ");
    why = `${v} reaches mask bit 0 and nothing sits below bit 0 (POSITION). No tier above can outrank a veto.`;
  } else if (act === 1) {
    const a = set.filter((b) => b.tier === "attest").map((b) => b.name).join(", ");
    const d = set.filter((b) => b.tier === "degrade").map((b) => b.name);
    why = `${a} owns mask bit 1, below the degrade tier's bit 2 (POSITION). Nothing is released, not even into ESCROW: a hold would have nothing to act against.` + (d.length ? ` ${d.join(", ")} is outranked: narrower outranks wider.` : "");
  } else {
    const d = set.filter((b) => b.tier === "degrade").map((b) => b.name).join(", ");
    why = `${d} owns mask bit 2, above the veto and attest tiers and below the floor (POSITION). The rail is in trouble, so the crossing slows into a reversible hold instead of closing.`;
  }
  return { obs: x, bits, mask: m, emit: e, act, actName: ACT_NAMES[act], why };
}

export const hex = (n: number) => "0x" + n.toString(16).padStart(2, "0").toUpperCase();
export const bin = (n: number) => n.toString(2).padStart(8, "0");
