const pptxgen = require("pptxgenjs");
const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE";            // 13.333 x 7.5
pres.author = "CROSSING";
pres.title  = "CROSSING - settlement escrow ruled by a law";

const W = 13.333, H = 7.5, M = 0.62;    // slide + margin
const CW = W - 2 * M;                   // content width 12.093

/* ---- palette -------------------------------------------------------------
   Dark surfaces carry the product's own identity. The three tier colors are a
   STATUS palette (critical / caution / informational): every use is paired with
   its name in text, never colour alone. Validated: deutan dE 17.5, contrast >=3:1.
   The one chart is a single hue on a light surface: all six checks pass.        */
const BG='0B1116', PANEL='16222D', PANEL2='1D2C3A', LINE='27394A';
const INK='E8EFF5', MUTED='93A7B8', DIM='6B8296';
const MINT='5EEAD4', VETO='FF5D6C', ATT='FFC857', DEG='63A4FF', OK='4ADE80';
const LBG='FFFFFF', LINK_='0B1116', LMUTED='55697A', TEAL='169484', LPANEL='F3F6F8';
const HEAD='Arial', BODY='Arial', MONO='Courier New';

/* ---- helpers: every call builds FRESH option objects ---------------------- */
const bg   = (s, c=BG) => s.background = { color: c };
const rect = (s, o) => s.addShape(pres.ShapeType.roundRect, { rectRadius: 0.09, ...o });
const dot  = (s, x, y, c, d=0.17) => s.addShape(pres.ShapeType.ellipse, { x, y, w: d, h: d, fill: { color: c } });
const txt  = (s, t, o) => s.addText(t, { isTextBox: true, margin: 0, ...o });

function title(s, t, sub, dark=true){
  txt(s, t, { x:M, y:0.46, w:CW, h:0.62, fontFace:HEAD, fontSize:34, bold:true,
              color: dark?INK:LINK_, align:"left", valign:"middle" });
  if (sub) txt(s, sub, { x:M, y:1.12, w:CW, h:0.34, fontFace:BODY, fontSize:14,
              color: dark?MUTED:LMUTED, align:"left", valign:"middle" });
}
// a card with an optional heading + body
function card(s, o){
  const { x, y, w, h, fill=PANEL, head, headColor=INK, body, bodyColor=MUTED,
          headSize=15, bodySize=12.5, pad=0.26, dotColor, lineColor=LINE } = o;
  rect(s, { x, y, w, h, fill:{ color:fill }, line:{ color:lineColor, width:0.75 } });
  let ty = y + pad;
  if (dotColor){ dot(s, x+pad, ty+0.045, dotColor, 0.16);
    txt(s, head, { x:x+pad+0.3, y:ty-0.03, w:w-pad*2-0.3, h:0.3, fontFace:HEAD,
      fontSize:headSize, bold:true, color:headColor, valign:"middle" }); ty += 0.42; }
  else if (head){ txt(s, head, { x:x+pad, y:ty, w:w-pad*2, h:0.3, fontFace:HEAD,
      fontSize:headSize, bold:true, color:headColor, valign:"top" }); ty += 0.44; }
  if (body) txt(s, body, { x:x+pad, y:ty, w:w-pad*2, h:h-(ty-y)-pad*0.7, fontFace:BODY,
      fontSize:bodySize, color:bodyColor, valign:"top", lineSpacingMultiple:1.18 });
}
// big number + label
function stat(s, x, y, w, value, label, color, dark=true, vSize=40){
  txt(s, value, { x, y, w, h:0.72, fontFace:HEAD, fontSize:vSize, bold:true, color, valign:"middle" });
  txt(s, label, { x, y:y+0.74, w, h:0.5, fontFace:BODY, fontSize:11.5,
                  color: dark?MUTED:LMUTED, valign:"top", lineSpacingMultiple:1.12 });
}
const foot = (s, t, dark=true) => txt(s, t, { x:M, y:H-0.62, w:CW, h:0.3, fontFace:BODY,
  fontSize:10.5, color: dark?DIM:LMUTED, valign:"middle" });

