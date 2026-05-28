import { describe, expect, it } from "vitest";
import {
  SESSION_BACKUP_APP,
  SESSION_BACKUP_KIND,
  SESSION_BACKUP_VERSION,
  parseSessionBackup,
} from "./sessionBackup";

function makeValidEntry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "session-1",
    title: "Deep Work",
    category: "Work",
    energy: "good",
    startedAt: new Date(2026, 4, 12, 9, 0, 0, 0).getTime(),
    endedAt: new Date(2026, 4, 12, 10, 0, 0, 0).getTime(),
    effectiveDurationMs: 45 * 60 * 1000,
    pauses: [
      {
        startedAt: new Date(2026, 4, 12, 9, 20, 0, 0).getTime(),
        endedAt: new Date(2026, 4, 12, 9, 35, 0, 0).getTime(),
      },
    ],
    pauseCount: 1,
    pausedDurationMs: 15 * 60 * 1000,
    weekday: "monday",
    ...overrides,
  };
}

function makeBackupRaw(sessions: unknown): string {
  return JSON.stringify({
    app: SESSION_BACKUP_APP,
    kind: SESSION_BACKUP_KIND,
    version: SESSION_BACKUP_VERSION,
    exportedAt: new Date(2026, 4, 12).toISOString(),
    sessions,
  });
}

