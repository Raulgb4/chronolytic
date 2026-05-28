import type { ActiveSession } from "./sessionTypes";
import { reducePausedDuration } from "../../shared/utils/durationUtils";

export function applyForgottenStartOffset(createdAt: number, forgottenMinutes: number): number {
  return createdAt - Math.floor(forgottenMinutes) * 60 * 1000;
}

export function applyAddPausedTime(
  session: ActiveSession,
  requestedMs: number,
  applyAt: number,
): ActiveSession {
  return {
    ...session,
    pauses: reducePausedDuration(session.pauses, requestedMs, applyAt),
  };
}

export function applyRemoveDistractedTime(
  session: ActiveSession,
  requestedMs: number,
  applyAt: number,
): ActiveSession {
  return {
    ...session,
    pauses: [...session.pauses, { startedAt: applyAt - requestedMs, endedAt: applyAt }],
  };
}
