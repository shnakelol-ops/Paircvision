// Self-tests for test-guard.mjs (run with: node --test .github/scripts/test-guard.test.mjs).
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MARKER,
  evaluate,
  formatBaseline,
  formatManifest,
  parseBaseline,
  parseManifest,
  readVitestReport,
  scanMarkers,
} from "./test-guard.mjs";

const ROOT = "/repo";
const H1 = "a".repeat(64);
const H2 = "b".repeat(64);

function report(files, extra = {}) {
  const testResults = Object.entries(files).map(([file, names]) => ({
    name: `${ROOT}/${file}`,
    status: "passed",
    assertionResults: names.map((n) => ({ fullName: n, status: "passed" })),
  }));
  const total = testResults.reduce((n, f) => n + f.assertionResults.length, 0);
  return { success: true, numTotalTests: total, numFailedTests: 0, numPendingTests: 0, numTodoTests: 0, testResults, ...extra };
}

const BASE_FILES = { "src/a.test.ts": ["a one", "a two"], "src/stats/b.test.ts": ["b one"] };

function input(json, overrides = {}) {
  const run = readVitestReport(json, ROOT);
  return {
    run,
    trackedTests: Object.keys(BASE_FILES),
    sources: new Map(Object.keys(BASE_FILES).map((f) => [f, "it('x', () => {});"])),
    baseline: parseBaseline(formatBaseline(readVitestReport(report(BASE_FILES), ROOT).files)),
    manifest: new Map([["src/stats/b.test.ts", H1]]),
    currentHashes: new Map([["src/stats/b.test.ts", H1]]),
    ...overrides,
  };
}

test("an unchanged run passes", () => {
  const r = evaluate(input(report(BASE_FILES)));
  assert.deepEqual(r.failures, []);
  assert.equal(r.executed, 3);
});

test("added tests and new protected files are accepted, as notices", () => {
  const r = evaluate(input(report({ ...BASE_FILES, "src/c.test.ts": ["c one"] }), {
    currentHashes: new Map([["src/stats/b.test.ts", H1], ["src/stats/new.test.ts", H2]]),
  }));
  assert.deepEqual(r.failures, []);
  assert.equal(r.notices.length, 2);
});

test("a deleted test file fails (not executed, and its baseline tests missing)", () => {
  const r = evaluate(input(report({ "src/a.test.ts": ["a one", "a two"] })));
  assert.ok(r.failures.some((f) => f.includes("Test file not executed: src/stats/b.test.ts")));
  assert.ok(r.failures.some((f) => f.includes("Baseline test did not run") && f.includes("b one")));
});

test("a removed test fails, even when another test is added to keep the count", () => {
  const r = evaluate(input(report({ "src/a.test.ts": ["a one", "a three"], "src/stats/b.test.ts": ["b one"] })));
  assert.ok(r.failures.some((f) => f.includes("a two")));
});

test("one of two identically named tests removed fails", () => {
  const files = { "src/a.test.ts": ["dup", "dup"], "src/stats/b.test.ts": ["b one"] };
  const baseline = readVitestReport(report(files), ROOT).files;
  const r = evaluate(input(report({ "src/a.test.ts": ["dup"], "src/stats/b.test.ts": ["b one"] }), { baseline, trackedTests: Object.keys(files) }));
  assert.ok(r.failures.some((f) => f.includes("› dup")));
});

test("skipped, todo and failed tests fail", () => {
  const json = report(BASE_FILES, { numPendingTests: 1, success: true });
  json.testResults[0].assertionResults[1].status = "skipped";
  const r = evaluate(input(json));
  assert.ok(r.failures.some((f) => f.includes("(skipped)")));
  assert.ok(r.failures.some((f) => f.includes("skipped or todo")));
  const failed = report(BASE_FILES, { success: false, numFailedTests: 1 });
  failed.testResults[0].status = "failed";
  assert.ok(evaluate(input(failed)).failures.length >= 3);
});

test("source markers: skip / only / todo / skipIf / xit are caught; ordinary code is not", () => {
  for (const s of ["it.only('x'", "describe.skip('x'", "test.todo('x')", "it.skipIf(a)('x'", "xit('x'", "fdescribe('x'", "it.concurrent.only('x'", "ctx.skip()", "it.fails('x'"]) {
    assert.ok(MARKER.test(s), s);
  }
  for (const s of ["it('skips nothing', () => {})", "it.each([1])('x'", "const skipped = 1;", "describe('only one', () => {})", "test('todo list')"]) {
    assert.ok(!MARKER.test(s), s);
  }
  assert.deepEqual(scanMarkers(new Map([["src/a.test.ts", "ok\n  it.only('x', f)\n"]])), ["src/a.test.ts:2: it.only('x', f)"]);
});

test("a changed or deleted protected expectation fails", () => {
  assert.ok(evaluate(input(report(BASE_FILES), { currentHashes: new Map([["src/stats/b.test.ts", H2]]) })).failures.some((f) => f.includes("changed without a manifest update")));
  assert.ok(evaluate(input(report(BASE_FILES), { currentHashes: new Map() })).failures.some((f) => f.includes("missing")));
});

test("an incomplete run (unsuccessful, or fewer tests than the baseline) fails", () => {
  const r = evaluate(input(report({ "src/a.test.ts": ["a one"] }, { success: false })));
  assert.ok(r.failures.some((f) => f.includes("unsuccessful run")));
  assert.ok(r.failures.some((f) => f.includes("Executed 1 tests; the baseline has 3")));
});

test("baseline removals and manifest changes made in a PR are listed for review, not silently accepted", () => {
  const smaller = parseBaseline(formatBaseline(new Map([["src/a.test.ts", ["a one"]], ["src/stats/b.test.ts", ["b one"]]])));
  const base = parseBaseline(formatBaseline(readVitestReport(report(BASE_FILES), ROOT).files));
  const r = evaluate(input(report({ "src/a.test.ts": ["a one"], "src/stats/b.test.ts": ["b one"] }), {
    baseline: smaller,
    baseBaseline: base,
    manifest: new Map([["src/stats/b.test.ts", H2]]),
    currentHashes: new Map([["src/stats/b.test.ts", H2]]),
    baseManifest: new Map([["src/stats/b.test.ts", H1]]),
  }));
  assert.deepEqual(r.failures, []);
  assert.ok(r.review.some((x) => x.includes("Test removed from the baseline: src/a.test.ts › a two")));
  assert.ok(r.review.some((x) => x.includes("Protected expectation changed: src/stats/b.test.ts")));
});

test("baseline and manifest round-trip; malformed files throw", () => {
  const files = readVitestReport(report(BASE_FILES), ROOT).files;
  assert.deepEqual(parseBaseline(formatBaseline(files)), new Map([...files].map(([k, v]) => [k, [...v].sort()])));
  const m = new Map([["src/x.ts", H1]]);
  assert.deepEqual(parseManifest(formatManifest(m)), m);
  assert.throws(() => parseBaseline("garbage\n"), /Malformed/);
  assert.throws(() => parseManifest("abc  src/x.ts\n"), /Malformed/);
  assert.throws(() => readVitestReport({}, ROOT), /no testResults/);
});
