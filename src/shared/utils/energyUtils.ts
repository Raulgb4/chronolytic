import type { CompletedSession, EnergyLevel } from "../../features/sessions/sessionTypes";

export function getEnergyIndex(energy: EnergyLevel): number {
  if (energy === "bad") return 0;
  if (energy === "regular") return 1;
  return 2;
}

export function getEnergyFromIndex(index: number): EnergyLevel {
  if (index <= 0) return "bad";
  if (index >= 2) return "good";
  return "regular";
}

export function getEnergySortValue(energy: EnergyLevel): number {
  if (energy === "bad") return 0;
  if (energy === "regular") return 1;
  return 2;
}

export function getEnergyBadgeClasses(energy: EnergyLevel): string {
  if (energy === "bad") {
    return "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-300";
  }

  if (energy === "regular") {
    return "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300";
  }

  return "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300";
}

export function isHighInterruptionSession(session: CompletedSession): boolean {
  return session.pauseCount > 10;
}
