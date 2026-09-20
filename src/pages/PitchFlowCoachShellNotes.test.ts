// Regression coverage for the PáircVision Notes V1 hardening pass:
//  - a storage write failure must never crash the page or silently report
//    success (see persistWrittenNotes, buildNoteToSave)
//  - unsaved drafts must survive navigation/switching without leaking
//    between notes (see the draft-cache helpers and resolveInitialNotesPageState)
//  - title/body limits must never silently truncate without the user
//    knowing (see MAX_NOTE_TITLE_LENGTH / MAX_NOTE_BODY_LENGTH)
//
// This file tests the exported pure functions NotesPage is built from
// directly (the repo has no component-rendering test harness — see
// backup-domains.test.ts for the same in-memory-localStorage pattern used
// here), plus the ConfirmSheet accessible-modal behaviour is verified
// separately via live browser testing (see the release report).
import { beforeEach, describe, expect, it } from "vitest";

import {
  MAX_NOTE_BODY_LENGTH,
  MAX_NOTE_TITLE_LENGTH,
  NEW_NOTE_DRAFT_KEY,
  NOTES_DRAFT_STORAGE_KEY,
  WRITTEN_NOTES_STORAGE_KEY,
  buildNoteToSave,
  isNoteDraftDirty,
  loadDraftStore,
  parseStoredWrittenNotes,
  persistWrittenNotes,
  pickDraftForNew,
  pickDraftForOpen,
  resolveInitialNotesPageState,
  sanitizeWrittenNotes,
  saveDraftStore,
  withDraftPersisted,
  withDraftResolved,
  type NoteDraftStore,
  type WrittenNote,
} from "./PitchFlowCoachShell";

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
}

beforeEach(() => {
  const storage = createMemoryStorage();
  (globalThis as unknown as { window: Window }).window = { localStorage: storage } as unknown as Window;
  (globalThis as unknown as { localStorage: Storage }).localStorage = storage;
});

function makeNote(overrides: Partial<WrittenNote> = {}): WrittenNote {
  return {
    id: "note-1",
    title: "Half-time reset",
    body: "Push higher press second half.",
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

describe("P0.1 — storage failure must never crash Notes or report a false success", () => {
  it("persistWrittenNotes returns false (never throws) when localStorage.setItem throws", () => {
    window.localStorage.setItem = () => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    };
    expect(() => persistWrittenNotes([makeNote()])).not.toThrow();
    expect(persistWrittenNotes([makeNote()])).toBe(false);
  });

  it("persistWrittenNotes returns true and actually writes on the happy path", () => {
    expect(persistWrittenNotes([makeNote()])).toBe(true);
    const stored = JSON.parse(window.localStorage.getItem(WRITTEN_NOTES_STORAGE_KEY)!);
    expect(stored).toHaveLength(1);
    expect(stored[0].title).toBe("Half-time reset");
  });

  it("a storage failure leaves the previously-saved notes untouched (nothing half-written)", () => {
    persistWrittenNotes([makeNote({ id: "existing", title: "Untouched" })]);
    const previousSetItem = window.localStorage.setItem.bind(window.localStorage);
    window.localStorage.setItem = () => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    };
    const ok = persistWrittenNotes([makeNote({ id: "existing", title: "Untouched" }), makeNote({ id: "new-one" })]);
    expect(ok).toBe(false);
    window.localStorage.setItem = previousSetItem;
    // setItem threw before writing, so the store still holds only the original note.
    const stored = JSON.parse(window.localStorage.getItem(WRITTEN_NOTES_STORAGE_KEY)!);
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe("existing");
  });

  it("draft-cache writes are best-effort and swallow storage failures silently", () => {
    window.localStorage.setItem = () => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    };
    expect(() => saveDraftStore({ activeKey: NEW_NOTE_DRAFT_KEY, drafts: {} })).not.toThrow();
  });

  it("buildNoteToSave never represents a failed save as a real note — callers gate on persistWrittenNotes' return value", () => {
    const note = buildNoteToSave({
      activeNoteId: null,
      existingNote: null,
      titleDraft: "A real thought",
      bodyDraft: "",
      dateDraft: "",
      now: 5000,
    });
    expect(note).not.toBeNull();
    window.localStorage.setItem = () => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    };
    // This mirrors NotesPage.saveNote(): build the note, then gate on persistence.
    const persisted = persistWrittenNotes([note!]);
    expect(persisted).toBe(false);
    // The caller (NotesPage) must not call setNotes/resolveDraft/"Note saved" when persisted is false.
  });
});

