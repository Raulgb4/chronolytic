import { describe, expect, it } from "vitest";
import type { ActiveSession, PausePeriod } from "../../features/sessions/sessionTypes";
import {
  formatDuration,
  formatHumanDuration,
  getEffectiveDuration,
  getPausedDuration,
  getTimerDisplayNow,
  reducePausedDuration,
} from "./durationUtils";

const minute = 60 * 1000;

describe("getPausedDuration", () => {
  it("returns zero when there are no pauses", () => {
    expect(getPausedDuration([], 10_000)).toBe(0);
  });

  it("sums closed pauses", () => {
    const pauses: PausePeriod[] = [
      { startedAt: 1_000, endedAt: 2_000 },
      { startedAt: 3_000, endedAt: 4_500 },
    ];

    expect(getPausedDuration(pauses, 10_000)).toBe(2_500);
  });

  it("includes an open pause using now", () => {
    const pauses: PausePeriod[] = [{ startedAt: 5_000, endedAt: null }];

    expect(getPausedDuration(pauses, 8_000)).toBe(3_000);
  });

  it("handles a pause around midnight", () => {
    const start = new Date(2026, 4, 1, 23, 59, 30).getTime();
    const end = new Date(2026, 4, 2, 0, 5, 30).getTime();
    const pauses: PausePeriod[] = [{ startedAt: start, endedAt: end }];

    expect(getPausedDuration(pauses, end)).toBe(6 * minute);
  });
});

describe("getEffectiveDuration", () => {
  it("excludes paused time", () => {
    const session: ActiveSession = {
      id: "s1",
      title: "Focus",
      category: "Study",
      energy: "good",
      startedAt: 0,
      status: "running",
      pauses: [{ startedAt: 2_000, endedAt: 4_000 }],
    };

    expect(getEffectiveDuration(session, 10_000)).toBe(8_000);
  });

  it("handles an open pause", () => {
    const session: ActiveSession = {
      id: "s2",
      title: "Focus",
      category: "Work",
      energy: "regular",
      startedAt: 0,
      status: "paused",
      pauses: [{ startedAt: 7_000, endedAt: null }],
    };

    expect(getEffectiveDuration(session, 10_000)).toBe(7_000);
  });

  it("never returns a negative value", () => {
    const session: ActiveSession = {
      id: "s3",
      title: "Focus",
      category: "Work",
      energy: "bad",
      startedAt: 5_000,
      status: "paused",
      pauses: [{ startedAt: 1_000, endedAt: null }],
    };

    expect(getEffectiveDuration(session, 5_000)).toBe(0);
  });
});

describe("reducePausedDuration", () => {
  it("consumes newest pauses first", () => {
    const pauses: PausePeriod[] = [
      { startedAt: 1_000, endedAt: 3_000 },
      { startedAt: 5_000, endedAt: 7_000 },
    ];

    const next = reducePausedDuration(pauses, 1_500, 9_000);

    expect(next).toEqual([
      { startedAt: 1_000, endedAt: 3_000 },
      { startedAt: 6_500, endedAt: 7_000 },
    ]);
  });

  it("partially reduces a pause duration", () => {
    const pauses: PausePeriod[] = [{ startedAt: 10_000, endedAt: 16_000 }];

    const next = reducePausedDuration(pauses, 2_000, 20_000);

    expect(next).toEqual([{ startedAt: 12_000, endedAt: 16_000 }]);
  });

  it("removes fully consumed closed pauses", () => {
    const pauses: PausePeriod[] = [
      { startedAt: 2_000, endedAt: 4_000 },
      { startedAt: 6_000, endedAt: 7_000 },
    ];

    const next = reducePausedDuration(pauses, 2_500, 10_000);

    expect(next).toEqual([{ startedAt: 3_500, endedAt: 4_000 }]);
  });

  it("does not mutate the original pauses", () => {
    const pauses: PausePeriod[] = [
      { startedAt: 1_000, endedAt: 2_000 },
      { startedAt: 3_000, endedAt: 5_000 },
    ];
    const snapshot = pauses.map((pause) => ({ ...pause }));

    const next = reducePausedDuration(pauses, 500, 7_000);

    expect(pauses).toEqual(snapshot);
    expect(next).not.toBe(pauses);
  });

  it("partially reduces an open pause using now", () => {
    const pauses: PausePeriod[] = [{ startedAt: 10_000, endedAt: null }];

    const next = reducePausedDuration(pauses, 2_000, 16_000);

    expect(next).toEqual([{ startedAt: 12_000, endedAt: null }]);
  });

  it("fully consumes an open pause without invalid timestamps", () => {
    const pauses: PausePeriod[] = [{ startedAt: 10_000, endedAt: null }];

    const next = reducePausedDuration(pauses, 6_000, 16_000);

    expect(next).toEqual([{ startedAt: 16_000, endedAt: null }]);
  });

  it("stays safe when amount exceeds total paused duration", () => {
    const pauses: PausePeriod[] = [
      { startedAt: 1_000, endedAt: 3_000 },
      { startedAt: 6_000, endedAt: null },
    ];

    const next = reducePausedDuration(pauses, 10_000, 8_000);

    expect(next).toEqual([{ startedAt: 8_000, endedAt: null }]);
  });
});