/* =========================== 1. TITLE ==================================== */
{
  const s = pres.addSlide(); bg(s);
  const tiers=[VETO,VETO,ATT,ATT,DEG,DEG,DEG,DEG];
  const names=["UNFUNDED","EXPIRED","UNSIGNED","UNCONFIRMED","DISPUTED","DEPEGGED","PAUSED","THROTTLED"];
  tiers.forEach((c,i)=>dot(s, M+i*0.40, 1.28, c, 0.2));
  txt(s, "eight measured hazards  ·  one ruling", { x:M+8*0.40+0.18, y:1.24, w:5, h:0.3,
      fontFace:MONO, fontSize:11, color:DIM, valign:"middle" });
  txt(s, "CROSSING", { x:M, y:1.95, w:CW, h:1.25, fontFace:HEAD, fontSize:76, bold:true,
      color:INK, charSpacing:2, valign:"middle" });
  txt(s, "A non-custodial stablecoin settlement escrow in which the release decision is a law, not an if-chain.",
      { x:M, y:3.30, w:11.7, h:0.5, fontFace:BODY, fontSize:17, color:MINT, valign:"middle" });
  txt(s, "Funds cross only when every measurement ran and every measurement found nothing wrong.",
      { x:M, y:3.82, w:11.7, h:0.44, fontFace:BODY, fontSize:14, color:MUTED, valign:"middle" });
  const facts=[["0","violations across 4.3 billion inputs"],["50","contract tests, incl. fuzzing"],
               ["3","OSes green in CI"],["~40","gas for the ruling itself"]];
  facts.forEach((f,i)=>stat(s, M+i*3.05, 5.05, 2.8, f[0], f[1], MINT, true, 34));
  foot(s, "github.com/devkancheti4-design/crossing-escrow   ·   live dApp: devkancheti4-design.github.io/crossing-escrow");
  s.addNotes("CROSSING is a non-custodial escrow for cross-border stablecoin settlement. The distinctive part is that the release decision is a proved decision function - a law - rather than hand-written if-statements. Eight hazards are measured on chain; the law returns one of four acts.");
}

/* =========================== 2. THE PROBLEM ============================== */
{
  const s = pres.addSlide(); bg(s);
  title(s, "Cross-border settlement: slow, costly, trust-bound",
           "The three costs every international payment still pays");
  const items=[
    { head:"Intermediary fees", body:"Correspondent banks, FX desks and payment processors each take a cut of the same payment.", c:VETO },
    { head:"Multi-day delays",  body:"Value sits in transit across time zones, cut-off times and settlement windows while both sides wait.", c:ATT },
    { head:"Counterparty risk", body:"Someone has to go first. Pay before delivery and you carry the risk; deliver before payment and you carry it.", c:DEG },
  ];
  items.forEach((it,i)=>card(s,{ x:M+i*4.06, y:1.88, w:3.79, h:2.10, head:it.head, body:it.body, dotColor:it.c }));
  card(s,{ x:M, y:4.34, w:CW, h:1.55, fill:PANEL2,
    head:"And the usual fix does not remove that risk — it renames it",
    body:"An escrow agent holds the money instead. Now both parties trust a custodian who can freeze the funds, be compelled to release them, or simply fail. The risk moved; it did not go away.",
    bodySize:13.5 });
  foot(s, "Source: the problem statement this project was built against.");
  s.addNotes("Fees, delays and counterparty risk. The traditional answer - an escrow agent - converts counterparty risk into custodian risk.");
}

