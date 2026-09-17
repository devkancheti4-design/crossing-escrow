import { describe, expect, it } from "vitest";
import { expr5, ntzbAct } from "./ntzb";

function plain(x: number): number {
  x &= 255;
  let first = 0;
  for (let b = 1; b <= 6; b++) if ((x >> b) & 1) { first = b; break; }
  const y = (x - 7) & 254;
  let fb = 0;
  for (let b = 1; b <= 7; b++) if ((y >> b) & 1) { fb = b; break; }
  return (fb >= 4 ? 4 : 0) + first;
}

describe("experimental ntzb kernel (evaluation facts)", () => {
  it("matches the plain restatement and the C partition on all 256 bytes", () => {
    const part = [0, 0, 0, 0, 0, 0, 0, 0];
    for (let x = 0; x < 256; x++) { expect(ntzbAct(x)).toBe(plain(x)); part[ntzbAct(x)]++; }
    expect(part).toEqual([4, 113, 64, 17, 16, 23, 4, 15]);
  });
  it("reports no blocker on 0x01, 0x80, 0x81 and escalates 0x21 to 5", () => {
    expect(ntzbAct(0x01)).toBe(0); expect(ntzbAct(0x80)).toBe(0); expect(ntzbAct(0x81)).toBe(0); expect(ntzbAct(0x21)).toBe(5);
  });
  it("expr5 is (b1 + b2 - b0) mod 256 and cancels equal hazards", () => {
    expect(expr5(0x808000)).toBe(0); expect(expr5(0x000101)).toBe(0); expect(expr5(1)).toBe(0xff);
  });
});
