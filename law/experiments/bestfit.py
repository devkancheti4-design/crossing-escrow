"""Best-case fit of the author's ntzb kernel to the escrow: search every assignment of the
eight hazards to bits (6 blocker bits 1..6 in some order, 2 non-blocker bits 0 and 7), map the
kernel's act to an escrow action by the tier of the first blocker, and count disagreements
with the CROSSING law over all 256 situations. Prints the best assignment and its residue."""
from itertools import combinations, permutations

HZ = ["UNFUNDED","EXPIRED","UNSIGNED","UNCONFIRMED","DISPUTED","DEPEGGED","PAUSED","THROTTLED"]
TIER = {"UNFUNDED":"veto","EXPIRED":"veto","UNSIGNED":"attest","UNCONFIRMED":"attest",
        "DISPUTED":"degrade","DEPEGGED":"degrade","PAUSED":"degrade","THROTTLED":"degrade"}
ACT_OF_TIER = {"veto":0,"attest":1,"degrade":2}

def ntzb(v): v &= 254; return (v & -v).bit_length()-1 if v else 0
def act_ntzb(x): return (4 & ntzb(x-7)) + ntzb(x + (x & 128))
def crossing(situ):  # situ = set of hazard names present
    if any(TIER[h]=="veto" for h in situ): return 0
    if any(TIER[h]=="attest" for h in situ): return 1
    if situ: return 2
    return 4

def escrow_action(a, layout):
    """layout[bit] = hazard name. act k in 1..6 names the first blocker at bit k;
       0 = settle; 5 and 7 may be escalations (bit 1 / bit 3 + 4): treat 5 as 'bit 5 or escalated bit 1',
       7 as 'escalated bit 3' -> use the tier of the named bit (5 -> bit 5, 7 -> bit 3)."""
    if a == 0: return 4
    bit = {7:3}.get(a, a)
    return ACT_OF_TIER[TIER[layout[bit]]]

best = None
for nonblock in combinations(range(8), 2):
    blockers = [i for i in range(8) if i not in nonblock]
    for order in permutations(blockers):
        layout = {0: HZ[nonblock[0]], 7: HZ[nonblock[1]]}
        for bit, hz in zip(range(1,7), order): layout[bit] = HZ[hz]
        diff = unsafe = held_instead_of_reject = 0
        for x in range(256):
            situ = {layout[b] for b in range(8) if (x>>b)&1}
            want = crossing(situ); got = escrow_action(act_ntzb(x), layout)
            if got != want:
                diff += 1
                if got == 4 and want != 4: unsafe += 1
                if got == 2 and want == 0: held_instead_of_reject += 1
        key = (unsafe, held_instead_of_reject, diff)
        if best is None or key < best[0]: best = (key, dict(layout))
(unsafe, held, diff), layout = best
print("assignments searched: 28 x 720 = 20160")
print("best layout (bit -> hazard):", {b: layout[b] for b in range(8)})
print(f"residue over 256 situations: disagreements {diff}, SETTLE-on-hazard (unsafe) {unsafe}, HELD-where-REJECT {held}")
print("hazards the kernel can never block in this best case:", layout[0], "and", layout[7])
print()
print("real-world flows under the best layout (crossing vs ntzb-derived escrow action):")
names = {0:"REJECT",1:"ATTEST",2:"ESCROW",4:"SETTLE"}
inv = {h:b for b,h in layout.items()}
def byte(situ): return sum(1<<inv[h] for h in situ)
flows = [
 ("open, 0/2 signatures", {"UNSIGNED"}),
 ("1/2 signatures", {"UNSIGNED"}),
 ("2/2 signatures", set()),
 ("2/2 + payer disputes", {"DISPUTED"}),
 ("guardian pauses the rail, 2/2", {"PAUSED"}),
 ("throttle cap hit, 2/2", {"THROTTLED"}),
 ("feed off-peg, 2/2", {"DEPEGGED"}),
 ("deadline passes, 2/2", {"EXPIRED"}),
 ("fee-on-transfer token (unfunded), 2/2", {"UNFUNDED"}),
 ("unfunded + throttled", {"UNFUNDED","THROTTLED"}),
 ("unfunded + depegged", {"UNFUNDED","DEPEGGED"}),
 ("unsigned + unconfirmed + disputed", {"UNSIGNED","UNCONFIRMED","DISPUTED"}),
]
for label, situ in flows:
    x = byte(situ); want = crossing(situ); got = escrow_action(act_ntzb(x), layout)
    flag = "" if got == want else ("  <-- UNSAFE: funds would move" if got == 4 else "  <-- differs")
    print(f"  {label:40s} byte 0x{x:02X}  crossing {names[want]:6s}  ntzb {names[got]:6s}{flag}")