/* =========================== 3. THE DEEPER PROBLEM ======================= */
{
  const s = pres.addSlide(); bg(s);
  title(s, "The failure mode nobody writes a test for",
           "Release conditions written by hand cannot tell two very different situations apart");
  card(s,{ x:M, y:1.88, w:5.88, h:4.05, head:"What production writes", headColor:VETO, body:"" });
  txt(s, "if (confirmations >= 6 &&\n    block.timestamp < deadline &&\n    oracle.isConfirmed(id))\n        release(payee);",
      { x:M+0.26, y:2.46, w:5.36, h:1.15, fontFace:MONO, fontSize:12.5, color:INK, valign:"top", lineSpacingMultiple:1.2 });
  txt(s, "The oracle is down, so it returns false.\nThe feed is stale, so it reads zero.\nThe token reverts, so the call fails.",
      { x:M+0.26, y:3.78, w:5.36, h:0.85, fontFace:BODY, fontSize:12.5, color:MUTED, valign:"top", lineSpacingMultiple:1.16, isTextBox:true, margin:0 });
  txt(s, "Every one of those looks exactly like \u201cnot yet\u201d. The code cannot tell measured-and-fine from could-not-measure \u2014 so it waits forever, or worse, proceeds.",
      { x:M+0.26, y:4.72, w:5.36, h:1.0, fontFace:BODY, fontSize:12.5, color:MUTED, valign:"top", lineSpacingMultiple:1.16, isTextBox:true, margin:0 });
  card(s,{ x:M+6.2, y:1.88, w:5.88, h:4.05, head:"What CROSSING writes", headColor:MINT, body:"" });
  txt(s, "obs |= UNCONFIRMED;   // it said no\nobs |= UNCONFIRMED;   // it reverted\nobs |= UNCONFIRMED;   // no code there",
      { x:M+6.46, y:2.46, w:5.36, h:1.15, fontFace:MONO, fontSize:12.5, color:INK, valign:"top", lineSpacingMultiple:1.2 });
  txt(s, "A hazard bit is set by a positive finding AND by any measurement that could not complete.",
      { x:M+6.46, y:3.78, w:5.36, h:0.85, fontFace:BODY, fontSize:12.5, color:MUTED, valign:"top", lineSpacingMultiple:1.16, isTextBox:true, margin:0 });
  txt(s, "So an unmeasured world always settles less, never more. That single rule is what makes the protocol fail closed instead of failing blind.",
      { x:M+6.46, y:4.72, w:5.36, h:1.0, fontFace:BODY, fontSize:12.5, color:MUTED, valign:"top", lineSpacingMultiple:1.16, isTextBox:true, margin:0 });
  txt(s, "You cannot settle by failing to measure.", { x:M, y:6.24, w:CW, h:0.5, fontFace:HEAD,
      fontSize:22, bold:true, color:MINT, align:"center", valign:"middle", isTextBox:true, margin:0 });
  s.addNotes("This is the core insight. A constant cannot distinguish a successful measurement from a failed one. Every hazard in CROSSING is set both by a finding and by a failure to measure, so missing information always reduces what may cross.");
}

/* =========================== 4. THE PROTOCOL ============================= */
{
  const s = pres.addSlide(); bg(s);
  title(s, "One contract holds the funds. One law decides.",
           "Nothing releases on a human's say-so, and no role can send the money anywhere else");
  const boxes=[
    { x:M,      head:"1. OPEN",    body:"The payer locks stablecoins for a named payee. The contract measures what actually arrived." },
    { x:M+3.10, head:"2. MEASURE", body:"Eight bits: funding, deadline, signatures, oracle, dispute, peg, pause, throttle." },
    { x:M+6.20, head:"3. RULE",    body:"The law reads the byte and returns one act. Anyone may crank it; it is permissionless." },
  ];
  boxes.forEach(b=>card(s,{ x:b.x, y:1.9, w:2.86, h:2.42, head:b.head, headColor:MINT, body:b.body, headSize:14, bodySize:12 }));
  [M+2.94, M+6.04].forEach(x=>txt(s, "→", { x, y:2.65, w:0.32, h:0.4, fontFace:HEAD, fontSize:20, color:DIM, align:"center", valign:"middle" }));
  const acts=[
    { n:"4", k:"SETTLE", c:OK,   d:"funds cross to the payee. Final." },
    { n:"2", k:"ESCROW", c:DEG,  d:"held, reversible: a window opens and an arbiter may act." },
    { n:"1", k:"ATTEST", c:ATT,  d:"recorded; nothing moves; re-rule later." },
    { n:"0", k:"REJECT", c:VETO, d:"the crossing never enters." },
  ];
  rect(s,{ x:M+9.32, y:1.9, w:2.76, h:2.42, fill:{ color:PANEL2 }, line:{ color:LINE, width:0.75 } });
  txt(s, "4. ONE OF FOUR ACTS", { x:M+9.58, y:2.13, w:2.3, h:0.28, fontFace:HEAD, fontSize:14, bold:true, color:MINT, isTextBox:true, margin:0 });
  acts.forEach((a,i)=>{ dot(s, M+9.58, 2.58+i*0.32, a.c, 0.15);
    txt(s, `act ${a.n}  ${a.k}`, { x:M+9.86, y:2.52+i*0.32, w:2.1, h:0.28, fontFace:MONO, fontSize:11.5, color:INK, valign:"middle", isTextBox:true, margin:0 }); });
  card(s,{ x:M, y:4.66, w:CW, h:1.72, fill:PANEL,
    head:"Non-custodial, precisely",
    body:"Value can leave the contract in exactly four ways: the law rules SETTLE, an arbiter acts during a hold window, the payer refunds after the deadline, or the payee cancels. In every one of them the funds go to the payee or back to the payer — never anywhere else, and never to us. The guardian can pause and throttle, which only ever holds a crossing; it can never block a refund.",
    bodySize:13 });
  s.addNotes("Walk the four steps, then stress the non-custodial guarantee: only two possible destinations, four possible paths, and the guardian cannot block a refund.");
}

