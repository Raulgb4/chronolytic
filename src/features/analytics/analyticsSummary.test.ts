import { afterEach, describe, expect, it, vi } from "vitest";
import type { CompletedSession } from "../sessions/sessionTypes";
import { buildAnalyticsSummary } from "./analyticsSummary";

const hour = 60 * 60 * 1000;

function at(year: number, monthIndex: number, day: number, hours = 0, minutes = 0): number {
  return new Date(year, monthIndex, day, hours, minutes, 0, 0).getTime();
}

function weekdayFromTimestamp(timestamp: number): string {
  const labels = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  return labels[new Date(timestamp).getDay()] ?? "monday";
}

function session(input: {
  id: string;
  startedAt: number;
  effectiveHours: number;
  pausedHours?: number;
  category?: string;
  energy?: "bad" | "regular" | "good";
  weekday?: string;
}): CompletedSession {
  const pausedMs = Math.round((input.pausedHours ?? 0) * hour);
  const effectiveMs = Math.round(input.effectiveHours * hour);
  const startedAt = input.startedAt;
  return {
    id: input.id,
    title: `Session ${input.id}`,
    category: input.category ?? "",
    energy: input.energy ?? "good",
    startedAt,
    endedAt: startedAt + effectiveMs + pausedMs,
    effectiveDurationMs: effectiveMs,
    pauses:
      pausedMs > 0 ? [{ startedAt: startedAt + hour, endedAt: startedAt + hour + pausedMs }] : [],
    pauseCount: pausedMs > 0 ? 1 : 0,
    pausedDurationMs: pausedMs,
    weekday: input.weekday ?? weekdayFromTimestamp(startedAt),
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("buildAnalyticsSummary", () => {
  it("returns empty-safe defaults", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 15, 12, 0, 0));

    const summary = buildAnalyticsSummary([], "Uncategorized");

    expect(summary.totalEffectiveMs).toBe(0);
    expect(summary.totalPausedMs).toBe(0);
    expect(summary.completedCount).toBe(0);
    expect(summary.averageSessionMs).toBe(0);
    expect(summary.focusRatio).toBe(0);
    expect(summary.interruptionRatio).toBe(0);
    expect(summary.mostProductiveCategory).toBeNull();
    expect(summary.currentMonthEffectiveMs).toBe(0);
    expect(summary.currentWeekEffectiveMs).toBe(0);
    expect(summary.averageMonthlyEffectiveMs).toBe(0);
    expect(summary.averageWeeklyEffectiveMs).toBe(0);
    expect(summary.averageDailyEffectiveMs).toBe(0);
    expect(summary.monthlyProductivityCalendar.days.length).toBe(31);
  });

  it("calculates totals, averages, ratios, categories, weekdays, and time slots", () => {
    const sessions = [
      session({
        id: "a",
        startedAt: at(2026, 4, 11, 9),
        effectiveHours: 2,
        pausedHours: 1,
        category: "Work",
        energy: "good",
        weekday: "monday",
      }),
      session({
        id: "b",
        startedAt: at(2026, 4, 12, 14),
        effectiveHours: 1,
        pausedHours: 1,
        category: "Study",
        energy: "regular",
        weekday: "tuesday",
      }),
      session({
        id: "c",
        startedAt: at(2026, 4, 13, 20),
        effectiveHours: 3,
        pausedHours: 0,
        category: "Work",
        energy: "bad",
        weekday: "wednesday",
      }),
    ];

    const summary = buildAnalyticsSummary(sessions, "Uncategorized");

    expect(summary.totalEffectiveMs).toBe(6 * hour);
    expect(summary.totalPausedMs).toBe(2 * hour);
    expect(summary.completedCount).toBe(3);
    expect(summary.averageSessionMs).toBe(2 * hour);
    expect(summary.focusRatio).toBeCloseTo(0.75);
    expect(summary.interruptionRatio).toBeCloseTo(0.25);

    expect(summary.effectiveByCategory).toEqual([
      { category: "Work", effectiveMs: 5 * hour },
      { category: "Study", effectiveMs: 1 * hour },
    ]);
    expect(summary.mostProductiveCategory).toEqual({ category: "Work", effectiveMs: 5 * hour });

    const monday = summary.effectiveByWeekday.find((item) => item.weekday === "monday");
    const tuesday = summary.effectiveByWeekday.find((item) => item.weekday === "tuesday");
    const wednesday = summary.effectiveByWeekday.find((item) => item.weekday === "wednesday");
    expect(monday?.effectiveMs).toBe(2 * hour);
    expect(tuesday?.effectiveMs).toBe(1 * hour);
    expect(wednesday?.effectiveMs).toBe(3 * hour);

    const morning = summary.effectiveByTimeSlot.find((item) => item.slot === "morning");
    const afternoon = summary.effectiveByTimeSlot.find((item) => item.slot === "afternoon");
    const evening = summary.effectiveByTimeSlot.find((item) => item.slot === "evening");
    expect(morning?.effectiveMs).toBe(2 * hour);
    expect(afternoon?.effectiveMs).toBe(1 * hour);
    expect(evening?.effectiveMs).toBe(3 * hour);
  });

  it("calculates current month and week using Monday-start weeks", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 13, 12, 0, 0));

    const sessions = [
      session({ id: "monday", startedAt: at(2026, 4, 11, 10), effectiveHours: 2 }),
      session({ id: "wednesday", startedAt: at(2026, 4, 13, 11), effectiveHours: 3 }),
      session({ id: "sunday-prev", startedAt: at(2026, 4, 10, 9), effectiveHours: 4 }),
      session({ id: "prev-month", startedAt: at(2026, 3, 30, 9), effectiveHours: 5 }),
    ];

    const summary = buildAnalyticsSummary(sessions, "Uncategorized");

    expect(summary.currentMonthEffectiveMs).toBe(9 * hour);
    expect(summary.currentWeekEffectiveMs).toBe(5 * hour);
  });

  it("calculates average monthly, weekly, and daily effective time", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 20, 12, 0, 0));

    const sessions = [
      session({ id: "jan-1", startedAt: at(2026, 0, 1, 8), effectiveHours: 2 }),
      session({ id: "jan-2", startedAt: at(2026, 0, 2, 8), effectiveHours: 4 }),
      session({ id: "feb-1", startedAt: at(2026, 1, 3, 8), effectiveHours: 6 }),
      session({ id: "mar-1", startedAt: at(2026, 2, 4, 8), effectiveHours: 8 }),
    ];

    const summary = buildAnalyticsSummary(sessions, "Uncategorized");

    expect(summary.averageMonthlyEffectiveMs).toBe(24_000_000);
    expect(summary.averageWeeklyEffectiveMs).toBe(24_000_000);
    expect(summary.averageDailyEffectiveMs).toBe(5 * hour);
  });

  it("groups crossing-midnight sessions by startedAt local day", () => {
    const sessions = [
      session({
        id: "night",
        startedAt: at(2026, 4, 11, 23, 30),
        effectiveHours: 2,
      }),
    ];

    const summary = buildAnalyticsSummary(sessions, "Uncategorized", { year: 2026, monthIndex: 4 });
    const day11 = summary.monthlyProductivityCalendar.days.find((day) => day.dayOfMonth === 11);
    const day12 = summary.monthlyProductivityCalendar.days.find((day) => day.dayOfMonth === 12);

    expect(day11?.effectiveMs).toBe(2 * hour);
    expect(day12?.effectiveMs).toBe(0);
  });

  it("supports filtered analytics by using provided filtered sessions", () => {
    const allSessions = [
      session({ id: "w1", startedAt: at(2026, 4, 1, 10), effectiveHours: 3, category: "Work" }),
      session({ id: "w2", startedAt: at(2026, 4, 2, 10), effectiveHours: 2, category: "Work" }),
      session({ id: "s1", startedAt: at(2026, 4, 3, 10), effectiveHours: 4, category: "Study" }),
    ];

    const filtered = allSessions.filter((item) => item.category === "Work");
    const summary = buildAnalyticsSummary(filtered, "Uncategorized");

    expect(summary.completedCount).toBe(2);
    expect(summary.totalEffectiveMs).toBe(5 * hour);
    expect(summary.effectiveByCategory).toEqual([{ category: "Work", effectiveMs: 5 * hour }]);
  });

  it("builds energy interruption stats and keeps zero averages for missing levels", () => {
    const sessions = [
      session({
        id: "bad-1",
        startedAt: at(2026, 4, 1, 9),
        effectiveHours: 1,
        pausedHours: 1,
        energy: "bad",
      }),
      session({
        id: "bad-2",
        startedAt: at(2026, 4, 2, 9),
        effectiveHours: 1,
        pausedHours: 0.5,
        energy: "bad",
      }),
      session({
        id: "regular-1",
        startedAt: at(2026, 4, 3, 9),
        effectiveHours: 1,
        pausedHours: 0.25,
        energy: "regular",
      }),
    ];

    const summary = buildAnalyticsSummary(sessions, "Uncategorized");
    const bad = summary.energyInterruptionStats.find((item) => item.energy === "bad");
    const regular = summary.energyInterruptionStats.find((item) => item.energy === "regular");
    const good = summary.energyInterruptionStats.find((item) => item.energy === "good");

    expect(bad?.sessionCount).toBe(2);
    expect(bad?.averagePauseCount).toBe(1);
    expect(bad?.averagePausedMs).toBe(2_700_000);

    expect(regular?.sessionCount).toBe(1);
    expect(regular?.averagePauseCount).toBe(1);
    expect(regular?.averagePausedMs).toBe(900_000);

    expect(good?.sessionCount).toBe(0);
    expect(good?.averagePauseCount).toBe(0);
    expect(good?.averagePausedMs).toBe(0);
  });

  it("selects bestTimeSlot with a clear winner", () => {
    const sessions = [
      session({ id: "m1", startedAt: at(2026, 4, 1, 8), effectiveHours: 1 }),
      session({ id: "m2", startedAt: at(2026, 4, 2, 8), effectiveHours: 1 }),
      session({ id: "a1", startedAt: at(2026, 4, 3, 13), effectiveHours: 3 }),
    ];

    const summary = buildAnalyticsSummary(sessions, "Uncategorized");

    expect(summary.bestTimeSlot).toEqual({ slot: "afternoon", effectiveMs: 3 * hour });
  });

  it("counts 00:00 and 05:59 as night while 23:00 remains evening", () => {
    const sessions = [
      session({ id: "n1", startedAt: at(2026, 4, 1, 0, 0), effectiveHours: 1 }),
      session({ id: "n2", startedAt: at(2026, 4, 1, 5, 59), effectiveHours: 2 }),
      session({ id: "e1", startedAt: at(2026, 4, 1, 23, 0), effectiveHours: 3 }),
    ];

    const summary = buildAnalyticsSummary(sessions, "Uncategorized");
    const night = summary.effectiveByTimeSlot.find((item) => item.slot === "night");
    const evening = summary.effectiveByTimeSlot.find((item) => item.slot === "evening");

    expect(night?.effectiveMs).toBe(3 * hour);
    expect(evening?.effectiveMs).toBe(3 * hour);
  });

  it("groups empty categories under provided uncategorized label", () => {
    const sessions = [
      session({ id: "u1", startedAt: at(2026, 4, 1, 10), effectiveHours: 2, category: "" }),
    ];

    const summary = buildAnalyticsSummary(sessions, "Sin categoria");

    expect(summary.effectiveByCategory).toEqual([
      { category: "Sin categoria", effectiveMs: 2 * hour },
    ]);
  });

  it("falls back invalid weekday values to monday aggregation", () => {
    const sessions = [
      session({
        id: "wd-invalid",
        startedAt: at(2026, 4, 1, 10),
        effectiveHours: 2,
        weekday: "invalid-weekday",
      }),
    ];

    const summary = buildAnalyticsSummary(sessions, "Uncategorized");
    const monday = summary.effectiveByWeekday.find((item) => item.weekday === "monday");

    expect(monday?.effectiveMs).toBe(2 * hour);
  });
});

