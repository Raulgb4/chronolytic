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

type TimeSlot = "morning" | "afternoon" | "evening" | "night";

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
  focusRatio: number;
  interruptionRatio: number;
  mostInterruptedSession: CompletedSession | null;
  energyInterruptionStats: Array<{
    energy: EnergyLevel;
    averagePauseCount: number;
    averagePausedMs: number;
    sessionCount: number;
  }>;
  mostProductiveCategory: { category: string; effectiveMs: number } | null;
  bestTimeSlot: { slot: TimeSlot; effectiveMs: number } | null;
  effectiveByTimeSlot: Array<{ slot: TimeSlot; effectiveMs: number }>;
  latestSessions: CompletedSession[];
};

function getTimeSlot(hour: number): TimeSlot {
  if (hour >= 6 && hour <= 11) return "morning";
  if (hour >= 12 && hour <= 17) return "afternoon";
  if (hour >= 18 && hour <= 23) return "evening";
  return "night";
}

export function buildAnalyticsSummary(
  sessions: CompletedSession[],
  uncategorizedLabel: string,
): AnalyticsSummary {
  const totalEffectiveMs = sessions.reduce((acc, session) => acc + session.effectiveDurationMs, 0);
  const totalPausedMs = sessions.reduce((acc, session) => acc + session.pausedDurationMs, 0);
  const totalPauseCount = sessions.reduce((acc, session) => acc + session.pauseCount, 0);
  const completedCount = sessions.length;
  const averageSessionMs = completedCount > 0 ? Math.round(totalEffectiveMs / completedCount) : 0;
  const totalTimeMs = totalEffectiveMs + totalPausedMs;
  const focusRatio = totalTimeMs > 0 ? totalEffectiveMs / totalTimeMs : 0;
  const interruptionRatio = totalTimeMs > 0 ? totalPausedMs / totalTimeMs : 0;

  const categoryMap = new Map<string, number>();
  const weekdayMap = new Map<string, number>(WEEKDAY_ORDER.map((day) => [day, 0]));
  const energyMap = new Map<EnergyLevel, number>([
    ["bad", 0],
    ["regular", 0],
    ["good", 0],
  ]);
  const energyPauseCountMap = new Map<EnergyLevel, number>([
    ["bad", 0],
    ["regular", 0],
    ["good", 0],
  ]);
  const energyPausedMsMap = new Map<EnergyLevel, number>([
    ["bad", 0],
    ["regular", 0],
    ["good", 0],
  ]);
  const timeSlotMap = new Map<TimeSlot, number>([
    ["morning", 0],
    ["afternoon", 0],
    ["evening", 0],
    ["night", 0],
  ]);

  for (const session of sessions) {
    const category = session.category || uncategorizedLabel;
    categoryMap.set(category, (categoryMap.get(category) ?? 0) + session.effectiveDurationMs);

    const weekday = weekdayMap.has(session.weekday) ? session.weekday : "monday";
    weekdayMap.set(weekday, (weekdayMap.get(weekday) ?? 0) + session.effectiveDurationMs);

    energyMap.set(session.energy, (energyMap.get(session.energy) ?? 0) + 1);
    energyPauseCountMap.set(
      session.energy,
      (energyPauseCountMap.get(session.energy) ?? 0) + session.pauseCount,
    );
    energyPausedMsMap.set(
      session.energy,
      (energyPausedMsMap.get(session.energy) ?? 0) + session.pausedDurationMs,
    );

    const sessionHour = new Date(session.startedAt).getHours();
    const sessionSlot = getTimeSlot(sessionHour);
    timeSlotMap.set(sessionSlot, (timeSlotMap.get(sessionSlot) ?? 0) + session.effectiveDurationMs);
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

  const mostInterruptedSession =
    sessions.length > 0
      ? [...sessions].sort((a, b) => {
          if (b.pauseCount !== a.pauseCount) {
            return b.pauseCount - a.pauseCount;
          }
          return b.pausedDurationMs - a.pausedDurationMs;
        })[0]
      : null;

  const energyInterruptionStats: Array<{
    energy: EnergyLevel;
    averagePauseCount: number;
    averagePausedMs: number;
    sessionCount: number;
  }> = ["bad", "regular", "good"].map((energy) => {
    const typedEnergy = energy as EnergyLevel;
    const sessionCount = energyMap.get(typedEnergy) ?? 0;
    const totalPauseByEnergy = energyPauseCountMap.get(typedEnergy) ?? 0;
    const totalPausedByEnergy = energyPausedMsMap.get(typedEnergy) ?? 0;

    return {
      energy: typedEnergy,
      averagePauseCount: sessionCount > 0 ? totalPauseByEnergy / sessionCount : 0,
      averagePausedMs: sessionCount > 0 ? totalPausedByEnergy / sessionCount : 0,
      sessionCount,
    };
  });

  const mostProductiveCategory = effectiveByCategory[0] ?? null;

  const effectiveByTimeSlot: Array<{ slot: TimeSlot; effectiveMs: number }> = [
    "morning",
    "afternoon",
    "evening",
    "night",
  ].map((slot) => ({
    slot: slot as TimeSlot,
    effectiveMs: timeSlotMap.get(slot as TimeSlot) ?? 0,
  }));

  const bestTimeSlot =
    effectiveByTimeSlot.length > 0
      ? [...effectiveByTimeSlot].sort((a, b) => b.effectiveMs - a.effectiveMs)[0]
      : null;

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
    focusRatio,
    interruptionRatio,
    mostInterruptedSession,
    energyInterruptionStats,
    mostProductiveCategory,
    bestTimeSlot,
    effectiveByTimeSlot,
    latestSessions,
  };
}
