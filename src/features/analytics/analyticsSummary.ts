import type { CompletedSession, EnergyLevel } from "../sessions/sessionTypes";

const WEEKDAY_ORDER = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

type TimeSlot = "morning" | "afternoon" | "evening" | "night";

type ProductivityLevel = "low" | "medium" | "high";

type MonthlyProductivityDay = {
  dateKey: string;
  dayOfMonth: number;
  effectiveMs: number;
  isToday: boolean;
  productivityLevel: ProductivityLevel;
};

type MonthlyProductivityCalendar = {
  year: number;
  monthIndex: number;
  leadingBlankDays: number;
  days: MonthlyProductivityDay[];
};

export type AnalyticsSummary = {
  totalEffectiveMs: number;
  totalPausedMs: number;
  completedCount: number;
  averageSessionMs: number;
  effectiveByCategory: Array<{ category: string; effectiveMs: number }>;
  effectiveByWeekday: Array<{ weekday: string; effectiveMs: number }>;
  focusRatio: number;
  interruptionRatio: number;
  energyInterruptionStats: Array<{
    energy: EnergyLevel;
    averagePauseCount: number;
    averagePausedMs: number;
    sessionCount: number;
  }>;
  mostProductiveCategory: { category: string; effectiveMs: number } | null;
  bestTimeSlot: { slot: TimeSlot; effectiveMs: number } | null;
  effectiveByTimeSlot: Array<{ slot: TimeSlot; effectiveMs: number }>;
  recentDailyEffectiveHours: Array<{ label: string; dateKey: string; effectiveMs: number }>;
  currentMonthEffectiveMs: number;
  averageMonthlyEffectiveMs: number;
  currentWeekEffectiveMs: number;
  averageWeeklyEffectiveMs: number;
  averageDailyEffectiveMs: number;
  monthlyProductivityCalendar: MonthlyProductivityCalendar;
  latestSessions: CompletedSession[];
};

function toLocalDateKey(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatShortWeekday(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, { weekday: "short" });
}

function toLocalMonthKey(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function getMondayFirstWeekdayIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

function getMondayWeekStart(date: Date): Date {
  const weekStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  weekStart.setDate(weekStart.getDate() - getMondayFirstWeekdayIndex(weekStart));
  return weekStart;
}

function toLocalWeekKey(timestamp: number): string {
  const weekStart = getMondayWeekStart(new Date(timestamp));
  return toLocalDateKey(weekStart.getTime());
}

function getProductivityLevel(effectiveMs: number): ProductivityLevel {
  const hours = effectiveMs / (60 * 60 * 1000);
  if (hours < 4) return "low";
  if (hours <= 7) return "medium";
  return "high";
}

function buildMonthlyProductivityCalendar(
  sessions: CompletedSession[],
): MonthlyProductivityCalendar {
  const now = new Date();
  const year = now.getFullYear();
  const monthIndex = now.getMonth();
  const firstDayOfMonth = new Date(year, monthIndex, 1);
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const leadingBlankDays = getMondayFirstWeekdayIndex(firstDayOfMonth);
  const todayKey = toLocalDateKey(now.getTime());

  const totalsByDate = new Map<string, number>();
  for (const session of sessions) {
    const key = toLocalDateKey(session.startedAt);
    totalsByDate.set(key, (totalsByDate.get(key) ?? 0) + session.effectiveDurationMs);
  }

  const days: MonthlyProductivityDay[] = [];
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, monthIndex, day);
    const dateKey = toLocalDateKey(date.getTime());
    const effectiveMs = totalsByDate.get(dateKey) ?? 0;
    days.push({
      dateKey,
      dayOfMonth: day,
      effectiveMs,
      isToday: dateKey === todayKey,
      productivityLevel: getProductivityLevel(effectiveMs),
    });
  }

  return {
    year,
    monthIndex,
    leadingBlankDays,
    days,
  };
}

export function buildRecentDailyEffectiveHours(
  sessions: CompletedSession[],
  dayCount = 5,
): Array<{ label: string; dateKey: string; effectiveMs: number }> {
  const count = Math.max(1, dayCount);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const dayStarts: Date[] = [];
  for (let index = count - 1; index >= 0; index -= 1) {
    const day = new Date(today);
    day.setDate(today.getDate() - index);
    dayStarts.push(day);
  }

  const totalsByDay = new Map<string, number>();
  for (const day of dayStarts) {
    totalsByDay.set(toLocalDateKey(day.getTime()), 0);
  }

  for (const session of sessions) {
    // Attribute each session to the day it started to match Session History weekday expectations.
    const key = toLocalDateKey(session.startedAt);
    if (!totalsByDay.has(key)) continue;
    totalsByDay.set(key, (totalsByDay.get(key) ?? 0) + session.effectiveDurationMs);
  }

  return dayStarts.map((day) => {
    const timestamp = day.getTime();
    const dateKey = toLocalDateKey(timestamp);
    return {
      label: formatShortWeekday(timestamp),
      dateKey,
      effectiveMs: totalsByDay.get(dateKey) ?? 0,
    };
  });
}

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
  const recentDailyEffectiveHours = buildRecentDailyEffectiveHours(sessions);
  const monthTotals = new Map<string, number>();
  const weekTotals = new Map<string, number>();
  const dayTotals = new Map<string, number>();
  const currentMonthKey = toLocalMonthKey(Date.now());
  const currentWeekKey = toLocalWeekKey(Date.now());

  for (const session of sessions) {
    const monthKey = toLocalMonthKey(session.startedAt);
    monthTotals.set(monthKey, (monthTotals.get(monthKey) ?? 0) + session.effectiveDurationMs);

    const weekKey = toLocalWeekKey(session.startedAt);
    weekTotals.set(weekKey, (weekTotals.get(weekKey) ?? 0) + session.effectiveDurationMs);

    const dayKey = toLocalDateKey(session.startedAt);
    dayTotals.set(dayKey, (dayTotals.get(dayKey) ?? 0) + session.effectiveDurationMs);
  }

  const currentMonthEffectiveMs = monthTotals.get(currentMonthKey) ?? 0;
  const averageMonthlyEffectiveMs =
    monthTotals.size > 0
      ? Math.round(Array.from(monthTotals.values()).reduce((acc, value) => acc + value, 0) / monthTotals.size)
      : 0;
  const currentWeekEffectiveMs = weekTotals.get(currentWeekKey) ?? 0;
  const averageWeeklyEffectiveMs =
    weekTotals.size > 0
      ? Math.round(Array.from(weekTotals.values()).reduce((acc, value) => acc + value, 0) / weekTotals.size)
      : 0;
  const averageDailyEffectiveMs =
    dayTotals.size > 0
      ? Math.round(Array.from(dayTotals.values()).reduce((acc, value) => acc + value, 0) / dayTotals.size)
      : 0;
  const monthlyProductivityCalendar = buildMonthlyProductivityCalendar(sessions);

  return {
    totalEffectiveMs,
    totalPausedMs,
    completedCount,
    averageSessionMs,
    effectiveByCategory,
    effectiveByWeekday,
    focusRatio,
    interruptionRatio,
    energyInterruptionStats,
    mostProductiveCategory,
    bestTimeSlot,
    effectiveByTimeSlot,
    recentDailyEffectiveHours,
    currentMonthEffectiveMs,
    averageMonthlyEffectiveMs,
    currentWeekEffectiveMs,
    averageWeeklyEffectiveMs,
    averageDailyEffectiveMs,
    monthlyProductivityCalendar,
    latestSessions,
  };
}
