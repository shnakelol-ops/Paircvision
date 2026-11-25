// ui-driver.mjs — drives the REAL Event Stats (Pro Tagger) UI in Chromium.
// Every event is entered through the same taps a coach makes:
//   family tile (FOR row / opposition row) → [owner toggle] → player picker → pitch tap.
// Match time is advanced with Playwright's fake clock so events carry realistic
// match-clock timestamps without waiting in real time.

export const CHROME = "/opt/pw-browsers/chromium-1243/chrome-linux64/chrome";

const FAMILY_LABEL = {
  football: { GOAL: "Goal", POINT: "Point", TWO_POINT: "2PT", SHOT: "Shot", WIDE: "Wide", RESTART: "Kickout", FORTY_FIVE: "45", SIDELINE: "Sideline", TURNOVER: "Turnover", FREE: "Free", DISCIPLINE: "Discipline" },
  hurling:  { GOAL: "Goal", POINT: "Point", SHOT: "Shot", WIDE: "Wide", RESTART: "Puckout", FORTY_FIVE: "65", SIDELINE: "Sideline", TURNOVER: "Turnover", FREE: "Free", DISCIPLINE: "Discipline" },
};

const TURNOVER_ROW_LABEL = {
  FOR: { Tackle: "Tackle", Interception: "Interception", "HP Error": "Opposition HP Error", "KP Error": "Opposition KP Error", Overcarried: "Opposition Overcarried" },
  OPP: { Tackle: "Dispossessed", Interception: "Intercepted", "HP Error": "HP Error", "KP Error": "KP Error", Overcarried: "Overcarried" },
};

/** Marks the exact tile button with data-audit-target and returns its selector. */
async function markTile(page, sportKey, family, row, tile) {
  const familyLabel = FAMILY_LABEL[sportKey][family];
  let display = tile;
  if (family === "TURNOVER") display = TURNOVER_ROW_LABEL[row][tile];
  const ok = await page.evaluate(({ familyLabel, row, display }) => {
    document.querySelectorAll("[data-audit-target]").forEach((n) => n.removeAttribute("data-audit-target"));
    const spans = Array.from(document.querySelectorAll("span")).filter((s) => s.textContent === familyLabel.toUpperCase() || s.textContent === familyLabel);
    for (const span of spans) {
      const header = span.parentElement; // card header
      const card = header?.parentElement;
      if (!card) continue;
      const tileButtons = Array.from(card.querySelectorAll("button")).filter((b) => !header.contains(b));
      if (tileButtons.length === 0) continue;
      const isOppBtn = (b) => {
        const a = b.getAttribute("aria-label") || "";
        return a.startsWith("Opposition ") || a.startsWith("OUR TURNOVERS LOST");
      };
      const candidates = tileButtons.filter((b) => (row === "OPP" ? isOppBtn(b) : !isOppBtn(b)) && b.textContent.trim() === display);
      if (candidates.length === 1) { candidates[0].setAttribute("data-audit-target", "1"); return true; }
    }
    return false;
  }, { familyLabel, row, display });
  if (!ok) throw new Error(`tile not found: ${family}/${row}/${tile}`);
  return "[data-audit-target='1']";
}

async function setOwner(page, sportKey, owner) {
  const abbr = sportKey === "hurling" ? "P/O" : "K/O";
  const label = owner === "FOR" ? `OUR ${abbr}` : `THEIR ${abbr}`;
  await page.getByRole("button", { name: label, exact: true }).click();
}

/** Reads which owner button is currently highlighted (active style has a filled background). */
export async function readOwnerToggle(page, sportKey) {
  const abbr = sportKey === "hurling" ? "P/O" : "K/O";
  return page.evaluate((abbr) => {
    const btns = Array.from(document.querySelectorAll("button")).filter((b) => b.textContent === `OUR ${abbr}` || b.textContent === `THEIR ${abbr}`);
    return btns.map((b) => ({ label: b.textContent, bg: getComputedStyle(b).backgroundColor, color: getComputedStyle(b).color }));
  }, abbr);
}

export async function pitchTap(page, nx, ny) {
  const svg = page.locator("svg[aria-label='Pitch - tap to place event']");
  const box = await svg.boundingBox();
  // Portrait viewBox is 100 (w) × 160 (h): svgY = nx·160, svgX = 100 − ny·100 (see ProTaggerPitchView).
  const VW = 100, VH = 160;
  const scale = Math.min(box.width / VW, box.height / VH);
  const offX = (box.width - VW * scale) / 2, offY = (box.height - VH * scale) / 2;
  const svgX = VW - ny * VW, svgY = nx * VH;
  await page.mouse.click(box.x + offX + svgX * scale, box.y + offY + svgY * scale);
}

/** Enters one fixture event through the live UI. */
export async function tagEvent(page, sportKey, ev) {
  if (ev.family === "RESTART") await setOwner(page, sportKey, ev.owner);
  const sel = await markTile(page, sportKey, ev.family, ev.row, ev.tile);
  await page.locator(sel).click();
  // Player picker
  if (ev.player == null) await page.getByRole("button", { name: "No player / Unknown" }).click();
  else await page.locator("button").filter({ hasText: new RegExp(`^${ev.player.number}(?!\\d)`) }).first().click();
  await pitchTap(page, ev.nx, ev.ny);
  // Wrong-way guard: a second tap within 3 s overrides (fixture never relies on it, but report it).
  const warn = await page.getByText("Wrong way? Tap again to override").count();
  if (warn > 0) { await pitchTap(page, ev.nx, ev.ny); ev._wrongWayOverride = true; }
  // Feedback dot clears after 750 ms.
  await page.clock.runFor(800);
  await page.getByText("✓ Event saved").waitFor({ state: "detached", timeout: 5000 }).catch(() => {});
}
