export type Page = "home" | "analytics" | "settings";
export type AnalyticsTab = "dashboard" | "sessionHistory";
export type Language = "en" | "es";
export type ThemeMode = "light" | "dark";
export type BackupFeedbackType = "success" | "error";
export type SessionHistoryDurationFilter =
  | "all"
  | "1hTo2h"
  | "2hTo4h"
  | "4hTo6h"
  | "6hTo8h"
  | "8hTo10h";
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
