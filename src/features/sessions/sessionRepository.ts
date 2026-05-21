import Database from "@tauri-apps/plugin-sql";
import type { ActiveSession, CompletedSession, EnergyLevel, PausePeriod } from "./sessionTypes";

type SessionRow = {
  id: string;
  title: string;
  category: string | null;
  tags: string | null;
  pauses: string | null;
  started_at: number;
  ended_at: number;
  effective_duration_ms: number;
  pause_count: number | null;
  paused_duration_ms: number | null;
  weekday: string | null;
  energy: string | null;
};

type LegacySessionRow = {
  id: string;
  title: string;
  category: string | null;
  tags: string | null;
  pauses: string | null;
  started_at: number;
  ended_at: number;
  effective_duration_ms: number;
};

type TableInfoRow = {
  name: string;
};

type ActiveSessionRow = {
  id: string;
  title: string;
  category: string | null;
  tags: string | null;
  pauses: string | null;
  started_at: number;
  status: string;
  energy: string | null;
  last_seen_at: number | null;
  updated_at: number | null;
};

type PersistedActiveSession = {
  session: ActiveSession;
  lastSeenAt: number;
};

let dbPromise: Promise<Database> | null = null;

async function ensureSessionsSchema(db: Database): Promise<void> {
  await db.execute(
    `
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        category TEXT,
        tags TEXT,
        pauses TEXT,
        started_at INTEGER NOT NULL,
        ended_at INTEGER NOT NULL,
        effective_duration_ms INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      )
    `,
  );

  const columns = await db.select<TableInfoRow[]>("PRAGMA table_info(sessions)");
  const existingColumns = new Set(columns.map((column) => column.name));

  if (!existingColumns.has("weekday")) {
    await db.execute("ALTER TABLE sessions ADD COLUMN weekday TEXT");
  }

  if (!existingColumns.has("pause_count")) {
    await db.execute("ALTER TABLE sessions ADD COLUMN pause_count INTEGER");
  }

  if (!existingColumns.has("paused_duration_ms")) {
    await db.execute("ALTER TABLE sessions ADD COLUMN paused_duration_ms INTEGER");
  }

  if (!existingColumns.has("energy")) {
    await db.execute("ALTER TABLE sessions ADD COLUMN energy TEXT");
  }
}

async function ensureActiveSessionSchema(db: Database): Promise<void> {
  await db.execute(
    `
      CREATE TABLE IF NOT EXISTS active_session (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        category TEXT,
        tags TEXT,
        pauses TEXT,
        started_at INTEGER NOT NULL,
        status TEXT NOT NULL,
        energy TEXT,
        last_seen_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `,
  );

  const columns = await db.select<TableInfoRow[]>("PRAGMA table_info(active_session)");
  const existingColumns = new Set(columns.map((column) => column.name));

  if (!existingColumns.has("energy")) {
    await db.execute("ALTER TABLE active_session ADD COLUMN energy TEXT");
  }

  if (!existingColumns.has("last_seen_at")) {
    await db.execute("ALTER TABLE active_session ADD COLUMN last_seen_at INTEGER");
    await db.execute(
      "UPDATE active_session SET last_seen_at = started_at WHERE last_seen_at IS NULL",
    );
  }

  if (!existingColumns.has("updated_at")) {
    await db.execute("ALTER TABLE active_session ADD COLUMN updated_at INTEGER");
    await db.execute("UPDATE active_session SET updated_at = started_at WHERE updated_at IS NULL");
  }
}

function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = Database.load("sqlite:chronolytic.db")
      .then(async (db) => {
        await ensureSessionsSchema(db);
        await ensureActiveSessionSchema(db);
        return db;
      })
      .catch((error) => {
        dbPromise = null;
        throw error;
      });
  }
  return dbPromise;
}

