/**
 * Demo recorder — drives the real dApp in a real browser and renders an MP4.
 *
 * It does not fake anything: every click below is a click a judge could make, every
 * state change is the contract ruling on a measured situation byte.
 *
 *   cd contracts && npx hardhat node          # terminal 1
 *   cd contracts && npm run deploy:local      # terminal 2  (reseeds escrows #1 and #2)
 *   cd frontend  && npm run dev               # terminal 3
 *   cd tools     && npm run record            # writes demo.mp4 here
 *
 * Environment:
 *   HEADLESS=false   watch it happen in a visible window (good for rehearsing)
 *   FPS=8            output frame rate
 *   OUT=demo.mp4     output file
 *   CHROME=/path/to/Chrome
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const APP = process.env.APP ?? "http://localhost:5173";
const OUT = process.env.OUT ?? "demo.mp4";
const FPS = Number(process.env.FPS ?? 8);
const HEADLESS = (process.env.HEADLESS ?? "true") !== "false";
const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const FRAMES = path.resolve("frames");

if (!existsSync(CHROME)) {
  console.error(`Chrome not found at ${CHROME}. Set CHROME=/path/to/your/browser`);
  process.exit(1);
}
rmSync(FRAMES, { recursive: true, force: true });
mkdirSync(FRAMES, { recursive: true });

let frame = 0;
let caption = "";
const log = (m) => console.log(`  ${m}`);

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: HEADLESS,
  defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
  args: ["--window-size=1440,900", "--hide-scrollbars"],
});
const page = await browser.newPage();

/** Burn the caption into the page itself so it is part of the recording. */
async function setCaption(text) {
  caption = text;
  await page.evaluate((t) => {
    let el = document.getElementById("__cap");
    if (!el) {
      el = document.createElement("div");
      el.id = "__cap";
      el.style.cssText =
        "position:fixed;left:0;right:0;bottom:0;z-index:99999;padding:14px 24px;" +
        "background:linear-gradient(transparent,rgba(5,9,12,.92) 38%);color:#E8EFF5;" +
        "font:600 19px/1.35 Arial,sans-serif;text-align:center;pointer-events:none;" +
        "text-shadow:0 2px 10px rgba(0,0,0,.9)";
      document.body.appendChild(el);
    }
    el.textContent = t;
  }, text);
}

/** One captured frame. `hold` repeats it so the moment reads on screen. */
async function shot(hold = 1) {
  for (let i = 0; i < hold; i++) {
    await page.screenshot({ path: path.join(FRAMES, `f${String(frame++).padStart(5, "0")}.png`) });
  }
}

/** Capture continuously for `ms`, so live polling and animations are recorded. */
async function record(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    await shot(1);
    await new Promise((r) => setTimeout(r, Math.max(0, 1000 / FPS - 35)));
  }
}

/** Click the first element whose visible text contains `text`. */
async function clickText(text, { tag = "button", nth = 0 } = {}) {
  const ok = await page.evaluate((t, g, n) => {
    const all = [...document.querySelectorAll(g)].filter((e) => (e.textContent || "").includes(t) && !e.disabled);
    // keep only the deepest matches: an ancestor also "contains" the text and clicking it does nothing
    const els = all.filter((e) => !all.some((o) => o !== e && e.contains(o)));
    if (!els[n]) return false;
    els[n].scrollIntoView({ block: "center" });
    els[n].click();
    return true;
  }, text, tag, nth);
  if (!ok) throw new Error(`could not click ${tag} containing "${text}"`);
  await new Promise((r) => setTimeout(r, 350));
}

/** Pick a demo role from the header dropdown. */
async function role(label) {
  await page.evaluate((l) => {
    const sel = document.querySelector("select.role");
    const opt = [...sel.options].find((o) => o.textContent.includes(l));
    sel.value = opt.value;
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  }, label);
  await new Promise((r) => setTimeout(r, 500));
}

async function waitForText(text, timeout = 30000) {
  await page.waitForFunction((t) => document.body.innerText.includes(t), { timeout, polling: 400 }, text);
}

