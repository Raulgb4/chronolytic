import type { CompletedSession, EnergyLevel, PausePeriod } from "./sessionTypes";

export const SESSION_BACKUP_APP = "chronolytic";
export const SESSION_BACKUP_KIND = "session-history-backup";
export const SESSION_BACKUP_VERSION = 1;

export type SessionBackupFile = {
  app: string;
  kind: string;
  version: number;
  exportedAt: string;
  sessions: CompletedSession[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parseEnergy(value: unknown): EnergyLevel | null {
  if (value === "bad" || value === "regular" || value === "good") {
    return value;
  }

  if (value === "low") return "bad";
  if (value === "medium") return "regular";
  if (value === "high") return "good";

  return null;
}

function getWeekdayFromTimestamp(timestamp: number): string {
  const dayIndex = new Date(timestamp).getDay();
  const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  return weekdays[dayIndex] ?? "monday";
}

function parsePauses(value: unknown): PausePeriod[] | null {
  if (!Array.isArray(value)) return null;

  const pauses: PausePeriod[] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    const startedAt = item.startedAt;
    const endedAt = item.endedAt;

    if (!isFiniteNumber(startedAt)) return null;
    if (!(endedAt === null || isFiniteNumber(endedAt))) return null;
    if (isFiniteNumber(endedAt) && endedAt < startedAt) return null;
    if (endedAt === null) return null;

    pauses.push({ startedAt, endedAt });
  }

  return pauses;
}

function parseSession(value: unknown): CompletedSession | null {
  if (!isRecord(value)) return null;

  const id = value.id;
  const title = value.title;
  const category = value.category;
  const energy = parseEnergy(value.energy);
  const startedAt = value.startedAt;
  const endedAt = value.endedAt;
  const effectiveDurationMs = value.effectiveDurationMs;
  const pauses = parsePauses(value.pauses);
  const pauseCount = value.pauseCount;
  const pausedDurationMs = value.pausedDurationMs;
  const weekday = value.weekday;

  if (typeof id !== "string" || id.trim().length === 0) return null;
  if (typeof title !== "string" || title.trim().length === 0) return null;
  if (typeof category !== "string") return null;
  if (!energy) return null;
  if (!isFiniteNumber(startedAt) || !isFiniteNumber(endedAt)) return null;
  if (endedAt < startedAt) return null;
  if (!isFiniteNumber(effectiveDurationMs) || effectiveDurationMs < 0) return null;
  if (!pauses) return null;
  if (!isFiniteNumber(pauseCount) || pauseCount < 0) return null;
  if (!isFiniteNumber(pausedDurationMs) || pausedDurationMs < 0) return null;

  const derivedWeekday = getWeekdayFromTimestamp(startedAt);
  const safeWeekday =
    typeof weekday === "string" && weekday.trim().length > 0 ? weekday : derivedWeekday;

  return {
    id,
    title,
    category,
    energy,
    startedAt,
    endedAt,
    effectiveDurationMs,
    pauses,
    pauseCount,
    pausedDurationMs,
    weekday: safeWeekday,
  };
}

export function createSessionBackup(sessions: CompletedSession[]): SessionBackupFile {
  return {
    app: SESSION_BACKUP_APP,
    kind: SESSION_BACKUP_KIND,
    version: SESSION_BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    sessions,
  };
}

export function parseSessionBackup(raw: string): CompletedSession[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("invalid_json");
  }

  if (!isRecord(parsed)) {
    throw new Error("invalid_backup_shape");
  }

  if (parsed.app !== SESSION_BACKUP_APP || parsed.kind !== SESSION_BACKUP_KIND) {
    throw new Error("invalid_backup_origin");
  }

  if (parsed.version !== SESSION_BACKUP_VERSION) {
    throw new Error("unsupported_backup_version");
  }

  if (typeof parsed.exportedAt !== "string") {
    throw new Error("invalid_backup_exported_at");
  }

  if (!Array.isArray(parsed.sessions)) {
    throw new Error("invalid_backup_sessions");
  }

  const sessions: CompletedSession[] = [];
  const ids = new Set<string>();

  for (const item of parsed.sessions) {
    const session = parseSession(item);
    if (!session) {
      throw new Error("invalid_backup_session_entry");
    }

    if (ids.has(session.id)) {
      throw new Error("duplicate_backup_session_ids");
    }

    ids.add(session.id);
    sessions.push(session);
  }

  return sessions;
}