describe("getTimerDisplayNow", () => {
  it("uses startedAt when running and now is earlier", () => {
    const session: ActiveSession = {
      id: "timer-1",
      title: "Focus",
      category: "Work",
      energy: "good",
      startedAt: 10_000,
      status: "running",
      pauses: [],
    };

    expect(getTimerDisplayNow(session, 9_000)).toBe(10_000);
  });

  it("uses latest closed pause end when running and it is after now", () => {
    const session: ActiveSession = {
      id: "timer-2",
      title: "Focus",
      category: "Work",
      energy: "good",
      startedAt: 10_000,
      status: "running",
      pauses: [{ startedAt: 11_000, endedAt: 14_000 }],
    };

    expect(getTimerDisplayNow(session, 12_000)).toBe(14_000);
  });

  it("uses open pause start when paused and open pause starts after now", () => {
    const session: ActiveSession = {
      id: "timer-3",
      title: "Focus",
      category: "Work",
      energy: "regular",
      startedAt: 10_000,
      status: "paused",
      pauses: [{ startedAt: 13_000, endedAt: null }],
    };

    expect(getTimerDisplayNow(session, 12_000)).toBe(13_000);
  });

  it("ignores closed pauses for paused display-now decision", () => {
    const session: ActiveSession = {
      id: "timer-4",
      title: "Focus",
      category: "Work",
      energy: "regular",
      startedAt: 10_000,
      status: "paused",
      pauses: [
        { startedAt: 11_000, endedAt: 20_000 },
        { startedAt: 15_000, endedAt: null },
      ],
    };

    expect(getTimerDisplayNow(session, 12_000)).toBe(15_000);
  });
});

describe("formatDuration", () => {
  it("formats zero duration", () => {
    expect(formatDuration(0)).toBe("00:00:00");
  });

  it("formats seconds with padding", () => {
    expect(formatDuration(9_000)).toBe("00:00:09");
  });

  it("formats minutes with padding", () => {
    expect(formatDuration(5 * minute + 3_000)).toBe("00:05:03");
  });

  it("formats hours with padding", () => {
    expect(formatDuration(2 * 60 * minute + 4 * minute + 5_000)).toBe("02:04:05");
  });
});

describe("formatHumanDuration", () => {
  it("uses singular and plural labels", () => {
    expect(formatHumanDuration(1_000)).toBe("1 second");
    expect(formatHumanDuration(2_000)).toBe("2 seconds");
    expect(formatHumanDuration(60_000)).toBe("1 minute");
    expect(formatHumanDuration(2 * 60_000)).toBe("2 minutes");
  });

  it("supports localized labels", () => {
    expect(
      formatHumanDuration(2 * 60 * 60 * 1000, {
        second: "segundo",
        seconds: "segundos",
        minute: "minuto",
        minutes: "minutos",
        hour: "hora",
        hours: "horas",
      }),
    ).toBe("2 horas");
  });

  it("clamps negative values to zero", () => {
    expect(formatHumanDuration(-5_000)).toBe("0 seconds");
  });
});