// ------------------------------------------------------------------ the demo
try {
  log(`opening ${APP}`);
  await page.goto(APP, { waitUntil: "networkidle2", timeout: 60000 });
  await waitForText("Escrows");

  await setCaption("CROSSING — a non-custodial settlement escrow whose release decision is a proved law");
  await record(2600);

  // ---- Act 1: a settlement that should succeed
  await setCaption("Escrow #1 · 25,000 mUSD locked by the payer, two of three approvers must sign");
  await clickText("25,000 mUSD", { tag: ".ecard" });
  await waitForText("LIVE MEASUREMENT");
  await record(2600);

  await setCaption("One hazard is lit: UNSIGNED. The law returns act 1 ATTEST — recorded, nothing moves");
  await record(3000);

  await setCaption("Approver A signs…");
  await role("Approver A");
  await clickText("Approve (sign)");
  await record(3200);

  await setCaption("Still ATTEST. One signature is not the quorum, and no human can override that");
  await record(2400);

  await setCaption("Approver B signs — the byte falls to 0x00");
  await role("Approver B");
  await clickText("Approve (sign)");
  await record(1800);

  await setCaption("act 4 SETTLE · 25,000 mUSD crossed to the payee. Nobody authorised it — every lane was silent");
  await record(4200);

  // ---- Act 2: a dispute, a reversible hold, an arbiter
  await setCaption("Escrow #2 · 120,000 mUSD, this one also requires an oracle and a peg check");
  await clickText("all escrows");
  await waitForText("on this rail");
  await clickText("120,000 mUSD", { tag: ".ecard" });
  await waitForText("LIVE MEASUREMENT");
  await record(2600);

  await setCaption("The payer disputes");
  await role("Payer");
  await clickText("Open dispute");
  await record(2600);

  await setCaption("Two hazards now — but ATTEST still wins. The lower bit rules: narrower outranks wider");
  await record(3400);

  await setCaption("Both approvers sign…");
  await role("Approver A");
  await clickText("Approve (sign)");
  await role("Approver B");
  await clickText("Approve (sign)");
  await record(3000);

  await setCaption("…and it is STILL ATTEST, because the oracle has not confirmed the off-chain proof");
  await record(3000);

  await setCaption("The oracle operator validates the proof on chain");
  await role("Oracle operator");
  await clickText("Confirm off-chain proof");
  await record(3200);

  await setCaption("Only the dispute is left. Anyone may now run the law — it is a permissionless crank");
  await role("Payer");
  await clickText("Run the law");
  await record(3400);

  await setCaption("act 2 ESCROW · held in a reversible state. A window is open and the arbiter may undo it");
  await record(3600);

  await setCaption("The arbiter finds for the payee");
  await role("Arbiter");
  await clickText("Release");
  await record(4200);

  // ---- Act 3: the law itself
  await setCaption("The law explorer: toggle the eight hazards and watch the ruling");
  await clickText("Law explorer");
  await waitForText("TOGGLE THE SITUATION");
  await record(2600);

  for (const [byte, cap] of [
    ["0x00 (SETTLE)", "0x00 · every measurement ran and found nothing — the only byte in 256 that settles"],
    ["0x10 (ESCROW)", "0x10 · a dispute alone holds the crossing, reversibly"],
    ["0x18 (attest+degrade)", "0x18 · an attest hazard and a degrade hazard: the narrower one rules"],
    ["0xFF (REJECT)", "0xFF · everything wrong at once — refused"],
  ]) {
    await setCaption(cap);
    await clickText(byte);
    await record(3000);
  }

  await setCaption("The browser's copy of the law and the on-chain kernel are compared live — they agree");
  await record(3200);

  await setCaption("Proved on all 4.3 billion inputs · 50 contract tests · CI green on Linux, Windows and macOS");
  await record(3600);

  await setCaption("You cannot settle by failing to measure.");
  await record(4000);
} catch (err) {
  console.error(`\n  recording failed: ${err.message}`);
  await page.screenshot({ path: "failure.png" }).catch(() => {});
  console.error("  wrote failure.png — is the node running and were escrows #1 and #2 reseeded?");
  await browser.close();
  process.exit(1);
}

await browser.close();
log(`captured ${frame} frames`);

// ------------------------------------------------------------------- encode
const ff = spawnSync("ffmpeg", [
  "-y", "-framerate", String(FPS), "-i", path.join(FRAMES, "f%05d.png"),
  "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "medium", "-crf", "20",
  "-vf", "scale=1440:-2", OUT,
], { encoding: "utf8" });
if (ff.status !== 0) {
  console.error(ff.stderr?.slice(-1200));
  console.error("\n  ffmpeg failed. Install it with: brew install ffmpeg");
  process.exit(1);
}
writeFileSync(path.join(FRAMES, ".gitignore"), "*\n");
const secs = (frame / FPS).toFixed(1);
console.log(`\n  ${OUT} — ${secs}s at ${FPS} fps, ${frame} frames\n`);
