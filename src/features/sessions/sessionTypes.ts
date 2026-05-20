export type PausePeriod = {
  startedAt: number;
  endedAt: number | null;
};

export type EnergyLevel = "bad" | "regular" | "good";

export type ActiveSession = {
  id: string;
  title: string;
  category: string;
  tags: string[];
  energy: EnergyLevel;
  startedAt: number;
  pauses: PausePeriod[];
  status: "running" | "paused";
};

export type CompletedSession = {
  id: string;
  title: string;
  category: string;
  tags: string[];
  energy: EnergyLevel;
  startedAt: number;
  endedAt: number;
  effectiveDurationMs: number;
  pauses: PausePeriod[];
  weekday: string;
};