function parseJsonArray<T>(value: string | null): T[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function getWeekdayFromTimestamp(timestamp: number): string {
  const dayIndex = new Date(timestamp).getDay();
  const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  return weekdays[dayIndex] ?? "monday";
}

function parseEnergy(value: string | null): EnergyLevel {
  if (value === "bad" || value === "regular" || value === "good") {
    return value;
  }

  if (value === "low") return "bad";
  if (value === "medium") return "regular";
  if (value === "high") return "good";

  return "regular";
}

function getPausedDurationFromStoredPauses(pauses: PausePeriod[]): number {
  return pauses.reduce((acc, pause) => {
    if (
      typeof pause.startedAt !== "number" ||
      typeof pause.endedAt !== "number" ||
      !Number.isFinite(pause.startedAt) ||
      !Number.isFinite(pause.endedAt)
    ) {
      return acc;
    }

    if (pause.endedAt < pause.startedAt) {
      return acc;
    }

    return acc + (pause.endedAt - pause.startedAt);
  }, 0);
}

function getSafeLastSeenAt(value: number | null | undefined, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return fallback;
}

function normalizePauses(pauses: PausePeriod[]): PausePeriod[] {
  const normalized = pauses
    .filter(
      (pause) =>
        typeof pause.startedAt === "number" &&
        Number.isFinite(pause.startedAt) &&
        (pause.endedAt === null ||
          (typeof pause.endedAt === "number" && Number.isFinite(pause.endedAt))),
    )
    .map((pause) => ({ startedAt: pause.startedAt, endedAt: pause.endedAt }));

  let openPauseSeen = false;
  for (let index = normalized.length - 1; index >= 0; index -= 1) {
    if (normalized[index].endedAt === null) {
      if (openPauseSeen) {
        normalized[index] = { ...normalized[index], endedAt: normalized[index].startedAt };
      } else {
        openPauseSeen = true;
      }
    }
  }

  return normalized;
}

export async function getCompletedSessions(): Promise<CompletedSession[]> {
  const db = await getDb();
  let rows: SessionRow[] = [];

  try {
    rows = await db.select<SessionRow[]>(
      `
        SELECT
          id,
          title,
          category,
          tags,
          pauses,
          started_at,
          ended_at,
          effective_duration_ms,
          pause_count,
          paused_duration_ms,
          weekday,
          energy
        FROM sessions
        ORDER BY ended_at DESC
      `,
    );
  } catch (error) {
    console.warn(
      "Failed to load sessions with weekday column; falling back to legacy query",
      error,
    );

    const legacyRows = await db.select<LegacySessionRow[]>(
      `
        SELECT
          id,
          title,
          category,
          tags,
          pauses,
          started_at,
          ended_at,
          effective_duration_ms
        FROM sessions
        ORDER BY ended_at DESC
      `,
    );

    rows = legacyRows.map((row) => ({
      ...row,
      pause_count: null,
      paused_duration_ms: null,
      weekday: null,
      energy: null,
    }));
  }

  return rows.map((row) => {
    const pauses = parseJsonArray<PausePeriod>(row.pauses);

    return {
      id: row.id,
      title: row.title,
      category: row.category ?? "",
      tags: parseJsonArray<string>(row.tags),
      pauses,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      effectiveDurationMs: row.effective_duration_ms,
      pauseCount: row.pause_count ?? pauses.length,
      pausedDurationMs: row.paused_duration_ms ?? getPausedDurationFromStoredPauses(pauses),
      weekday: row.weekday ?? getWeekdayFromTimestamp(row.started_at),
      energy: parseEnergy(row.energy),
    };
  });
}

export async function exportCompletedSessions(): Promise<CompletedSession[]> {
  return getCompletedSessions();
}

export async function saveCompletedSession(session: CompletedSession): Promise<void> {
  const db = await getDb();
  await db.execute(
    `
      INSERT INTO sessions (
        id,
        title,
        category,
        tags,
        pauses,
        started_at,
        ended_at,
        effective_duration_ms,
        pause_count,
        paused_duration_ms,
        weekday,
        energy,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    `,
    [
      session.id,
      session.title,
      session.category || null,
      JSON.stringify(session.tags),
      JSON.stringify(session.pauses),
      session.startedAt,
      session.endedAt,
      session.effectiveDurationMs,
      session.pauseCount,
      session.pausedDurationMs,
      session.weekday,
      session.energy,
      Date.now(),
    ],
  );
}

export async function deleteCompletedSession(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM sessions WHERE id = $1", [id]);
}

export async function deleteAllCompletedSessions(): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM sessions");
}

export async function updateCompletedSession(session: CompletedSession): Promise<void> {
  const db = await getDb();
  await db.execute(
    `
      UPDATE sessions
      SET
        title = $1,
        category = $2,
        tags = $3,
        pauses = $4,
        started_at = $5,
        ended_at = $6,
        effective_duration_ms = $7,
        pause_count = $8,
        paused_duration_ms = $9,
        weekday = $10,
        energy = $11
      WHERE id = $12
    `,
    [
      session.title,
      session.category || null,
      JSON.stringify(session.tags),
      JSON.stringify(session.pauses),
      session.startedAt,
      session.endedAt,
      session.effectiveDurationMs,
      session.pauseCount,
      session.pausedDurationMs,
      session.weekday,
      session.energy,
      session.id,
    ],
  );
}

export type ImportCompletedSessionsResult = {
  importedCount: number;
  skippedDuplicateCount: number;
};

