import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { useTranslation } from "react-i18next";
import AppLayout from "./app/AppLayout";
import type {
  AnalyticsTab,
  BackupFeedbackType,
  Language,
  NavItem,
  Page,
  SessionHistoryDurationFilter,
  SessionHistoryEditableField,
  SessionHistoryPauseFilter,
  SessionHistorySortKey,
  SettingsFeedbackType,
  SortDirection,
  ThemeMode,
} from "./app/appTypes";
import logoHeader from "./assets/logo/logoHeader.png";
import { AnalyticsPage } from "./features/analytics/AnalyticsPage";
import {
  recordCriticalError,
} from "./features/diagnostics/debugLog";
import { HomePage } from "./features/home/HomePage";
import { createSessionBackup, parseSessionBackup } from "./features/sessions/sessionBackup";
import { SettingsPage } from "./features/settings/SettingsPage";
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
} from "./features/sessions/sessionTypes";
import {
  getBackupDefaultFileName,
  getGreetingKey,
  getWeekdayFromTimestamp,
} from "./shared/utils/dateUtils";
import {
  getEffectiveDuration,
  getPausedDuration,
  reducePausedDuration,
  getTimerDisplayNow,
} from "./shared/utils/durationUtils";
import { getEnergySortValue } from "./shared/utils/energyUtils";
import { normalizeDuplicateTitle, normalizeSearchValue } from "./shared/utils/searchUtils";

