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
import { buildAnalyticsSummary } from "./features/analytics/analyticsSummary";
import {
  buildDebugReport,
  clearDebugLogEntries,
  getDebugLogEntries,
  recordCriticalError,
  type DebugLogEntry,
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
  formatSessionDate,
  getBackupDefaultFileName,
  getGreetingKey,
  getWeekdayFromTimestamp,
} from "./shared/utils/dateUtils";
import {
  getEffectiveDuration,
  getPausedDuration,
  getTimerDisplayNow,
  formatHumanDuration,
} from "./shared/utils/durationUtils";
import {
  getEnergyBadgeClasses,
  getEnergySortValue,
  isHighInterruptionSession,
} from "./shared/utils/energyUtils";
import {
  normalizeDuplicateTitle,
  normalizeSearchValue,
  parseTags,
} from "./shared/utils/searchUtils";

const SESSION_HISTORY_PAGE_SIZE = 8;
const APP_VERSION = "0.1.0";

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
  const [sessionSavedFeedbackVisible, setSessionSavedFeedbackVisible] = useState(false);
  const backupFadeTimeoutRef = useRef<number | null>(null);
  const backupRemoveTimeoutRef = useRef<number | null>(null);
  const sessionSavedFeedbackTimeoutRef = useRef<number | null>(null);

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
        tagsInput={tagsInput}
        setTagsInput={setTagsInput}
        energy={energy}
        setEnergy={setEnergy}
        categorySuggestionsOpen={categorySuggestionsOpen}
        setCategorySuggestionsOpen={setCategorySuggestionsOpen}
        filteredCategorySuggestions={filteredCategorySuggestions}
        tagSuggestionsOpen={tagSuggestionsOpen}
        setTagSuggestionsOpen={setTagSuggestionsOpen}
        filteredTagSuggestions={filteredTagSuggestions}
        canStartSession={canStartSession}
        requestStartSession={requestStartSession}
        closeCreateSession={() => setIsCreateSessionOpen(false)}
        renderMoodFace={renderMoodFace}
        duplicateTitleCandidate={duplicateTitleCandidate}
        setDuplicateTitleCandidate={setDuplicateTitleCandidate}
        commitStartSession={commitStartSession}
        getAutoRenamedSessionTitle={getAutoRenamedSessionTitle}
      />
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
        debugLogEntries={debugLogEntries}
        isDebugActionBusy={isDebugActionBusy}
        handleCopyDebugInfo={handleCopyDebugInfo}
        handleClearDebugLogs={handleClearDebugLogs}
        handleExportDebugReport={handleExportDebugReport}
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
        <path d="M12 8.8a3.2 3.2 0 1 0 0 6.4 3.2 3.2 0 0 0 0-6.4Z" />
        <path d="M19 12a1 1 0 0 0-.7-1l-1.1-.3a5.6 5.6 0 0 0-.5-1.2l.6-1a1 1 0 0 0-.1-1.2l-.9-.9a1 1 0 0 0-1.2-.1l-1 .6a5.6 5.6 0 0 0-1.2-.5l-.3-1.1a1 1 0 0 0-1-.7h-1.2a1 1 0 0 0-1 .7l-.3 1.1a5.6 5.6 0 0 0-1.2.5l-1-.6a1 1 0 0 0-1.2.1l-.9.9a1 1 0 0 0-.1 1.2l.6 1a5.6 5.6 0 0 0-.5 1.2l-1.1.3a1 1 0 0 0-.7 1v1.2a1 1 0 0 0 .7 1l1.1.3c.1.4.3.8.5 1.2l-.6 1a1 1 0 0 0 .1 1.2l.9.9a1 1 0 0 0 1.2.1l1-.6c.4.2.8.4 1.2.5l.3 1.1a1 1 0 0 0 1 .7h1.2a1 1 0 0 0 1-.7l.3-1.1c.4-.1.8-.3 1.2-.5l1 .6a1 1 0 0 0 1.2-.1l.9-.9a1 1 0 0 0 .1-1.2l-.6-1c.2-.4.4-.8.5-1.2l1.1-.3a1 1 0 0 0 .7-1V12Z" />
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