describe("buildAnalyticsSummary calendar", () => {
  it("builds February 2024 with 29 days", () => {
    const summary = buildAnalyticsSummary([], "Uncategorized", { year: 2024, monthIndex: 1 });
    expect(summary.monthlyProductivityCalendar.days.length).toBe(29);
  });

  it("builds February 2025 with 28 days", () => {
    const summary = buildAnalyticsSummary([], "Uncategorized", { year: 2025, monthIndex: 1 });
    expect(summary.monthlyProductivityCalendar.days.length).toBe(28);
  });

  it("uses Monday-first leading blanks and Sunday-start has six blanks", () => {
    const mondayStart = buildAnalyticsSummary([], "Uncategorized", {
      year: 2024,
      monthIndex: 0,
    });
    const sundayStart = buildAnalyticsSummary([], "Uncategorized", {
      year: 2024,
      monthIndex: 8,
    });

    expect(mondayStart.monthlyProductivityCalendar.leadingBlankDays).toBe(0);
    expect(sundayStart.monthlyProductivityCalendar.leadingBlankDays).toBe(6);
  });

  it("uses startedAt local day totals and threshold levels", () => {
    const sessions = [
      session({ id: "d1", startedAt: at(2026, 4, 1, 9), effectiveHours: 0 }),
      session({ id: "d2", startedAt: at(2026, 4, 2, 9), effectiveHours: 3.5 }),
      session({ id: "d3", startedAt: at(2026, 4, 3, 9), effectiveHours: 4 }),
      session({ id: "d4", startedAt: at(2026, 4, 4, 9), effectiveHours: 7 }),
      session({ id: "d5", startedAt: at(2026, 4, 5, 9), effectiveHours: 8 }),
      session({ id: "cross", startedAt: at(2026, 4, 6, 23, 30), effectiveHours: 2 }),
    ];

    const summary = buildAnalyticsSummary(sessions, "Uncategorized", { year: 2026, monthIndex: 4 });
    const getDay = (dayOfMonth: number) =>
      summary.monthlyProductivityCalendar.days.find((day) => day.dayOfMonth === dayOfMonth);

    expect(getDay(1)?.productivityLevel).toBe("low");
    expect(getDay(2)?.productivityLevel).toBe("low");
    expect(getDay(3)?.productivityLevel).toBe("medium");
    expect(getDay(4)?.productivityLevel).toBe("medium");
    expect(getDay(5)?.productivityLevel).toBe("high");
    expect(getDay(6)?.effectiveMs).toBe(2 * hour);
    expect(getDay(7)?.effectiveMs).toBe(0);
  });

  it("highlights today only in the real current month", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 15, 10, 0, 0));

    const currentMonth = buildAnalyticsSummary([], "Uncategorized", { year: 2026, monthIndex: 4 });
    const previousMonth = buildAnalyticsSummary([], "Uncategorized", { year: 2026, monthIndex: 3 });

    expect(currentMonth.monthlyProductivityCalendar.days.some((day) => day.isToday)).toBe(true);
    expect(previousMonth.monthlyProductivityCalendar.days.some((day) => day.isToday)).toBe(false);
  });

  it("changes calendar grid when selected visible month changes", () => {
    const april = buildAnalyticsSummary([], "Uncategorized", { year: 2026, monthIndex: 3 });
    const may = buildAnalyticsSummary([], "Uncategorized", { year: 2026, monthIndex: 4 });

    expect(april.monthlyProductivityCalendar.year).toBe(2026);
    expect(april.monthlyProductivityCalendar.monthIndex).toBe(3);
    expect(april.monthlyProductivityCalendar.days.length).toBe(30);

    expect(may.monthlyProductivityCalendar.year).toBe(2026);
    expect(may.monthlyProductivityCalendar.monthIndex).toBe(4);
    expect(may.monthlyProductivityCalendar.days.length).toBe(31);
  });
});
