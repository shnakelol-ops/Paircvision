import { describe, expect, it } from "vitest";
import { parseBackupFile } from "./backup-validate";
import { BACKUP_SCHEMA, BACKUP_VERSION } from "./backup-types";

function validBackupJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    schema: BACKUP_SCHEMA,
    version: BACKUP_VERSION,
    createdAt: "2026-01-01T00:00:00.000Z",
    appVersion: "0.1.0 Beta",
    summary: { domains: {}, unsupported: [] },
    data: {
      matchStatsSavedMatches: JSON.stringify([{ id: "m1", homeTeamName: "Ballyboden" }]),
    },
    ...overrides,
  });
}

describe("parseBackupFile — accepts a valid current backup", () => {
  it("ok: true for a well-formed v1 backup", () => {
    const result = parseBackupFile(validBackupJson());
    expect(result.ok).toBe(true);
  });

  it("recomputes the summary from validated data rather than trusting the file's claimed summary", () => {
    const result = parseBackupFile(
      validBackupJson({ summary: { domains: { matchStatsSavedMatches: 999 }, unsupported: [] } }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.file.summary.domains.matchStatsSavedMatches).toBe(1); // real count, not the spoofed 999
  });
});

describe("parseBackupFile — rejections", () => {
  it("corrupt JSON", () => {
    const result = parseBackupFile("{ this is not json ");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("invalid-json");
  });

  it("unrelated JSON (valid JSON, not a backup at all)", () => {
    const result = parseBackupFile(JSON.stringify({ hello: "world", numbers: [1, 2, 3] }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("wrong-schema");
  });

  it("a bare JSON array (not an object) at the top level", () => {
    const result = parseBackupFile(JSON.stringify([1, 2, 3]));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("invalid-shape");
  });

  it("wrong schema marker", () => {
    const result = parseBackupFile(validBackupJson({ schema: "some-other-app-backup" }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("wrong-schema");
  });

  it("missing version entirely", () => {
    const raw = JSON.parse(validBackupJson());
    delete raw.version;
    const result = parseBackupFile(JSON.stringify(raw));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("missing-version");
  });

  it("unsupported future version", () => {
    const result = parseBackupFile(validBackupJson({ version: 2 }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("unsupported-version");
  });

  it("malformed required domain: matchStatsSavedMatches is not an array", () => {
    const result = parseBackupFile(validBackupJson({ data: { matchStatsSavedMatches: JSON.stringify({ not: "an array" }) } }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("malformed-domain");
  });

  it("malformed domain: value is not even a string", () => {
    const raw = JSON.parse(validBackupJson());
    raw.data.matchStatsSavedMatches = ["not", "a", "string"];
    const result = parseBackupFile(JSON.stringify(raw));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("malformed-domain");
  });

  it("prototype-pollution-style key in the top-level object", () => {
    const raw = `{"schema":"${BACKUP_SCHEMA}","version":${BACKUP_VERSION},"createdAt":"2026-01-01T00:00:00.000Z","__proto__":{"polluted":true},"data":{}}`;
    const result = parseBackupFile(raw);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("unsafe-keys");
  });

  it("prototype-pollution-style key nested inside data", () => {
    const raw = `{"schema":"${BACKUP_SCHEMA}","version":${BACKUP_VERSION},"createdAt":"2026-01-01T00:00:00.000Z","data":{"matchStatsSavedMatches":"[]","constructor":{"polluted":true}}}`;
    const result = parseBackupFile(raw);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("unsafe-keys");
  });

  it("excessively large payload", () => {
    const huge = "x".repeat(210 * 1024 * 1024);
    const result = parseBackupFile(huge);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("too-large");
  });
});

describe("parseBackupFile — allowances", () => {
  it("allows a backup with no domains at all (missing optional domains)", () => {
    const result = parseBackupFile(validBackupJson({ data: {} }));
    expect(result.ok).toBe(true);
  });

  it("allows an empty supported domain (a genuinely empty array, not absent)", () => {
    const result = parseBackupFile(validBackupJson({ data: { matchStatsSavedMatches: "[]" } }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.file.summary.domains.matchStatsSavedMatches).toBe(0); // present-but-empty is distinct from absent
    expect(result.file.data.matchStatsSavedMatches).toBe("[]");
  });

  it("allows an unknown/future top-level field without rejecting the file", () => {
    const result = parseBackupFile(validBackupJson({ someFutureField: "from a later app version" }));
    expect(result.ok).toBe(true);
  });

  it("allows an unknown/future domain id inside data without rejecting the file", () => {
    const result = parseBackupFile(validBackupJson({ data: { matchStatsSavedMatches: "[]", someFutureDomain: "whatever" } }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.file.data.someFutureDomain).toBeUndefined(); // ignored, not surfaced
  });
});