/* =========================== 5. THE LAW ================================== */
{
  const s = pres.addSlide(); bg(s);
  title(s, "The kernel: eight hazards, one instruction path",
           "The same law is authored three times — in C, in Solidity and in TypeScript — and all three agree on every input");
  rect(s,{ x:M, y:1.82, w:CW, h:1.12, fill:{ color:PANEL2 }, line:{ color:LINE, width:0.75 } });
  txt(s, "MASK = (veto lanes) | (attest lanes) | (degrade lanes) | FLOOR\nact  = ctz(MASK & -MASK)",
      { x:M+0.34, y:1.98, w:CW-0.68, h:0.8, fontFace:MONO, fontSize:16, color:MINT, lineSpacingMultiple:1.25, isTextBox:true, margin:0 });
  const tiers=[
    { c:VETO, k:"VETO", bits:"bits 0–1", hz:"UNFUNDED · EXPIRED", r:"mask bit 0 — nothing sits below it, so a veto cannot be outranked at any depth." },
    { c:ATT,  k:"ATTEST", bits:"bits 2–3", hz:"UNSIGNED · UNCONFIRMED", r:"mask bit 1 — releases nothing, not even into a hold: an undo would have nothing to act against." },
    { c:DEG,  k:"DEGRADE", bits:"bits 4–7", hz:"DISPUTED · DEPEGGED · PAUSED · THROTTLED", r:"mask bit 2 — a rail in trouble slows the crossing instead of closing it." },
  ];
  tiers.forEach((t,i)=>{
    const y = 3.24 + i*1.02;
    dot(s, M+0.06, y+0.17, t.c, 0.2);
    txt(s, t.k, { x:M+0.42, y:y+0.02, w:1.25, h:0.3, fontFace:HEAD, fontSize:14, bold:true, color:INK, valign:"middle" });
    txt(s, t.bits, { x:M+0.42, y:y+0.32, w:1.25, h:0.26, fontFace:MONO, fontSize:10.5, color:DIM, valign:"middle" });
    txt(s, t.hz, { x:M+1.78, y:y+0.02, w:4.5, h:0.3, fontFace:MONO, fontSize:11.5, color:t.c, valign:"middle" });
    txt(s, t.r, { x:M+1.78, y:y+0.32, w:10.2, h:0.5, fontFace:BODY, fontSize:12, color:MUTED, valign:"top", lineSpacingMultiple:1.1 });
  });
  txt(s, "No branch. No loop. No table. Precedence is bit position, not comparison — which is why “a dispute cannot outrank a missing signature” needed no rule, and no test for it ever failed.",
      { x:M, y:6.42, w:CW, h:0.62, fontFace:BODY, fontSize:13, color:MINT, valign:"middle", isTextBox:true, margin:0 });
  s.addNotes("The law is one mask, one isolate-lowest-bit, one count-trailing-zeros. Precedence is geometry: the lowest set bit wins. SETTLE is the FLOOR - what is left over when every lane is silent.");
}

