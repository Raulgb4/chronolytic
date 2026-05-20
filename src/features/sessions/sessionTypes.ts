export type PausePeriod = {
  startedAt: number;
  endedAt: number | null;
};

export type ActiveSession = {
  id: string;
  title: string;
  category: string;
  tags: string[];
  startedAt: number;
  pauses: PausePeriod[];
  status: "running" | "paused";
};

export type CompletedSession = {
  id: string;
  title: string;
  category: string;
  tags: string[];
  startedAt: number;
  endedAt: number;
  effectiveDurationMs: number;
  pauses: PausePeriod[];
};
