export type Page = "home" | "analytics" | "settings";
export type AnalyticsTab = "dashboard" | "sessionHistory";
export type Language = "en" | "es";
export type ThemeMode = "light" | "dark";
export type BackupFeedbackType = "success" | "error";
export type SessionHistoryDurationFilter = "all" | "under30m" | "30mTo1h" | "1hTo2h" | "over2h";
export type SessionHistoryPauseFilter = "all" | "withPauses" | "withoutPauses";
export type SessionHistorySortKey =
  | "startedAt"
  | "endedAt"
  | "effectiveDurationMs"
  | "pauseCount"
  | "energy";
export type SortDirection = "asc" | "desc";
export type SessionHistoryEditableField = "title" | "category" | "energy" | "weekday";
export type SettingsFeedbackType = "success" | "error";

export type NavItem = {
  page: Page;
  label: string;
};
