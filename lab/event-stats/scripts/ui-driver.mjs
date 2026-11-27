// ui-driver.mjs — drives the REAL Event Stats (Pro Tagger) UI in Chromium.
// Every event is entered through the same taps a coach makes:
//   family tile (FOR row / opposition row) → [owner toggle] → player picker → pitch tap.
// Match time is advanced with Playwright's fake clock so events carry realistic
// match-clock timestamps without waiting in real time.

/** Chromium binary: PLAYWRIGHT_CHROMIUM_EXECUTABLE if set, otherwise the browser installed for the project's pinned Playwright (`npx playwright install chromium`). */
export const CHROME = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined;

const FAMILY_LABEL = {
  football: { GOAL: "Goal", POINT: "Point", TWO_POINT: "2PT", SHOT: "Shot", WIDE: "Wide", RESTART: "Kickout", FORTY_FIVE: "45", SIDELINE: "Sideline", TURNOVER: "Turnover", FREE: "Free", DISCIPLINE: "Discipline" },
  hurling:  { GOAL: "Goal", POINT: "Point", SHOT: "Shot", WIDE: "Wide", RESTART: "Puckout", FORTY_FIVE: "65", SIDELINE: "Sideline", TURNOVER: "Turnover", FREE: "Free", DISCIPLINE: "Discipline" },
};

const TURNOVER_ROW_LABEL = {
  FOR: { Tackle: "Tackle", Interception: "Interception", "HP Error": "Opposition HP Error", "KP Error": "Opposition KP Error", Overcarried: "Opposition Overcarried" },
  OPP: { Tackle: "Dispossessed", Interception: "Intercepted", "HP Error": "HP Error", "KP Error": "KP Error", Overcarried: "Overcarried" },
};

/** Thrown when the live screen does not offer a fixture event's family or tile (recorded, never substituted). */
export class NotOffered extends Error {}

/**
 * Labels the app may show for the same fact. Camogie's end-line free is a "45" (Camogie Official
 * Guide Rule 11.14); the app currently shows "65" (finding CF-1) — the event is still entered, and
 * the label shown is recorded so the wording checks report it.
 */
const LABEL_ALTERNATIVES = { camogie: { family: { FORTY_FIVE: ["45", "65"] }, tile: { "45": ["45", "65"] } } };

/** Marks the exact tile button with data-audit-target and returns its selector. */
async function markTile(page, sportKey, family, row, tile, sport) {
  const alts = LABEL_ALTERNATIVES[sport] ?? {};
  const familyLabels = alts.family?.[family] ?? [FAMILY_LABEL[sportKey][family]];
  const displays = family === "TURNOVER" ? [TURNOVER_ROW_LABEL[row][tile]] : (alts.tile?.[tile] ?? [tile]);
  for (const familyLabel of familyLabels) for (const display of displays) {
    if (familyLabel == null) continue;
    const found = await markTileLabel(page, familyLabel, row, display);
    if (found) return { selector: "[data-audit-target='1']", familyLabel, display };
  }
  throw new NotOffered(`not offered: ${family}/${row}/${tile} (looked for family ${familyLabels.join(" | ")}, tile ${displays.join(" | ")})`);
}

