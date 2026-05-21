import type { CompletedSession } from "../../features/sessions/sessionTypes";
import type { Language, SessionHistorySortKey, SortDirection } from "../../app/appTypes";
import { getEnergySortValue } from "./energyUtils";

export function formatSessionDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function getBackupDefaultFileName(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `chronolytic-session-history-${y}-${m}-${d}.json`;
}

export function getGreetingKey(date: Date): string {
  const hour = date.getHours();
  if (hour >= 6 && hour < 13) return "home.goodMorning";
  if (hour >= 13 && hour < 21) return "home.goodAfternoon";
  return "home.goodEvening";
}

export function getDateLocale(language: Language): string {
  return language === "es" ? "es-ES" : "en-US";
}

export function getWeekdayFromTimestamp(timestamp: number): string {
  const dayIndex = new Date(timestamp).getDay();
  const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  return weekdays[dayIndex] ?? "monday";
}

export function normalizeTimestamp(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric;
    }

    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return 0;
}

export function compareSessionHistoryRows(
  a: CompletedSession,
  b: CompletedSession,
  sort: { key: SessionHistorySortKey; direction: SortDirection },
): number {
  const endedAtA = normalizeTimestamp(a.endedAt);
  const endedAtB = normalizeTimestamp(b.endedAt);
  const startedAtA = normalizeTimestamp(a.startedAt);
  const startedAtB = normalizeTimestamp(b.startedAt);

  if (sort.key === "endedAt") {
    const comparison = sort.direction === "desc" ? endedAtB - endedAtA : endedAtA - endedAtB;
    if (comparison !== 0) {
      return comparison;
    }

    const startedTieBreaker = startedAtB - startedAtA;
    if (startedTieBreaker !== 0) {
      return startedTieBreaker;
    }

    return b.id.localeCompare(a.id);
  }

  const factor = sort.direction === "asc" ? 1 : -1;
  let comparison = 0;

  switch (sort.key) {
    case "startedAt":
      comparison = startedAtA - startedAtB;
      break;
    case "effectiveDurationMs":
      comparison = a.effectiveDurationMs - b.effectiveDurationMs;
      break;
    case "pauseCount":
      comparison = a.pauseCount - b.pauseCount;
      break;
    case "energy":
      comparison = getEnergySortValue(a.energy) - getEnergySortValue(b.energy);
      break;
    default:
      comparison = endedAtA - endedAtB;
      break;
  }

  if (comparison !== 0) {
    return comparison * factor;
  }

  const endedTieBreaker = endedAtB - endedAtA;
  if (endedTieBreaker !== 0) {
    return endedTieBreaker;
  }

  const startedTieBreaker = startedAtB - startedAtA;
  if (startedTieBreaker !== 0) {
    return startedTieBreaker;
  }

  return b.id.localeCompare(a.id);
}
