import { useEffect, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { buildAnalyticsSummary } from "./analyticsSummary";
import type {
  AnalyticsTab,
  SessionHistoryDurationFilter,
  SessionHistoryEditableField,
  SessionHistorySortKey,
  SortDirection,
} from "../../app/appTypes";
import type { CompletedSession, EnergyLevel } from "../sessions/sessionTypes";
import { formatSessionDate } from "../../shared/utils/dateUtils";
import { formatHumanDuration } from "../../shared/utils/durationUtils";
import { getEnergyBadgeClasses, isHighInterruptionSession } from "../../shared/utils/energyUtils";

type SessionHistoryEditingState = {
  sessionId: string;
  field: SessionHistoryEditableField;
  value: string;
};

type BackupFeedback = {
  type: "success" | "error";
  message: string;
};

type AnalyticsPageProps = {
  t: (key: string, options?: Record<string, unknown>) => string;
  analyticsTab: AnalyticsTab;
  setAnalyticsTab: (tab: AnalyticsTab) => void;
  completedSessions: CompletedSession[];
  dashboardSessions: CompletedSession[];
  dashboardCategoryFilter: string;
  setDashboardCategoryFilter: (value: string) => void;
  dashboardCategoryOptions: Array<{ value: string; label: string }>;
  sessionHistorySearch: string;
  setSessionHistorySearch: (value: string) => void;
  handleExportBackup: () => void;
  handleImportBackup: () => void;
  isBackupBusy: boolean;
  sessionHistoryWeekdayFilter: string;
  setSessionHistoryWeekdayFilter: (value: string) => void;
  sessionHistoryEnergyFilter: string;
  setSessionHistoryEnergyFilter: (value: string) => void;
  sessionHistoryCategoryFilter: string;
  setSessionHistoryCategoryFilter: (value: string) => void;
  usedCategories: string[];
  sessionHistoryDurationFilter: SessionHistoryDurationFilter;
  setSessionHistoryDurationFilter: (value: SessionHistoryDurationFilter) => void;
  sessionHistoryPauseFilter: "all" | "withPauses" | "withoutPauses";
  setSessionHistoryPauseFilter: (value: "all" | "withPauses" | "withoutPauses") => void;
  resetSessionHistoryView: () => void;
  hasSessionHistoryQueryOrFilters: boolean;
  activeSessionHistoryFilterCount: number;
  backupFeedback: BackupFeedback | null;
  isBackupFeedbackVisible: boolean;
  sessionHistoryEditError: string | null;
  visibleSessionHistorySessions: CompletedSession[];
  paginatedSessionHistorySessions: CompletedSession[];
  sessionHistoryEditing: SessionHistoryEditingState | null;
  setSessionHistoryEditing: (
    updater: (previous: SessionHistoryEditingState | null) => SessionHistoryEditingState | null,
  ) => void;
  saveSessionHistoryInlineEdit: () => Promise<void>;
  handleSessionHistoryInlineEditKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  startSessionHistoryInlineEdit: (
    session: CompletedSession,
    field: SessionHistoryEditableField,
  ) => void;
  deleteCompletedSession: (sessionId: string) => void;
  sessionHistoryPage: number;
  setSessionHistoryPage: (updater: (previous: number) => number) => void;
  sessionHistoryTotalPages: number;
  sessionHistorySort: { key: SessionHistorySortKey; direction: SortDirection };
  handleSessionHistorySort: (key: SessionHistorySortKey) => void;
  renderMoodFace: (level: EnergyLevel, className: string) => ReactNode;
  sessionHistoryPageSize: number;
};

export function AnalyticsPage(props: AnalyticsPageProps) {
  const [sessionPendingDeleteId, setSessionPendingDeleteId] = useState<string | null>(null);

  const analyticsTabs: Array<{ key: AnalyticsTab; label: string }> = [
    { key: "dashboard", label: props.t("analytics.tabs.dashboard") },
    { key: "sessionHistory", label: props.t("analytics.tabs.sessionHistory") },
  ];

  const summary = buildAnalyticsSummary(props.dashboardSessions, props.t("home.uncategorized"));

  const maxCategoryMs = Math.max(...summary.effectiveByCategory.map((item) => item.effectiveMs), 1);
  const maxWeekdayMs = Math.max(...summary.effectiveByWeekday.map((item) => item.effectiveMs), 1);
  const maxTimeSlotMs = Math.max(...summary.effectiveByTimeSlot.map((item) => item.effectiveMs), 1);
  const maxEnergyInterruptPausedMs = Math.max(
    ...summary.energyInterruptionStats.map((item) => item.averagePausedMs),
    1,
  );
  const maxRecentDailyMs = Math.max(
    ...summary.recentDailyEffectiveHours.map((item) => item.effectiveMs),
    1,
  );

  const formatPercentage = (value: number): string => `${Math.round(value * 100)}%`;
  const formatHours = (durationMs: number): string =>
    `${(durationMs / (60 * 60 * 1000)).toFixed(1)}h`;
  const todayDateKey = (() => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  })();
  const getSortIndicator = (sortKey: SessionHistorySortKey): string => {
    if (props.sessionHistorySort.key !== sortKey) return "";
    return props.sessionHistorySort.direction === "asc" ? "↑" : "↓";
  };

  const sessionPendingDelete =
    sessionPendingDeleteId === null
      ? null
      : (props.completedSessions.find((session) => session.id === sessionPendingDeleteId) ?? null);

  useEffect(() => {
    if (!sessionPendingDeleteId) return;

    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setSessionPendingDeleteId(null);
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [sessionPendingDeleteId]);

  useEffect(() => {
    if (sessionPendingDeleteId && !sessionPendingDelete) {
      setSessionPendingDeleteId(null);
    }
  }, [sessionPendingDeleteId, sessionPendingDelete]);

  const confirmDeletePendingSession = () => {
    if (!sessionPendingDelete) return;
    props.deleteCompletedSession(sessionPendingDelete.id);
    setSessionPendingDeleteId(null);
  };

  return (
    <section className="flex h-full flex-col">
      <div className="border-b border-[var(--border)] bg-[var(--panel-bg)] px-8">
        <nav className="mx-auto flex w-full max-w-4xl items-stretch">
          {analyticsTabs.map((tab) => {
            const isActive = props.analyticsTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => props.setAnalyticsTab(tab.key)}
                className={`group relative flex-1 border-b-2 px-3 py-3 text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? "border-[#4E89FF] text-[var(--text)]"
                    : "border-transparent text-[var(--text-muted)] hover:border-[#4E89FF]/45 hover:text-[var(--text)]"
                }`}
              >
                <span className="inline-block transition-transform duration-200 group-hover:-translate-y-0.5">
                  {tab.label}
                </span>
              </button>
            );
          })}
        </nav>
      </div>

      {props.analyticsTab === "dashboard" ? (
        <div className="px-8 py-8">
          {props.completedSessions.length === 0 ? (
            <div className="w-full rounded-2xl border border-[var(--border)] bg-[var(--panel-bg)] px-6 py-14 text-center shadow-[0_8px_28px_rgba(15,23,42,0.06)]">
              <h2 className="text-2xl font-semibold text-[var(--text)]">
                {props.t("analytics.dashboard.emptyTitle")}
              </h2>
              <p className="mt-3 text-base text-[var(--text-muted)]">
                {props.t("analytics.dashboard.emptyDescription")}
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-end gap-3">
                <label
                  className="text-sm font-medium text-[var(--text-muted)]"
                  htmlFor="dashboard-category-filter"
                >
                  {props.t("analytics.dashboard.filters.category")}
                </label>
                <select
                  id="dashboard-category-filter"
                  value={props.dashboardCategoryFilter}
                  onChange={(event) => props.setDashboardCategoryFilter(event.target.value)}
                  className="app-select min-w-52 px-3 py-2 text-sm"
                >
                  {props.dashboardCategoryOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  {
                    label: props.t("analytics.dashboard.kpis.totalEffectiveTime"),
                    value: formatHumanDuration(summary.totalEffectiveMs),
                  },
                  {
                    label: props.t("analytics.dashboard.kpis.totalPausedTime"),
                    value: formatHumanDuration(summary.totalPausedMs),
                  },
                  {
                    label: props.t("analytics.dashboard.kpis.completedSessions"),
                    value: String(summary.completedCount),
                  },
                  {
                    label: props.t("analytics.dashboard.kpis.averageSessionDuration"),
                    value: formatHumanDuration(summary.averageSessionMs),
                  },
                ].map((kpi) => (
                  <div
                    key={kpi.label}
                    className="rounded-2xl border border-[var(--border)] bg-[var(--panel-bg)] p-4 shadow-[0_8px_22px_rgba(15,23,42,0.06)]"
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                      {kpi.label}
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-[var(--text)]">{kpi.value}</p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel-bg)] p-4 shadow-[0_8px_22px_rgba(15,23,42,0.06)]">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                    {props.t("analytics.dashboard.kpis.focusRatio")}
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-[var(--text)]">
                    {formatPercentage(summary.focusRatio)}
                  </p>
                  <div className="mt-3 h-2 rounded-full bg-[var(--panel-muted)]">
                    <div
                      className="h-2 rounded-full bg-[#4E89FF]"
                      style={{ width: `${Math.max(summary.focusRatio * 100, 2)}%` }}
                    />
                  </div>
                </div>
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel-bg)] p-4 shadow-[0_8px_22px_rgba(15,23,42,0.06)]">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                    {props.t("analytics.dashboard.kpis.interruptionRatio")}
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-[var(--text)]">
                    {formatPercentage(summary.interruptionRatio)}
                  </p>
                  <div className="mt-3 h-2 rounded-full bg-[var(--panel-muted)]">
                    <div
                      className="h-2 rounded-full bg-amber-500"
                      style={{ width: `${Math.max(summary.interruptionRatio * 100, 2)}%` }}
                    />
                  </div>
                </div>
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel-bg)] p-4 shadow-[0_8px_22px_rgba(15,23,42,0.06)]">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                    {props.t("analytics.dashboard.kpis.mostProductiveCategory")}
                  </p>
                  <p className="mt-2 truncate text-lg font-semibold text-[var(--text)]">
                    {summary.mostProductiveCategory?.category ??
                      props.t("analytics.dashboard.emptyMetric")}
                  </p>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">
                    {summary.mostProductiveCategory
                      ? formatHumanDuration(summary.mostProductiveCategory.effectiveMs)
                      : "-"}
                  </p>
                </div>
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel-bg)] p-4 shadow-[0_8px_22px_rgba(15,23,42,0.06)]">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                    {props.t("analytics.dashboard.kpis.bestTimeSlot")}
                  </p>
                  <p className="mt-2 text-lg font-semibold text-[var(--text)]">
                    {summary.bestTimeSlot
                      ? props.t(`analytics.dashboard.timeSlots.${summary.bestTimeSlot.slot}`)
                      : props.t("analytics.dashboard.emptyMetric")}
                  </p>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">
                    {summary.bestTimeSlot
                      ? formatHumanDuration(summary.bestTimeSlot.effectiveMs)
                      : "-"}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel-bg)] p-5 shadow-[0_8px_22px_rgba(15,23,42,0.06)]">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                    {props.t("analytics.dashboard.charts.effectiveByCategory")}
                  </h3>
                  <div className="mt-4 space-y-3">
                    {summary.effectiveByCategory.map((item) => (
                      <div key={item.category}>
                        <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                          <span className="truncate text-[var(--text)]">{item.category}</span>
                          <span className="text-[var(--text-muted)]">
                            {formatHumanDuration(item.effectiveMs)}
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-[var(--panel-muted)]">
                          <div
                            className="h-2 rounded-full bg-[var(--accent)]"
                            style={{ width: `${(item.effectiveMs / maxCategoryMs) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel-bg)] p-5 shadow-[0_8px_22px_rgba(15,23,42,0.06)]">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                    {props.t("analytics.dashboard.charts.recentDailyEffectiveHours")}
                  </h3>
                  <div className="mt-4 grid grid-cols-5 gap-2.5">
                    {summary.recentDailyEffectiveHours.map((item) => (
                      <div key={item.dateKey} className="flex flex-col items-center gap-2">
                        <div className="flex h-28 w-full items-end rounded-md bg-[var(--panel-muted)] px-1.5 py-1">
                          <div
                            className={`w-full rounded-sm ${item.dateKey === todayDateKey ? "bg-amber-500" : "bg-[#4E89FF]"}`}
                            style={{
                              height: `${Math.max((item.effectiveMs / maxRecentDailyMs) * 100, 6)}%`,
                            }}
                          />
                        </div>
                        <span className="text-[10px] font-medium uppercase text-[var(--text-muted)]">
                          {item.label}
                        </span>
                        <span className="text-xs text-[var(--text-muted)]">
                          {props.t("analytics.dashboard.series.hours", {
                            value: formatHours(item.effectiveMs),
                          })}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel-bg)] p-5 shadow-[0_8px_22px_rgba(15,23,42,0.06)]">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                    {props.t("analytics.dashboard.charts.effectiveByWeekday")}
                  </h3>
                  <div className="mt-4 grid grid-cols-7 gap-2">
                    {summary.effectiveByWeekday.map((item) => (
                      <div key={item.weekday} className="flex flex-col items-center gap-2">
                        <div className="flex h-28 w-full items-end rounded-md bg-[var(--panel-muted)] px-1.5 py-1">
                          <div
                            className="w-full rounded-sm bg-[#4E89FF]"
                            style={{
                              height: `${Math.max((item.effectiveMs / maxWeekdayMs) * 100, 6)}%`,
                            }}
                          />
                        </div>
                        <span className="text-[10px] font-medium uppercase text-[var(--text-muted)]">
                          {props.t(`analytics.weekdays.${item.weekday}`).slice(0, 3)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel-bg)] p-5 shadow-[0_8px_22px_rgba(15,23,42,0.06)]">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                    {props.t("analytics.dashboard.charts.energyInterruptions")}
                  </h3>
                  <div className="mt-4 space-y-4">
                    {summary.energyInterruptionStats.map((item) => (
                      <div key={`${item.energy}-interruptions`}>
                        <div className="mb-1.5 flex items-center justify-between text-sm">
                          <span className="inline-flex items-center gap-1.5 text-[var(--text)]">
                            {props.renderMoodFace(item.energy, "h-4 w-4")}
                            {props.t(`analytics.energy.${item.energy}`)}
                          </span>
                          <span className="text-[var(--text-muted)]">
                            {props.t("analytics.dashboard.series.averagePauseCount")}:{" "}
                            {item.averagePauseCount.toFixed(1)}
                          </span>
                        </div>
                        <div className="mb-1 text-xs text-[var(--text-muted)]">
                          {props.t("analytics.dashboard.series.averagePausedTime")}:{" "}
                          {formatHumanDuration(item.averagePausedMs)}
                        </div>
                        <div className="h-2 rounded-full bg-[var(--panel-muted)]">
                          <div
                            className="h-2 rounded-full bg-[var(--accent)]"
                            style={{
                              width: `${(item.averagePausedMs / maxEnergyInterruptPausedMs) * 100}%`,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel-bg)] p-5 shadow-[0_8px_22px_rgba(15,23,42,0.06)]">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                    {props.t("analytics.dashboard.charts.effectiveByTimeSlot")}
                  </h3>
                  <div className="mt-4 grid grid-cols-4 gap-3">
                    {summary.effectiveByTimeSlot.map((item) => (
                      <div key={item.slot} className="flex flex-col items-center gap-2">
                        <div className="flex h-28 w-full items-end rounded-md bg-[var(--panel-muted)] px-1.5 py-1">
                          <div
                            className={`w-full rounded-sm ${summary.bestTimeSlot?.slot === item.slot ? "bg-[#4E89FF]" : "bg-[#4E89FF]/60"}`}
                            style={{
                              height: `${Math.max((item.effectiveMs / maxTimeSlotMs) * 100, 6)}%`,
                            }}
                          />
                        </div>
                        <span className="text-[10px] font-medium uppercase text-[var(--text-muted)]">
                          {props.t(`analytics.dashboard.timeSlots.${item.slot}`)}
                        </span>
                        <span className="text-[10px] text-[var(--text-muted)]">
                          {formatHumanDuration(item.effectiveMs)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel-bg)] p-5 shadow-[0_8px_22px_rgba(15,23,42,0.06)]">
                <h3 className="text-sm font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                  {props.t("analytics.dashboard.latest.title")}
                </h3>
                <div className="mt-3 space-y-2">
                  {summary.latestSessions.map((session) => (
                    <div
                      key={`${session.id}-latest`}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--panel-muted)]/30 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[var(--text)]">
                          {session.title}
                        </p>
                        <p className="text-xs text-[var(--text-muted)]">
                          {session.category || props.t("home.uncategorized")}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-[var(--text-muted)]">
                        <span>{formatHumanDuration(session.effectiveDurationMs)}</span>
                        <span>{props.t(`analytics.weekdays.${session.weekday}`)}</span>
                        <span className="inline-flex items-center gap-1">
                          {props.renderMoodFace(session.energy, "h-3.5 w-3.5")}
                          {props.t(`analytics.energy.${session.energy}`)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="px-8 py-8">
          <div className="mb-4 space-y-3">
            <h2 className="text-base font-semibold text-[var(--text)]">
              {props.t("analytics.tabs.sessionHistory")}
            </h2>

            {props.completedSessions.length > 0 ? (
              <div className="mx-auto w-full max-w-md">
                <label className="sr-only" htmlFor="session-history-search">
                  {props.t("analytics.sessionHistory.searchLabel")}
                </label>
                <input
                  id="session-history-search"
                  type="text"
                  value={props.sessionHistorySearch}
                  onChange={(event) => props.setSessionHistorySearch(event.target.value)}
                  placeholder={props.t("analytics.sessionHistory.searchPlaceholder")}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--panel-bg)] px-3 py-2 text-sm text-[var(--text)] outline-none ring-[var(--accent)] transition focus:ring"
                />
              </div>
            ) : null}

            <div className="flex justify-end">
              {props.completedSessions.length > 0 ? (
                <button
                  type="button"
                  onClick={props.handleExportBackup}
                  disabled={props.isBackupBusy}
                  className="rounded-xl border border-[var(--border)] bg-[var(--panel-bg)] px-4 py-2 text-sm font-medium text-[var(--text)] transition duration-200 ease-out hover:bg-[var(--panel-muted)] disabled:cursor-not-allowed disabled:opacity-55"
                >
                  {props.isBackupBusy
                    ? props.t("analytics.sessionHistory.backup.processing")
                    : props.t("analytics.sessionHistory.backup.export")}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={props.handleImportBackup}
                  disabled={props.isBackupBusy}
                  className="rounded-xl border border-[var(--border)] bg-[var(--panel-bg)] px-4 py-2 text-sm font-medium text-[var(--text)] transition duration-200 ease-out hover:bg-[var(--panel-muted)] disabled:cursor-not-allowed disabled:opacity-55"
                >
                  {props.isBackupBusy
                    ? props.t("analytics.sessionHistory.backup.processing")
                    : props.t("analytics.sessionHistory.backup.import")}
                </button>
              )}
            </div>
          </div>

          {props.completedSessions.length > 0 ? (
            <div className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--panel-bg)] p-3">
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-6">
                <select
                  value={props.sessionHistoryWeekdayFilter}
                  onChange={(event) => props.setSessionHistoryWeekdayFilter(event.target.value)}
                  className="rounded-lg border border-[var(--border)] bg-[var(--panel-bg)] px-3 py-2 text-sm text-[var(--text)]"
                  aria-label={props.t("analytics.sessionHistory.filters.weekday")}
                >
                  <option value="all">
                    {props.t("analytics.sessionHistory.filters.allWeekdays")}
                  </option>
                  {[
                    "monday",
                    "tuesday",
                    "wednesday",
                    "thursday",
                    "friday",
                    "saturday",
                    "sunday",
                  ].map((weekday) => (
                    <option key={weekday} value={weekday}>
                      {props.t(`analytics.weekdays.${weekday}`)}
                    </option>
                  ))}
                </select>

                <select
                  value={props.sessionHistoryEnergyFilter}
                  onChange={(event) => props.setSessionHistoryEnergyFilter(event.target.value)}
                  className="rounded-lg border border-[var(--border)] bg-[var(--panel-bg)] px-3 py-2 text-sm text-[var(--text)]"
                  aria-label={props.t("analytics.sessionHistory.filters.energy")}
                >
                  <option value="all">
                    {props.t("analytics.sessionHistory.filters.allEnergy")}
                  </option>
                  {(["bad", "regular", "good"] as EnergyLevel[]).map((energyValue) => (
                    <option key={energyValue} value={energyValue}>
                      {props.t(`analytics.energy.${energyValue}`)}
                    </option>
                  ))}
                </select>

                <select
                  value={props.sessionHistoryCategoryFilter}
                  onChange={(event) => props.setSessionHistoryCategoryFilter(event.target.value)}
                  className="rounded-lg border border-[var(--border)] bg-[var(--panel-bg)] px-3 py-2 text-sm text-[var(--text)]"
                  aria-label={props.t("analytics.sessionHistory.filters.category")}
                >
                  <option value="all">
                    {props.t("analytics.sessionHistory.filters.allCategories")}
                  </option>
                  {props.usedCategories.map((categoryValue) => (
                    <option key={categoryValue} value={categoryValue}>
                      {categoryValue}
                    </option>
                  ))}
                </select>

                <select
                  value={props.sessionHistoryDurationFilter}
                  onChange={(event) =>
                    props.setSessionHistoryDurationFilter(
                      event.target.value as SessionHistoryDurationFilter,
                    )
                  }
                  className="rounded-lg border border-[var(--border)] bg-[var(--panel-bg)] px-3 py-2 text-sm text-[var(--text)]"
                  aria-label={props.t("analytics.sessionHistory.filters.duration")}
                >
                  <option value="all">
                    {props.t("analytics.sessionHistory.durationOptions.all")}
                  </option>
                  <option value="1hTo2h">
                    {props.t("analytics.sessionHistory.durationOptions.1hTo2h")}
                  </option>
                  <option value="2hTo4h">
                    {props.t("analytics.sessionHistory.durationOptions.2hTo4h")}
                  </option>
                  <option value="4hTo6h">
                    {props.t("analytics.sessionHistory.durationOptions.4hTo6h")}
                  </option>
                  <option value="6hTo8h">
                    {props.t("analytics.sessionHistory.durationOptions.6hTo8h")}
                  </option>
                  <option value="8hTo10h">
                    {props.t("analytics.sessionHistory.durationOptions.8hTo10h")}
                  </option>
                </select>

                <select
                  value={props.sessionHistoryPauseFilter}
                  onChange={(event) =>
                    props.setSessionHistoryPauseFilter(
                      event.target.value as "all" | "withPauses" | "withoutPauses",
                    )
                  }
                  className="rounded-lg border border-[var(--border)] bg-[var(--panel-bg)] px-3 py-2 text-sm text-[var(--text)]"
                  aria-label={props.t("analytics.sessionHistory.filters.pauses")}
                >
                  <option value="all">
                    {props.t("analytics.sessionHistory.filters.allPauses")}
                  </option>
                  <option value="withPauses">
                    {props.t("analytics.sessionHistory.filters.withPauses")}
                  </option>
                  <option value="withoutPauses">
                    {props.t("analytics.sessionHistory.filters.withoutPauses")}
                  </option>
                </select>

                <button
                  type="button"
                  onClick={props.resetSessionHistoryView}
                  disabled={
                    !props.hasSessionHistoryQueryOrFilters &&
                    props.activeSessionHistoryFilterCount === 0
                  }
                  className="rounded-lg border border-[var(--border)] bg-[var(--panel-bg)] px-3 py-2 text-sm font-medium text-[var(--text)] transition duration-200 ease-out hover:bg-[var(--panel-muted)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {props.activeSessionHistoryFilterCount > 0
                    ? props.t("analytics.sessionHistory.filters.clearWithCount", {
                        count: props.activeSessionHistoryFilterCount,
                      })
                    : props.t("analytics.sessionHistory.filters.clear")}
                </button>
              </div>
            </div>
          ) : null}

          {props.backupFeedback ? (
            <div
              className={`mb-4 rounded-xl border px-4 py-3 text-sm ${
                props.backupFeedback.type === "success"
                  ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                  : "border-rose-300 bg-rose-50 text-rose-800"
              } transition-opacity duration-300 ease-out ${
                props.isBackupFeedbackVisible ? "opacity-100" : "opacity-0"
              }`}
            >
              {props.backupFeedback.message}
            </div>
          ) : null}

          {props.sessionHistoryEditError ? (
            <div className="mb-4 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              {props.sessionHistoryEditError}
            </div>
          ) : null}

          <div className="w-full rounded-2xl border border-[var(--border)] bg-[var(--panel-bg)] shadow-[0_8px_28px_rgba(15,23,42,0.06)]">
            {props.completedSessions.length === 0 ? (
              <div className="px-6 py-14 text-center">
                <h2 className="text-xl font-semibold text-[var(--text)]">
                  {props.t("analytics.sessionHistory.emptyTitle")}
                </h2>
                <p className="mt-2 text-sm text-[var(--text-muted)]">
                  {props.t("analytics.sessionHistory.emptyDescription")}
                </p>
              </div>
            ) : props.visibleSessionHistorySessions.length === 0 ? (
              <div className="px-6 py-14 text-center">
                <h2 className="text-xl font-semibold text-[var(--text)]">
                  {props.t("analytics.sessionHistory.emptySearchTitle")}
                </h2>
                <p className="mt-2 text-sm text-[var(--text-muted)]">
                  {props.t("analytics.sessionHistory.emptySearchDescription")}
                </p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[980px] text-left">
                    <thead className="border-b border-[var(--border)] bg-[var(--panel-muted)]/40 text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">
                      <tr>
                        <th className="px-5 py-3.5 font-semibold">
                          {props.t("analytics.sessionHistory.columns.name")}
                        </th>
                        <th className="px-5 py-3.5 font-semibold">
                          {props.t("analytics.sessionHistory.columns.category")}
                        </th>
                        <th className="px-5 py-3.5 font-semibold">
                          {props.t("analytics.sessionHistory.columns.weekday")}
                        </th>
                        <th className="px-5 py-3.5 font-semibold">
                          <button
                            type="button"
                            onClick={() => props.handleSessionHistorySort("effectiveDurationMs")}
                            aria-label={props.t("analytics.sessionHistory.sorting.sortByDuration")}
                            className="inline-flex items-center gap-1 hover:text-[var(--text)]"
                          >
                            <span>{props.t("analytics.sessionHistory.columns.duration")}</span>
                            <span className="text-[var(--text-muted)]">
                              {getSortIndicator("effectiveDurationMs")}
                            </span>
                          </button>
                        </th>
                        <th className="px-5 py-3.5 font-semibold">
                          <button
                            type="button"
                            onClick={() => props.handleSessionHistorySort("startedAt")}
                            aria-label={props.t("analytics.sessionHistory.sorting.sortByStartDate")}
                            className="inline-flex items-center gap-1 hover:text-[var(--text)]"
                          >
                            <span>{props.t("analytics.sessionHistory.columns.startDate")}</span>
                            <span className="text-[var(--text-muted)]">
                              {getSortIndicator("startedAt")}
                            </span>
                          </button>
                        </th>
                        <th className="px-5 py-3.5 font-semibold">
                          <button
                            type="button"
                            onClick={() => props.handleSessionHistorySort("endedAt")}
                            aria-label={props.t("analytics.sessionHistory.sorting.sortByEndDate")}
                            className="inline-flex items-center gap-1 hover:text-[var(--text)]"
                          >
                            <span>{props.t("analytics.sessionHistory.columns.endDate")}</span>
                            <span className="text-[var(--text-muted)]">
                              {getSortIndicator("endedAt")}
                            </span>
                          </button>
                        </th>
                        <th className="px-5 py-3.5 font-semibold">
                          <button
                            type="button"
                            onClick={() => props.handleSessionHistorySort("pauseCount")}
                            aria-label={props.t(
                              "analytics.sessionHistory.sorting.sortByPauseCount",
                            )}
                            className="inline-flex items-center gap-1 hover:text-[var(--text)]"
                          >
                            <span>{props.t("analytics.sessionHistory.columns.pauseCount")}</span>
                            <span className="text-[var(--text-muted)]">
                              {getSortIndicator("pauseCount")}
                            </span>
                          </button>
                        </th>
                        <th className="px-5 py-3.5 font-semibold">
                          {props.t("analytics.sessionHistory.columns.pausedTime")}
                        </th>
                        <th className="px-5 py-3.5 font-semibold">
                          <button
                            type="button"
                            onClick={() => props.handleSessionHistorySort("energy")}
                            aria-label={props.t("analytics.sessionHistory.sorting.sortByEnergy")}
                            className="inline-flex items-center gap-1 hover:text-[var(--text)]"
                          >
                            <span>{props.t("analytics.sessionHistory.columns.energy")}</span>
                            <span className="text-[var(--text-muted)]">
                              {getSortIndicator("energy")}
                            </span>
                          </button>
                        </th>
                        <th className="px-5 py-3.5 text-right font-semibold">
                          {props.t("analytics.sessionHistory.columns.actions")}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                      {props.paginatedSessionHistorySessions.map((session) => (
                        <tr
                          key={session.id}
                          className="transition-colors duration-150 hover:bg-[var(--panel-muted)]/35"
                        >
                          <td className="px-5 py-4 text-sm font-semibold text-[var(--text)]">
                            {props.sessionHistoryEditing?.sessionId === session.id &&
                            props.sessionHistoryEditing.field === "title" ? (
                              <input
                                autoFocus
                                value={props.sessionHistoryEditing.value}
                                onChange={(event) =>
                                  props.setSessionHistoryEditing((prev) =>
                                    prev ? { ...prev, value: event.target.value } : prev,
                                  )
                                }
                                onBlur={() => void props.saveSessionHistoryInlineEdit()}
                                onKeyDown={props.handleSessionHistoryInlineEditKeyDown}
                                className="w-full rounded-lg border border-[var(--border)] bg-[var(--panel-bg)] px-2 py-1 text-sm text-[var(--text)]"
                              />
                            ) : (
                              <button
                                type="button"
                                onClick={() =>
                                  props.startSessionHistoryInlineEdit(session, "title")
                                }
                                className="text-left hover:text-[var(--accent)]"
                              >
                                {session.title}
                              </button>
                            )}
                          </td>
                          <td className="px-5 py-4 text-sm text-[var(--text-muted)]">
                            {props.sessionHistoryEditing?.sessionId === session.id &&
                            props.sessionHistoryEditing.field === "category" ? (
                              <input
                                autoFocus
                                value={props.sessionHistoryEditing.value}
                                onChange={(event) =>
                                  props.setSessionHistoryEditing((prev) =>
                                    prev ? { ...prev, value: event.target.value } : prev,
                                  )
                                }
                                onBlur={() => void props.saveSessionHistoryInlineEdit()}
                                onKeyDown={props.handleSessionHistoryInlineEditKeyDown}
                                className="w-full rounded-lg border border-[var(--border)] bg-[var(--panel-bg)] px-2 py-1 text-sm text-[var(--text)]"
                              />
                            ) : (
                              <button
                                type="button"
                                onClick={() =>
                                  props.startSessionHistoryInlineEdit(session, "category")
                                }
                                className="text-left hover:text-[var(--accent)]"
                              >
                                {session.category || props.t("home.uncategorized")}
                              </button>
                            )}
                          </td>
                          <td className="px-5 py-4 text-sm text-[var(--text-muted)]">
                            {props.sessionHistoryEditing?.sessionId === session.id &&
                            props.sessionHistoryEditing.field === "weekday" ? (
                              <select
                                autoFocus
                                value={props.sessionHistoryEditing.value}
                                onChange={(event) =>
                                  props.setSessionHistoryEditing((prev) =>
                                    prev ? { ...prev, value: event.target.value } : prev,
                                  )
                                }
                                onBlur={() => void props.saveSessionHistoryInlineEdit()}
                                className="w-full rounded-lg border border-[var(--border)] bg-[var(--panel-bg)] px-2 py-1 text-sm text-[var(--text)]"
                              >
                                {[
                                  "monday",
                                  "tuesday",
                                  "wednesday",
                                  "thursday",
                                  "friday",
                                  "saturday",
                                  "sunday",
                                ].map((weekday) => (
                                  <option key={`${session.id}-${weekday}`} value={weekday}>
                                    {props.t(`analytics.weekdays.${weekday}`)}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <button
                                type="button"
                                onClick={() =>
                                  props.startSessionHistoryInlineEdit(session, "weekday")
                                }
                                className="text-left hover:text-[var(--accent)]"
                              >
                                {props.t(`analytics.weekdays.${session.weekday}`)}
                              </button>
                            )}
                          </td>
                          <td className="px-5 py-4 text-sm text-[var(--text)]">
                            {formatHumanDuration(session.effectiveDurationMs)}
                          </td>
                          <td className="px-5 py-4 text-sm text-[var(--text-muted)]">
                            {formatSessionDate(session.startedAt)}
                          </td>
                          <td className="px-5 py-4 text-sm text-[var(--text-muted)]">
                            {formatSessionDate(session.endedAt)}
                          </td>
                          <td className="px-5 py-4 text-sm text-[var(--text-muted)]">
                            <div className="inline-flex items-center gap-2">
                              <span>{session.pauseCount}</span>
                              {isHighInterruptionSession(session) ? (
                                <span className="rounded-full border border-amber-500/30 bg-amber-500/12 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-300">
                                  {props.t("analytics.sessionHistory.indicators.highInterruptions")}
                                </span>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-5 py-4 text-sm text-[var(--text-muted)]">
                            {formatHumanDuration(session.pausedDurationMs)}
                          </td>
                          <td className="px-5 py-4 text-sm">
                            {props.sessionHistoryEditing?.sessionId === session.id &&
                            props.sessionHistoryEditing.field === "energy" ? (
                              <select
                                autoFocus
                                value={props.sessionHistoryEditing.value}
                                onChange={(event) =>
                                  props.setSessionHistoryEditing((prev) =>
                                    prev ? { ...prev, value: event.target.value } : prev,
                                  )
                                }
                                onBlur={() => void props.saveSessionHistoryInlineEdit()}
                                className="w-full rounded-lg border border-[var(--border)] bg-[var(--panel-bg)] px-2 py-1 text-sm text-[var(--text)]"
                              >
                                {(["bad", "regular", "good"] as EnergyLevel[]).map(
                                  (energyValue) => (
                                    <option
                                      key={`${session.id}-${energyValue}`}
                                      value={energyValue}
                                    >
                                      {props.t(`analytics.energy.${energyValue}`)}
                                    </option>
                                  ),
                                )}
                              </select>
                            ) : (
                              <button
                                type="button"
                                onClick={() =>
                                  props.startSessionHistoryInlineEdit(session, "energy")
                                }
                                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${getEnergyBadgeClasses(session.energy)} hover:border-[var(--accent)] hover:text-[var(--accent)]`}
                              >
                                {props.renderMoodFace(session.energy, "h-3.5 w-3.5")}
                                <span>{props.t(`analytics.energy.${session.energy}`)}</span>
                              </button>
                            )}
                          </td>
                          <td className="px-5 py-4 text-right">
                            <button
                              type="button"
                              onClick={() => setSessionPendingDeleteId(session.id)}
                              aria-label={props.t("analytics.sessionHistory.deleteSession")}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-rose-500 transition duration-200 ease-out hover:bg-rose-500/10 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--panel-bg)]"
                            >
                              <svg
                                viewBox="0 0 24 24"
                                className="h-5 w-5"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden="true"
                              >
                                <path d="M3 6h18" />
                                <path d="M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2" />
                                <path d="M19 6l-1 13a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                                <path d="M10 11v6" />
                                <path d="M14 11v6" />
                              </svg>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {props.visibleSessionHistorySessions.length > props.sessionHistoryPageSize ? (
                  <div className="flex items-center justify-center gap-3 border-t border-[var(--border)] px-5 py-4">
                    <button
                      type="button"
                      onClick={() => props.setSessionHistoryPage((prev) => Math.max(1, prev - 1))}
                      disabled={props.sessionHistoryPage <= 1}
                      className="rounded-lg border border-[var(--border)] bg-[var(--panel-bg)] px-3 py-1.5 text-sm text-[var(--text)] transition duration-200 ease-out hover:bg-[var(--panel-muted)] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {props.t("analytics.sessionHistory.pagination.previous")}
                    </button>

                    <span className="text-sm text-[var(--text-muted)]">
                      {props.t("analytics.sessionHistory.pagination.pageStatus", {
                        page: props.sessionHistoryPage,
                        total: props.sessionHistoryTotalPages,
                      })}
                    </span>

                    <button
                      type="button"
                      onClick={() =>
                        props.setSessionHistoryPage((prev) =>
                          Math.min(props.sessionHistoryTotalPages, prev + 1),
                        )
                      }
                      disabled={props.sessionHistoryPage >= props.sessionHistoryTotalPages}
                      className="rounded-lg border border-[var(--border)] bg-[var(--panel-bg)] px-3 py-1.5 text-sm text-[var(--text)] transition duration-200 ease-out hover:bg-[var(--panel-muted)] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {props.t("analytics.sessionHistory.pagination.next")}
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
      )}

      {sessionPendingDelete ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 px-4"
          onClick={() => setSessionPendingDeleteId(null)}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-session-modal-title"
            className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--panel-bg)] p-6 shadow-[0_24px_60px_rgba(15,23,42,0.35)]"
            onClick={(event) => event.stopPropagation()}
          >
            <h3
              id="delete-session-modal-title"
              className="text-lg font-semibold text-[var(--text)]"
            >
              {props.t("analytics.sessionHistory.deleteConfirm.title")}
            </h3>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              {props.t("analytics.sessionHistory.deleteConfirm.description")}
            </p>

            <div className="mt-5 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setSessionPendingDeleteId(null)}
                className="rounded-lg border border-[var(--border)] bg-[var(--panel-bg)] px-4 py-2 text-sm font-medium text-[var(--text)] transition duration-200 ease-out hover:bg-[var(--panel-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40"
                autoFocus
              >
                {props.t("analytics.sessionHistory.deleteConfirm.cancel")}
              </button>
              <button
                type="button"
                onClick={confirmDeletePendingSession}
                className="rounded-lg border border-rose-500/35 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-600 transition duration-200 ease-out hover:bg-rose-500/16 hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/60 dark:text-rose-300 dark:hover:text-rose-200"
              >
                {props.t("analytics.sessionHistory.deleteConfirm.confirm")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
