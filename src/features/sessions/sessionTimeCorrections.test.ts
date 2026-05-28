import { describe, expect, it } from "vitest";
import type { ActiveSession } from "./sessionTypes";
import {
  applyAddPausedTime,
  applyForgottenStartOffset,
  applyRemoveDistractedTime,
} from "./sessionTimeCorrections";
import {
  getEffectiveDuration,
  getPausedDuration,
  getTimerDisplayNow,
} from "../../shared/utils/durationUtils";

function makeSession(overrides: Partial<ActiveSession> = {}): ActiveSession {
  return {
    id: "a1",
    title: "Focus",
    category: "Work",
    energy: "regular",
    startedAt: 0,
    pauses: [],
    status: "running",
    ...overrides,
  };
}

describe("sessionTimeCorrections", () => {
  it("applies forgotten start offset backwards", () => {
    const startedAt = applyForgottenStartOffset(100_000, 15);
    expect(startedAt).toBe(100_000 - 15 * 60 * 1000);
  });

  it("add paused time reduces total paused duration", () => {
    const session = makeSession({
      status: "paused",
      pauses: [
        { startedAt: 1_000, endedAt: 4_000 },
        { startedAt: 6_000, endedAt: 9_000 },
      ],
    });

    const next = applyAddPausedTime(session, 2_000, 10_000);
    expect(getPausedDuration(next.pauses, 10_000)).toBe(4_000);
  });

  it("remove distracted time appends synthetic closed pause", () => {
    const session = makeSession({ pauses: [{ startedAt: 1_000, endedAt: 2_000 }] });
    const next = applyRemoveDistractedTime(session, 3_000, 10_000);

    expect(next.pauses[next.pauses.length - 1]).toEqual({ startedAt: 7_000, endedAt: 10_000 });
  });

  it("remove distracted time decreases effective duration by requested amount", () => {
    const session = makeSession({
      startedAt: 0,
      pauses: [{ startedAt: 2_000, endedAt: 4_000 }],
      status: "running",
    });
    const applyAt = 10_000;
    const before = getEffectiveDuration(session, getTimerDisplayNow(session, applyAt));

    const next = applyRemoveDistractedTime(session, 3_000, applyAt);
    const after = getEffectiveDuration(next, getTimerDisplayNow(next, applyAt));

    expect(before - after).toBe(3_000);
  });

  it("does not mutate input session", () => {
    const session = makeSession({
      pauses: [
        { startedAt: 1_000, endedAt: 3_000 },
        { startedAt: 4_000, endedAt: 7_000 },
      ],
    });
    const snapshot = JSON.parse(JSON.stringify(session)) as ActiveSession;

    void applyAddPausedTime(session, 1_000, 8_000);
    void applyRemoveDistractedTime(session, 500, 8_000);

    expect(session).toEqual(snapshot);
  });

  it("applyAddPausedTime handles paused session with open latest pause", () => {
    const session = makeSession({
      id: "paused-open",
      title: "Paused",
      category: "Study",
      energy: "good",
      startedAt: 0,
      status: "paused",
      pauses: [
        { startedAt: 2_000, endedAt: 4_000 },
        { startedAt: 6_000, endedAt: null },
      ],
    });
    const snapshot = JSON.parse(JSON.stringify(session)) as ActiveSession;
    const applyAt = 10_000;

    const pausedBefore = getPausedDuration(session.pauses, applyAt);
    const effectiveBefore = getEffectiveDuration(session, getTimerDisplayNow(session, applyAt));

    const next = applyAddPausedTime(session, 1_500, applyAt);

    const pausedAfter = getPausedDuration(next.pauses, applyAt);
    const effectiveAfter = getEffectiveDuration(next, getTimerDisplayNow(next, applyAt));

    expect(pausedBefore - pausedAfter).toBe(1_500);
    expect(effectiveAfter - effectiveBefore).toBe(1_500);
    expect(next.id).toBe(session.id);
    expect(next.title).toBe(session.title);
    expect(next.category).toBe(session.category);
    expect(next.energy).toBe(session.energy);
    expect(next.startedAt).toBe(session.startedAt);
    expect(next.status).toBe(session.status);
    expect(session).toEqual(snapshot);
  });
});
