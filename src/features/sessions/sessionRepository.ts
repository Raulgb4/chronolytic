import Database from "@tauri-apps/plugin-sql";
import type { CompletedSession, EnergyLevel, PausePeriod } from "./sessionTypes";

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

function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = Database.load("sqlite:chronolytic.db")
      .then(async (db) => {
        await ensureSessionsSchema(db);
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