describe("P0.2 — unsaved drafts survive navigation and cannot leak between notes", () => {
  it("a new-note draft survives an app remount (resolveInitialNotesPageState)", () => {
    let store: NoteDraftStore = { activeKey: null, drafts: {} };
    store = withDraftPersisted(store, NEW_NOTE_DRAFT_KEY, true, {
      title: "Corner routine idea",
      body: "Try the short one to the near post.",
      selectedDate: "",
    });
    saveDraftStore(store);

    const restored = resolveInitialNotesPageState();
    expect(restored.activeNoteId).toBeNull();
    expect(restored.titleDraft).toBe("Corner routine idea");
    expect(restored.bodyDraft).toBe("Try the short one to the near post.");
  });

  it("an existing note's edit draft survives an app remount", () => {
    const note = makeNote({ id: "note-1", title: "Saved title", body: "Saved body" });
    persistWrittenNotes([note]);

    let store: NoteDraftStore = { activeKey: null, drafts: {} };
    store = withDraftPersisted(store, "note-1", true, {
      title: "Saved title",
      body: "Saved body — plus one more line I haven't saved yet",
      selectedDate: "",
    });
    saveDraftStore(store);

    const restored = resolveInitialNotesPageState();
    expect(restored.activeNoteId).toBe("note-1");
    expect(restored.bodyDraft).toBe("Saved body — plus one more line I haven't saved yet");
  });

  it("resolveInitialNotesPageState ignores an orphaned draft for a note that no longer exists", () => {
    let store: NoteDraftStore = { activeKey: null, drafts: {} };
    store = withDraftPersisted(store, "deleted-note-id", true, { title: "x", body: "y", selectedDate: "" });
    saveDraftStore(store);
    // No notes saved at all, so "deleted-note-id" can't be a real note.
    const restored = resolveInitialNotesPageState();
    expect(restored.activeNoteId).toBeNull();
    expect(restored.titleDraft).toBe("");
  });

  it("switching between two notes with separate unsaved drafts never leaks one into the other", () => {
    const noteA = makeNote({ id: "A", title: "Note A", body: "A saved body" });
    const noteB = makeNote({ id: "B", title: "Note B", body: "B saved body" });

    let store: NoteDraftStore = { activeKey: null, drafts: {} };

    // Type into A.
    store = withDraftPersisted(store, "A", true, { title: "Note A", body: "A saved body + edits", selectedDate: "" });

    // Switch to B: B must show its own saved content, never A's draft.
    const bView = pickDraftForOpen(store, noteB);
    expect(bView.body).toBe("B saved body");
    expect(bView.body).not.toContain("edits");

    // Type into B.
    store = withDraftPersisted(store, "B", true, { title: "Note B", body: "B saved body + different edits", selectedDate: "" });

    // Switch back to A: A's draft must still be intact, untouched by B's edits.
    const aView = pickDraftForOpen(store, noteA);
    expect(aView.body).toBe("A saved body + edits");

    // And B's own draft is also still there, independently.
    const bViewAgain = pickDraftForOpen(store, noteB);
    expect(bViewAgain.body).toBe("B saved body + different edits");
  });

  it("tapping '+ New Note' does not destroy a different, already-open note's draft", () => {
    const noteA = makeNote({ id: "A", title: "Note A", body: "Saved" });
    let store: NoteDraftStore = { activeKey: null, drafts: {} };
    store = withDraftPersisted(store, "A", true, { title: "Note A", body: "Saved + unsaved edit", selectedDate: "" });

    // Starting a new note reads only the NEW_NOTE_DRAFT_KEY slot — A's entry is untouched.
    const newNoteView = pickDraftForNew(store);
    expect(newNoteView).toEqual({ title: "", body: "", selectedDate: "" });
    expect(store.drafts["A"]).toBeDefined();
    expect(pickDraftForOpen(store, noteA).body).toBe("Saved + unsaved edit");
  });

  it("a successful save resolves (clears) exactly the draft for the note that was saved, not others", () => {
    let store: NoteDraftStore = { activeKey: null, drafts: {} };
    store = withDraftPersisted(store, "A", true, { title: "A", body: "a", selectedDate: "" });
    store = withDraftPersisted(store, "B", true, { title: "B", body: "b", selectedDate: "" });

    store = withDraftResolved(store, "A");

    expect(store.drafts["A"]).toBeUndefined();
    expect(store.drafts["B"]).toBeDefined();
  });

  it("isNoteDraftDirty is false only when title/body/date exactly match the saved baseline", () => {
    const baseline = { title: "T", body: "B", selectedDate: "" };
    expect(isNoteDraftDirty({ title: "T", body: "B", selectedDate: "" }, baseline)).toBe(false);
    expect(isNoteDraftDirty({ title: "T", body: "B!", selectedDate: "" }, baseline)).toBe(true);
  });

  it("loadDraftStore is defensive against malformed/corrupted stored JSON", () => {
    window.localStorage.setItem(NOTES_DRAFT_STORAGE_KEY, "{not valid json");
    expect(loadDraftStore()).toEqual({ activeKey: null, drafts: {} });

    window.localStorage.setItem(NOTES_DRAFT_STORAGE_KEY, JSON.stringify({ activeKey: 42, drafts: { a: { title: 5 } } }));
    expect(loadDraftStore()).toEqual({ activeKey: null, drafts: {} });
  });
});