const SESSION_HISTORY_PAGE_SIZE = 8;
type TimeCorrectionMode = "addDuringPause" | "removeDistracted";

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
  const [forgottenStartMinutes, setForgottenStartMinutes] = useState<string>("0");
  const [energy, setEnergy] = useState<EnergyLevel>("regular");
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
  const [completedSessions, setCompletedSessions] = useState<CompletedSession[]>([]);
  const [categorySuggestionsOpen, setCategorySuggestionsOpen] = useState(false);
  const [analyticsTab, setAnalyticsTab] = useState<AnalyticsTab>("dashboard");
  const [recoveryNoticeVisible, setRecoveryNoticeVisible] = useState(false);
  const [isBackupBusy, setIsBackupBusy] = useState(false);
  const [sessionHistorySearch, setSessionHistorySearch] = useState("");
  const [dashboardCategoryFilter, setDashboardCategoryFilter] = useState("all");
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
  const [isStartupSessionLoaded, setIsStartupSessionLoaded] = useState(false);
  const [isStartupMinElapsed, setIsStartupMinElapsed] = useState(false);
  const [isStartupLeaving, setIsStartupLeaving] = useState(false);
  const [isStartupComplete, setIsStartupComplete] = useState(false);
  const [isStartingSession, setIsStartingSession] = useState(false);
  const [isFinishingSession, setIsFinishingSession] = useState(false);
  const [isPausingSession, setIsPausingSession] = useState(false);
  const [isResumingSession, setIsResumingSession] = useState(false);
  const [duplicateTitleCandidate, setDuplicateTitleCandidate] = useState<string | null>(null);
  const [sessionSavedFeedbackVisible, setSessionSavedFeedbackVisible] = useState(false);
  const [timeCorrectionMode, setTimeCorrectionMode] = useState<TimeCorrectionMode | null>(null);
  const [timeCorrectionMinutes, setTimeCorrectionMinutes] = useState<string>("");
  const [timeCorrectionError, setTimeCorrectionError] = useState<string | null>(null);
  const [isApplyingTimeCorrection, setIsApplyingTimeCorrection] = useState(false);
  const [correctionOpenedAt, setCorrectionOpenedAt] = useState<number | null>(null);
  const backupFadeTimeoutRef = useRef<number | null>(null);
  const backupRemoveTimeoutRef = useRef<number | null>(null);
  const sessionSavedFeedbackTimeoutRef = useRef<number | null>(null);

  function logCriticalError(source: string, error: unknown, details?: Record<string, unknown>) {
    recordCriticalError(source, error, details);
  }

  useEffect(() => {
    let intervalId: number | null = null;
    let timeoutId: number | null = null;

    const scheduleAlignedClock = () => {
      const updateNow = () => setNow(Date.now());

      updateNow();
      const nowMs = Date.now();
      const delayToNextSecond = 1000 - (nowMs % 1000);

      timeoutId = window.setTimeout(() => {
        updateNow();
        intervalId = window.setInterval(updateNow, 1000);
      }, delayToNextSecond);
    };

    scheduleAlignedClock();

    return () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
      if (intervalId !== null) {
        window.clearInterval(intervalId);
      }
    };
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
    return () => {
      if (sessionSavedFeedbackTimeoutRef.current) {
        window.clearTimeout(sessionSavedFeedbackTimeoutRef.current);
        sessionSavedFeedbackTimeoutRef.current = null;
      }
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

  const parsedForgottenStartMinutes = useMemo(() => {
    const trimmed = forgottenStartMinutes.trim();
    if (trimmed.length === 0) return null;
    const value = Number(trimmed);
    if (!Number.isFinite(value) || value < 0 || value > 120) return null;
    return Math.floor(value);
  }, [forgottenStartMinutes]);
  const isForgottenStartMinutesValid = parsedForgottenStartMinutes !== null;

  const effectiveDurationMs = useMemo(() => {
    if (!activeSession) return 0;
    const timerNow =
      timeCorrectionMode === "removeDistracted" && correctionOpenedAt !== null
        ? correctionOpenedAt
        : now;
    return getEffectiveDuration(activeSession, getTimerDisplayNow(activeSession, timerNow));
  }, [activeSession, correctionOpenedAt, now, timeCorrectionMode]);

  const usedCategories = useMemo(
    () => [...new Set(completedSessions.map((s) => s.category).filter(Boolean))],
    [completedSessions],
  );

  const hasUncategorizedSessions = useMemo(
    () => completedSessions.some((session) => session.category.trim().length === 0),
    [completedSessions],
  );

  const dashboardCategoryOptions = useMemo(() => {
    const options: Array<{ value: string; label: string }> = [
      {
        value: "all",
        label: t("analytics.dashboard.filters.allSessions"),
      },
      ...usedCategories.map((category) => ({ value: category, label: category })),
    ];

    if (hasUncategorizedSessions) {
      options.push({ value: "__uncategorized__", label: t("home.uncategorized") });
    }

    return options;
  }, [hasUncategorizedSessions, t, usedCategories]);

  const dashboardSessions = useMemo(() => {
    if (dashboardCategoryFilter === "all") return completedSessions;
    if (dashboardCategoryFilter === "__uncategorized__") {
      return completedSessions.filter((session) => session.category.trim().length === 0);
    }
    return completedSessions.filter((session) => session.category === dashboardCategoryFilter);
  }, [completedSessions, dashboardCategoryFilter]);

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

  const sessionHistorySearchIndex = useMemo(
    () =>
      completedSessions.map((session) => ({
        session,
        searchableText: normalizeSearchValue(`${session.title} ${session.category}`),
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
      if (
        sessionHistoryDurationFilter === "1hTo2h" &&
        (duration < 60 * 60 * 1000 || duration >= 2 * 60 * 60 * 1000)
      ) {
        return false;
      }
      if (
        sessionHistoryDurationFilter === "2hTo4h" &&
        (duration < 2 * 60 * 60 * 1000 || duration >= 4 * 60 * 60 * 1000)
      ) {
        return false;
      }
      if (
        sessionHistoryDurationFilter === "4hTo6h" &&
        (duration < 4 * 60 * 60 * 1000 || duration >= 6 * 60 * 60 * 1000)
      ) {
        return false;
      }
      if (
        sessionHistoryDurationFilter === "6hTo8h" &&
        (duration < 6 * 60 * 60 * 1000 || duration >= 8 * 60 * 60 * 1000)
      ) {
        return false;
      }
      if (
        sessionHistoryDurationFilter === "8hTo10h" &&
        (duration < 8 * 60 * 60 * 1000 || duration >= 10 * 60 * 60 * 1000)
      ) {
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

  const recentHomeSessions = useMemo(
    () => [...completedSessions].sort((a, b) => b.endedAt - a.endedAt).slice(0, 3),
    [completedSessions],
  );

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

  useEffect(() => {
    const isValid = dashboardCategoryOptions.some(
      (option) => option.value === dashboardCategoryFilter,
    );
    if (!isValid) {
      setDashboardCategoryFilter("all");
    }
  }, [dashboardCategoryFilter, dashboardCategoryOptions]);

  const canStartSession =
    title.trim().length > 0 &&
    !activeSession &&
    !isStartingSession &&
    isForgottenStartMinutesValid;

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

    const createdAt = Date.now();
    const forgottenOffsetMs = (parsedForgottenStartMinutes ?? 0) * 60 * 1000;
    const startedAt = createdAt - forgottenOffsetMs;
    const session: ActiveSession = {
      id: crypto.randomUUID(),
      title: finalTitle.trim(),
      category: category.trim(),
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

      await saveActiveSession(session, createdAt);
      setActiveSession(session);
      setNow(createdAt);
      setIsCreateSessionOpen(false);
      setForgottenStartMinutes("0");
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
    if (!canStartSession || isStartingSession || activeSession || !isForgottenStartMinutesValid) return;

    const trimmedTitle = title.trim();
    if (hasDuplicateCompletedTitle(trimmedTitle)) {
      setDuplicateTitleCandidate(trimmedTitle);
      return;
    }

    await commitStartSession(trimmedTitle);
  }

  function closeTimeCorrectionModal() {
    setTimeCorrectionMode(null);
    setTimeCorrectionMinutes("");
    setTimeCorrectionError(null);
    setCorrectionOpenedAt(null);
  }

  function openAddTimeModal() {
    setTimeCorrectionMode("addDuringPause");
    setTimeCorrectionMinutes("");
    setTimeCorrectionError(null);
    setCorrectionOpenedAt(null);
  }

  function openRemoveTimeModal() {
    setTimeCorrectionMode("removeDistracted");
    setTimeCorrectionMinutes("");
    setTimeCorrectionError(null);
    setCorrectionOpenedAt(Date.now());
  }

  function handleTimeCorrectionMinutesChange(value: string) {
    setTimeCorrectionMinutes(value);
    if (timeCorrectionError) {
      setTimeCorrectionError(null);
    }
  }

  async function applyTimeCorrection() {
    if (!activeSession || !timeCorrectionMode || isApplyingTimeCorrection) return;

    const value = Number(timeCorrectionMinutes);
    const requestedMs = Math.floor(value * 60 * 1000);
    if (!Number.isFinite(value) || value <= 0 || requestedMs <= 0) {
      setTimeCorrectionError(t("timeCorrection.invalidMinutes"));
      return;
    }

    const applyAt = Date.now();
    setIsApplyingTimeCorrection(true);
    try {
      if (timeCorrectionMode === "addDuringPause") {
        if (activeSession.status !== "paused") return;
        const totalPausedMs = getPausedDuration(activeSession.pauses, applyAt);
        if (requestedMs > totalPausedMs) {
          setTimeCorrectionError(t("timeCorrection.exceedsPausedTime"));
          return;
        }

        const nextSession: ActiveSession = {
          ...activeSession,
          pauses: reducePausedDuration(activeSession.pauses, requestedMs, applyAt),
        };
        await saveActiveSession(nextSession, applyAt);
        setActiveSession(nextSession);
        setNow(applyAt);
        closeTimeCorrectionModal();
        return;
      }

      if (activeSession.status !== "running") return;
      const effectiveMs = getEffectiveDuration(activeSession, getTimerDisplayNow(activeSession, applyAt));
      if (requestedMs > effectiveMs) {
        setTimeCorrectionError(t("timeCorrection.exceedsEffectiveTime"));
        return;
      }

      const nextSession: ActiveSession = {
        ...activeSession,
        pauses: [...activeSession.pauses, { startedAt: applyAt - requestedMs, endedAt: applyAt }],
      };
      await saveActiveSession(nextSession, applyAt);
      setActiveSession(nextSession);
      setNow(applyAt);
      closeTimeCorrectionModal();
    } catch (error) {
      console.error("Failed to apply time correction", error);
      logCriticalError("session.timeCorrection.apply", error);
      setTimeCorrectionError(t("timeCorrection.genericError"));
    } finally {
      setIsApplyingTimeCorrection(false);
    }
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
      setEnergy("regular");
      setIsCreateSessionOpen(false);
      setRecoveryNoticeVisible(false);
      if (sessionSavedFeedbackTimeoutRef.current) {
        window.clearTimeout(sessionSavedFeedbackTimeoutRef.current);
      }
      setSessionSavedFeedbackVisible(true);
      sessionSavedFeedbackTimeoutRef.current = window.setTimeout(() => {
        setSessionSavedFeedbackVisible(false);
        sessionSavedFeedbackTimeoutRef.current = null;
      }, 3000);
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
      setForgottenStartMinutes("0");
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
      field === "energy"
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

  function renderHome() {
    return (
      <HomePage
        recoveryNoticeVisible={recoveryNoticeVisible}
        onDismissRecoveryNotice={() => setRecoveryNoticeVisible(false)}
        greetingKey={greetingKey}
        nowDate={nowDate}
        language={language}
        activeSession={activeSession}
        effectiveDurationMs={effectiveDurationMs}
        onOpenCreateSession={() => setIsCreateSessionOpen(true)}
        pauseSession={pauseSession}
        resumeSession={resumeSession}
        finishSession={finishSession}
        discardSession={discardSession}
        isStartingSession={isStartingSession}
        isPausingSession={isPausingSession}
        isResumingSession={isResumingSession}
        isFinishingSession={isFinishingSession}
        isCreateSessionOpen={isCreateSessionOpen}
        title={title}
        setTitle={setTitle}
        category={category}
        setCategory={setCategory}
        forgottenStartMinutes={forgottenStartMinutes}
        setForgottenStartMinutes={setForgottenStartMinutes}
        isForgottenStartMinutesValid={isForgottenStartMinutesValid}
        energy={energy}
        setEnergy={setEnergy}
        categorySuggestionsOpen={categorySuggestionsOpen}
        setCategorySuggestionsOpen={setCategorySuggestionsOpen}
        filteredCategorySuggestions={filteredCategorySuggestions}
        canStartSession={canStartSession}
        requestStartSession={requestStartSession}
        closeCreateSession={() => {
          setIsCreateSessionOpen(false);
          setForgottenStartMinutes("0");
        }}
        renderMoodFace={renderMoodFace}
        duplicateTitleCandidate={duplicateTitleCandidate}
        setDuplicateTitleCandidate={setDuplicateTitleCandidate}
        commitStartSession={commitStartSession}
        getAutoRenamedSessionTitle={getAutoRenamedSessionTitle}
        recentHomeSessions={recentHomeSessions}
        onOpenAddTimeModal={openAddTimeModal}
        onOpenRemoveTimeModal={openRemoveTimeModal}
        timeCorrectionMode={timeCorrectionMode}
        timeCorrectionMinutes={timeCorrectionMinutes}
        setTimeCorrectionMinutes={handleTimeCorrectionMinutesChange}
        timeCorrectionError={timeCorrectionError}
        isApplyingTimeCorrection={isApplyingTimeCorrection}
        onCloseTimeCorrectionModal={closeTimeCorrectionModal}
        onApplyTimeCorrection={applyTimeCorrection}
      />
    );
  }

  const analyticsProps = {
    t,
    analyticsTab,
    setAnalyticsTab,
    completedSessions,
    dashboardSessions,
    dashboardCategoryFilter,
    setDashboardCategoryFilter,
    dashboardCategoryOptions,
    sessionHistorySearch,
    setSessionHistorySearch,
    handleExportBackup,
    handleImportBackup,
    isBackupBusy,
    sessionHistoryWeekdayFilter,
    setSessionHistoryWeekdayFilter,
    sessionHistoryEnergyFilter,
    setSessionHistoryEnergyFilter,
    sessionHistoryCategoryFilter,
    setSessionHistoryCategoryFilter,
    usedCategories,
    sessionHistoryDurationFilter,
    setSessionHistoryDurationFilter,
    sessionHistoryPauseFilter,
    setSessionHistoryPauseFilter,
    resetSessionHistoryView,
    hasSessionHistoryQueryOrFilters,
    activeSessionHistoryFilterCount,
    backupFeedback,
    isBackupFeedbackVisible,
    sessionHistoryEditError,
    visibleSessionHistorySessions,
    paginatedSessionHistorySessions,
    sessionHistoryEditing,
    setSessionHistoryEditing,
    saveSessionHistoryInlineEdit,
    handleSessionHistoryInlineEditKeyDown,
    startSessionHistoryInlineEdit,
    deleteCompletedSession,
    sessionHistoryPage,
    setSessionHistoryPage,
    sessionHistoryTotalPages,
    sessionHistorySort,
    handleSessionHistorySort,
    renderMoodFace,
    sessionHistoryPageSize: SESSION_HISTORY_PAGE_SIZE,
  };

  function renderAnalyticsPage() {
    return <AnalyticsPage {...analyticsProps} />;
  }

  function renderSettingsPage() {
    return (
      <SettingsPage
        settingsFeedback={settingsFeedback}
        language={language}
        setLanguage={setLanguage}
        themeMode={themeMode}
        toggleThemeMode={() => setThemeMode((prev) => (prev === "light" ? "dark" : "light"))}
        handleToggleAutostart={handleToggleAutostart}
        isAutostartLoading={isAutostartLoading}
        isAutostartEnabled={isAutostartEnabled}
        openDeleteAllConfirm={() => setIsDeleteAllConfirmOpen(true)}
        isDeleteAllConfirmOpen={isDeleteAllConfirmOpen}
        closeDeleteAllConfirm={() => setIsDeleteAllConfirmOpen(false)}
        isDeletingAllSessions={isDeletingAllSessions}
        handleConfirmDeleteAllSessions={handleConfirmDeleteAllSessions}
      />
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
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756.427 1.756 2.925 0 3.352a1.724 1.724 0 0 0-1.066 2.572c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 0 0-2.572 1.065c-.427 1.756-2.925 1.756-3.352 0a1.724 1.724 0 0 0-2.572-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 0 0-1.065-2.572c-1.756-.427-1.756-2.925 0-3.352a1.724 1.724 0 0 0 1.066-2.572c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065Z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 15.75a3.75 3.75 0 1 0 0-7.5 3.75 3.75 0 0 0 0 7.5Z"
        />
      </svg>
    );
  }

  const navItems: NavItem[] = [
    { page: "home", label: t("nav.home") },
    { page: "analytics", label: t("nav.analytics") },
    { page: "settings", label: t("nav.settings") },
  ];

  return (
    <AppLayout
      header={renderHeader()}
      navItems={navItems}
      activePage={activePage}
      onNavigate={setActivePage}
      renderNavIcon={renderNavIcon}
      isStartupComplete={isStartupComplete}
      isStartupLeaving={isStartupLeaving}
      sessionSavedFeedbackVisible={sessionSavedFeedbackVisible}
      sessionSavedFeedbackMessage={t("home.sessionSavedSuccess")}
      startupLogoSrc={logoHeader}
      themeMode={themeMode}
    >
      {activePage === "home"
        ? renderHome()
        : activePage === "settings"
          ? renderSettingsPage()
          : renderAnalyticsPage()}
    </AppLayout>
  );
}

export default App;
