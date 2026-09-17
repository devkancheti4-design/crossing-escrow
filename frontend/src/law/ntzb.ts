/**
 * EXPERIMENTAL candidate kernel supplied by the author — evaluated, not used by the escrow.
 *   ntzb(v) = index of the lowest set bit of (v & 254); ntzb(0) := 0
 *   act(x)  = (4 & ntzb(x - 7)) + ntzb(x + (x & 128))
 *   expr5(x)= 255 & ((x >> 8) + ((x >> 16) - x))   == (byte1 + byte2 - byte0) mod 256
 */
export const ntzb = (v: number) => 7 & (31 - Math.clz32(((v & 254) | 256) & -((v & 254) | 256)));
export const ntzbAct = (x: number) => (4 & ntzb(x - 7)) + ntzb(x + (x & 128));
export const expr5 = (x: number) => 255 & (((x >>> 8) + ((x >>> 16) - x)) | 0);

export const NTZB_ACT_MEANING: Record<number, string> = {
  0: "no blocker among bits 1..6 (bits 0 and 7 are never read as blockers)",
  1: "first blocker: bit 1", 2: "first blocker: bit 2", 3: "first blocker: bit 3", 4: "first blocker: bit 4",
  5: "first blocker: bit 1 or 5, or bit 1 escalated by the (x−7) term", 6: "first blocker: bit 6",
  7: "bit 3 escalated by the (x−7) term (bits 3 and 4 both set)",
};
