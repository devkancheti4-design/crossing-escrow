import { describe, expect, it } from "vitest";
import { HELD_OUT, LANES, TAUGHT, actOf, fold, lanes, mask, oracle, rule } from "./crossing";

describe("THE CROSSING LAW (TypeScript port)", () => {
  it("agrees with the independent oracle on all 256 bytes", () => {
    for (let x = 0; x < 256; x++) expect(rule(x)).toBe(oracle(x));
  });
  it("partition: SETTLE 1, RESERVED 0, ESCROW 15, ATTEST 48, REJECT 192", () => {
    const n = [0, 0, 0, 0, 0];
    for (let x = 0; x < 256; x++) n[rule(x)]++;
    expect(n).toEqual([192, 48, 15, 0, 1]);
  });
  it("R2: act 4 iff byte == 0x00 (the theorem)", () => {
    for (let x = 0; x < 256; x++) expect(rule(x) === 4).toBe(x === 0);
  });
  it("R6: monotone over 256 x 8 single-bit lifts", () => {
    for (let x = 0; x < 256; x++)
      for (let i = 0; i < 8; i++) if (!(x & (1 << i))) expect(rule(x | (1 << i))).toBeLessThanOrEqual(rule(x));
  });
  it("certificates: every lane is c * bit_i", () => {
    const c = [1, 1, 2, 2, 4, 4, 4, 4];
    for (let x = 0; x < 256; x++) {
      const l = lanes(x);
      for (let i = 0; i < 8; i++) expect(l[i]).toBe(c[i] * ((x >> i) & 1));
    }
    expect(LANES.length).toBe(8);
  });
  it("TAUGHT and HELD-OUT (scored apart) and the landing pair", () => {
    for (const [b, a] of TAUGHT) expect(rule(b)).toBe(a);
    for (const [b, a] of HELD_OUT) expect(rule(b)).toBe(a);
    expect(rule(0x04)).toBe(1);
    expect(rule(0x00)).toBe(4);
  });
  it("the fold is min: ACT(a|b) == min(ACT a, ACT b), idempotent, identity", () => {
    for (let a = 0; a < 8; a++)
      for (let b = 0; b < 8; b++) {
        const ma = 16 | a, mb = 16 | b;
        expect(actOf(fold(ma, mb))).toBe(Math.min(actOf(ma), actOf(mb)));
        expect(fold(ma, ma)).toBe(ma);
        expect(fold(ma, 16)).toBe(ma);
      }
  });
  it("totality: any integer agrees with its own low byte", () => {
    for (const v of [256, 0x1ff, 0xffff, 0x12345600, -1, -256, 2 ** 31 - 1]) expect(rule(v)).toBe(rule(v & 0xff));
  });
  it("mask values match the C kernel", () => {
    expect(mask(0x00)).toBe(16);
    expect(mask(0x01)).toBe(17);
    expect(mask(0x04)).toBe(18);
    expect(mask(0x10)).toBe(20);
    expect(mask(0xff)).toBe(23);
  });
});
