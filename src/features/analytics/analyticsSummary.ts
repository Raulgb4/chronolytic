import type { CompletedSession, EnergyLevel } from "../sessions/sessionTypes";

const WEEKDAY_ORDER = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

export type AnalyticsSummary = {
  totalEffectiveMs: number;
  totalPausedMs: number;
  completedCount: number;
  totalPauseCount: number;
  averageSessionMs: number;
  effectiveByCategory: Array<{ category: string; effectiveMs: number }>;
  effectiveByWeekday: Array<{ weekday: string; effectiveMs: number }>;
  effectiveVsPaused: Array<{ key: "effective" | "paused"; valueMs: number }>;
  sessionsByEnergy: Array<{ energy: EnergyLevel; count: number }>;
  latestSessions: CompletedSession[];
};

export function buildAnalyticsSummary(
  sessions: CompletedSession[],
  uncategorizedLabel: string,
): AnalyticsSummary {
  const totalEffectiveMs = sessions.reduce((acc, session) => acc + session.effectiveDurationMs, 0);
  const totalPausedMs = sessions.reduce((acc, session) => acc + session.pausedDurationMs, 0);
  const totalPauseCount = sessions.reduce((acc, session) => acc + session.pauseCount, 0);
  const completedCount = sessions.length;
  const averageSessionMs = completedCount > 0 ? Math.round(totalEffectiveMs / completedCount) : 0;

  const categoryMap = new Map<string, number>();
  const weekdayMap = new Map<string, number>(WEEKDAY_ORDER.map((day) => [day, 0]));
  const energyMap = new Map<EnergyLevel, number>([
    ["bad", 0],
    ["regular", 0],
    ["good", 0],
  ]);

  for (const session of sessions) {
    const category = session.category || uncategorizedLabel;
    categoryMap.set(category, (categoryMap.get(category) ?? 0) + session.effectiveDurationMs);

    const weekday = weekdayMap.has(session.weekday) ? session.weekday : "monday";
    weekdayMap.set(weekday, (weekdayMap.get(weekday) ?? 0) + session.effectiveDurationMs);

    energyMap.set(session.energy, (energyMap.get(session.energy) ?? 0) + 1);
  }

  const effectiveByCategory = Array.from(categoryMap.entries())
    .map(([category, effectiveMs]) => ({ category, effectiveMs }))
    .sort((a, b) => b.effectiveMs - a.effectiveMs)
    .slice(0, 6);

  const effectiveByWeekday = WEEKDAY_ORDER.map((weekday) => ({
    weekday,
    effectiveMs: weekdayMap.get(weekday) ?? 0,
  }));

  const effectiveVsPaused: Array<{ key: "effective" | "paused"; valueMs: number }> = [
    { key: "effective", valueMs: totalEffectiveMs },
    { key: "paused", valueMs: totalPausedMs },
  ];

  const sessionsByEnergy: Array<{ energy: EnergyLevel; count: number }> = [
    "bad",
    "regular",
    "good",
  ].map((energy) => ({ energy, count: energyMap.get(energy as EnergyLevel) ?? 0 })) as Array<{
    energy: EnergyLevel;
    count: number;
  }>;

  const latestSessions = sessions.slice(0, 5);

  return {
    totalEffectiveMs,
    totalPausedMs,
    completedCount,
    totalPauseCount,
    averageSessionMs,
    effectiveByCategory,
    effectiveByWeekday,
    effectiveVsPaused,
    sessionsByEnergy,
    latestSessions,
  };
}
