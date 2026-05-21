const DEBUG_LOG_STORAGE_KEY = "chronolytic.debugLogs";
const DEBUG_LOG_LIMIT = 50;

export type DebugLogEntry = {
  id: string;
  timestamp: string;
  source: string;
  message: string;
  stack?: string;
  details?: Record<string, unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toSafeString(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Error) return value.message;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function sanitizeDetails(details?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!details) return undefined;
  const entries = Object.entries(details).filter(([, value]) => value !== undefined);
  if (entries.length === 0) return undefined;
  return Object.fromEntries(entries);
}

function parseStoredEntries(raw: string | null): DebugLogEntry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is DebugLogEntry => {
      if (!isRecord(item)) return false;
      return (
        typeof item.id === "string" &&
        typeof item.timestamp === "string" &&
        typeof item.source === "string" &&
        typeof item.message === "string"
      );
    });
  } catch {
    return [];
  }
}

function saveEntries(entries: DebugLogEntry[]) {
  window.localStorage.setItem(
    DEBUG_LOG_STORAGE_KEY,
    JSON.stringify(entries.slice(0, DEBUG_LOG_LIMIT)),
  );
}

function parseUnknownError(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) {
    return {
      message: error.message || error.name || "Unknown error",
      stack: error.stack,
    };
  }

  return {
    message: toSafeString(error) || "Unknown error",
  };
}

export function getDebugLogEntries(): DebugLogEntry[] {
  const raw = window.localStorage.getItem(DEBUG_LOG_STORAGE_KEY);
  return parseStoredEntries(raw);
}

export function clearDebugLogEntries(): void {
  window.localStorage.removeItem(DEBUG_LOG_STORAGE_KEY);
}

export function recordCriticalError(
  source: string,
  error: unknown,
  details?: Record<string, unknown>,
): DebugLogEntry {
  const { message, stack } = parseUnknownError(error);
  const entry: DebugLogEntry = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    source,
    message,
    stack,
    details: sanitizeDetails(details),
  };

  const next = [entry, ...getDebugLogEntries()].slice(0, DEBUG_LOG_LIMIT);
  saveEntries(next);
  return entry;
}

export function buildDebugReport(
  entries: DebugLogEntry[],
  metadata?: {
    appVersion?: string;
    platform?: string;
    userAgent?: string;
  },
): string {
  const lines: string[] = [];
  lines.push("Chronolytic Debug Report");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`App version: ${metadata?.appVersion ?? "unknown"}`);
  lines.push(`Platform: ${metadata?.platform ?? "unknown"}`);
  lines.push(`User agent: ${metadata?.userAgent ?? "unknown"}`);
  lines.push(`Entries: ${entries.length}`);
  lines.push("");

  for (const [index, entry] of entries.entries()) {
    lines.push(`#${index + 1}`);
    lines.push(`Timestamp: ${entry.timestamp}`);
    lines.push(`Source: ${entry.source}`);
    lines.push(`Message: ${entry.message}`);
    if (entry.stack) {
      lines.push("Stack:");
      lines.push(entry.stack);
    }
    if (entry.details) {
      lines.push("Details:");
      lines.push(JSON.stringify(entry.details, null, 2));
    }
    lines.push("");
  }

  return lines.join("\n");
}