describe("parseSessionBackup", () => {
  it("rejects raw JSON that is not an object", () => {
    expect(() => parseSessionBackup(JSON.stringify("not-an-object"))).toThrowError(
      "invalid_backup_shape",
    );
  });

  it("parses a valid backup", () => {
    const parsed = parseSessionBackup(makeBackupRaw([makeValidEntry()]));

    expect(parsed).toHaveLength(1);
    expect(parsed[0].id).toBe("session-1");
    expect(parsed[0].energy).toBe("good");
  });

  it("rejects invalid JSON", () => {
    expect(() => parseSessionBackup("{invalid")).toThrowError("invalid_json");
  });

  it("rejects invalid app or kind", () => {
    const invalidApp = JSON.stringify({
      app: "other",
      kind: SESSION_BACKUP_KIND,
      version: SESSION_BACKUP_VERSION,
      exportedAt: "2026-01-01T00:00:00.000Z",
      sessions: [makeValidEntry()],
    });
    const invalidKind = JSON.stringify({
      app: SESSION_BACKUP_APP,
      kind: "other-kind",
      version: SESSION_BACKUP_VERSION,
      exportedAt: "2026-01-01T00:00:00.000Z",
      sessions: [makeValidEntry()],
    });

    expect(() => parseSessionBackup(invalidApp)).toThrowError("invalid_backup_origin");
    expect(() => parseSessionBackup(invalidKind)).toThrowError("invalid_backup_origin");
  });

  it("rejects unsupported version", () => {
    const raw = JSON.stringify({
      app: SESSION_BACKUP_APP,
      kind: SESSION_BACKUP_KIND,
      version: 99,
      exportedAt: "2026-01-01T00:00:00.000Z",
      sessions: [makeValidEntry()],
    });

    expect(() => parseSessionBackup(raw)).toThrowError("unsupported_backup_version");
  });

  it("rejects missing sessions array", () => {
    const raw = JSON.stringify({
      app: SESSION_BACKUP_APP,
      kind: SESSION_BACKUP_KIND,
      version: SESSION_BACKUP_VERSION,
      exportedAt: "2026-01-01T00:00:00.000Z",
      sessions: null,
    });

    expect(() => parseSessionBackup(raw)).toThrowError("invalid_backup_sessions");
  });

  it("rejects non-string exportedAt", () => {
    const raw = JSON.stringify({
      app: SESSION_BACKUP_APP,
      kind: SESSION_BACKUP_KIND,
      version: SESSION_BACKUP_VERSION,
      exportedAt: 123,
      sessions: [makeValidEntry()],
    });

    expect(() => parseSessionBackup(raw)).toThrowError("invalid_backup_exported_at");
  });

  it("rejects duplicate session ids", () => {
    const raw = makeBackupRaw([
      makeValidEntry({ id: "dup" }),
      makeValidEntry({ id: "dup", title: "Second" }),
    ]);

    expect(() => parseSessionBackup(raw)).toThrowError("duplicate_backup_session_ids");
  });

  it("maps legacy energy values", () => {
    const raw = makeBackupRaw([
      makeValidEntry({ id: "e1", energy: "low" }),
      makeValidEntry({ id: "e2", energy: "medium" }),
      makeValidEntry({ id: "e3", energy: "high" }),
    ]);

    const parsed = parseSessionBackup(raw);
    expect(parsed.map((item) => item.energy)).toEqual(["bad", "regular", "good"]);
  });

  it("rejects invalid pauses", () => {
    const raw = makeBackupRaw([
      makeValidEntry({
        pauses: [{ startedAt: 10_000, endedAt: 5_000 }],
      }),
    ]);

    expect(() => parseSessionBackup(raw)).toThrowError("invalid_backup_session_entry");
  });

  it("rejects open pauses", () => {
    const raw = makeBackupRaw([
      makeValidEntry({
        pauses: [{ startedAt: 10_000, endedAt: null }],
      }),
    ]);

    expect(() => parseSessionBackup(raw)).toThrowError("invalid_backup_session_entry");
  });

  it("derives weekday when missing", () => {
    const startedAt = new Date(2026, 4, 17, 9, 0, 0, 0).getTime();
    const raw = makeBackupRaw([
      makeValidEntry({
        id: "weekday-missing",
        startedAt,
        endedAt: startedAt + 60 * 60 * 1000,
        weekday: "",
      }),
    ]);

    const parsed = parseSessionBackup(raw);
    expect(parsed[0].weekday).toBe("sunday");
  });

  it("rejects empty session id", () => {
    const raw = makeBackupRaw([makeValidEntry({ id: "" })]);
    expect(() => parseSessionBackup(raw)).toThrowError("invalid_backup_session_entry");
  });

  it("rejects empty session title", () => {
    const raw = makeBackupRaw([makeValidEntry({ title: "" })]);
    expect(() => parseSessionBackup(raw)).toThrowError("invalid_backup_session_entry");
  });

  it("rejects category that is not string", () => {
    const raw = makeBackupRaw([makeValidEntry({ category: 42 })]);
    expect(() => parseSessionBackup(raw)).toThrowError("invalid_backup_session_entry");
  });

  it("rejects non-numeric startedAt or endedAt", () => {
    const badStart = makeBackupRaw([makeValidEntry({ startedAt: "123" })]);
    const badEnd = makeBackupRaw([makeValidEntry({ endedAt: "456" })]);

    expect(() => parseSessionBackup(badStart)).toThrowError("invalid_backup_session_entry");
    expect(() => parseSessionBackup(badEnd)).toThrowError("invalid_backup_session_entry");
  });

  it("rejects endedAt earlier than startedAt", () => {
    const raw = makeBackupRaw([makeValidEntry({ startedAt: 2_000, endedAt: 1_000 })]);
    expect(() => parseSessionBackup(raw)).toThrowError("invalid_backup_session_entry");
  });

  it("rejects negative effectiveDurationMs", () => {
    const raw = makeBackupRaw([makeValidEntry({ effectiveDurationMs: -1 })]);
    expect(() => parseSessionBackup(raw)).toThrowError("invalid_backup_session_entry");
  });

  it("rejects negative pauseCount", () => {
    const raw = makeBackupRaw([makeValidEntry({ pauseCount: -1 })]);
    expect(() => parseSessionBackup(raw)).toThrowError("invalid_backup_session_entry");
  });

  it("rejects negative pausedDurationMs", () => {
    const raw = makeBackupRaw([makeValidEntry({ pausedDurationMs: -1 })]);
    expect(() => parseSessionBackup(raw)).toThrowError("invalid_backup_session_entry");
  });
});