/* =========================== 6. WHAT IT SOLVES =========================== */
{
  const s = pres.addSlide(); bg(s);
  title(s, "What it actually solves", "Six situations that break real settlements, and what the protocol does in each");
  const rows=[
    { c:OK,   h:"The payer stalls after delivery", b:"Release needs a quorum of approvers or an oracle confirmation — not the payer's goodwill. Anyone can then trigger the ruling." },
    { c:OK,   h:"The custodian is the risk",        b:"No one holds the funds. They can only reach the payee or the payer, through four auditable paths." },
    { c:DEG,  h:"The goods are disputed",           b:"Either party opens a dispute; the crossing degrades into a reversible hold with an arbiter, rather than settling or freezing forever." },
    { c:DEG,  h:"The oracle or price feed breaks",  b:"A revert, a gas-burning loop, a stale answer or an empty address all set the hazard. The crossing holds; it never settles blind." },
    { c:ATT,  h:"The stablecoin depegs mid-flight", b:"A price outside its band, or a feed older than its heartbeat, holds the crossing until the peg is measured healthy again." },
    { c:VETO, h:"Nobody ever shows up",             b:"The deadline passes, the law turns REJECT even with a full quorum, and the payer takes their money back." },
  ];
  rows.forEach((r,i)=>{
    const col=i%2, row=Math.floor(i/2);
    card(s,{ x:M+col*6.12, y:1.82+row*1.76, w:5.86, h:1.58, head:r.h, body:r.b, dotColor:r.c, headSize:13.5, bodySize:11.5, pad:0.22 });
  });
  s.addNotes("This is the direct answer to what problems it solves. Each row is a real settlement failure and the mechanism that handles it.");
}

/* =========================== 7. PROOF (LIGHT) ============================ */
{
  const s = pres.addSlide(); bg(s, LBG);
  title(s, "Is it strong?  1 — the decision is proved, not sampled", "Every claim below is re-checked on every push, on Linux, Windows and macOS", false);
  const stats=[["0","violations across every proof obligation"],["2³²","inputs checked exhaustively, not sampled"],
               ["8 / 8","lane certificates: each lane proved to be c · bitᵢ"],["3","independent ports that agree byte for byte"]];
  stats.forEach((st,i)=>{
    rect(s,{ x:M+i*3.05, y:1.82, w:2.83, h:1.74, fill:{ color:LPANEL }, line:{ color:"DDE4E9", width:0.75 } });
    txt(s, st[0], { x:M+i*3.05+0.24, y:1.98, w:2.35, h:0.7, fontFace:HEAD, fontSize:40, bold:true, color:TEAL, valign:"middle", isTextBox:true, margin:0 });
    txt(s, st[1], { x:M+i*3.05+0.24, y:2.70, w:2.35, h:0.6, fontFace:BODY, fontSize:11.5, color:LMUTED, valign:"top", lineSpacingMultiple:1.14, isTextBox:true, margin:0 });
  });
  card(s,{ x:M, y:3.86, w:5.88, h:2.62, fill:LPANEL, lineColor:"DDE4E9", head:"Exactly one byte in 256 may settle", headColor:LINK_,
    body:"Of all 256 situations the contract can measure, 192 refuse, 48 record and release nothing, 15 hold reversibly, and exactly 1 settles: the byte in which every measurement ran and found nothing.\n\nThat count is asserted, not asserted-about. If a future change let a second byte settle, the build fails.",
    bodyColor:LMUTED, bodySize:12.5 });
  card(s,{ x:M+6.2, y:3.86, w:5.88, h:2.62, fill:LPANEL, lineColor:"DDE4E9", head:"What “proved” means here", headColor:LINK_,
    body:"•  Agrees with an independent branchy oracle on all 256 bytes\n•  Monotone: a new hazard never lets more value cross\n•  Total over all 4.3 billion inputs it can be handed\n•  Batches fold by OR — the weakest crossing rules\n•  The same tables pass in all three languages",
    bodyColor:LMUTED, bodySize:12.5 });
  foot(s, "Reproduce: cc -O2 -Wall -Wextra -Werror -o crossing crossing.c && ./crossing   →   TOTAL  0 violations", false);
  s.addNotes("The strength claim rests on exhaustive verification rather than spot tests. 2^32 is every input the function can receive, not a sample.");
}

