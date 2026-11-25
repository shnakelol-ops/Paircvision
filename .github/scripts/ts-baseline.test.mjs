// Self-tests for ts-baseline.mjs (run with: node --test .github/scripts/ts-baseline.test.mjs).
import assert from "node:assert/strict";
import { test } from "node:test";
import { compare, countKeys, formatBaseline, parseBaseline, parseTscOutput } from "./ts-baseline.mjs";

const SAMPLE = [
  "src/a.tsx(88,58): error TS2339: Property 'error' does not exist on type 'ParsedBackup'.",
  "src/b.test.ts(61,16): error TS2339: Property 'strokeWidth' does not exist on type 'PitchMarking'.",
  "  Property 'strokeWidth' does not exist on type 'TextSpec'.",
  "src/b.test.ts(61,36): error TS2339: Property 'strokeWidth' does not exist on type 'PitchMarking'.",
  "  Property 'strokeWidth' does not exist on type 'TextSpec'.",
  "",
].join("\n");

test("parses file diagnostics, ignores continuation lines, keeps duplicates", () => {
  const keys = parseTscOutput(SAMPLE);
  assert.equal(keys.length, 3);
  assert.equal(countKeys(keys).size, 2);
});

test("line and column movement does not change a diagnostic", () => {
  const moved = SAMPLE.replace("(88,58)", "(140,7)");
  const { added, resolved } = compare(countKeys(parseTscOutput(moved)), countKeys(parseTscOutput(SAMPLE)));
  assert.deepEqual(added, []);
  assert.deepEqual(resolved, []);
});

test("a new error is detected even if an unrelated error is fixed at the same time", () => {
  const baseline = countKeys(parseTscOutput(SAMPLE));
  const swapped = SAMPLE.replace(
    "src/a.tsx(88,58): error TS2339: Property 'error' does not exist on type 'ParsedBackup'.",
    "src/c.ts(1,1): error TS2322: Type 'string' is not assignable to type 'number'.",
  );
  const { added, resolved } = compare(countKeys(parseTscOutput(swapped)), baseline);
  assert.equal(added.length, 1);
  assert.match(added[0].key, /src\/c\.ts\tTS2322/);
  assert.equal(resolved.length, 1);
  assert.match(resolved[0].key, /src\/a\.tsx\tTS2339/);
});

test("an extra copy of a known error is detected", () => {
  const baseline = countKeys(parseTscOutput(SAMPLE));
  const extra = `${SAMPLE}src/a.tsx(90,1): error TS2339: Property 'error' does not exist on type 'ParsedBackup'.\n`;
  const { added } = compare(countKeys(parseTscOutput(extra)), baseline);
  assert.deepEqual(added.map((x) => x.extra), [1]);
});

test("global diagnostics are parsed; uninterpretable output throws", () => {
  assert.equal(parseTscOutput("error TS5083: Cannot read file 'tsconfig.json'.\n").length, 1);
  assert.throws(() => parseTscOutput("Segmentation fault\n"), /Uninterpretable/);
  assert.throws(() => parseTscOutput("   orphan continuation\n"), /Unexpected indented/);
});

test("a Found-N summary that disagrees with the parsed count throws", () => {
  assert.throws(() => parseTscOutput(`${SAMPLE}Found 5 errors.\n`), /reported 5/);
  assert.equal(parseTscOutput(`${SAMPLE}Found 3 errors in 2 files.\n`).length, 3);
});

test("baseline round-trips and rejects malformed or duplicate lines", () => {
  const counts = countKeys(parseTscOutput(SAMPLE));
  assert.deepEqual(parseBaseline(formatBaseline(counts)), counts);
  assert.throws(() => parseBaseline("x\tsrc/a.ts\tTS1\tmsg\n"), /Malformed/);
  assert.throws(() => parseBaseline("0\tsrc/a.ts\tTS1\tmsg\n"), /Malformed/);
  assert.throws(() => parseBaseline("1\tsrc/a.ts\tTS1\tmsg\n1\tsrc/a.ts\tTS1\tmsg\n"), /Duplicate/);
});