describe("P0.3 — title/body limits are enforced without silently destroying entered text", () => {
  it("the caps were raised from the old 80/2000 values", () => {
    expect(MAX_NOTE_TITLE_LENGTH).toBeGreaterThan(80);
    expect(MAX_NOTE_BODY_LENGTH).toBeGreaterThan(2000);
  });

  it("text at or under the limit is preserved exactly — no truncation", () => {
    const title = "A".repeat(MAX_NOTE_TITLE_LENGTH);
    const body = "B".repeat(MAX_NOTE_BODY_LENGTH);
    const note = buildNoteToSave({ activeNoteId: null, existingNote: null, titleDraft: title, bodyDraft: body, dateDraft: "", now: 1 });
    expect(note!.title).toHaveLength(MAX_NOTE_TITLE_LENGTH);
    expect(note!.body).toHaveLength(MAX_NOTE_BODY_LENGTH);
  });

  it("a body well within the new limit (well past the old 2000-char cap) survives fully", () => {
    const body = "word ".repeat(500); // 2500 chars — would have been silently cut under the old 2000 cap.
    const note = buildNoteToSave({ activeNoteId: null, existingNote: null, titleDraft: "t", bodyDraft: body, dateDraft: "", now: 1 });
    expect(note!.body).toBe(body.trim());
  });

  it("sanitizeWrittenNotes and parseStoredWrittenNotes both use the new, larger caps", () => {
    const longNote = makeNote({ title: "A".repeat(300), body: "B".repeat(15000) });
    const sanitized = sanitizeWrittenNotes([longNote]);
    expect(sanitized[0].title).toHaveLength(MAX_NOTE_TITLE_LENGTH);
    expect(sanitized[0].body).toHaveLength(MAX_NOTE_BODY_LENGTH);

    const parsed = parseStoredWrittenNotes(JSON.stringify([{ ...longNote }]));
    expect(parsed[0].title).toHaveLength(MAX_NOTE_TITLE_LENGTH);
    expect(parsed[0].body).toHaveLength(MAX_NOTE_BODY_LENGTH);
  });
});

describe("existing notes still load correctly (no regression to the read path)", () => {
  it("round-trips a normal set of previously-saved notes", () => {
    const notes = [makeNote({ id: "1", title: "One" }), makeNote({ id: "2", title: "Two", updatedAt: 2000 })];
    persistWrittenNotes(notes);
    const loaded = parseStoredWrittenNotes(window.localStorage.getItem(WRITTEN_NOTES_STORAGE_KEY));
    expect(loaded.map((n: WrittenNote) => n.title).sort()).toEqual(["One", "Two"]);
  });

  it("defensively drops malformed entries instead of crashing", () => {
    const raw = JSON.stringify([
      { id: "ok", title: "Fine", body: "Fine body", createdAt: 1, updatedAt: 1 },
      { id: "bad", title: 123, body: "oops", createdAt: 1, updatedAt: 1 },
      "not-an-object",
    ]);
    expect(() => parseStoredWrittenNotes(raw)).not.toThrow();
    const loaded = parseStoredWrittenNotes(raw);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].title).toBe("Fine");
  });

  it("returns an empty list (not a throw) for garbage JSON", () => {
    expect(parseStoredWrittenNotes("{not json")).toEqual([]);
    expect(parseStoredWrittenNotes(null)).toEqual([]);
  });
});

describe("create/edit/delete note-building behaviour is unchanged", () => {
  it("buildNoteToSave returns null when both title and body are empty", () => {
    expect(buildNoteToSave({ activeNoteId: null, existingNote: null, titleDraft: "  ", bodyDraft: "", dateDraft: "", now: 1 })).toBeNull();
  });

  it("editing an existing note keeps its id and createdAt, and only bumps updatedAt", () => {
    const existing = makeNote({ id: "note-1", createdAt: 111, updatedAt: 111 });
    const note = buildNoteToSave({
      activeNoteId: "note-1",
      existingNote: existing,
      titleDraft: "Updated title",
      bodyDraft: "Updated body",
      dateDraft: "",
      now: 999,
    });
    expect(note!.id).toBe("note-1");
    expect(note!.createdAt).toBe(111);
    expect(note!.updatedAt).toBe(999);
  });

  it("creating a new note assigns a fresh id and uses `now` for both timestamps", () => {
    const note = buildNoteToSave({ activeNoteId: null, existingNote: null, titleDraft: "New", bodyDraft: "", dateDraft: "", now: 42 });
    expect(note!.id).toBeTruthy();
    expect(note!.createdAt).toBe(42);
    expect(note!.updatedAt).toBe(42);
  });

  it("an invalid selectedDate is dropped rather than saved as garbage", () => {
    const note = buildNoteToSave({ activeNoteId: null, existingNote: null, titleDraft: "T", bodyDraft: "", dateDraft: "not-a-date", now: 1 });
    expect(note!.selectedDate).toBeUndefined();
  });
});
