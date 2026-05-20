import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import logoHeader from "./assets/logo/logoHeader.png";
import { buildAnalyticsSummary } from "./features/analytics/analyticsSummary";
import {
  deleteActiveSession,
  deleteCompletedSession as deleteCompletedSessionFromRepository,
  getCompletedSessions,
  getRecoverableActiveSession,
  saveActiveSession,
  saveCompletedSession,
  touchActiveSession,
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

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => window.clearInterval(interval);
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
      });
    }, 7500);

    return () => {
      window.clearInterval(interval);
    };
  }, [activeSession]);

  const nowDate = useMemo(() => new Date(now), [now]);
  const greetingKey = useMemo(() => getGreetingKey(nowDate), [nowDate]);

  const effectiveDurationMs = useMemo(() => {
    if (!activeSession) return 0;
    return getEffectiveDuration(activeSession, now);
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

  const canStartSession = title.trim().length > 0 && !activeSession;

  async function startSession() {
    if (!canStartSession) return;
    const startedAt = Date.now();
    const session: ActiveSession = {
      id: crypto.randomUUID(),
      title: title.trim(),
      category: category.trim(),
      tags: parseTags(tagsInput),
      energy,
      startedAt,
      pauses: [],
      status: "running",
    };

    try {
      await saveActiveSession(session, startedAt);
      setActiveSession(session);
      setIsCreateSessionOpen(false);
      setRecoveryNoticeVisible(false);
    } catch (error) {
      console.error("Failed to persist active session on start", {
        error,
        source: "saveActiveSession",
        sessionId: session.id,
      });
    }
  }

  async function pauseSession() {
    if (!activeSession || activeSession.status !== "running") return;
    const pauseStartedAt = Date.now();
    const nextSession: ActiveSession = {
      ...activeSession,
      status: "paused",
      pauses: [...activeSession.pauses, { startedAt: pauseStartedAt, endedAt: null }],
    };

    try {
      await saveActiveSession(nextSession, pauseStartedAt);
      setActiveSession(nextSession);
    } catch (error) {
      console.error("Failed to persist active session on pause", {
        error,
        source: "saveActiveSession",
        sessionId: activeSession.id,
      });
    }
  }

  async function resumeSession() {
    if (!activeSession || activeSession.status !== "paused") return;
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

    try {
      await saveActiveSession(nextSession, resumedAt);
      setActiveSession(nextSession);
    } catch (error) {
      console.error("Failed to persist active session on resume", {
        error,
        source: "saveActiveSession",
        sessionId: activeSession.id,
      });
    }
  }

  async function finishSession() {
    if (!activeSession) return;
    const endedAt = Date.now();
    const pauses = [...activeSession.pauses];
    if (activeSession.status === "paused") {
      for (let index = pauses.length - 1; index >= 0; index -= 1) {
        if (pauses[index].endedAt === null) {
          pauses[index] = { ...pauses[index], endedAt };
          break;
        }
      }
    }

    const sessionToSave: ActiveSession = {
      ...activeSession,
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
    }
  }

  async function deleteCompletedSession(sessionId: string) {
    try {
      await deleteCompletedSessionFromRepository(sessionId);
      setCompletedSessions((prev) => prev.filter((session) => session.id !== sessionId));
    } catch (error) {
      console.error("Failed to delete completed session from SQLite", error);
    }
  }

  function renderHeader() {
    return (
      <header className="flex h-20 shrink-0 items-center justify-between border-b border-[var(--border)] bg-[var(--panel-bg)] px-7">
        <div className="flex items-center">
          <img src={logoHeader} alt={t("app.name")} className="h-32 w-auto object-contain" />
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--panel-bg)] text-[var(--text-muted)] hover:bg-[var(--panel-muted)]"
            aria-label="Notifications"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-[1.05rem] w-[1.05rem]"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <path d="M12 5a4 4 0 0 0-4 4v2.5c0 .8-.3 1.5-.8 2.1L6 15h12l-1.2-1.4a3 3 0 0 1-.8-2.1V9a4 4 0 0 0-4-4Z" />
              <path d="M10.5 18a1.5 1.5 0 0 0 3 0" />
            </svg>
          </button>
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--panel-bg)] text-[var(--text-muted)] hover:bg-[var(--panel-muted)]"
            aria-label="Profile"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-[1.05rem] w-[1.05rem]"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <circle cx="12" cy="8" r="3" />
              <path d="M6.5 18a5.5 5.5 0 0 1 11 0" />
            </svg>
          </button>
        </div>
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
              className="rounded-xl border border-[var(--border)] bg-[var(--panel-muted)] px-4 py-2 text-sm font-medium text-[var(--text-muted)] hover:opacity-90"
            >
              {t("sessionModal.cancel")}
            </button>
            <button
              type="button"
              onClick={startSession}
              disabled={!canStartSession}
              className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t("sessionModal.start")}
            </button>
          </div>
        </div>
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
                className="rounded-xl border border-[var(--border)] bg-[var(--panel-bg)] px-5 py-2.5 text-base font-medium text-[var(--text)] transition duration-200 ease-out hover:-translate-y-0.5 hover:bg-[var(--panel-muted)] hover:opacity-95 active:translate-y-0"
              >
                {t("home.pause")}
              </button>
            ) : null}

            {activeSession?.status === "paused" ? (
              <button
                type="button"
                onClick={resumeSession}
                className="rounded-xl border border-[var(--border)] bg-[var(--panel-bg)] px-5 py-2.5 text-base font-medium text-[var(--text)] transition duration-200 ease-out hover:-translate-y-0.5 hover:bg-[var(--panel-muted)] hover:opacity-95 active:translate-y-0"
              >
                {t("home.resume")}
              </button>
            ) : null}

            {activeSession ? (
              <>
                <button
                  type="button"
                  onClick={finishSession}
                  className="rounded-xl border border-emerald-300 bg-emerald-50 px-5 py-2.5 text-base font-medium text-emerald-800 transition duration-200 ease-out hover:-translate-y-0.5 hover:bg-emerald-100 hover:opacity-95 active:translate-y-0"
                >
                  {t("home.finish")}
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
              ) : (
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
                          {t("analytics.sessionHistory.columns.startDate")}
                        </th>
                        <th className="px-5 py-3.5 font-semibold">
                          {t("analytics.sessionHistory.columns.endDate")}
                        </th>
                        <th className="px-5 py-3.5 font-semibold">
                          {t("analytics.sessionHistory.columns.duration")}
                        </th>
                        <th className="px-5 py-3.5 font-semibold">
                          {t("analytics.sessionHistory.columns.pauseCount")}
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
                          {t("analytics.sessionHistory.columns.energy")}
                        </th>
                        <th className="px-5 py-3.5 text-right font-semibold">
                          {t("analytics.sessionHistory.columns.actions")}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                      {completedSessions.map((session) => (
                        <tr
                          key={session.id}
                          className="transition-colors duration-150 hover:bg-[var(--panel-muted)]/35"
                        >
                          <td className="px-5 py-4 text-sm font-semibold text-[var(--text)]">
                            {session.title}
                          </td>
                          <td className="px-5 py-4 text-sm text-[var(--text-muted)]">
                            {session.category || t("home.uncategorized")}
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
                            {session.pauseCount}
                          </td>
                          <td className="px-5 py-4 text-sm text-[var(--text-muted)]">
                            {formatHumanDuration(session.pausedDurationMs)}
                          </td>
                          <td className="px-5 py-4 text-sm text-[var(--text-muted)]">
                            {session.tags.length > 0 ? (
                              <div className="flex flex-wrap gap-1.5">
                                {session.tags.map((tag) => (
                                  <span
                                    key={`${session.id}-table-${tag}`}
                                    className="rounded-full border border-[var(--border)] bg-[var(--panel-muted)] px-2 py-0.5 text-xs text-[var(--text-muted)]"
                                  >
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-[var(--text-muted)]/80">
                                {t("analytics.sessionHistory.noTags")}
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-4 text-sm text-[var(--text-muted)]">
                            {t(`analytics.weekdays.${session.weekday}`)}
                          </td>
                          <td className="px-5 py-4 text-sm">
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--panel-muted)] px-2.5 py-1 text-[var(--text-muted)]">
                              {renderMoodFace(session.energy, "h-3.5 w-3.5")}
                              <span>{t(`analytics.energy.${session.energy}`)}</span>
                            </span>
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
  );
}

export default App;
