import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { useTranslation } from "react-i18next";
import logoHeader from "./assets/logo/logoHeader.png";
import { buildAnalyticsSummary } from "./features/analytics/analyticsSummary";
import {
  buildDebugReport,
  clearDebugLogEntries,
  getDebugLogEntries,
  recordCriticalError,
  type DebugLogEntry,
} from "./features/diagnostics/debugLog";
import { createSessionBackup, parseSessionBackup } from "./features/sessions/sessionBackup";
import {
  deleteActiveSession,
  deleteAllCompletedSessions,
  deleteCompletedSession as deleteCompletedSessionFromRepository,
  exportCompletedSessions,
  getCompletedSessions,
  getRecoverableActiveSession,
  importCompletedSessions,
  saveActiveSession,
  saveCompletedSession,
  touchActiveSession,
  updateCompletedSession,
} from "./features/sessions/sessionRepository";
import type {
  ActiveSession,
  CompletedSession,
  EnergyLevel,
  PausePeriod,
} from "./features/sessions/sessionTypes";

type Page = "home" | "analytics" | "settings";
type AnalyticsTab = "dashboard" | "sessionHistory";
type Language = "en" | "es";
type ThemeMode = "light" | "dark";
type BackupFeedbackType = "success" | "error";
type SessionHistoryDurationFilter = "all" | "under30m" | "30mTo1h" | "1hTo2h" | "over2h";
type SessionHistoryPauseFilter = "all" | "withPauses" | "withoutPauses";
type SessionHistorySortKey =
  | "startedAt"
  | "endedAt"
  | "effectiveDurationMs"
  | "pauseCount"
  | "energy";
type SortDirection = "asc" | "desc";
type SessionHistoryEditableField = "title" | "category" | "tags" | "energy" | "weekday";
type SettingsFeedbackType = "success" | "error";

const SESSION_HISTORY_PAGE_SIZE = 8;
const APP_VERSION = "0.1.0";

function parseTags(value: string): string[] {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatHumanDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  if (totalSeconds < 60) {
    return `${totalSeconds} ${totalSeconds === 1 ? "second" : "seconds"}`;
  }

  const totalMinutes = totalSeconds / 60;
  if (totalMinutes < 60) {
    const roundedMinutes = Math.round(totalMinutes);
    return `${roundedMinutes} ${roundedMinutes === 1 ? "minute" : "minutes"}`;
  }

  const totalHours = totalMinutes / 60;
  const roundedHours = totalHours < 10 ? Math.round(totalHours * 10) / 10 : Math.round(totalHours);
  return `${roundedHours} ${roundedHours === 1 ? "hour" : "hours"}`;
}

function formatSessionDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function normalizeSearchValue(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeDuplicateTitle(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function getBackupDefaultFileName(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `chronolytic-session-history-${y}-${m}-${d}.json`;
}

function getPausedDuration(pauses: PausePeriod[], now: number): number {
  return pauses.reduce((acc, pause) => {
    if (pause.endedAt === null) {
      return acc + (now - pause.startedAt);
    }
    return acc + (pause.endedAt - pause.startedAt);
  }, 0);
}

function getEffectiveDuration(session: ActiveSession, now: number): number {
  const total = now - session.startedAt;
  const paused = getPausedDuration(session.pauses, now);
  return Math.max(0, total - paused);
}

function getTimerDisplayNow(session: ActiveSession, now: number): number {
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

function getGreetingKey(date: Date): string {
  const hour = date.getHours();
  if (hour >= 6 && hour < 13) return "home.goodMorning";
  if (hour >= 13 && hour < 21) return "home.goodAfternoon";
  return "home.goodEvening";
}

function getWeekdayFromTimestamp(timestamp: number): string {
  const dayIndex = new Date(timestamp).getDay();
  const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  return weekdays[dayIndex] ?? "monday";
}

function getEnergyIndex(energy: EnergyLevel): number {
  if (energy === "bad") return 0;
  if (energy === "regular") return 1;
  return 2;
}

function getEnergyFromIndex(index: number): EnergyLevel {
  if (index <= 0) return "bad";
  if (index >= 2) return "good";
  return "regular";
}

function getEnergySortValue(energy: EnergyLevel): number {
  if (energy === "bad") return 0;
  if (energy === "regular") return 1;
  return 2;
}

function getEnergyBadgeClasses(energy: EnergyLevel): string {
  if (energy === "bad") {
    return "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-300";
  }

  if (energy === "regular") {
    return "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300";
  }

  return "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300";
}

function isHighInterruptionSession(session: CompletedSession): boolean {
  return session.pauseCount >= 4 || session.pausedDurationMs >= 30 * 60 * 1000;
}

function getStoredLanguage(): Language {
  const value = window.localStorage.getItem("chronolytic.language");
  return value === "es" ? "es" : "en";
}

function getStoredThemeMode(): ThemeMode {
  const value = window.localStorage.getItem("chronolytic.theme");
  return value === "dark" ? "dark" : "light";
}

function App() {
  const { t, i18n } = useTranslation();
  const [activePage, setActivePage] = useState<Page>("home");
  const [isCreateSessionOpen, setIsCreateSessionOpen] = useState<boolean>(false);
  const [language, setLanguage] = useState<Language>(() => getStoredLanguage());
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => getStoredThemeMode());
  const [now, setNow] = useState<number>(Date.now());
  const [title, setTitle] = useState<string>("");
  const [category, setCategory] = useState<string>("");
  const [tagsInput, setTagsInput] = useState<string>("");
  const [energy, setEnergy] = useState<EnergyLevel>("regular");
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
  const [completedSessions, setCompletedSessions] = useState<CompletedSession[]>([]);
  const [categorySuggestionsOpen, setCategorySuggestionsOpen] = useState(false);
  const [tagSuggestionsOpen, setTagSuggestionsOpen] = useState(false);
  const [analyticsTab, setAnalyticsTab] = useState<AnalyticsTab>("dashboard");
  const [recoveryNoticeVisible, setRecoveryNoticeVisible] = useState(false);
  const [isBackupBusy, setIsBackupBusy] = useState(false);
  const [sessionHistorySearch, setSessionHistorySearch] = useState("");
  const [sessionHistoryWeekdayFilter, setSessionHistoryWeekdayFilter] = useState("all");
  const [sessionHistoryEnergyFilter, setSessionHistoryEnergyFilter] = useState("all");
  const [sessionHistoryCategoryFilter, setSessionHistoryCategoryFilter] = useState("all");
  const [sessionHistoryDurationFilter, setSessionHistoryDurationFilter] =
    useState<SessionHistoryDurationFilter>("all");
  const [sessionHistoryPauseFilter, setSessionHistoryPauseFilter] =
    useState<SessionHistoryPauseFilter>("all");
  const [sessionHistorySort, setSessionHistorySort] = useState<{
    key: SessionHistorySortKey;
    direction: SortDirection;
  }>({ key: "endedAt", direction: "desc" });
  const [backupFeedback, setBackupFeedback] = useState<{
    type: BackupFeedbackType;
    message: string;
  } | null>(null);
  const [sessionHistoryEditing, setSessionHistoryEditing] = useState<{
    sessionId: string;
    field: SessionHistoryEditableField;
    value: string;
  } | null>(null);
  const [isSessionHistorySavingEdit, setIsSessionHistorySavingEdit] = useState(false);
  const [sessionHistoryEditError, setSessionHistoryEditError] = useState<string | null>(null);
  const [sessionHistoryPage, setSessionHistoryPage] = useState(1);
  const [isBackupFeedbackVisible, setIsBackupFeedbackVisible] = useState(false);
  const [isAutostartEnabled, setIsAutostartEnabled] = useState(false);
  const [isAutostartLoading, setIsAutostartLoading] = useState(false);
  const [isDeleteAllConfirmOpen, setIsDeleteAllConfirmOpen] = useState(false);
  const [isDeletingAllSessions, setIsDeletingAllSessions] = useState(false);
  const [settingsFeedback, setSettingsFeedback] = useState<{
    type: SettingsFeedbackType;
    message: string;
  } | null>(null);
  const [debugLogEntries, setDebugLogEntries] = useState<DebugLogEntry[]>(() =>
    getDebugLogEntries(),
  );
  const [isDebugActionBusy, setIsDebugActionBusy] = useState(false);
  const [isStartupSessionLoaded, setIsStartupSessionLoaded] = useState(false);
  const [isStartupMinElapsed, setIsStartupMinElapsed] = useState(false);
  const [isStartupLeaving, setIsStartupLeaving] = useState(false);
  const [isStartupComplete, setIsStartupComplete] = useState(false);
  const [isStartingSession, setIsStartingSession] = useState(false);
  const [isFinishingSession, setIsFinishingSession] = useState(false);
  const [isPausingSession, setIsPausingSession] = useState(false);
  const [isResumingSession, setIsResumingSession] = useState(false);
  const [duplicateTitleCandidate, setDuplicateTitleCandidate] = useState<string | null>(null);
  const backupFadeTimeoutRef = useRef<number | null>(null);
  const backupRemoveTimeoutRef = useRef<number | null>(null);

  function logCriticalError(source: string, error: unknown, details?: Record<string, unknown>) {
    recordCriticalError(source, error, details);
    setDebugLogEntries(getDebugLogEntries());
  }

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setIsStartupMinElapsed(true), 500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    window.localStorage.setItem("chronolytic.language", language);
  }, [language]);

  useEffect(() => {
    void i18n.changeLanguage(language);
  }, [language, i18n]);

  useEffect(() => {
    window.localStorage.setItem("chronolytic.theme", themeMode);
    document.documentElement.dataset.theme = themeMode;
  }, [themeMode]);

  useEffect(() => {
    let cancelled = false;

    async function loadSessionState() {
      try {
        const [sessions, recoverableSession] = await Promise.all([
          getCompletedSessions(),
          getRecoverableActiveSession(),
        ]);

        if (!cancelled) {
          setCompletedSessions(sessions);

          if (recoverableSession) {
            const wasAlreadyCompleted = sessions.some(
              (session) => session.id === recoverableSession.id,
            );
            if (wasAlreadyCompleted) {
              await deleteActiveSession(recoverableSession.id);
              return;
            }

            setActiveSession(recoverableSession);
            setRecoveryNoticeVisible(true);
            await saveActiveSession(recoverableSession, Date.now());
          }
        }
      } catch (error) {
        console.error("Failed to load session state from SQLite", {
          error,
          source: "loadSessionState",
        });
        logCriticalError("startup.loadSessionState", error);
      } finally {
        if (!cancelled) {
          setIsStartupSessionLoaded(true);
        }
      }
    }

    void loadSessionState();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!activeSession || activeSession.status !== "running") {
      return;
    }

    const interval = window.setInterval(() => {
      void touchActiveSession(activeSession.id, Date.now()).catch((error) => {
        console.error("Failed to touch active session", {
          error,
          source: "touchActiveSession",
          sessionId: activeSession.id,
        });
        logCriticalError("session.touchActiveSession", error, {
          sessionId: activeSession.id,
        });
      });
    }, 7500);

    return () => {
      window.clearInterval(interval);
    };
  }, [activeSession]);

  useEffect(() => {
    let cancelled = false;

    async function loadAutostartState() {
      try {
        const enabled = await isEnabled();
        if (!cancelled) {
          setIsAutostartEnabled(enabled);
        }
      } catch (error) {
        console.error("Failed to load autostart state", error);
        logCriticalError("settings.loadAutostartState", error);
      }
    }

    void loadAutostartState();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (isStartupSessionLoaded && isStartupMinElapsed) {
      setIsStartupLeaving(true);
    }
  }, [isStartupSessionLoaded, isStartupMinElapsed]);

  useEffect(() => {
    if (!isStartupLeaving) return;
    const timer = setTimeout(() => setIsStartupComplete(true), 300);
    return () => clearTimeout(timer);
  }, [isStartupLeaving]);

  useEffect(() => {
    const onWindowError = (event: ErrorEvent) => {
      const normalizedError = event.error ?? new Error(event.message || "window_error");
      logCriticalError("runtime.windowError", normalizedError, {
        filename: event.filename,
        line: event.lineno,
        column: event.colno,
      });
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      logCriticalError("runtime.unhandledRejection", event.reason);
    };

    window.addEventListener("error", onWindowError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);

    return () => {
      window.removeEventListener("error", onWindowError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, []);

  useEffect(() => {
    if (backupFadeTimeoutRef.current) {
      window.clearTimeout(backupFadeTimeoutRef.current);
      backupFadeTimeoutRef.current = null;
    }

    if (backupRemoveTimeoutRef.current) {
      window.clearTimeout(backupRemoveTimeoutRef.current);
      backupRemoveTimeoutRef.current = null;
    }

    if (!backupFeedback) {
      setIsBackupFeedbackVisible(false);
      return;
    }

    setIsBackupFeedbackVisible(true);
    backupFadeTimeoutRef.current = window.setTimeout(() => {
      setIsBackupFeedbackVisible(false);
    }, 2600);

    backupRemoveTimeoutRef.current = window.setTimeout(() => {
      setBackupFeedback(null);
    }, 3000);

    return () => {
      if (backupFadeTimeoutRef.current) {
        window.clearTimeout(backupFadeTimeoutRef.current);
        backupFadeTimeoutRef.current = null;
      }

      if (backupRemoveTimeoutRef.current) {
        window.clearTimeout(backupRemoveTimeoutRef.current);
        backupRemoveTimeoutRef.current = null;
      }
    };
  }, [backupFeedback]);

  const nowDate = useMemo(() => new Date(now), [now]);
  const greetingKey = useMemo(() => getGreetingKey(nowDate), [nowDate]);

  const effectiveDurationMs = useMemo(() => {
    if (!activeSession) return 0;
    return getEffectiveDuration(activeSession, getTimerDisplayNow(activeSession, now));
  }, [activeSession, now]);

  const usedCategories = useMemo(
    () => [...new Set(completedSessions.map((s) => s.category).filter(Boolean))],
    [completedSessions],
  );

  const currentTagSegment = useMemo(() => {
    const parts = tagsInput.split(",");
    return parts[parts.length - 1]?.trim() || "";
  }, [tagsInput]);

  const filteredCategorySuggestions = useMemo(
    () =>
      category.length > 0
        ? usedCategories.filter(
            (c) =>
              c.toLowerCase() !== category.toLowerCase() &&
              c.toLowerCase().includes(category.toLowerCase()),
          )
        : usedCategories,
    [usedCategories, category],
  );

  const usedTags = useMemo(
    () => [...new Set(completedSessions.flatMap((s) => s.tags))].filter(Boolean),
    [completedSessions],
  );

  const filteredTagSuggestions = useMemo(
    () =>
      currentTagSegment.length > 0
        ? usedTags.filter(
            (t) =>
              t.toLowerCase() !== currentTagSegment.toLowerCase() &&
              t.toLowerCase().includes(currentTagSegment.toLowerCase()),
          )
        : [],
    [usedTags, currentTagSegment],
  );

  const sessionHistorySearchIndex = useMemo(
    () =>
      completedSessions.map((session) => ({
        session,
        searchableText: normalizeSearchValue(
          `${session.title} ${session.category} ${session.tags.join(" ")}`,
        ),
      })),
    [completedSessions],
  );

  const visibleSessionHistorySessions = useMemo(() => {
    const normalizedQuery = normalizeSearchValue(sessionHistorySearch);
    const searchMatched = (
      normalizedQuery
        ? sessionHistorySearchIndex.filter((entry) =>
            entry.searchableText.includes(normalizedQuery),
          )
        : sessionHistorySearchIndex
    ).map((entry) => entry.session);

    const filtered = searchMatched.filter((session) => {
      if (
        sessionHistoryWeekdayFilter !== "all" &&
        session.weekday !== sessionHistoryWeekdayFilter
      ) {
        return false;
      }

      if (sessionHistoryEnergyFilter !== "all" && session.energy !== sessionHistoryEnergyFilter) {
        return false;
      }

      if (
        sessionHistoryCategoryFilter !== "all" &&
        session.category !== sessionHistoryCategoryFilter
      ) {
        return false;
      }

      if (sessionHistoryPauseFilter === "withPauses" && session.pauseCount === 0) {
        return false;
      }

      if (sessionHistoryPauseFilter === "withoutPauses" && session.pauseCount > 0) {
        return false;
      }

      const duration = session.effectiveDurationMs;
      if (sessionHistoryDurationFilter === "under30m" && duration >= 30 * 60 * 1000) {
        return false;
      }
      if (
        sessionHistoryDurationFilter === "30mTo1h" &&
        (duration < 30 * 60 * 1000 || duration >= 60 * 60 * 1000)
      ) {
        return false;
      }
      if (
        sessionHistoryDurationFilter === "1hTo2h" &&
        (duration < 60 * 60 * 1000 || duration >= 2 * 60 * 60 * 1000)
      ) {
        return false;
      }
      if (sessionHistoryDurationFilter === "over2h" && duration < 2 * 60 * 60 * 1000) {
        return false;
      }

      return true;
    });

    return [...filtered].sort((a, b) => {
      const factor = sessionHistorySort.direction === "asc" ? 1 : -1;

      let comparison = 0;
      switch (sessionHistorySort.key) {
        case "startedAt":
          comparison = a.startedAt - b.startedAt;
          break;
        case "endedAt":
          comparison = a.endedAt - b.endedAt;
          break;
        case "effectiveDurationMs":
          comparison = a.effectiveDurationMs - b.effectiveDurationMs;
          break;
        case "pauseCount":
          comparison = a.pauseCount - b.pauseCount;
          break;
        case "energy":
          comparison = getEnergySortValue(a.energy) - getEnergySortValue(b.energy);
          break;
      }

      if (comparison === 0) {
        return b.endedAt - a.endedAt;
      }

      return comparison * factor;
    });
  }, [
    sessionHistorySearch,
    sessionHistorySearchIndex,
    sessionHistoryWeekdayFilter,
    sessionHistoryEnergyFilter,
    sessionHistoryCategoryFilter,
    sessionHistoryPauseFilter,
    sessionHistoryDurationFilter,
    sessionHistorySort,
  ]);

  const hasSessionHistoryQueryOrFilters = useMemo(
    () =>
      normalizeSearchValue(sessionHistorySearch).length > 0 ||
      sessionHistoryWeekdayFilter !== "all" ||
      sessionHistoryEnergyFilter !== "all" ||
      sessionHistoryCategoryFilter !== "all" ||
      sessionHistoryDurationFilter !== "all" ||
      sessionHistoryPauseFilter !== "all",
    [
      sessionHistorySearch,
      sessionHistoryWeekdayFilter,
      sessionHistoryEnergyFilter,
      sessionHistoryCategoryFilter,
      sessionHistoryDurationFilter,
      sessionHistoryPauseFilter,
    ],
  );

  const activeSessionHistoryFilterCount = useMemo(() => {
    let count = 0;
    if (normalizeSearchValue(sessionHistorySearch).length > 0) count += 1;
    if (sessionHistoryWeekdayFilter !== "all") count += 1;
    if (sessionHistoryEnergyFilter !== "all") count += 1;
    if (sessionHistoryCategoryFilter !== "all") count += 1;
    if (sessionHistoryDurationFilter !== "all") count += 1;
    if (sessionHistoryPauseFilter !== "all") count += 1;
    return count;
  }, [
    sessionHistorySearch,
    sessionHistoryWeekdayFilter,
    sessionHistoryEnergyFilter,
    sessionHistoryCategoryFilter,
    sessionHistoryDurationFilter,
    sessionHistoryPauseFilter,
  ]);

  const sessionHistoryTotalPages = useMemo(
    () => Math.max(1, Math.ceil(visibleSessionHistorySessions.length / SESSION_HISTORY_PAGE_SIZE)),
    [visibleSessionHistorySessions.length],
  );

  const paginatedSessionHistorySessions = useMemo(() => {
    const clampedPage = Math.min(sessionHistoryPage, sessionHistoryTotalPages);
    const start = (clampedPage - 1) * SESSION_HISTORY_PAGE_SIZE;
    return visibleSessionHistorySessions.slice(start, start + SESSION_HISTORY_PAGE_SIZE);
  }, [visibleSessionHistorySessions, sessionHistoryPage, sessionHistoryTotalPages]);

  useEffect(() => {
    setSessionHistoryPage(1);
  }, [
    sessionHistorySearch,
    sessionHistoryWeekdayFilter,
    sessionHistoryEnergyFilter,
    sessionHistoryCategoryFilter,
    sessionHistoryDurationFilter,
    sessionHistoryPauseFilter,
    sessionHistorySort,
  ]);

  useEffect(() => {
    if (sessionHistoryPage > sessionHistoryTotalPages) {
      setSessionHistoryPage(sessionHistoryTotalPages);
    }
  }, [sessionHistoryPage, sessionHistoryTotalPages]);

  const canStartSession = title.trim().length > 0 && !activeSession && !isStartingSession;

  function hasDuplicateCompletedTitle(candidate: string): boolean {
    const normalizedCandidate = normalizeDuplicateTitle(candidate);
    if (!normalizedCandidate) return false;

    return completedSessions.some(
      (session) => normalizeDuplicateTitle(session.title) === normalizedCandidate,
    );
  }

  function getAutoRenamedSessionTitle(originalTitle: string): string {
    const trimmed = originalTitle.trim();
    const existingTitles = new Set(
      completedSessions.map((session) => normalizeDuplicateTitle(session.title)),
    );

    let suffix = 2;
    while (true) {
      const candidate = `${trimmed} (${suffix})`;
      if (!existingTitles.has(normalizeDuplicateTitle(candidate))) {
        return candidate;
      }
      suffix += 1;
    }
  }

  async function commitStartSession(finalTitle: string) {
    if (isStartingSession || activeSession) return;

    const startedAt = Date.now();
    const session: ActiveSession = {
      id: crypto.randomUUID(),
      title: finalTitle.trim(),
      category: category.trim(),
      tags: parseTags(tagsInput),
      energy,
      startedAt,
      pauses: [],
      status: "running",
    };

    setIsStartingSession(true);
    try {
      if (activeSession) {
        return;
      }

      await saveActiveSession(session, startedAt);
      setActiveSession(session);
      setNow(startedAt);
      setIsCreateSessionOpen(false);
      setRecoveryNoticeVisible(false);
      setDuplicateTitleCandidate(null);
    } catch (error) {
      console.error("Failed to persist active session on start", {
        error,
        source: "saveActiveSession",
        sessionId: session.id,
      });
      logCriticalError("session.start.saveActiveSession", error, {
        sessionId: session.id,
      });
    } finally {
      setIsStartingSession(false);
    }
  }

  async function requestStartSession() {
    if (!canStartSession || isStartingSession || activeSession) return;

    const trimmedTitle = title.trim();
    if (hasDuplicateCompletedTitle(trimmedTitle)) {
      setDuplicateTitleCandidate(trimmedTitle);
      return;
    }

    await commitStartSession(trimmedTitle);
  }

  async function pauseSession() {
    if (
      !activeSession ||
      activeSession.status !== "running" ||
      isPausingSession ||
      isResumingSession ||
      isStartingSession ||
      isFinishingSession
    ) {
      return;
    }

    const pauseStartedAt = Date.now();
    const nextSession: ActiveSession = {
      ...activeSession,
      status: "paused",
      pauses: [...activeSession.pauses, { startedAt: pauseStartedAt, endedAt: null }],
    };

    setIsPausingSession(true);
    try {
      await saveActiveSession(nextSession, pauseStartedAt);
      setActiveSession(nextSession);
      setNow(pauseStartedAt);
    } catch (error) {
      console.error("Failed to persist active session on pause", {
        error,
        source: "saveActiveSession",
        sessionId: activeSession.id,
      });
      logCriticalError("session.pause.saveActiveSession", error, {
        sessionId: activeSession.id,
      });
    } finally {
      setIsPausingSession(false);
    }
  }

  async function resumeSession() {
    if (
      !activeSession ||
      activeSession.status !== "paused" ||
      isResumingSession ||
      isPausingSession ||
      isStartingSession ||
      isFinishingSession
    ) {
      return;
    }

    const resumedAt = Date.now();
    const pauses = [...activeSession.pauses];
    for (let index = pauses.length - 1; index >= 0; index -= 1) {
      if (pauses[index].endedAt === null) {
        pauses[index] = { ...pauses[index], endedAt: resumedAt };
        break;
      }
    }
    const nextSession: ActiveSession = {
      ...activeSession,
      status: "running",
      pauses,
    };

    setIsResumingSession(true);
    try {
      await saveActiveSession(nextSession, resumedAt);
      setActiveSession(nextSession);
      setNow(resumedAt);
    } catch (error) {
      console.error("Failed to persist active session on resume", {
        error,
        source: "saveActiveSession",
        sessionId: activeSession.id,
      });
      logCriticalError("session.resume.saveActiveSession", error, {
        sessionId: activeSession.id,
      });
    } finally {
      setIsResumingSession(false);
    }
  }

  async function finishSession() {
    if (!activeSession || isFinishingSession) return;
    const sessionBeingFinished = activeSession;
    const endedAt = Date.now();
    const pauses = [...sessionBeingFinished.pauses];
    if (sessionBeingFinished.status === "paused") {
      for (let index = pauses.length - 1; index >= 0; index -= 1) {
        if (pauses[index].endedAt === null) {
          pauses[index] = { ...pauses[index], endedAt };
          break;
        }
      }
    }

    const sessionToSave: ActiveSession = {
      ...sessionBeingFinished,
      pauses,
      status: "running",
    };

    const completed: CompletedSession = {
      id: sessionToSave.id,
      title: sessionToSave.title,
      category: sessionToSave.category,
      tags: sessionToSave.tags,
      energy: sessionToSave.energy,
      startedAt: sessionToSave.startedAt,
      endedAt,
      effectiveDurationMs: getEffectiveDuration(sessionToSave, endedAt),
      pauses,
      pauseCount: pauses.length,
      pausedDurationMs: getPausedDuration(pauses, endedAt),
      weekday: getWeekdayFromTimestamp(sessionToSave.startedAt),
    };

    setIsFinishingSession(true);
    try {
      await saveCompletedSession(completed);
      await deleteActiveSession(completed.id);
      setCompletedSessions((prev) => [completed, ...prev]);
      setActiveSession(null);
      setTitle("");
      setCategory("");
      setTagsInput("");
      setEnergy("regular");
      setIsCreateSessionOpen(false);
      setRecoveryNoticeVisible(false);
    } catch (error) {
      console.error("Failed to save completed session to SQLite", {
        error,
        source: "saveCompletedSession",
        sessionId: completed.id,
        startedAt: completed.startedAt,
        endedAt: completed.endedAt,
        weekday: completed.weekday,
        energy: completed.energy,
      });
      logCriticalError("session.finish.saveCompletedSession", error, {
        sessionId: completed.id,
        startedAt: completed.startedAt,
        endedAt: completed.endedAt,
      });
    } finally {
      setIsFinishingSession(false);
    }
  }

  function renderMoodFace(level: EnergyLevel, className: string) {
    const mouthPath =
      level === "bad"
        ? "M7.5 16c1.4-1.4 2.9-2 4.5-2s3.1.6 4.5 2"
        : level === "good"
          ? "M7.5 14c1.4 1.4 2.9 2 4.5 2s3.1-.6 4.5-2"
          : "M8 15.5h8";

    return (
      <svg
        viewBox="0 0 24 24"
        className={className}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <circle cx="12" cy="12" r="8" />
        <path d="M9.2 10.2h.01M14.8 10.2h.01" strokeLinecap="round" />
        <path d={mouthPath} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  async function discardSession() {
    if (!activeSession) {
      setActiveSession(null);
      setIsCreateSessionOpen(false);
      setRecoveryNoticeVisible(false);
      return;
    }

    try {
      await deleteActiveSession(activeSession.id);
      setActiveSession(null);
      setIsCreateSessionOpen(false);
      setRecoveryNoticeVisible(false);
    } catch (error) {
      console.error("Failed to delete active session on discard", {
        error,
        source: "deleteActiveSession",
        sessionId: activeSession.id,
      });
      logCriticalError("session.discard.deleteActiveSession", error, {
        sessionId: activeSession.id,
      });
    }
  }

  async function deleteCompletedSession(sessionId: string) {
    try {
      await deleteCompletedSessionFromRepository(sessionId);
      setCompletedSessions((prev) => prev.filter((session) => session.id !== sessionId));
    } catch (error) {
      console.error("Failed to delete completed session from SQLite", error);
      logCriticalError("sessionHistory.deleteCompletedSession", error, {
        sessionId,
      });
    }
  }

  function startSessionHistoryInlineEdit(
    session: CompletedSession,
    field: SessionHistoryEditableField,
  ) {
    if (isSessionHistorySavingEdit) return;

    const initialValue =
      field === "tags"
        ? session.tags.join(", ")
        : field === "energy"
          ? session.energy
          : field === "weekday"
            ? session.weekday
            : field === "title"
              ? session.title
              : session.category;

    setSessionHistoryEditError(null);
    setSessionHistoryEditing({
      sessionId: session.id,
      field,
      value: initialValue,
    });
  }

  function cancelSessionHistoryInlineEdit() {
    setSessionHistoryEditing(null);
    setSessionHistoryEditError(null);
  }

  async function saveSessionHistoryInlineEdit() {
    if (!sessionHistoryEditing || isSessionHistorySavingEdit) return;

    const target = completedSessions.find(
      (session) => session.id === sessionHistoryEditing.sessionId,
    );
    if (!target) {
      cancelSessionHistoryInlineEdit();
      return;
    }

    const rawValue = sessionHistoryEditing.value;
    const trimmedValue = rawValue.trim();
    const field = sessionHistoryEditing.field;

    const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

    const nextSession: CompletedSession = { ...target };

    if (field === "title") {
      if (trimmedValue.length === 0) {
        setSessionHistoryEditError(t("analytics.sessionHistory.inlineEdit.invalidTitle"));
        return;
      }
      nextSession.title = trimmedValue;
    }

    if (field === "category") {
      nextSession.category = trimmedValue;
    }

    if (field === "tags") {
      nextSession.tags = parseTags(rawValue);
    }

    if (field === "energy") {
      if (trimmedValue !== "bad" && trimmedValue !== "regular" && trimmedValue !== "good") {
        setSessionHistoryEditError(t("analytics.sessionHistory.inlineEdit.invalidEnergy"));
        return;
      }
      nextSession.energy = trimmedValue;
    }

    if (field === "weekday") {
      const normalizedWeekday = trimmedValue.toLowerCase();
      if (!weekdays.includes(normalizedWeekday)) {
        setSessionHistoryEditError(t("analytics.sessionHistory.inlineEdit.invalidWeekday"));
        return;
      }
      nextSession.weekday = normalizedWeekday;
    }

    setIsSessionHistorySavingEdit(true);
    setSessionHistoryEditError(null);

    try {
      await updateCompletedSession(nextSession);
      setCompletedSessions((prev) =>
        prev.map((session) => (session.id === nextSession.id ? nextSession : session)),
      );
      setSessionHistoryEditing(null);
    } catch (error) {
      console.error("Failed to update completed session", error);
      logCriticalError("sessionHistory.updateCompletedSession", error, {
        sessionId: nextSession.id,
      });
      setSessionHistoryEditError(t("analytics.sessionHistory.inlineEdit.saveError"));
    } finally {
      setIsSessionHistorySavingEdit(false);
    }
  }

  function handleSessionHistoryInlineEditKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      void saveSessionHistoryInlineEdit();
    }

    if (event.key === "Escape") {
      event.preventDefault();
      cancelSessionHistoryInlineEdit();
    }
  }

  async function handleExportBackup() {
    if (completedSessions.length === 0 || isBackupBusy) return;

    setIsBackupBusy(true);
    setBackupFeedback(null);

    try {
      const selectedPath = await save({
        title: t("analytics.sessionHistory.backup.exportDialogTitle"),
        defaultPath: getBackupDefaultFileName(),
        filters: [{ name: "JSON", extensions: ["json"] }],
      });

      if (!selectedPath) {
        return;
      }

      const sessions = await exportCompletedSessions();
      const backup = createSessionBackup(sessions);
      await writeTextFile(selectedPath, JSON.stringify(backup, null, 2));

      setBackupFeedback({
        type: "success",
        message: t("analytics.sessionHistory.backup.exportSuccess", {
          count: sessions.length,
        }),
      });
    } catch (error) {
      console.error("Failed to export session backup", error);
      logCriticalError("backup.export", error);
      setBackupFeedback({
        type: "error",
        message: t("analytics.sessionHistory.backup.exportError"),
      });
    } finally {
      setIsBackupBusy(false);
    }
  }

  async function handleImportBackup() {
    if (completedSessions.length > 0 || isBackupBusy) return;

    setIsBackupBusy(true);
    setBackupFeedback(null);

    try {
      const selectedPath = await open({
        title: t("analytics.sessionHistory.backup.importDialogTitle"),
        multiple: false,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });

      if (!selectedPath || Array.isArray(selectedPath)) {
        return;
      }

      const backupContent = await readTextFile(selectedPath);
      const parsedSessions = parseSessionBackup(backupContent);

      if (parsedSessions.length === 0) {
        setBackupFeedback({
          type: "error",
          message: t("analytics.sessionHistory.backup.emptyBackupError"),
        });
        return;
      }

      const result = await importCompletedSessions(parsedSessions);
      const reloadedSessions = await getCompletedSessions();
      setCompletedSessions(reloadedSessions);

      if (result.importedCount === 0) {
        setBackupFeedback({
          type: "error",
          message: t("analytics.sessionHistory.backup.duplicateOnlyError"),
        });
        return;
      }

      setBackupFeedback({
        type: "success",
        message:
          result.skippedDuplicateCount > 0
            ? t("analytics.sessionHistory.backup.importSuccessWithSkipped", {
                imported: result.importedCount,
                skipped: result.skippedDuplicateCount,
              })
            : t("analytics.sessionHistory.backup.importSuccess", {
                count: result.importedCount,
              }),
      });
    } catch (error) {
      console.error("Failed to import session backup", error);
      logCriticalError("backup.import", error);
      setBackupFeedback({
        type: "error",
        message: t("analytics.sessionHistory.backup.importError"),
      });
    } finally {
      setIsBackupBusy(false);
    }
  }

  async function handleToggleAutostart() {
    if (isAutostartLoading) return;

    setIsAutostartLoading(true);

    try {
      const currentlyEnabled = await isEnabled();

      if (currentlyEnabled) {
        await disable();
      } else {
        await enable();
      }

      const nextEnabled = await isEnabled();
      setIsAutostartEnabled(nextEnabled);
    } catch (error) {
      console.error("Failed to toggle autostart", error);
      logCriticalError("settings.toggleAutostart", error);
      setSettingsFeedback({
        type: "error",
        message: t("settings.startupError"),
      });
    } finally {
      setIsAutostartLoading(false);
    }
  }

  async function handleConfirmDeleteAllSessions() {
    if (isDeletingAllSessions) return;

    setIsDeletingAllSessions(true);
    setSettingsFeedback(null);

    try {
      await deleteAllCompletedSessions();
      setCompletedSessions([]);
      setSessionHistorySearch("");
      setSessionHistoryWeekdayFilter("all");
      setSessionHistoryEnergyFilter("all");
      setSessionHistoryCategoryFilter("all");
      setSessionHistoryDurationFilter("all");
      setSessionHistoryPauseFilter("all");
      setSessionHistorySort({ key: "endedAt", direction: "desc" });
      setSessionHistoryEditing(null);
      setSessionHistoryEditError(null);
      setSessionHistoryPage(1);
      setBackupFeedback(null);
      setIsDeleteAllConfirmOpen(false);
    } catch (error) {
      console.error("Failed to delete all completed sessions", error);
      logCriticalError("settings.deleteAllSessions", error);
      setSettingsFeedback({
        type: "error",
        message: t("settings.deleteAllSessionsError"),
      });
    } finally {
      setIsDeletingAllSessions(false);
    }
  }

  function handleSessionHistorySort(nextKey: SessionHistorySortKey) {
    setSessionHistorySort((prev) =>
      prev.key === nextKey
        ? { ...prev, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { key: nextKey, direction: "desc" },
    );
  }

  function resetSessionHistoryView() {
    setSessionHistorySearch("");
    setSessionHistoryWeekdayFilter("all");
    setSessionHistoryEnergyFilter("all");
    setSessionHistoryCategoryFilter("all");
    setSessionHistoryDurationFilter("all");
    setSessionHistoryPauseFilter("all");
    setSessionHistorySort({ key: "endedAt", direction: "desc" });
  }

  async function handleCopyDebugInfo() {
    if (isDebugActionBusy) return;
    setIsDebugActionBusy(true);
    try {
      const entries = getDebugLogEntries();
      const report = buildDebugReport(entries, {
        appVersion: APP_VERSION,
        platform: navigator.platform,
        userAgent: navigator.userAgent,
      });
      await navigator.clipboard.writeText(report);
    } catch (error) {
      console.error("Failed to copy debug report", error);
      logCriticalError("settings.debug.copy", error);
      setSettingsFeedback({
        type: "error",
        message: t("settings.debug.copyError"),
      });
    } finally {
      setIsDebugActionBusy(false);
    }
  }

  function handleClearDebugLogs() {
    clearDebugLogEntries();
    setDebugLogEntries([]);
    setSettingsFeedback({
      type: "success",
      message: t("settings.debug.clearSuccess"),
    });
  }

  async function handleExportDebugReport() {
    if (isDebugActionBusy) return;
    setIsDebugActionBusy(true);
    try {
      const selectedPath = await save({
        title: t("settings.debug.export"),
        defaultPath: `chronolytic-debug-${new Date().toISOString().slice(0, 10)}.txt`,
        filters: [{ name: "Text", extensions: ["txt"] }],
      });

      if (!selectedPath) return;

      const entries = getDebugLogEntries();
      const report = buildDebugReport(entries, {
        appVersion: APP_VERSION,
        platform: navigator.platform,
        userAgent: navigator.userAgent,
      });
      await writeTextFile(selectedPath, report);
      setSettingsFeedback({
        type: "success",
        message: t("settings.debug.exportSuccess"),
      });
    } catch (error) {
      console.error("Failed to export debug report", error);
      logCriticalError("settings.debug.export", error);
      setSettingsFeedback({
        type: "error",
        message: t("settings.debug.exportError"),
      });
    } finally {
      setIsDebugActionBusy(false);
    }
  }

  function getSortIndicator(sortKey: SessionHistorySortKey): string {
    if (sessionHistorySort.key !== sortKey) return "";
    return sessionHistorySort.direction === "asc" ? "↑" : "↓";
  }

  function renderHeader() {
    return (
      <header className="flex h-20 shrink-0 items-center justify-between border-b border-[var(--border)] bg-[var(--panel-bg)] px-7">
        <div className="flex items-center">
          <img src={logoHeader} alt={t("app.name")} className="h-32 w-auto object-contain" />
        </div>
        <div className="h-10 w-10" aria-hidden="true" />
      </header>
    );
  }

  function renderCreateSessionModal() {
    if (!isCreateSessionOpen) return null;

    return (
      <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/45 p-6">
        <div className="w-full max-w-xl rounded-2xl border border-[var(--border)] bg-[var(--panel-bg)] p-6 shadow-2xl">
          <h2 className="text-lg font-semibold text-[var(--text)]">{t("sessionModal.title")}</h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">{t("sessionModal.description")}</p>

          <div className="mt-5 grid gap-4">
            <label className="flex flex-col gap-2 text-sm text-[var(--text-muted)]">
              <span className="flex items-center gap-1">
                {t("sessionModal.sessionTitle")}
                <span className="text-[var(--accent)]">*</span>
              </span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="rounded-xl border border-[var(--border)] bg-[var(--panel-muted)] px-3 py-2 text-sm text-[var(--text)] outline-none ring-[var(--accent)] transition focus:ring"
                placeholder={t("sessionModal.titlePlaceholder")}
              />
            </label>

            <label className="relative flex flex-col gap-2 text-sm text-[var(--text-muted)]">
              {t("sessionModal.category")}
              <input
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                onFocus={() => setCategorySuggestionsOpen(true)}
                onBlur={() => setTimeout(() => setCategorySuggestionsOpen(false), 150)}
                className="rounded-xl border border-[var(--border)] bg-[var(--panel-muted)] px-3 py-2 text-sm text-[var(--text)] outline-none ring-[var(--accent)] transition focus:ring"
                placeholder={t("sessionModal.categoryPlaceholder")}
              />
              {categorySuggestionsOpen && filteredCategorySuggestions.length > 0 && (
                <ul className="absolute top-full left-0 right-0 z-10 mt-1 max-h-40 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--panel-bg)] shadow-lg">
                  {filteredCategorySuggestions.map((s) => (
                    <li
                      key={s}
                      className="cursor-pointer px-3 py-2 text-sm text-[var(--text)] hover:bg-[var(--panel-muted)]"
                      onMouseDown={() => {
                        setCategory(s);
                        setCategorySuggestionsOpen(false);
                      }}
                    >
                      {s}
                    </li>
                  ))}
                </ul>
              )}
            </label>

            <label className="relative flex flex-col gap-2 text-sm text-[var(--text-muted)]">
              {t("sessionModal.tags")}
              <input
                value={tagsInput}
                onChange={(event) => setTagsInput(event.target.value)}
                onFocus={() => setTagSuggestionsOpen(true)}
                onBlur={() => setTimeout(() => setTagSuggestionsOpen(false), 150)}
                className="rounded-xl border border-[var(--border)] bg-[var(--panel-muted)] px-3 py-2 text-sm text-[var(--text)] outline-none ring-[var(--accent)] transition focus:ring"
                placeholder={t("sessionModal.tagsPlaceholder")}
              />
              {tagSuggestionsOpen && filteredTagSuggestions.length > 0 && (
                <ul className="absolute top-full left-0 right-0 z-10 mt-1 max-h-40 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--panel-bg)] shadow-lg">
                  {filteredTagSuggestions.map((t) => (
                    <li
                      key={t}
                      className="cursor-pointer px-3 py-2 text-sm text-[var(--text)] hover:bg-[var(--panel-muted)]"
                      onMouseDown={() => {
                        const parts = tagsInput.split(",");
                        parts[parts.length - 1] = t;
                        setTagsInput(parts.join(", ").replace(/,\s*$/, "").replace(/,\s*,/g, ","));
                        setTagSuggestionsOpen(false);
                      }}
                    >
                      {t}
                    </li>
                  ))}
                </ul>
              )}
            </label>

            <div className="flex flex-col gap-2 text-sm text-[var(--text-muted)]">
              <span>{t("sessionModal.energy")}</span>
              <span className="text-xs text-[var(--text-muted)]/90">
                {t("sessionModal.energyDescription")}
              </span>
              <div
                role="radiogroup"
                aria-label={t("sessionModal.energy")}
                className="rounded-xl border border-[var(--border)] bg-[var(--panel-muted)] p-3"
              >
                <div className="relative mx-1 h-12 overflow-hidden">
                  <div className="absolute left-0 right-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-[var(--panel-bg)]" />
                  <div className="pointer-events-none absolute inset-0 grid grid-cols-3 items-center">
                    <div
                      className="flex justify-center transition-transform duration-300 ease-out"
                      style={{ transform: `translateX(${getEnergyIndex(energy) * 100}%)` }}
                    >
                      <div className="h-8 w-8 rounded-full bg-[var(--accent)] shadow-md" />
                    </div>
                  </div>
                  <div className="absolute inset-0 grid grid-cols-3 items-center">
                    {(["bad", "regular", "good"] as EnergyLevel[]).map((level) => {
                      const selected = energy === level;
                      return (
                        <button
                          key={level}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          aria-label={t(`sessionModal.energyOptions.${level}`)}
                          onClick={() => setEnergy(level)}
                          onKeyDown={(event) => {
                            if (event.key === "ArrowRight") {
                              event.preventDefault();
                              setEnergy((prev) => getEnergyFromIndex(getEnergyIndex(prev) + 1));
                            }
                            if (event.key === "ArrowLeft") {
                              event.preventDefault();
                              setEnergy((prev) => getEnergyFromIndex(getEnergyIndex(prev) - 1));
                            }
                          }}
                          className={`z-10 mx-auto flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
                            selected ? "text-white" : "text-[var(--text-muted)]"
                          }`}
                        >
                          {renderMoodFace(level, "h-5 w-5")}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-3 text-center text-xs">
                  <span>{t("sessionModal.energyOptions.bad")}</span>
                  <span>{t("sessionModal.energyOptions.regular")}</span>
                  <span>{t("sessionModal.energyOptions.good")}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setIsCreateSessionOpen(false)}
              disabled={isStartingSession}
              className="rounded-xl border border-[var(--border)] bg-[var(--panel-muted)] px-4 py-2 text-sm font-medium text-[var(--text-muted)] hover:opacity-90"
            >
              {t("sessionModal.cancel")}
            </button>
            <button
              type="button"
              onClick={() => void requestStartSession()}
              disabled={!canStartSession}
              className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isStartingSession ? t("sessionModal.starting") : t("sessionModal.start")}
            </button>
          </div>
        </div>

        {duplicateTitleCandidate ? (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/45 p-6">
            <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--panel-bg)] p-6 shadow-2xl">
              <h3 className="text-lg font-semibold text-[var(--text)]">
                {t("sessionModal.duplicateTitle.title")}
              </h3>
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                {t("sessionModal.duplicateTitle.description", { title: duplicateTitleCandidate })}
              </p>
              <div className="mt-6 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDuplicateTitleCandidate(null)}
                  disabled={isStartingSession}
                  className="rounded-xl border border-[var(--border)] bg-[var(--panel-muted)] px-3 py-2 text-sm font-medium text-[var(--text-muted)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {t("sessionModal.duplicateTitle.cancel")}
                </button>
                <button
                  type="button"
                  onClick={() => void commitStartSession(duplicateTitleCandidate)}
                  disabled={isStartingSession}
                  className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {t("sessionModal.duplicateTitle.createAnyway")}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void commitStartSession(getAutoRenamedSessionTitle(duplicateTitleCandidate))
                  }
                  disabled={isStartingSession}
                  className="rounded-xl bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {t("sessionModal.duplicateTitle.autoRename")}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  function renderHome() {
    return (
      <section className="relative flex h-full flex-col px-10 py-9 lg:px-12 lg:py-10">
        <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center text-center">
          {recoveryNoticeVisible ? (
            <div className="mb-5 w-full max-w-3xl rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <div className="flex items-center justify-between gap-3">
                <p>{t("home.recoveredPausedSession")}</p>
                <button
                  type="button"
                  onClick={() => setRecoveryNoticeVisible(false)}
                  className="rounded-lg border border-amber-300 bg-amber-100 px-2 py-1 text-xs font-medium text-amber-900 hover:bg-amber-200"
                >
                  {t("home.dismissRecoveryNotice")}
                </button>
              </div>
            </div>
          ) : null}

          <p className="text-2xl font-medium text-[var(--text-muted)] lg:text-3xl">
            {t(greetingKey)}
          </p>
          <p className="mt-1.5 text-lg text-[var(--text-muted)] lg:text-xl">
            {nowDate.toLocaleDateString(undefined, {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}{" "}
            - {nowDate.toLocaleTimeString()}
          </p>

          <div className="mt-12 rounded-[1.75rem] border border-[var(--border)] bg-[var(--panel-bg)] px-12 py-10 shadow-[0_10px_30px_rgba(15,23,42,0.06)] lg:mt-14 lg:px-14 lg:py-12">
            <p className="text-base font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)] lg:text-lg">
              {t("home.activeSessionTimer")}
            </p>
            <p className="mt-4 text-[4.2rem] leading-none font-semibold tracking-tight text-[var(--text)] lg:text-[6rem]">
              {activeSession ? formatDuration(effectiveDurationMs) : "00:00:00"}
            </p>
            <div className="mt-5 flex items-center justify-center gap-2.5">
              <span
                className={`rounded-full px-4 py-1.5 text-base font-medium lg:px-5 lg:py-2 lg:text-lg ${
                  activeSession?.status === "running"
                    ? "bg-emerald-100 text-emerald-700"
                    : activeSession?.status === "paused"
                      ? "bg-amber-100 text-amber-700"
                      : "bg-[var(--panel-muted)] text-[var(--text-muted)]"
                }`}
              >
                {activeSession
                  ? activeSession.status === "running"
                    ? t("home.statusRunning")
                    : t("home.statusPaused")
                  : t("home.noActiveSession")}
              </span>
            </div>
            {activeSession ? (
              <div className="mt-4 text-base text-[var(--text-muted)]">
                <p className="font-medium text-[var(--text)]">{activeSession.title}</p>
                <p>{activeSession.category || t("home.uncategorized")}</p>
                {activeSession.tags.length > 0 ? (
                  <div className="mt-2 flex flex-wrap justify-center gap-2">
                    {activeSession.tags.map((tag) => (
                      <span
                        key={`${activeSession.id}-active-${tag}`}
                        className="rounded-full border border-[var(--border)] px-2 py-0.5 text-sm text-[var(--text-muted)]"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="mt-10 flex min-h-16 flex-wrap items-center justify-center gap-4 lg:mt-12 lg:gap-5">
            {!activeSession ? (
              <button
                type="button"
                onClick={() => setIsCreateSessionOpen(true)}
                className="rounded-full bg-gradient-to-r from-[#4E89FF] to-[#5F8FFF] px-10 py-4 text-xl font-semibold text-white shadow-[0_10px_24px_rgba(78,137,255,0.34)] transition duration-200 ease-out hover:scale-[1.02] hover:from-[#5B93FF] hover:to-[#6D9BFF] hover:shadow-[0_14px_30px_rgba(78,137,255,0.42)] active:scale-[0.98] lg:px-12 lg:py-5 lg:text-2xl"
              >
                {t("home.createSession")}
              </button>
            ) : null}

            {activeSession?.status === "running" ? (
              <button
                type="button"
                onClick={pauseSession}
                disabled={
                  isPausingSession || isResumingSession || isStartingSession || isFinishingSession
                }
                className="rounded-xl border border-[var(--border)] bg-[var(--panel-bg)] px-5 py-2.5 text-base font-medium text-[var(--text)] transition duration-200 ease-out hover:-translate-y-0.5 hover:bg-[var(--panel-muted)] hover:opacity-95 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {t("home.pause")}
              </button>
            ) : null}

            {activeSession?.status === "paused" ? (
              <button
                type="button"
                onClick={resumeSession}
                disabled={
                  isResumingSession || isPausingSession || isStartingSession || isFinishingSession
                }
                className="rounded-xl border border-[var(--border)] bg-[var(--panel-bg)] px-5 py-2.5 text-base font-medium text-[var(--text)] transition duration-200 ease-out hover:-translate-y-0.5 hover:bg-[var(--panel-muted)] hover:opacity-95 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {t("home.resume")}
              </button>
            ) : null}

            {activeSession ? (
              <>
                <button
                  type="button"
                  onClick={finishSession}
                  disabled={isFinishingSession}
                  className="rounded-xl border border-emerald-300 bg-emerald-50 px-5 py-2.5 text-base font-medium text-emerald-800 transition duration-200 ease-out hover:-translate-y-0.5 hover:bg-emerald-100 hover:opacity-95 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isFinishingSession ? t("home.finishing") : t("home.finish")}
                </button>

                <button
                  type="button"
                  onClick={discardSession}
                  className="rounded-xl border border-rose-300 bg-rose-50 px-5 py-2.5 text-base font-medium text-rose-800 transition duration-200 ease-out hover:-translate-y-0.5 hover:bg-rose-100 hover:opacity-95 active:translate-y-0"
                >
                  {t("home.discard")}
                </button>
              </>
            ) : null}
          </div>
        </div>

        {renderCreateSessionModal()}
      </section>
    );
  }

  function renderAnalyticsPage() {
    const analyticsTabs: Array<{ key: AnalyticsTab; label: string }> = [
      { key: "dashboard", label: t("analytics.tabs.dashboard") },
      { key: "sessionHistory", label: t("analytics.tabs.sessionHistory") },
    ];

    const summary = buildAnalyticsSummary(completedSessions, t("home.uncategorized"));

    const maxCategoryMs = Math.max(
      ...summary.effectiveByCategory.map((item) => item.effectiveMs),
      1,
    );
    const maxWeekdayMs = Math.max(...summary.effectiveByWeekday.map((item) => item.effectiveMs), 1);
    const maxEnergyCount = Math.max(...summary.sessionsByEnergy.map((item) => item.count), 1);
    const maxCompareMs = Math.max(...summary.effectiveVsPaused.map((item) => item.valueMs), 1);
    const maxTimeSlotMs = Math.max(
      ...summary.effectiveByTimeSlot.map((item) => item.effectiveMs),
      1,
    );
    const maxEnergyInterruptPausedMs = Math.max(
      ...summary.energyInterruptionStats.map((item) => item.averagePausedMs),
      1,
    );

    const formatPercentage = (value: number): string => `${Math.round(value * 100)}%`;

    return (
      <section className="flex h-full flex-col">
        <div className="border-b border-[var(--border)] bg-[var(--panel-bg)] px-8">
          <nav className="mx-auto flex w-full max-w-4xl items-stretch">
            {analyticsTabs.map((tab) => {
              const isActive = analyticsTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setAnalyticsTab(tab.key)}
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

        {analyticsTab === "dashboard" ? (
          <div className="px-8 py-8">
            {completedSessions.length === 0 ? (
              <div className="w-full rounded-2xl border border-[var(--border)] bg-[var(--panel-bg)] px-6 py-14 text-center shadow-[0_8px_28px_rgba(15,23,42,0.06)]">
                <h2 className="text-2xl font-semibold text-[var(--text)]">
                  {t("analytics.dashboard.emptyTitle")}
                </h2>
                <p className="mt-3 text-base text-[var(--text-muted)]">
                  {t("analytics.dashboard.emptyDescription")}
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
                  {[
                    {
                      label: t("analytics.dashboard.kpis.totalEffectiveTime"),
                      value: formatHumanDuration(summary.totalEffectiveMs),
                    },
                    {
                      label: t("analytics.dashboard.kpis.totalPausedTime"),
                      value: formatHumanDuration(summary.totalPausedMs),
                    },
                    {
                      label: t("analytics.dashboard.kpis.completedSessions"),
                      value: String(summary.completedCount),
                    },
                    {
                      label: t("analytics.dashboard.kpis.totalPauseCount"),
                      value: String(summary.totalPauseCount),
                    },
                    {
                      label: t("analytics.dashboard.kpis.averageSessionDuration"),
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
                      {t("analytics.dashboard.kpis.focusRatio")}
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
                      {t("analytics.dashboard.kpis.interruptionRatio")}
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
                      {t("analytics.dashboard.kpis.mostProductiveCategory")}
                    </p>
                    <p className="mt-2 truncate text-lg font-semibold text-[var(--text)]">
                      {summary.mostProductiveCategory?.category ??
                        t("analytics.dashboard.emptyMetric")}
                    </p>
                    <p className="mt-1 text-sm text-[var(--text-muted)]">
                      {summary.mostProductiveCategory
                        ? formatHumanDuration(summary.mostProductiveCategory.effectiveMs)
                        : "-"}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel-bg)] p-4 shadow-[0_8px_22px_rgba(15,23,42,0.06)]">
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                      {t("analytics.dashboard.kpis.bestTimeSlot")}
                    </p>
                    <p className="mt-2 text-lg font-semibold text-[var(--text)]">
                      {summary.bestTimeSlot
                        ? t(`analytics.dashboard.timeSlots.${summary.bestTimeSlot.slot}`)
                        : t("analytics.dashboard.emptyMetric")}
                    </p>
                    <p className="mt-1 text-sm text-[var(--text-muted)]">
                      {summary.bestTimeSlot
                        ? formatHumanDuration(summary.bestTimeSlot.effectiveMs)
                        : "-"}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel-bg)] p-4 shadow-[0_8px_22px_rgba(15,23,42,0.06)]">
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                      {t("analytics.dashboard.kpis.mostInterruptedSession")}
                    </p>
                    <p className="mt-2 truncate text-lg font-semibold text-[var(--text)]">
                      {summary.mostInterruptedSession?.title ??
                        t("analytics.dashboard.emptyMetric")}
                    </p>
                    <p className="mt-1 text-sm text-[var(--text-muted)]">
                      {summary.mostInterruptedSession
                        ? `${summary.mostInterruptedSession.pauseCount} · ${formatHumanDuration(summary.mostInterruptedSession.pausedDurationMs)}`
                        : "-"}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel-bg)] p-5 shadow-[0_8px_22px_rgba(15,23,42,0.06)]">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                      {t("analytics.dashboard.charts.effectiveByCategory")}
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
                      {t("analytics.dashboard.charts.effectiveByWeekday")}
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
                            {t(`analytics.weekdays.${item.weekday}`).slice(0, 3)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel-bg)] p-5 shadow-[0_8px_22px_rgba(15,23,42,0.06)]">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                      {t("analytics.dashboard.charts.effectiveVsPaused")}
                    </h3>
                    <div className="mt-4 space-y-4">
                      {summary.effectiveVsPaused.map((item) => (
                        <div key={item.key}>
                          <div className="mb-1.5 flex items-center justify-between text-sm">
                            <span className="text-[var(--text)]">
                              {item.key === "effective"
                                ? t("analytics.dashboard.series.effective")
                                : t("analytics.dashboard.series.paused")}
                            </span>
                            <span className="text-[var(--text-muted)]">
                              {formatHumanDuration(item.valueMs)}
                            </span>
                          </div>
                          <div className="h-2 rounded-full bg-[var(--panel-muted)]">
                            <div
                              className={`h-2 rounded-full ${item.key === "effective" ? "bg-[#4E89FF]" : "bg-amber-500"}`}
                              style={{ width: `${(item.valueMs / maxCompareMs) * 100}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel-bg)] p-5 shadow-[0_8px_22px_rgba(15,23,42,0.06)]">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                      {t("analytics.dashboard.charts.sessionsByEnergy")}
                    </h3>
                    <div className="mt-4 space-y-3">
                      {summary.sessionsByEnergy.map((item) => (
                        <div key={item.energy}>
                          <div className="mb-1.5 flex items-center justify-between text-sm">
                            <span className="inline-flex items-center gap-1.5 text-[var(--text)]">
                              {renderMoodFace(item.energy, "h-4 w-4")}
                              {t(`analytics.energy.${item.energy}`)}
                            </span>
                            <span className="text-[var(--text-muted)]">{item.count}</span>
                          </div>
                          <div className="h-2 rounded-full bg-[var(--panel-muted)]">
                            <div
                              className="h-2 rounded-full bg-[var(--accent)]"
                              style={{ width: `${(item.count / maxEnergyCount) * 100}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel-bg)] p-5 shadow-[0_8px_22px_rgba(15,23,42,0.06)]">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                      {t("analytics.dashboard.charts.energyInterruptions")}
                    </h3>
                    <div className="mt-4 space-y-4">
                      {summary.energyInterruptionStats.map((item) => (
                        <div key={`${item.energy}-interruptions`}>
                          <div className="mb-1.5 flex items-center justify-between text-sm">
                            <span className="inline-flex items-center gap-1.5 text-[var(--text)]">
                              {renderMoodFace(item.energy, "h-4 w-4")}
                              {t(`analytics.energy.${item.energy}`)}
                            </span>
                            <span className="text-[var(--text-muted)]">
                              {t("analytics.dashboard.series.averagePauseCount")}:{" "}
                              {item.averagePauseCount.toFixed(1)}
                            </span>
                          </div>
                          <div className="mb-1 text-xs text-[var(--text-muted)]">
                            {t("analytics.dashboard.series.averagePausedTime")}:{" "}
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
                      {t("analytics.dashboard.charts.effectiveByTimeSlot")}
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
                            {t(`analytics.dashboard.timeSlots.${item.slot}`)}
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
                    {t("analytics.dashboard.latest.title")}
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
                            {session.category || t("home.uncategorized")}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-[var(--text-muted)]">
                          <span>{formatHumanDuration(session.effectiveDurationMs)}</span>
                          <span>{t(`analytics.weekdays.${session.weekday}`)}</span>
                          <span className="inline-flex items-center gap-1">
                            {renderMoodFace(session.energy, "h-3.5 w-3.5")}
                            {t(`analytics.energy.${session.energy}`)}
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
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-[var(--text)]">
                {t("analytics.tabs.sessionHistory")}
              </h2>

              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                {completedSessions.length > 0 ? (
                  <div className="w-full sm:w-80">
                    <label className="sr-only" htmlFor="session-history-search">
                      {t("analytics.sessionHistory.searchLabel")}
                    </label>
                    <input
                      id="session-history-search"
                      type="text"
                      value={sessionHistorySearch}
                      onChange={(event) => setSessionHistorySearch(event.target.value)}
                      placeholder={t("analytics.sessionHistory.searchPlaceholder")}
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--panel-bg)] px-3 py-2 text-sm text-[var(--text)] outline-none ring-[var(--accent)] transition focus:ring"
                    />
                  </div>
                ) : null}

                {completedSessions.length > 0 ? (
                  <button
                    type="button"
                    onClick={handleExportBackup}
                    disabled={isBackupBusy}
                    className="rounded-xl border border-[var(--border)] bg-[var(--panel-bg)] px-4 py-2 text-sm font-medium text-[var(--text)] transition duration-200 ease-out hover:bg-[var(--panel-muted)] disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    {isBackupBusy
                      ? t("analytics.sessionHistory.backup.processing")
                      : t("analytics.sessionHistory.backup.export")}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleImportBackup}
                    disabled={isBackupBusy}
                    className="rounded-xl border border-[var(--border)] bg-[var(--panel-bg)] px-4 py-2 text-sm font-medium text-[var(--text)] transition duration-200 ease-out hover:bg-[var(--panel-muted)] disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    {isBackupBusy
                      ? t("analytics.sessionHistory.backup.processing")
                      : t("analytics.sessionHistory.backup.import")}
                  </button>
                )}
              </div>
            </div>

            {completedSessions.length > 0 ? (
              <div className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--panel-bg)] p-3">
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-6">
                  <select
                    value={sessionHistoryWeekdayFilter}
                    onChange={(event) => setSessionHistoryWeekdayFilter(event.target.value)}
                    className="rounded-lg border border-[var(--border)] bg-[var(--panel-bg)] px-3 py-2 text-sm text-[var(--text)]"
                    aria-label={t("analytics.sessionHistory.filters.weekday")}
                  >
                    <option value="all">{t("analytics.sessionHistory.filters.allWeekdays")}</option>
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
                        {t(`analytics.weekdays.${weekday}`)}
                      </option>
                    ))}
                  </select>

                  <select
                    value={sessionHistoryEnergyFilter}
                    onChange={(event) => setSessionHistoryEnergyFilter(event.target.value)}
                    className="rounded-lg border border-[var(--border)] bg-[var(--panel-bg)] px-3 py-2 text-sm text-[var(--text)]"
                    aria-label={t("analytics.sessionHistory.filters.energy")}
                  >
                    <option value="all">{t("analytics.sessionHistory.filters.allEnergy")}</option>
                    {(["bad", "regular", "good"] as EnergyLevel[]).map((energyValue) => (
                      <option key={energyValue} value={energyValue}>
                        {t(`analytics.energy.${energyValue}`)}
                      </option>
                    ))}
                  </select>

                  <select
                    value={sessionHistoryCategoryFilter}
                    onChange={(event) => setSessionHistoryCategoryFilter(event.target.value)}
                    className="rounded-lg border border-[var(--border)] bg-[var(--panel-bg)] px-3 py-2 text-sm text-[var(--text)]"
                    aria-label={t("analytics.sessionHistory.filters.category")}
                  >
                    <option value="all">
                      {t("analytics.sessionHistory.filters.allCategories")}
                    </option>
                    {usedCategories.map((categoryValue) => (
                      <option key={categoryValue} value={categoryValue}>
                        {categoryValue}
                      </option>
                    ))}
                  </select>

                  <select
                    value={sessionHistoryDurationFilter}
                    onChange={(event) =>
                      setSessionHistoryDurationFilter(
                        event.target.value as SessionHistoryDurationFilter,
                      )
                    }
                    className="rounded-lg border border-[var(--border)] bg-[var(--panel-bg)] px-3 py-2 text-sm text-[var(--text)]"
                    aria-label={t("analytics.sessionHistory.filters.duration")}
                  >
                    <option value="all">{t("analytics.sessionHistory.durationOptions.all")}</option>
                    <option value="under30m">
                      {t("analytics.sessionHistory.durationOptions.under30m")}
                    </option>
                    <option value="30mTo1h">
                      {t("analytics.sessionHistory.durationOptions.30mTo1h")}
                    </option>
                    <option value="1hTo2h">
                      {t("analytics.sessionHistory.durationOptions.1hTo2h")}
                    </option>
                    <option value="over2h">
                      {t("analytics.sessionHistory.durationOptions.over2h")}
                    </option>
                  </select>

                  <select
                    value={sessionHistoryPauseFilter}
                    onChange={(event) =>
                      setSessionHistoryPauseFilter(event.target.value as SessionHistoryPauseFilter)
                    }
                    className="rounded-lg border border-[var(--border)] bg-[var(--panel-bg)] px-3 py-2 text-sm text-[var(--text)]"
                    aria-label={t("analytics.sessionHistory.filters.pauses")}
                  >
                    <option value="all">{t("analytics.sessionHistory.filters.allPauses")}</option>
                    <option value="withPauses">
                      {t("analytics.sessionHistory.filters.withPauses")}
                    </option>
                    <option value="withoutPauses">
                      {t("analytics.sessionHistory.filters.withoutPauses")}
                    </option>
                  </select>

                  <button
                    type="button"
                    onClick={resetSessionHistoryView}
                    disabled={
                      !hasSessionHistoryQueryOrFilters && activeSessionHistoryFilterCount === 0
                    }
                    className="rounded-lg border border-[var(--border)] bg-[var(--panel-bg)] px-3 py-2 text-sm font-medium text-[var(--text)] transition duration-200 ease-out hover:bg-[var(--panel-muted)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {activeSessionHistoryFilterCount > 0
                      ? t("analytics.sessionHistory.filters.clearWithCount", {
                          count: activeSessionHistoryFilterCount,
                        })
                      : t("analytics.sessionHistory.filters.clear")}
                  </button>
                </div>
              </div>
            ) : null}

            {backupFeedback ? (
              <div
                className={`mb-4 rounded-xl border px-4 py-3 text-sm ${
                  backupFeedback.type === "success"
                    ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                    : "border-rose-300 bg-rose-50 text-rose-800"
                } transition-opacity duration-300 ease-out ${
                  isBackupFeedbackVisible ? "opacity-100" : "opacity-0"
                }`}
              >
                {backupFeedback.message}
              </div>
            ) : null}

            {sessionHistoryEditError ? (
              <div className="mb-4 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                {sessionHistoryEditError}
              </div>
            ) : null}

            <div className="w-full rounded-2xl border border-[var(--border)] bg-[var(--panel-bg)] shadow-[0_8px_28px_rgba(15,23,42,0.06)]">
              {completedSessions.length === 0 ? (
                <div className="px-6 py-14 text-center">
                  <h2 className="text-xl font-semibold text-[var(--text)]">
                    {t("analytics.sessionHistory.emptyTitle")}
                  </h2>
                  <p className="mt-2 text-sm text-[var(--text-muted)]">
                    {t("analytics.sessionHistory.emptyDescription")}
                  </p>
                </div>
              ) : visibleSessionHistorySessions.length === 0 ? (
                <div className="px-6 py-14 text-center">
                  <h2 className="text-xl font-semibold text-[var(--text)]">
                    {t("analytics.sessionHistory.emptySearchTitle")}
                  </h2>
                  <p className="mt-2 text-sm text-[var(--text-muted)]">
                    {t("analytics.sessionHistory.emptySearchDescription")}
                  </p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[980px] text-left">
                      <thead className="border-b border-[var(--border)] bg-[var(--panel-muted)]/40 text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">
                        <tr>
                          <th className="px-5 py-3.5 font-semibold">
                            {t("analytics.sessionHistory.columns.name")}
                          </th>
                          <th className="px-5 py-3.5 font-semibold">
                            {t("analytics.sessionHistory.columns.category")}
                          </th>
                          <th className="px-5 py-3.5 font-semibold">
                            <button
                              type="button"
                              onClick={() => handleSessionHistorySort("startedAt")}
                              aria-label={t("analytics.sessionHistory.sorting.sortByStartDate")}
                              className="inline-flex items-center gap-1 hover:text-[var(--text)]"
                            >
                              <span>{t("analytics.sessionHistory.columns.startDate")}</span>
                              <span className="text-[var(--text-muted)]">
                                {getSortIndicator("startedAt")}
                              </span>
                            </button>
                          </th>
                          <th className="px-5 py-3.5 font-semibold">
                            <button
                              type="button"
                              onClick={() => handleSessionHistorySort("endedAt")}
                              aria-label={t("analytics.sessionHistory.sorting.sortByEndDate")}
                              className="inline-flex items-center gap-1 hover:text-[var(--text)]"
                            >
                              <span>{t("analytics.sessionHistory.columns.endDate")}</span>
                              <span className="text-[var(--text-muted)]">
                                {getSortIndicator("endedAt")}
                              </span>
                            </button>
                          </th>
                          <th className="px-5 py-3.5 font-semibold">
                            <button
                              type="button"
                              onClick={() => handleSessionHistorySort("effectiveDurationMs")}
                              aria-label={t("analytics.sessionHistory.sorting.sortByDuration")}
                              className="inline-flex items-center gap-1 hover:text-[var(--text)]"
                            >
                              <span>{t("analytics.sessionHistory.columns.duration")}</span>
                              <span className="text-[var(--text-muted)]">
                                {getSortIndicator("effectiveDurationMs")}
                              </span>
                            </button>
                          </th>
                          <th className="px-5 py-3.5 font-semibold">
                            <button
                              type="button"
                              onClick={() => handleSessionHistorySort("pauseCount")}
                              aria-label={t("analytics.sessionHistory.sorting.sortByPauseCount")}
                              className="inline-flex items-center gap-1 hover:text-[var(--text)]"
                            >
                              <span>{t("analytics.sessionHistory.columns.pauseCount")}</span>
                              <span className="text-[var(--text-muted)]">
                                {getSortIndicator("pauseCount")}
                              </span>
                            </button>
                          </th>
                          <th className="px-5 py-3.5 font-semibold">
                            {t("analytics.sessionHistory.columns.pausedTime")}
                          </th>
                          <th className="px-5 py-3.5 font-semibold">
                            {t("analytics.sessionHistory.columns.tags")}
                          </th>
                          <th className="px-5 py-3.5 font-semibold">
                            {t("analytics.sessionHistory.columns.weekday")}
                          </th>
                          <th className="px-5 py-3.5 font-semibold">
                            <button
                              type="button"
                              onClick={() => handleSessionHistorySort("energy")}
                              aria-label={t("analytics.sessionHistory.sorting.sortByEnergy")}
                              className="inline-flex items-center gap-1 hover:text-[var(--text)]"
                            >
                              <span>{t("analytics.sessionHistory.columns.energy")}</span>
                              <span className="text-[var(--text-muted)]">
                                {getSortIndicator("energy")}
                              </span>
                            </button>
                          </th>
                          <th className="px-5 py-3.5 text-right font-semibold">
                            {t("analytics.sessionHistory.columns.actions")}
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border)]">
                        {paginatedSessionHistorySessions.map((session) => (
                          <tr
                            key={session.id}
                            className="transition-colors duration-150 hover:bg-[var(--panel-muted)]/35"
                          >
                            <td className="px-5 py-4 text-sm font-semibold text-[var(--text)]">
                              {sessionHistoryEditing?.sessionId === session.id &&
                              sessionHistoryEditing.field === "title" ? (
                                <input
                                  autoFocus
                                  value={sessionHistoryEditing.value}
                                  onChange={(event) =>
                                    setSessionHistoryEditing((prev) =>
                                      prev ? { ...prev, value: event.target.value } : prev,
                                    )
                                  }
                                  onBlur={() => void saveSessionHistoryInlineEdit()}
                                  onKeyDown={handleSessionHistoryInlineEditKeyDown}
                                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--panel-bg)] px-2 py-1 text-sm text-[var(--text)]"
                                />
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => startSessionHistoryInlineEdit(session, "title")}
                                  className="text-left hover:text-[var(--accent)]"
                                >
                                  {session.title}
                                </button>
                              )}
                            </td>
                            <td className="px-5 py-4 text-sm text-[var(--text-muted)]">
                              {sessionHistoryEditing?.sessionId === session.id &&
                              sessionHistoryEditing.field === "category" ? (
                                <input
                                  autoFocus
                                  value={sessionHistoryEditing.value}
                                  onChange={(event) =>
                                    setSessionHistoryEditing((prev) =>
                                      prev ? { ...prev, value: event.target.value } : prev,
                                    )
                                  }
                                  onBlur={() => void saveSessionHistoryInlineEdit()}
                                  onKeyDown={handleSessionHistoryInlineEditKeyDown}
                                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--panel-bg)] px-2 py-1 text-sm text-[var(--text)]"
                                />
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => startSessionHistoryInlineEdit(session, "category")}
                                  className="text-left hover:text-[var(--accent)]"
                                >
                                  {session.category || t("home.uncategorized")}
                                </button>
                              )}
                            </td>
                            <td className="px-5 py-4 text-sm text-[var(--text-muted)]">
                              {formatSessionDate(session.startedAt)}
                            </td>
                            <td className="px-5 py-4 text-sm text-[var(--text-muted)]">
                              {formatSessionDate(session.endedAt)}
                            </td>
                            <td className="px-5 py-4 text-sm text-[var(--text)]">
                              {formatHumanDuration(session.effectiveDurationMs)}
                            </td>
                            <td className="px-5 py-4 text-sm text-[var(--text-muted)]">
                              <div className="inline-flex items-center gap-2">
                                <span>{session.pauseCount}</span>
                                {isHighInterruptionSession(session) ? (
                                  <span className="rounded-full border border-amber-500/30 bg-amber-500/12 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-300">
                                    {t("analytics.sessionHistory.indicators.highInterruptions")}
                                  </span>
                                ) : null}
                              </div>
                            </td>
                            <td className="px-5 py-4 text-sm text-[var(--text-muted)]">
                              {formatHumanDuration(session.pausedDurationMs)}
                            </td>
                            <td className="px-5 py-4 text-sm text-[var(--text-muted)]">
                              {sessionHistoryEditing?.sessionId === session.id &&
                              sessionHistoryEditing.field === "tags" ? (
                                <input
                                  autoFocus
                                  value={sessionHistoryEditing.value}
                                  onChange={(event) =>
                                    setSessionHistoryEditing((prev) =>
                                      prev ? { ...prev, value: event.target.value } : prev,
                                    )
                                  }
                                  onBlur={() => void saveSessionHistoryInlineEdit()}
                                  onKeyDown={handleSessionHistoryInlineEditKeyDown}
                                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--panel-bg)] px-2 py-1 text-sm text-[var(--text)]"
                                />
                              ) : session.tags.length > 0 ? (
                                <div className="flex flex-wrap gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => startSessionHistoryInlineEdit(session, "tags")}
                                    className="contents"
                                  >
                                    {session.tags.map((tag) => (
                                      <span
                                        key={`${session.id}-table-${tag}`}
                                        className="rounded-full border border-[var(--border)] bg-[var(--panel-muted)] px-2 py-0.5 text-xs text-[var(--text-muted)]"
                                      >
                                        {tag}
                                      </span>
                                    ))}
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => startSessionHistoryInlineEdit(session, "tags")}
                                  className="text-[var(--text-muted)]/80 hover:text-[var(--accent)]"
                                >
                                  {t("analytics.sessionHistory.noTags")}
                                </button>
                              )}
                            </td>
                            <td className="px-5 py-4 text-sm text-[var(--text-muted)]">
                              {sessionHistoryEditing?.sessionId === session.id &&
                              sessionHistoryEditing.field === "weekday" ? (
                                <select
                                  autoFocus
                                  value={sessionHistoryEditing.value}
                                  onChange={(event) =>
                                    setSessionHistoryEditing((prev) =>
                                      prev ? { ...prev, value: event.target.value } : prev,
                                    )
                                  }
                                  onBlur={() => void saveSessionHistoryInlineEdit()}
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
                                      {t(`analytics.weekdays.${weekday}`)}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => startSessionHistoryInlineEdit(session, "weekday")}
                                  className="text-left hover:text-[var(--accent)]"
                                >
                                  {t(`analytics.weekdays.${session.weekday}`)}
                                </button>
                              )}
                            </td>
                            <td className="px-5 py-4 text-sm">
                              {sessionHistoryEditing?.sessionId === session.id &&
                              sessionHistoryEditing.field === "energy" ? (
                                <select
                                  autoFocus
                                  value={sessionHistoryEditing.value}
                                  onChange={(event) =>
                                    setSessionHistoryEditing((prev) =>
                                      prev ? { ...prev, value: event.target.value } : prev,
                                    )
                                  }
                                  onBlur={() => void saveSessionHistoryInlineEdit()}
                                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--panel-bg)] px-2 py-1 text-sm text-[var(--text)]"
                                >
                                  {(["bad", "regular", "good"] as EnergyLevel[]).map(
                                    (energyValue) => (
                                      <option
                                        key={`${session.id}-${energyValue}`}
                                        value={energyValue}
                                      >
                                        {t(`analytics.energy.${energyValue}`)}
                                      </option>
                                    ),
                                  )}
                                </select>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => startSessionHistoryInlineEdit(session, "energy")}
                                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${getEnergyBadgeClasses(session.energy)} hover:border-[var(--accent)] hover:text-[var(--accent)]`}
                                >
                                  {renderMoodFace(session.energy, "h-3.5 w-3.5")}
                                  <span>{t(`analytics.energy.${session.energy}`)}</span>
                                </button>
                              )}
                            </td>
                            <td className="px-5 py-4 text-right">
                              <button
                                type="button"
                                onClick={() => deleteCompletedSession(session.id)}
                                aria-label={t("analytics.sessionHistory.deleteSession")}
                                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-rose-400 transition duration-200 ease-out hover:bg-rose-500/10 hover:text-rose-500"
                              >
                                <svg
                                  viewBox="0 0 24 24"
                                  className="h-4 w-4"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.8"
                                >
                                  <path d="M4 7h16" />
                                  <path d="M9 7V5h6v2" />
                                  <path d="M8 7l1 12h6l1-12" />
                                  <path d="M10 11v5M14 11v5" />
                                </svg>
                                <span>{t("analytics.sessionHistory.delete")}</span>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {visibleSessionHistorySessions.length > SESSION_HISTORY_PAGE_SIZE ? (
                    <div className="flex items-center justify-center gap-3 border-t border-[var(--border)] px-5 py-4">
                      <button
                        type="button"
                        onClick={() => setSessionHistoryPage((prev) => Math.max(1, prev - 1))}
                        disabled={sessionHistoryPage <= 1}
                        className="rounded-lg border border-[var(--border)] bg-[var(--panel-bg)] px-3 py-1.5 text-sm text-[var(--text)] transition duration-200 ease-out hover:bg-[var(--panel-muted)] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {t("analytics.sessionHistory.pagination.previous")}
                      </button>

                      <span className="text-sm text-[var(--text-muted)]">
                        {t("analytics.sessionHistory.pagination.pageStatus", {
                          page: sessionHistoryPage,
                          total: sessionHistoryTotalPages,
                        })}
                      </span>

                      <button
                        type="button"
                        onClick={() =>
                          setSessionHistoryPage((prev) =>
                            Math.min(sessionHistoryTotalPages, prev + 1),
                          )
                        }
                        disabled={sessionHistoryPage >= sessionHistoryTotalPages}
                        className="rounded-lg border border-[var(--border)] bg-[var(--panel-bg)] px-3 py-1.5 text-sm text-[var(--text)] transition duration-200 ease-out hover:bg-[var(--panel-muted)] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {t("analytics.sessionHistory.pagination.next")}
                      </button>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </div>
        )}
      </section>
    );
  }

  function renderSettingsPage() {
    return (
      <section className="flex h-full items-start justify-center px-8 py-10">
        <div className="w-full max-w-3xl space-y-4">
          {settingsFeedback ? (
            <div
              className={`rounded-xl border px-4 py-3 text-sm ${
                settingsFeedback.type === "success"
                  ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                  : "border-rose-300 bg-rose-50 text-rose-800"
              }`}
            >
              {settingsFeedback.message}
            </div>
          ) : null}

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel-bg)] p-6 shadow-[0_8px_28px_rgba(15,23,42,0.06)]">
            <h2 className="text-lg font-semibold text-[var(--text)]">{t("settings.language")}</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {t("settings.languageDescription")}
            </p>
            <div className="mt-4 max-w-sm">
              <label
                className="mb-2 block text-sm font-medium text-[var(--text-muted)]"
                htmlFor="language-select"
              >
                {t("settings.appLanguage")}
              </label>
              <select
                id="language-select"
                value={language}
                onChange={(event) => setLanguage(event.target.value as Language)}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--panel-muted)] px-3 py-2 text-sm text-[var(--text)] outline-none ring-[var(--accent)] transition focus:ring"
              >
                <option value="en">{t("settings.english")}</option>
                <option value="es">{t("settings.spanish")}</option>
              </select>
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel-bg)] p-6 shadow-[0_8px_28px_rgba(15,23,42,0.06)]">
            <h2 className="text-lg font-semibold text-[var(--text)]">{t("settings.theme")}</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {t("settings.themeDescription")}
            </p>
            <div className="mt-4 flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--panel-muted)] p-3">
              <span className="text-sm font-medium text-[var(--text-muted)]">
                {themeMode === "light" ? t("settings.lightMode") : t("settings.darkMode")}
              </span>
              <button
                type="button"
                onClick={() => setThemeMode((prev) => (prev === "light" ? "dark" : "light"))}
                className={`relative h-8 w-14 shrink-0 rounded-full transition-colors duration-200 ${
                  themeMode === "dark" ? "bg-[var(--accent)]" : "bg-slate-300"
                }`}
                aria-label="Toggle theme"
              >
                <span
                  className={`absolute left-1 top-1 h-6 w-6 rounded-full shadow transition-transform duration-200 ${
                    themeMode === "dark"
                      ? "translate-x-6 bg-[var(--panel-bg)]"
                      : "translate-x-0 bg-[var(--panel-bg)]"
                  }`}
                />
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel-bg)] p-6 shadow-[0_8px_28px_rgba(15,23,42,0.06)]">
            <h2 className="text-lg font-semibold text-[var(--text)]">{t("settings.startup")}</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {t("settings.startupDescription")}
            </p>
            <div className="mt-4 flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--panel-muted)] p-3">
              <span className="text-sm font-medium text-[var(--text-muted)]">
                {t("settings.openAtStartup")}
              </span>
              <button
                type="button"
                onClick={() => void handleToggleAutostart()}
                disabled={isAutostartLoading}
                className={`relative h-8 w-14 shrink-0 rounded-full transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-60 ${
                  isAutostartEnabled ? "bg-[var(--accent)]" : "bg-slate-300"
                }`}
                aria-label={t("settings.openAtStartup")}
              >
                <span
                  className={`absolute left-1 top-1 h-6 w-6 rounded-full shadow transition-transform duration-200 ${
                    isAutostartEnabled
                      ? "translate-x-6 bg-[var(--panel-bg)]"
                      : "translate-x-0 bg-[var(--panel-bg)]"
                  }`}
                />
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-rose-300/70 bg-rose-50/60 p-6 shadow-[0_8px_28px_rgba(15,23,42,0.06)] dark:border-rose-500/30 dark:bg-rose-500/10">
            <h2 className="text-lg font-semibold text-rose-800 dark:text-rose-300">
              {t("settings.dangerZone")}
            </h2>
            <p className="mt-1 text-sm text-rose-700/85 dark:text-rose-300/85">
              {t("settings.dangerZoneDescription")}
            </p>
            <button
              type="button"
              onClick={() => setIsDeleteAllConfirmOpen(true)}
              className="mt-4 rounded-xl border border-rose-700 bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition duration-200 ease-out hover:bg-rose-700"
            >
              {t("settings.deleteAllSessions")}
            </button>
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel-bg)] p-6 shadow-[0_8px_28px_rgba(15,23,42,0.06)]">
            <h2 className="text-lg font-semibold text-[var(--text)]">{t("settings.helpAbout")}</h2>
            <p className="mt-3 text-sm text-[var(--text-muted)]">
              {t("settings.aboutDescription")}
            </p>
            <dl className="mt-4 grid grid-cols-1 gap-2 text-sm text-[var(--text-muted)] sm:grid-cols-2">
              <div>
                <dt className="font-medium text-[var(--text)]">{t("settings.version")}</dt>
                <dd>0.1.0</dd>
              </div>
              <div>
                <dt className="font-medium text-[var(--text)]">{t("settings.license")}</dt>
                <dd>MIT</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="font-medium text-[var(--text)]">{t("settings.author")}</dt>
                <dd>Raúl García Balongo</dd>
              </div>
            </dl>
            <button
              type="button"
              disabled
              className="mt-5 rounded-xl border border-[var(--border)] bg-[var(--panel-muted)] px-4 py-2 text-sm font-medium text-[var(--text-muted)] opacity-70"
            >
              {t("settings.checkUpdates")}
            </button>
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel-bg)] p-6 shadow-[0_8px_28px_rgba(15,23,42,0.06)]">
            <h2 className="text-lg font-semibold text-[var(--text)]">
              {t("settings.debug.title")}
            </h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {t("settings.debug.description")}
            </p>

            <p className="mt-3 text-sm text-[var(--text-muted)]">
              {t("settings.debug.recentErrors", { count: debugLogEntries.length })}
            </p>

            {debugLogEntries.length === 0 ? (
              <p className="mt-2 text-sm text-[var(--text-muted)]">{t("settings.debug.empty")}</p>
            ) : (
              <div className="mt-3 max-h-64 space-y-2 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--panel-muted)] p-3">
                {debugLogEntries.slice(0, 10).map((entry) => (
                  <div
                    key={entry.id}
                    className="rounded-lg border border-[var(--border)] bg-[var(--panel-bg)] p-3"
                  >
                    <div className="text-xs text-[var(--text-muted)]">{entry.timestamp}</div>
                    <div className="mt-1 text-sm font-medium text-[var(--text)]">
                      {entry.source}
                    </div>
                    <div className="mt-1 text-sm text-[var(--text-muted)]">{entry.message}</div>
                    {entry.stack ? (
                      <pre className="mt-2 overflow-x-auto rounded bg-[var(--panel-muted)] p-2 text-[11px] text-[var(--text-muted)]">
                        {entry.stack}
                      </pre>
                    ) : null}
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void handleCopyDebugInfo()}
                disabled={isDebugActionBusy}
                className="rounded-xl border border-[var(--border)] bg-[var(--panel-muted)] px-3 py-2 text-sm font-medium text-[var(--text)] transition hover:bg-[var(--panel-bg)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {t("settings.debug.copy")}
              </button>
              <button
                type="button"
                onClick={() => handleClearDebugLogs()}
                disabled={isDebugActionBusy || debugLogEntries.length === 0}
                className="rounded-xl border border-[var(--border)] bg-[var(--panel-muted)] px-3 py-2 text-sm font-medium text-[var(--text)] transition hover:bg-[var(--panel-bg)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {t("settings.debug.clear")}
              </button>
              <button
                type="button"
                onClick={() => void handleExportDebugReport()}
                disabled={isDebugActionBusy}
                className="rounded-xl border border-[var(--border)] bg-[var(--panel-muted)] px-3 py-2 text-sm font-medium text-[var(--text)] transition hover:bg-[var(--panel-bg)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {t("settings.debug.export")}
              </button>
            </div>
          </div>

          {isDeleteAllConfirmOpen ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-6">
              <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--panel-bg)] p-6 shadow-2xl">
                <h3 className="text-lg font-semibold text-[var(--text)]">
                  {t("settings.deleteAllSessionsConfirmTitle")}
                </h3>
                <p className="mt-2 text-sm text-[var(--text-muted)]">
                  {t("settings.deleteAllSessionsConfirmDescription")}
                </p>
                <div className="mt-5 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsDeleteAllConfirmOpen(false)}
                    disabled={isDeletingAllSessions}
                    className="rounded-xl border border-[var(--border)] bg-[var(--panel-bg)] px-4 py-2 text-sm font-medium text-[var(--text)] transition duration-200 ease-out hover:bg-[var(--panel-muted)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {t("settings.cancel")}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleConfirmDeleteAllSessions()}
                    disabled={isDeletingAllSessions}
                    className="rounded-xl border border-rose-700 bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition duration-200 ease-out hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isDeletingAllSessions
                      ? t("analytics.sessionHistory.backup.processing")
                      : t("settings.confirmDeleteAllSessions")}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </section>
    );
  }

  function renderNavIcon(page: Page) {
    const baseClass = "h-11 w-11";
    if (page === "home") {
      return (
        <svg
          viewBox="0 0 24 24"
          className={baseClass}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path d="M4 10.5 12 4l8 6.5V20H4z" />
        </svg>
      );
    }
    if (page === "analytics") {
      return (
        <svg
          viewBox="0 0 24 24"
          className={baseClass}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path d="M5 18V8M12 18V5M19 18v-6" />
        </svg>
      );
    }
    return (
      <svg
        viewBox="0 0 24 24"
        className={baseClass}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <path d="M12 8.8a3.2 3.2 0 1 0 0 6.4 3.2 3.2 0 0 0 0-6.4Z" />
        <path d="M19 12a1 1 0 0 0-.7-1l-1.1-.3a5.6 5.6 0 0 0-.5-1.2l.6-1a1 1 0 0 0-.1-1.2l-.9-.9a1 1 0 0 0-1.2-.1l-1 .6a5.6 5.6 0 0 0-1.2-.5l-.3-1.1a1 1 0 0 0-1-.7h-1.2a1 1 0 0 0-1 .7l-.3 1.1a5.6 5.6 0 0 0-1.2.5l-1-.6a1 1 0 0 0-1.2.1l-.9.9a1 1 0 0 0-.1 1.2l.6 1a5.6 5.6 0 0 0-.5 1.2l-1.1.3a1 1 0 0 0-.7 1v1.2a1 1 0 0 0 .7 1l1.1.3c.1.4.3.8.5 1.2l-.6 1a1 1 0 0 0 .1 1.2l.9.9a1 1 0 0 0 1.2.1l1-.6c.4.2.8.4 1.2.5l.3 1.1a1 1 0 0 0 1 .7h1.2a1 1 0 0 0 1-.7l.3-1.1c.4-.1.8-.3 1.2-.5l1 .6a1 1 0 0 0 1.2-.1l.9-.9a1 1 0 0 0 .1-1.2l-.6-1c.2-.4.4-.8.5-1.2l1.1-.3a1 1 0 0 0 .7-1V12Z" />
      </svg>
    );
  }

  const navItems: Array<{ page: Page; label: string }> = [
    { page: "home", label: t("nav.home") },
    { page: "analytics", label: t("nav.analytics") },
    { page: "settings", label: t("nav.settings") },
  ];

  return (
    <>
      {!isStartupComplete && (
        <div
          className={`fixed inset-0 z-50 flex flex-col items-center justify-center transition-opacity duration-300 ${isStartupLeaving ? "opacity-0" : "opacity-100"}`}
          style={{ background: "radial-gradient(ellipse at 50% 40%, #131c31 0%, #0a0f1a 100%)" }}
        >
          <style>{`@keyframes dot-pulse{0%,20%{opacity:.2;transform:scale(.6)}50%{opacity:1;transform:scale(1)}80%,100%{opacity:.2;transform:scale(.6)}}`}</style>
          <img src={logoHeader} alt="Chronolytic" className="h-40 w-auto object-contain" />
          <div className="mt-8 flex items-center gap-2.5">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-3 w-3 rounded-full bg-[#4E89FF]"
                style={{ animation: `dot-pulse 1.4s ease-in-out infinite ${i * 0.2}s` }}
              />
            ))}
          </div>
        </div>
      )}
      <main className="flex h-screen w-screen overflow-hidden">
        <div className="flex h-full w-full flex-col overflow-hidden bg-[var(--shell-bg)] text-[var(--text)]">
          {renderHeader()}

          <div className="flex min-h-0 flex-1">
            <aside className="flex w-56 shrink-0 border-r border-[var(--border)] bg-[var(--sidebar-bg)] px-4 py-7">
              <nav className="flex h-full w-full flex-col justify-evenly">
                {navItems.map((item) => (
                  <button
                    key={item.page}
                    type="button"
                    onClick={() => setActivePage(item.page)}
                    className={`relative flex flex-col items-center justify-center gap-3 rounded-3xl px-3 py-5 text-center transition ${
                      activePage === item.page
                        ? "text-[#4E89FF]"
                        : "text-[var(--text-muted)] hover:bg-[var(--panel-muted)] hover:text-[#4E89FF]"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`absolute bottom-2 left-0 top-2 w-0.5 rounded-r-md bg-[#4E89FF] transition-all duration-200 ease-out ${
                        activePage === item.page ? "opacity-100" : "opacity-0"
                      }`}
                    />
                    {renderNavIcon(item.page)}
                    <span className="text-lg font-semibold leading-none tracking-[0.05em]">
                      {item.label}
                    </span>
                  </button>
                ))}
              </nav>
            </aside>

            <div className="min-w-0 flex-1 overflow-y-auto bg-[var(--panel-bg)]">
              {activePage === "home"
                ? renderHome()
                : activePage === "settings"
                  ? renderSettingsPage()
                  : renderAnalyticsPage()}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}

export default App;