/* =========================== 8. ATTACKS ================================== */
{
  const s = pres.addSlide(); bg(s);
  title(s, "Is it strong?  2 — what we attacked it with", "Each of these is a passing test in the suite, not a design intention");
  const atk=[
    ["A token that re-enters on transfer","Blocked on both settle and refund: one attempt, zero successes, balances exact."],
    ["A fee-on-transfer token","What actually arrived is measured, so the escrow reports UNFUNDED and refuses rather than over-promising."],
    ["An oracle that reverts, burns all gas, or has no code","Each sets UNCONFIRMED. The ruling completes; a broken dependency cannot revert or grief the crossing."],
    ["A stale or codeless price feed","Sets DEPEGGED. The crossing holds until the peg can be measured healthy."],
    ["A guardian turning hostile","Can pause and throttle — both only hold a crossing. It can never move funds or block a refund."],
    ["A full quorum arriving after the deadline","Still REJECT. Expiry sits below attestation, so no amount of signatures outranks it."],
  ];
  atk.forEach((a,i)=>{
    const y=1.78+i*0.83;
    rect(s,{ x:M, y, w:CW, h:0.72, fill:{ color: i%2 ? PANEL : PANEL2 }, line:{ color:LINE, width:0.6 } });
    dot(s, M+0.26, y+0.28, OK, 0.16);
    txt(s, a[0], { x:M+0.58, y:y+0.06, w:4.6, h:0.6, fontFace:HEAD, fontSize:12.5, bold:true, color:INK, valign:"middle", isTextBox:true, margin:0 });
    txt(s, a[1], { x:M+5.34, y:y+0.06, w:6.5, h:0.6, fontFace:BODY, fontSize:11.5, color:MUTED, valign:"middle", isTextBox:true, margin:0 });
  });
  foot(s, "50 contract tests including a 256-run fuzz over the full uint256 input · checks-effects-interactions and a reentrancy guard on every state-changing function.");
  s.addNotes("These are adversarial tests that pass. The theme: a hostile or broken dependency can only ever set its own hazard bit, which lowers what may cross.");
}

