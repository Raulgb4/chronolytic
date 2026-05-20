import Database from "@tauri-apps/plugin-sql";
import type { CompletedSession, PausePeriod } from "./sessionTypes";

type SessionRow = {
  id: string;
  title: string;
  category: string | null;
  tags: string | null;
  pauses: string | null;
  started_at: number;
  ended_at: number;
  effective_duration_ms: number;
  weekday: string | null;
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
          weekday
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
      weekday: null,
    }));
  }

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    category: row.category ?? "",
    tags: parseJsonArray<string>(row.tags),
    pauses: parseJsonArray<PausePeriod>(row.pauses),
    startedAt: row.started_at,
    endedAt: row.ended_at,
    effectiveDurationMs: row.effective_duration_ms,
    weekday: row.weekday ?? getWeekdayFromTimestamp(row.started_at),
  }));
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
        weekday,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
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
      session.weekday,
      Date.now(),
    ],
  );
}

export async function deleteCompletedSession(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM sessions WHERE id = $1", [id]);
}
