import { describe, expect, it } from "vitest";
import {
  classifyTurnoverCauseTags,
  classifyKickoutTypeTags,
  classifyShotDetailTags,
} from "./tagVocabulary";

describe("classifyTurnoverCauseTags", () => {
  it("classifies Pro Tagger's turnover tag vocabulary (TACKLE, HP ERROR, KP ERROR, OVERCARRIED)", () => {
    expect(classifyTurnoverCauseTags(["TACKLE"])).toBe("TACKLE_PRESS");
    expect(classifyTurnoverCauseTags(["HP ERROR"])).toBe("SLACK_KP_HP");
    expect(classifyTurnoverCauseTags(["KP ERROR"])).toBe("SLACK_KP_HP");
    expect(classifyTurnoverCauseTags(["OVERCARRIED"])).toBe("OC_STRIPPED");
  });

  it("classifies Rapid Capture / Match Stats' turnover tag vocabulary", () => {
    expect(classifyTurnoverCauseTags(["TACKLE"])).toBe("TACKLE_PRESS");
    expect(classifyTurnoverCauseTags(["PRESS"])).toBe("TACKLE_PRESS");
    expect(classifyTurnoverCauseTags(["INTERCEPT"])).toBe("SWARM_INTERCEPT");
    expect(classifyTurnoverCauseTags(["SWARM"])).toBe("SWARM_INTERCEPT");
    expect(classifyTurnoverCauseTags(["OPP_ERROR"])).toBe("UNFORCED");
    expect(classifyTurnoverCauseTags(["UNFORCED"])).toBe("UNFORCED");
    expect(classifyTurnoverCauseTags(["SLACK_KICK_PASS"])).toBe("SLACK_KP_HP");
    expect(classifyTurnoverCauseTags(["SLACK_HAND_PASS"])).toBe("SLACK_KP_HP");
    expect(classifyTurnoverCauseTags(["STRIPPED"])).toBe("OC_STRIPPED");
  });

  it("renders UNCLASSIFIED rather than silently dropping unknown or missing tags", () => {
    expect(classifyTurnoverCauseTags(undefined)).toBe("UNCLASSIFIED");
    expect(classifyTurnoverCauseTags([])).toBe("UNCLASSIFIED");
    expect(classifyTurnoverCauseTags(["SOMETHING_NEW"])).toBe("UNCLASSIFIED");
  });

  it("Adare v Mungret regression: every one of the ground-truth cause tags resolves to a bucket, none vanish", () => {
    const adareCauses = [
      ...Array.from({ length: 4 }, () => ["TACKLE"]),
      ...Array.from({ length: 3 }, () => ["KP ERROR"]),
      ...Array.from({ length: 2 }, () => ["HP ERROR"]),
      ["OVERCARRIED"],
    ];
    const buckets = adareCauses.map((tags) => classifyTurnoverCauseTags(tags));
    expect(buckets.filter((b) => b === "TACKLE_PRESS").length).toBe(4);
    expect(buckets.filter((b) => b === "SLACK_KP_HP").length).toBe(5); // 3 KP + 2 HP
    expect(buckets.filter((b) => b === "OC_STRIPPED").length).toBe(1);
    expect(buckets.filter((b) => b === "UNCLASSIFIED").length).toBe(0);
  });
});

describe("classifyKickoutTypeTags", () => {
  it("classifies Pro Tagger's kickout tag vocabulary (CLEAN, BREAK, FOUL — no won/lost suffix)", () => {
    expect(classifyKickoutTypeTags(["CLEAN"])).toBe("CLEAN");
    expect(classifyKickoutTypeTags(["BREAK"])).toBe("BREAK");
    expect(classifyKickoutTypeTags(["FOUL"])).toBe("FOUL");
  });

  it("classifies Rapid Capture / Match Stats' kickout tag vocabulary (FOUL_WON / FOUL_CONCEDED / KICKED_DEAD)", () => {
    expect(classifyKickoutTypeTags(["FOUL_WON"])).toBe("FOUL");
    expect(classifyKickoutTypeTags(["FOUL_CONCEDED"])).toBe("FOUL");
    expect(classifyKickoutTypeTags(["KICKED_DEAD"])).toBe("KICKED_DEAD");
  });

  it("renders UNCLASSIFIED rather than silently dropping unknown or missing tags", () => {
    expect(classifyKickoutTypeTags(undefined)).toBe("UNCLASSIFIED");
    expect(classifyKickoutTypeTags(["MARK"])).toBe("UNCLASSIFIED");
  });
});

describe("classifyShotDetailTags", () => {
  it("classifies Pro Tagger's shot tag vocabulary, including the slash tag and the numeric 45/65 tag", () => {
    expect(classifyShotDetailTags(["SHORT"])).toBe("SHORT");
    expect(classifyShotDetailTags(["POST"])).toBe("POST");
    expect(classifyShotDetailTags(["45"])).toBe("FORTY_FIVE");
    expect(classifyShotDetailTags(["65"])).toBe("FORTY_FIVE");
    expect(classifyShotDetailTags(["BLOCK/SAVE"])).toBe("BLOCK_SAVE");
  });

  it("classifies Match Stats' shot tag vocabulary (FORTY_FIVE, BLOCK_SAVE, BLOCKED)", () => {
    expect(classifyShotDetailTags(["FORTY_FIVE"])).toBe("FORTY_FIVE");
    expect(classifyShotDetailTags(["BLOCK_SAVE"])).toBe("BLOCK_SAVE");
    expect(classifyShotDetailTags(["BLOCKED"])).toBe("BLOCK_SAVE");
  });

  it("renders UNCLASSIFIED rather than silently dropping unknown or missing tags", () => {
    expect(classifyShotDetailTags(undefined)).toBe("UNCLASSIFIED");
    expect(classifyShotDetailTags(["MARK"])).toBe("UNCLASSIFIED");
  });

  it("Adare v Mungret regression: Adare 3 block/save 0 short, Mungret 1 block/save 1 short", () => {
    const adare = [["BLOCK/SAVE"], ["BLOCK/SAVE"], ["BLOCK/SAVE"]];
    const mungret = [["BLOCK/SAVE"], ["SHORT"]];
    expect(adare.map((t) => classifyShotDetailTags(t)).filter((b) => b === "BLOCK_SAVE").length).toBe(3);
    expect(adare.map((t) => classifyShotDetailTags(t)).filter((b) => b === "SHORT").length).toBe(0);
    expect(mungret.map((t) => classifyShotDetailTags(t)).filter((b) => b === "BLOCK_SAVE").length).toBe(1);
    expect(mungret.map((t) => classifyShotDetailTags(t)).filter((b) => b === "SHORT").length).toBe(1);
  });
});
