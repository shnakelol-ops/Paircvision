import { describe, expect, it } from "vitest";

import {
  ANGLED_ZONE_HANDLE_CORE_PX,
  angledZoneEditorOpenAfterSelection,
  angledZoneOutsideTapAction,
  angledZonePressIsInteriorTap,
  isAngledZoneEditorToggleTap,
  resolveAngledToolPendingPress,
} from "./angledZoneEditorToggle";

const THRESHOLD = 5;

function release(isInteriorPress: boolean, hasCrossedThreshold: boolean, releaseDistancePx: number | null) {
  return isAngledZoneEditorToggleTap({ isInteriorPress, hasCrossedThreshold, releaseDistancePx, dragThresholdPx: THRESHOLD });
}

describe("Angled Zone toolbar — Practice Area interaction rules", () => {
  it("1. a corner tap never opens the toolbar", () => {
    const onHandle = angledZonePressIsInteriorTap({ onCornerTarget: true, cornerDistancePx: 4, insideZone: true });
    expect(onHandle).toBe(false);
    expect(release(onHandle, false, 0)).toBe(false);
    // On the corner target but outside the zone (the handle's outer half).
    const outsideRing = angledZonePressIsInteriorTap({ onCornerTarget: true, cornerDistancePx: 20, insideZone: false });
    expect(release(outsideRing, false, 1)).toBe(false);
  });

  it("2 + 5. a corner drag never opens the toolbar on release", () => {
    expect(release(false, true, 40)).toBe(false);
    // Even if the finger comes back to where it started.
    expect(release(false, true, 0)).toBe(false);
  });

  it("3. a stationary tap inside the zone toggles the toolbar", () => {
    expect(release(true, false, 0)).toBe(true);
    expect(release(true, false, THRESHOLD - 1)).toBe(true);
    expect(release(true, false, null)).toBe(true);
  });

  it("4 + 5. an interior drag never toggles, including a drag that returns to its start", () => {
    expect(release(true, true, 30)).toBe(false);
    expect(release(true, true, 0)).toBe(false);
    expect(release(true, false, THRESHOLD)).toBe(false);
  });

  it("6. a new or newly selected zone starts with the toolbar closed", () => {
    expect(angledZoneEditorOpenAfterSelection("z1")).toBe(false);
    expect(angledZoneEditorOpenAfterSelection(null)).toBe(false);
  });

  it("7. an outside tap closes an open toolbar first, then ends editing", () => {
    expect(angledZoneOutsideTapAction(true)).toBe("close-toolbar");
    expect(angledZoneOutsideTapAction(false)).toBe("end-edit");
  });

  it("10. small zones: inside a corner target but off the visible handle is still an interior tap", () => {
    expect(
      angledZonePressIsInteriorTap({ onCornerTarget: true, cornerDistancePx: ANGLED_ZONE_HANDLE_CORE_PX + 1, insideZone: true }),
    ).toBe(true);
    expect(
      angledZonePressIsInteriorTap({ onCornerTarget: true, cornerDistancePx: ANGLED_ZONE_HANDLE_CORE_PX, insideZone: true }),
    ).toBe(false);
    expect(angledZonePressIsInteriorTap({ onCornerTarget: false, cornerDistancePx: 0, insideZone: true })).toBe(true);
  });
});

describe("Angled Zone tool — tap vs drag for presses off the selected zone", () => {
  const base = { hasCrossedThreshold: false, zoneUnderPressId: null, isEditing: false, editorOpen: false };

  it("a drag always draws a new zone — on empty pitch, inside an unselected zone, or while one is selected", () => {
    expect(resolveAngledToolPendingPress({ ...base, hasCrossedThreshold: true })).toBe("draw");
    expect(resolveAngledToolPendingPress({ ...base, hasCrossedThreshold: true, zoneUnderPressId: "z1" })).toBe("draw");
    expect(
      resolveAngledToolPendingPress({ ...base, hasCrossedThreshold: true, zoneUnderPressId: "z1", isEditing: true, editorOpen: true }),
    ).toBe("draw");
  });

  it("a tap on an existing zone selects it (also switching from another selected zone)", () => {
    expect(resolveAngledToolPendingPress({ ...base, zoneUnderPressId: "z1" })).toBe("select");
    expect(resolveAngledToolPendingPress({ ...base, zoneUnderPressId: "z2", isEditing: true, editorOpen: true })).toBe("select");
  });

  it("a tap on empty pitch closes an open toolbar, then deselects; with nothing selected it does nothing", () => {
    expect(resolveAngledToolPendingPress({ ...base, isEditing: true, editorOpen: true })).toBe("close-toolbar");
    expect(resolveAngledToolPendingPress({ ...base, isEditing: true, editorOpen: false })).toBe("end-edit");
    expect(resolveAngledToolPendingPress(base)).toBe("none");
  });
});
