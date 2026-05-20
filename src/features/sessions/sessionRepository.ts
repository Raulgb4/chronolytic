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
};

let dbPromise: Promise<Database> | null = null;

function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = Database.load("sqlite:chronolytic.db");
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

export async function getCompletedSessions(): Promise<CompletedSession[]> {
  const db = await getDb();
  const rows = await db.select<SessionRow[]>(
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

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    category: row.category ?? "",
    tags: parseJsonArray<string>(row.tags),
    pauses: parseJsonArray<PausePeriod>(row.pauses),
    startedAt: row.started_at,
    endedAt: row.ended_at,
    effectiveDurationMs: row.effective_duration_ms,
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
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
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
      Date.now(),
    ],
  );
}

export async function deleteCompletedSession(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM sessions WHERE id = $1", [id]);
}