/* =========================== 9. COST (LIGHT + CHART) ===================== */
{
  const s = pres.addSlide(); bg(s, LBG);
  title(s, "Is it strong?  3 — cheap enough to run constantly", "Gas measured in the test suite, warm, excluding the 21,000 base transaction fee", false);
  /* Bars drawn as native vector shapes rather than an embedded OOXML chart: Keynote
     silently drops embedded charts on .pptx import, and this deck has to survive that.
     Mark spec: rounded data-ends on a common baseline, one validated hue, direct value
     labels, recessive gridlines, no legend (single series). */
  {
    const px=M+2.62, py=2.22, plotW=4.15, rowH=0.74, barH=0.40, MAXV=50000;
    txt(s, "Gas per operation", { x:M, y:1.80, w:7.6, h:0.32, fontFace:HEAD, fontSize:14, bold:true, color:LINK_, valign:"middle" });
    for(let g=0; g<=5; g++){
      const gx = px + (g/5)*plotW;
      s.addShape(pres.ShapeType.line, { x:gx, y:py, w:0, h:rowH*4+0.06,
        line:{ color: g===0 ? "C9D2D9" : "EDF1F4", width: g===0 ? 1 : 0.75 } });
      txt(s, g===0 ? "0" : `${g*10}k`, { x:gx-0.35, y:py+rowH*4+0.12, w:0.7, h:0.26,
        fontFace:BODY, fontSize:9.5, color:LMUTED, align:"center", valign:"middle" });
    }
    const data=[["Refund (payee cancel)",10900],["Rule \u2014 no-op crank",11131],
                ["Approve + rule",19330],["Approve + rule + SETTLE",43967]];
    data.forEach((d,i)=>{
      const by = py + i*rowH + (rowH-barH)/2;
      const bw = (d[1]/MAXV)*plotW;
      txt(s, d[0], { x:M, y:by-0.04, w:2.44, h:barH+0.08, fontFace:BODY, fontSize:11.5,
        color:LINK_, align:"right", valign:"middle" });
      s.addShape(pres.ShapeType.roundRect, { x:px, y:by, w:bw, h:barH, rectRadius:0.055,
        fill:{ color:TEAL }, line:{ color:"FFFFFF", width:1 } });
      txt(s, d[1].toLocaleString("en-US"), { x:px+bw+0.10, y:by-0.04, w:1.1, h:barH+0.08,
        fontFace:BODY, fontSize:11, bold:true, color:TEAL, align:"left", valign:"middle" });
    });
    txt(s, "measured in test_Gas_Report, contracts/GAS.md",
      { x:M, y:py+rowH*4+0.46, w:7.6, h:0.28, fontFace:BODY, fontSize:10, color:LMUTED, valign:"middle" });
  }
  card(s,{ x:M+8.05, y:1.98, w:4.03, h:1.92, fill:LPANEL, lineColor:"DDE4E9", head:"The ruling itself", headColor:LINK_,
    body:"≈ 40 gas. Eight shifts and masks, three ORs, one isolate-lowest-bit, one count-trailing-zeros. No branch, no loop, no storage read.",
    bodyColor:LMUTED, bodySize:12 });
  card(s,{ x:M+8.05, y:4.12, w:4.03, h:1.92, fill:LPANEL, lineColor:"DDE4E9", head:"Opening an escrow", headColor:LINK_,
    body:"317,892 gas — it stores the full terms. The obvious optimisation is to store a hash of the terms and pass them as calldata.",
    bodyColor:LMUTED, bodySize:12 });
  txt(s, "Cost is not what separates a good release rule from a bad one — but a rule this cheap can be re-run by anyone, at any time, which is what makes the crank permissionless.",
      { x:M, y:6.30, w:CW, h:0.5, fontFace:BODY, fontSize:12.5, color:LMUTED, valign:"middle", isTextBox:true, margin:0 });
  s.addNotes("One series, one hue, values labelled directly. The hot path is 11k to 44k gas; opening is the expensive step and has a known optimisation.");
}

/* =========================== 10. WEAKNESSES ============================== */
{
  const s = pres.addSlide(); bg(s);
  title(s, "Where it is not strong", "An independent review raised eight issues. None was a failure of the law; here they are anyway.");
  const w=[
    [VETO,"quorum = 0 is allowed","A payer can configure an escrow that needs no approver and no oracle. Their funds, their choice — but it is a foot-gun, and the first thing we would close."],
    [VETO,"The arbiter is not time-limited","Once a crossing is held, its arbiter can release or refund later. Bounded — it can never touch an open or finished escrow — but the hold window is not enforced on it."],
    [ATT,"Trust in payer-chosen dependencies","The law fails closed on a silent or broken oracle. It cannot see a lying one. That is inherent, and it is why the oracle choice is part of the signed terms."],
    [ATT,"Any ERC-20 is accepted","Fee-on-transfer is handled. Rebasing, pausing or blacklisting tokens can still strand a crossing in a hold. An allowlist is the fix."],
    [DEG,"Disputes can be used to delay","There is no bond and no limit on dispute cycles. Funds are never at risk of going to a third party, but settlement can be dragged out."],
    [DEG,"One guardian, no upgrades, no rotation","Availability risk, not custody risk: a compromised guardian can hold crossings but cannot move or trap funds. Deploy behind a multisig."],
  ];
  w.forEach((r,i)=>{
    const col=i%2, row=Math.floor(i/2);
    card(s,{ x:M+col*6.12, y:1.82+row*1.60, w:5.86, h:1.46, head:r[1], body:r[2], dotColor:r[0], headSize:13, bodySize:11, pad:0.22, fill: PANEL });
  });
  foot(s, "Every one of these is written up with a named fix in docs/AUDIT.md — including the ones we chose not to apply, and why.");
  s.addNotes("Being explicit about weaknesses is the point of this slide. Note the pattern: the issues live in the measurement and the terms, not in the decision function.");
}