export async function importCompletedSessions(
  sessions: CompletedSession[],
): Promise<ImportCompletedSessionsResult> {
  if (sessions.length === 0) {
    return { importedCount: 0, skippedDuplicateCount: 0 };
  }

  const db = await getDb();
  const existingRows = await db.select<Array<{ id: string }>>("SELECT id FROM sessions");
  const existingIds = new Set(existingRows.map((row) => row.id));

  let importedCount = 0;
  let skippedDuplicateCount = 0;

  for (const session of sessions) {
    if (existingIds.has(session.id)) {
      skippedDuplicateCount += 1;
      continue;
    }

    await db.execute(
      `
        INSERT INTO sessions (
          id,
          title,
          category,
          tags,
          pauses,
          started_at,
          ended_at,
          effective_duration_ms,
          pause_count,
          paused_duration_ms,
          weekday,
          energy,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      `,
      [
        session.id,
        session.title,
        session.category || null,
        JSON.stringify(session.tags),
        JSON.stringify(session.pauses),
        session.startedAt,
        session.endedAt,
        session.effectiveDurationMs,
        session.pauseCount,
        session.pausedDurationMs,
        session.weekday,
        session.energy,
        Date.now(),
      ],
    );

    existingIds.add(session.id);
    importedCount += 1;
  }

  return {
    importedCount,
    skippedDuplicateCount,
  };
}

export async function saveActiveSession(
  session: ActiveSession,
  lastSeenAt?: number,
): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  const safeLastSeenAt =
    typeof lastSeenAt === "number" && Number.isFinite(lastSeenAt) ? lastSeenAt : now;

  await db.execute("DELETE FROM active_session WHERE id <> $1", [session.id]);

  await db.execute(
    `
      INSERT INTO active_session (
        id,
        title,
        category,
        tags,
        pauses,
        started_at,
        status,
        energy,
        last_seen_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        category = excluded.category,
        tags = excluded.tags,
        pauses = excluded.pauses,
        started_at = excluded.started_at,
        status = excluded.status,
        energy = excluded.energy,
        last_seen_at = excluded.last_seen_at,
        updated_at = excluded.updated_at
    `,
    [
      session.id,
      session.title,
      session.category || null,
      JSON.stringify(session.tags),
      JSON.stringify(session.pauses),
      session.startedAt,
      session.status,
      session.energy,
      safeLastSeenAt,
      now,
    ],
  );
}

export async function touchActiveSession(id: string, lastSeenAt: number): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE active_session SET last_seen_at = $1, updated_at = $2 WHERE id = $3", [
    lastSeenAt,
    Date.now(),
    id,
  ]);
}

export async function deleteActiveSession(id?: string): Promise<void> {
  const db = await getDb();
  if (id) {
    await db.execute("DELETE FROM active_session WHERE id = $1", [id]);
    return;
  }

  await db.execute("DELETE FROM active_session");
}

async function getPersistedActiveSession(): Promise<PersistedActiveSession | null> {
  const db = await getDb();
  const rows = await db.select<ActiveSessionRow[]>(
    `
      SELECT
        id,
        title,
        category,
        tags,
        pauses,
        started_at,
        status,
        energy,
        last_seen_at,
        updated_at
      FROM active_session
      ORDER BY updated_at DESC
      LIMIT 1
    `,
  );

  const row = rows[0];
  if (!row) return null;

  const startedAt = Number.isFinite(row.started_at) ? row.started_at : Date.now();
  const pauses = normalizePauses(parseJsonArray<PausePeriod>(row.pauses));
  const status = row.status === "paused" ? "paused" : "running";
  const fallbackLastSeen = Number.isFinite(row.updated_at)
    ? (row.updated_at ?? startedAt)
    : startedAt;
  const lastSeenAt = getSafeLastSeenAt(row.last_seen_at, fallbackLastSeen);

  return {
    session: {
      id: row.id,
      title: row.title,
      category: row.category ?? "",
      tags: parseJsonArray<string>(row.tags),
      pauses,
      startedAt,
      status,
      energy: parseEnergy(row.energy),
    },
    lastSeenAt,
  };
}

export async function getRecoverableActiveSession(): Promise<ActiveSession | null> {
  const persisted = await getPersistedActiveSession();
  if (!persisted) return null;

  const { session, lastSeenAt } = persisted;
  const now = Date.now();
  const clampedLastSeenAt = Math.min(now, Math.max(session.startedAt, lastSeenAt));

  if (session.status === "paused") {
    const pauses = [...session.pauses];
    const hasOpenPause = pauses.some((pause) => pause.endedAt === null);
    if (!hasOpenPause) {
      pauses.push({ startedAt: clampedLastSeenAt, endedAt: null });
    }

    return {
      ...session,
      status: "paused",
      pauses,
    };
  }

  return {
    ...session,
    status: "paused",
    pauses: [...session.pauses, { startedAt: clampedLastSeenAt, endedAt: null }],
  };
}