async function markTileLabel(page, familyLabel, row, display) {
  return page.evaluate(({ familyLabel, row, display }) => {
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
}

/**
 * The tiles the live screen renders for each family (home row), read without tapping — for the
 * capture-option probes in rules/sport-rules.json. Returns null for a family that is not shown.
 */
export async function readFamilyTiles(page, familyLabels) {
  return page.evaluate((labels) => {
    const out = {};
    for (const label of labels) {
      const span = Array.from(document.querySelectorAll("span")).find((s) => s.textContent === label.toUpperCase() || s.textContent === label);
      const header = span?.parentElement, card = header?.parentElement;
      if (!card) { out[label] = null; continue; }
      const tiles = Array.from(card.querySelectorAll("button")).filter((b) => !header.contains(b) && !(b.getAttribute("aria-label") || "").startsWith("Opposition ")).map((b) => b.textContent.trim());
      out[label] = [...new Set(tiles)];
    }
    return out;
  }, familyLabels);
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

/** Thrown when the live player picker does not offer the fixture's player (e.g. the wrong squad is shown). */
export class PickerUnsupported extends Error {}

/**
 * Marks the player-picker button for a shirt number. Each picker button's text starts with the
 * shirt number (the jersey graphic and the label both show it, then the name), so match the first
 * line exactly rather than a text prefix ("8" must not match "88…" or "18"). When the squad name is
 * known it must also appear on the button, so a same-numbered player of the other team never passes.
 */
async function markPlayer(page, number, name) {
  const found = await page.evaluate(([n, nm]) => {
    document.querySelectorAll("[data-audit-player]").forEach((x) => x.removeAttribute("data-audit-player"));
    const byNumber = Array.from(document.querySelectorAll("button")).filter((b) => b.innerText.split("\n")[0].trim() === String(n));
    const hits = nm ? byNumber.filter((b) => b.innerText.split("\n").some((l) => l.trim() === nm)) : byNumber;
    if (hits.length === 1) hits[0].setAttribute("data-audit-player", "1");
    return { hits: hits.length, offered: byNumber.map((b) => b.innerText.split("\n").at(-1).trim()) };
  }, [number, name ?? null]);
  if (found.hits === 0 && name) throw new PickerUnsupported(`player picker does not offer ${name} (#${number}); offered: ${found.offered.join(", ") || "none"}`);
  if (found.hits !== 1) throw new Error(`player picker: expected exactly one button for #${number}${name ? ` (${name})` : ""}, found ${found.hits}`);
  return "[data-audit-player='1']";
}

/** Enters one fixture event through the live UI. */
export async function tagEvent(page, sportKey, ev, squads, { unsupportedPlayer = "throw", sport = null, notOffered = "throw" } = {}) {
  if (ev.family === "RESTART") await setOwner(page, sportKey, ev.owner);
  let marked;
  try {
    marked = await markTile(page, sportKey, ev.family, ev.row, ev.tile, sport);
  } catch (e) {
    // Only with an explicit opt-in (Golden Matches E and F): record that the app does not offer this
    // event and enter nothing in its place. The stored-event check reports it as not entered.
    if (!(e instanceof NotOffered) || notOffered !== "record") throw e;
    ev._notOffered = e.message;
    return;
  }
  if (marked.display !== ev.tile && ev.family !== "TURNOVER") ev._labelShown = marked.display;
  await page.locator(marked.selector).click();
  // Player picker
  if (ev.player == null) await page.getByRole("button", { name: "No player / Unknown" }).click();
  else {
    const name = squads?.[ev.player.team]?.find((p) => p.number === ev.player.number)?.name;
    try {
      await page.locator(await markPlayer(page, ev.player.number, name)).click();
    } catch (e) {
      // Only with an explicit opt-in: record the unsupported player and tag the event with no player,
      // so the run continues and the stored-event check reports the difference (never hidden).
      if (!(e instanceof PickerUnsupported) || unsupportedPlayer !== "unknown") throw e;
      ev._pickerUnsupported = e.message;
      await page.getByRole("button", { name: "No player / Unknown" }).click();
    }
  }
  await pitchTap(page, ev.nx, ev.ny);
  // Wrong-way guard: a second tap within 3 s overrides (fixture never relies on it, but report it).
  const warn = await page.getByText("Wrong way? Tap again to override").count();
  if (warn > 0) { await pitchTap(page, ev.nx, ev.ny); ev._wrongWayOverride = true; }
  // Feedback dot clears after 750 ms.
  await page.clock.runFor(800);
  await page.getByText("✓ Event saved").waitFor({ state: "detached", timeout: 5000 }).catch(() => {});
}