/* =========================== 11. RIVAL KERNEL ============================ */
{
  const s = pres.addSlide(); bg(s);
  title(s, "We tried to beat our own kernel", "A rival branchless decision function was proposed. We gave it every advantage and measured it.");
  card(s,{ x:M, y:1.92, w:3.88, h:2.32, head:"We searched 20,160 layouts", headColor:MINT,
    body:"Every way of assigning the eight hazards to the rival kernel's bits, scored against the law over all 256 situations. We report its best case, not its worst.", bodySize:12 });
  card(s,{ x:M+4.1, y:1.92, w:3.88, h:2.32, head:"Its best case still settles", headColor:VETO,
    body:"Given the most favourable layout that exists, it still releases funds into an open dispute, and onto a depegged coin — the two situations an escrow exists to stop.", bodySize:12 });
  card(s,{ x:M+8.2, y:1.92, w:3.88, h:2.32, head:"And it cannot compose", headColor:VETO,
    body:"67 monotonicity failures: adding a hazard can move its ruling to a later blocker. Batches do not fold, so a batch of crossings has no ruling at all.", bodySize:12 });
  card(s,{ x:M, y:4.62, w:CW, h:1.62, fill:PANEL2, head:"Why this matters more than the result",
    body:"A claim of strength is only worth what it was tested against. The rival kernel is a perfectly good diagnostic — it names which blocking observation came first, in about one nanosecond — and we shipped it as one, next to the law in the explorer. It is simply not a release rule. The law rules every one of those bytes correctly.",
    bodySize:12.5 });
  s.addNotes("This slide is about method. We stress-tested our own design choice rather than assuming it, and we kept the rival as a diagnostic where it is genuinely useful.");
}

/* =========================== 12. VERDICT ================================= */
{
  const s = pres.addSlide(); bg(s);
  txt(s, "Verdict", { x:M, y:0.72, w:CW, h:0.8, fontFace:HEAD, fontSize:40, bold:true, color:INK, valign:"middle" });
  card(s,{ x:M, y:1.86, w:5.88, h:2.78, fill:PANEL2, head:"Strong, where strength is checkable", headColor:OK,
    body:"The release decision is total, monotone and fail-closed on every one of 4.3 billion inputs, proved three times in three languages, and cheap enough that anyone can run it.\n\nThe custody guarantee is structural: two possible destinations, four possible paths, no privileged exit.",
    bodySize:12.5 });
  card(s,{ x:M+6.2, y:1.86, w:5.88, h:2.78, fill:PANEL, head:"Not yet strong, and we name it", headColor:ATT,
    body:"The measurement's dependencies are still trusted, a few configurations are foot-guns, and the contracts are unaudited. Those are policy and process, not proof — and each has a written fix.\n\nWhat we will not claim is that it has been run with real money.",
    bodySize:12.5 });
  const line="The law does not make the escrow trustworthy. It makes exactly one thing impossible: settling because nobody looked.";
  txt(s, line, { x:M, y:5.00, w:CW, h:0.72, fontFace:HEAD, fontSize:20, bold:true, color:MINT, align:"center", valign:"middle", isTextBox:true, margin:0 });
  const tiers=[VETO,VETO,ATT,ATT,DEG,DEG,DEG,DEG];
  tiers.forEach((c,i)=>dot(s, 5.32+i*0.34, 5.98, c, 0.16));
  txt(s, "github.com/devkancheti4-design/crossing-escrow", { x:M, y:6.46, w:CW, h:0.32, fontFace:MONO, fontSize:13, color:INK, align:"center", valign:"middle", isTextBox:true, margin:0 });
  txt(s, "live dApp: devkancheti4-design.github.io/crossing-escrow   ·   docs: README, ARCHITECTURE, AUDIT, LAW-EVALUATION",
      { x:M, y:6.82, w:CW, h:0.32, fontFace:BODY, fontSize:11.5, color:DIM, align:"center", valign:"middle", isTextBox:true, margin:0 });
  s.addNotes("Close on the honest split: the decision is proved, the surrounding policy is documented, and it has not been run with real money.");
}

pres.writeFile({ fileName: "CROSSING.pptx" }).then(f => console.log("wrote", f));
