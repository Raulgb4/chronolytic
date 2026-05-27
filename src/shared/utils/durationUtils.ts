import type { ActiveSession, PausePeriod } from "../../features/sessions/sessionTypes";

type DurationLabels = {
  second: string;
  seconds: string;
  minute: string;
  minutes: string;
  hour: string;
  hours: string;
};

const DEFAULT_DURATION_LABELS: DurationLabels = {
  second: "second",
  seconds: "seconds",
  minute: "minute",
  minutes: "minutes",
  hour: "hour",
  hours: "hours",
};

export function reducePausedDuration(
  pauses: PausePeriod[],
  amountMs: number,
  now: number,
): PausePeriod[] {
  let remaining = Math.max(0, Math.floor(amountMs));
  if (remaining === 0) return pauses;

  const nextPauses = pauses.map((pause) => ({ ...pause }));

  for (let index = nextPauses.length - 1; index >= 0 && remaining > 0; index -= 1) {
    const pause = nextPauses[index];
    const pauseEnd = pause.endedAt === null ? now : pause.endedAt;
    const pauseDuration = Math.max(0, pauseEnd - pause.startedAt);
    if (pauseDuration === 0) continue;

    const consume = Math.min(remaining, pauseDuration);
    remaining -= consume;
    pause.startedAt += consume;
  }

  return nextPauses.filter((pause) => {
    if (pause.endedAt === null) return true;
    return pause.endedAt > pause.startedAt;
  });
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function formatHumanDuration(ms: number, labels: DurationLabels = DEFAULT_DURATION_LABELS): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  if (totalSeconds < 60) {
    return `${totalSeconds} ${totalSeconds === 1 ? labels.second : labels.seconds}`;
  }

  const totalMinutes = totalSeconds / 60;
  if (totalMinutes < 60) {
    const roundedMinutes = Math.round(totalMinutes);
    return `${roundedMinutes} ${roundedMinutes === 1 ? labels.minute : labels.minutes}`;
  }

  const totalHours = totalMinutes / 60;
  const roundedHours = totalHours < 10 ? Math.round(totalHours * 10) / 10 : Math.round(totalHours);
  return `${roundedHours} ${roundedHours === 1 ? labels.hour : labels.hours}`;
}

export function getPausedDuration(pauses: PausePeriod[], now: number): number {
  return pauses.reduce((acc, pause) => {
    if (pause.endedAt === null) {
      return acc + (now - pause.startedAt);
    }
    return acc + (pause.endedAt - pause.startedAt);
  }, 0);
}

export function getEffectiveDuration(session: ActiveSession, now: number): number {
  const total = now - session.startedAt;
  const paused = getPausedDuration(session.pauses, now);
  return Math.max(0, total - paused);
}

export function getTimerDisplayNow(session: ActiveSession, now: number): number {
  const base = Math.max(now, session.startedAt);

  if (session.status === "running") {
    const latestClosedPauseEndedAt = session.pauses.reduce((latest, pause) => {
      if (typeof pause.endedAt !== "number") return latest;
      return Math.max(latest, pause.endedAt);
    }, session.startedAt);

    return Math.max(base, latestClosedPauseEndedAt);
  }

  const openPauseStartedAt = session.pauses.reduce((latest, pause) => {
    if (pause.endedAt !== null) return latest;
    return Math.max(latest, pause.startedAt);
  }, session.startedAt);

  return Math.max(base, openPauseStartedAt);
}
