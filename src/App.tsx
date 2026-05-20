import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import logoHeader from "./assets/logo/logoHeader.png";
import {
  deleteCompletedSession as deleteCompletedSessionFromRepository,
  getCompletedSessions,
  saveCompletedSession,
} from "./features/sessions/sessionRepository";
import type {
  ActiveSession,
  CompletedSession,
  PausePeriod,
} from "./features/sessions/sessionTypes";

type Page = "home" | "analytics" | "settings";
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
  if (hour < 12) return "home.goodMorning";
  if (hour < 18) return "home.goodAfternoon";
  return "home.goodEvening";
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
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
  const [completedSessions, setCompletedSessions] = useState<CompletedSession[]>([]);
  const [showAllCompletedSessions, setShowAllCompletedSessions] = useState<boolean>(false);
  const [categorySuggestionsOpen, setCategorySuggestionsOpen] = useState(false);
  const [tagSuggestionsOpen, setTagSuggestionsOpen] = useState(false);

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

    async function loadCompletedSessions() {
      try {
        const sessions = await getCompletedSessions();
        if (!cancelled) {
          setCompletedSessions(sessions);
        }
      } catch (error) {
        console.error("Failed to load completed sessions from SQLite", error);
      }
    }

    void loadCompletedSessions();

    return () => {
      cancelled = true;
    };
  }, []);

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

  function startSession() {
    if (!canStartSession) return;
    const startedAt = Date.now();
    setActiveSession({
      id: crypto.randomUUID(),
      title: title.trim(),
      category: category.trim(),
      tags: parseTags(tagsInput),
      startedAt,
      pauses: [],
      status: "running",
    });
    setIsCreateSessionOpen(false);
  }

  function pauseSession() {
    if (!activeSession || activeSession.status !== "running") return;
    const pauseStartedAt = Date.now();
    setActiveSession({
      ...activeSession,
      status: "paused",
      pauses: [...activeSession.pauses, { startedAt: pauseStartedAt, endedAt: null }],
    });
  }

  function resumeSession() {
    if (!activeSession || activeSession.status !== "paused") return;
    const resumedAt = Date.now();
    const pauses = [...activeSession.pauses];
    for (let index = pauses.length - 1; index >= 0; index -= 1) {
      if (pauses[index].endedAt === null) {
        pauses[index] = { ...pauses[index], endedAt: resumedAt };
        break;
      }
    }
    setActiveSession({
      ...activeSession,
      status: "running",
      pauses,
    });
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
      startedAt: sessionToSave.startedAt,
      endedAt,
      effectiveDurationMs: getEffectiveDuration(sessionToSave, endedAt),
      pauses,
    };

    try {
      await saveCompletedSession(completed);
      setCompletedSessions((prev) => [completed, ...prev]);
      setActiveSession(null);
      setTitle("");
      setCategory("");
      setTagsInput("");
      setIsCreateSessionOpen(false);
    } catch (error) {
      console.error("Failed to save completed session to SQLite", error);
    }
  }

  function discardSession() {
    setActiveSession(null);
    setIsCreateSessionOpen(false);
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
      <section className="relative flex h-full flex-col px-8 py-7">
        <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center text-center">
          <p className="text-lg text-[var(--text-muted)]">{t(greetingKey)}</p>
          <p className="mt-1 text-base text-[var(--text-muted)]">
            {nowDate.toLocaleDateString(undefined, {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}{" "}
            - {nowDate.toLocaleTimeString()}
          </p>

          <div className="mt-10 rounded-3xl border border-[var(--border)] bg-[var(--panel-bg)] px-10 py-8 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
              {t("home.activeSessionTimer")}
            </p>
            <p className="mt-3 text-7xl font-semibold tracking-tight text-[var(--text)]">
              {activeSession ? formatDuration(effectiveDurationMs) : "00:00:00"}
            </p>
            <div className="mt-4 flex items-center justify-center gap-2">
              <span
                className={`rounded-full px-3 py-1 text-sm font-medium ${
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

          <div className="mt-8 flex min-h-12 flex-wrap items-center justify-center gap-3">
            {!activeSession ? (
              <button
                type="button"
                onClick={() => setIsCreateSessionOpen(true)}
                className="rounded-full bg-gradient-to-r from-[#4E89FF] to-[#5F8FFF] px-8 py-3 text-lg font-semibold text-white shadow-[0_10px_24px_rgba(78,137,255,0.34)] transition duration-200 ease-out hover:scale-[1.02] hover:from-[#5B93FF] hover:to-[#6D9BFF] hover:shadow-[0_14px_30px_rgba(78,137,255,0.42)] active:scale-[0.98]"
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

          <div className="mt-10 w-full rounded-2xl border border-[var(--border)] bg-[var(--panel-bg)] p-5 text-left">
            <h2 className="text-lg font-semibold text-[var(--text)]">
              {t("home.completedSessions")}
            </h2>
            {completedSessions.length === 0 ? (
              <p className="mt-3 text-base text-[var(--text-muted)]">
                {t("home.noCompletedSessions")}
              </p>
            ) : (
              <div className="mt-3 space-y-3">
                <ul className="space-y-3">
                  {completedSessions.slice(0, 2).map((session) => (
                    <li
                      key={session.id}
                      className="rounded-xl border border-[var(--border)] bg-[var(--panel-muted)] p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-base font-semibold text-[var(--text)]">
                            {session.title}
                          </p>
                          <p className="mt-1 text-base text-[var(--text-muted)]">
                            {session.category || t("home.uncategorized")} -{" "}
                            {formatHumanDuration(session.effectiveDurationMs)}
                          </p>
                          <p className="mt-1 text-sm text-[var(--text-muted)]">
                            {t("home.started")} {new Date(session.startedAt).toLocaleTimeString()} -{" "}
                            {t("home.finished")} {new Date(session.endedAt).toLocaleTimeString()}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => deleteCompletedSession(session.id)}
                          aria-label={t("home.deleteSession")}
                          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-rose-400 transition duration-200 ease-out hover:bg-rose-500/10 hover:text-rose-500"
                        >
                          <svg
                            viewBox="0 0 24 24"
                            className="h-5 w-5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                          >
                            <path d="M4 7h16" />
                            <path d="M9 7V5h6v2" />
                            <path d="M8 7l1 12h6l1-12" />
                            <path d="M10 11v5M14 11v5" />
                          </svg>
                          <span>{t("home.delete")}</span>
                        </button>
                      </div>
                      {session.tags.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {session.tags.map((tag) => (
                            <span
                              key={`${session.id}-${tag}`}
                              className="rounded-full border border-[var(--border)] px-2 py-0.5 text-sm text-[var(--text-muted)]"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>

                <div
                  className={`overflow-hidden transition-all duration-300 ease-out ${
                    showAllCompletedSessions ? "max-h-[1200px] opacity-100" : "max-h-0 opacity-0"
                  }`}
                >
                  <ul
                    className={`space-y-3 transition-all duration-300 ease-out ${
                      showAllCompletedSessions ? "translate-y-0 pt-3" : "-translate-y-1 pt-0"
                    }`}
                  >
                    {completedSessions.slice(2).map((session) => (
                      <li
                        key={session.id}
                        className="rounded-xl border border-[var(--border)] bg-[var(--panel-muted)] p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-base font-semibold text-[var(--text)]">
                              {session.title}
                            </p>
                            <p className="mt-1 text-base text-[var(--text-muted)]">
                              {session.category || t("home.uncategorized")} -{" "}
                              {formatHumanDuration(session.effectiveDurationMs)}
                            </p>
                            <p className="mt-1 text-sm text-[var(--text-muted)]">
                              {t("home.started")} {new Date(session.startedAt).toLocaleTimeString()}{" "}
                              - {t("home.finished")}{" "}
                              {new Date(session.endedAt).toLocaleTimeString()}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => deleteCompletedSession(session.id)}
                            aria-label={t("home.deleteSession")}
                            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-rose-400 transition duration-200 ease-out hover:bg-rose-500/10 hover:text-rose-500"
                          >
                            <svg
                              viewBox="0 0 24 24"
                              className="h-5 w-5"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.8"
                            >
                              <path d="M4 7h16" />
                              <path d="M9 7V5h6v2" />
                              <path d="M8 7l1 12h6l1-12" />
                              <path d="M10 11v5M14 11v5" />
                            </svg>
                            <span>{t("home.delete")}</span>
                          </button>
                        </div>
                        {session.tags.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {session.tags.map((tag) => (
                              <span
                                key={`${session.id}-${tag}`}
                                className="rounded-full border border-[var(--border)] px-2 py-0.5 text-sm text-[var(--text-muted)]"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>

                {completedSessions.length > 2 ? (
                  <div className="flex justify-center">
                    <button
                      type="button"
                      onClick={() => setShowAllCompletedSessions((prev) => !prev)}
                      className="group inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-[#4E89FF] transition duration-200 ease-out hover:-translate-y-0.5 hover:text-[#6A9BFF]"
                    >
                      <span>
                        {showAllCompletedSessions ? t("home.viewLess") : t("home.viewMore")}
                      </span>
                      <svg
                        viewBox="0 0 24 24"
                        className={`h-4 w-4 transition-transform duration-200 ${showAllCompletedSessions ? "rotate-180" : "rotate-0"}`}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                      >
                        <path d="m6 9 6 6 6-6" />
                      </svg>
                    </button>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>

        {renderCreateSessionModal()}
      </section>
    );
  }

  function renderPlaceholderPage() {
    return (
      <section className="flex h-full items-center justify-center px-8 py-10">
        <div className="w-full max-w-2xl rounded-2xl border border-[var(--border)] bg-[var(--panel-bg)] p-8 text-center shadow-[0_8px_28px_rgba(15,23,42,0.06)]">
          <p className="text-base font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
            {t("app.name")}
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--text)]">
            {t("nav.analytics")}
          </h1>
          <p className="mt-4 text-base leading-7 text-[var(--text-muted)]">
            {t("placeholder.futurePage")}
          </p>
        </div>
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
    const baseClass = "h-7 w-7";
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
          <aside className="flex w-36 shrink-0 border-r border-[var(--border)] bg-[var(--sidebar-bg)] px-3 py-5">
            <nav className="flex h-full w-full flex-col justify-evenly">
              {navItems.map((item) => (
                <button
                  key={item.page}
                  type="button"
                  onClick={() => setActivePage(item.page)}
                  className={`relative flex flex-col items-center justify-center gap-2 rounded-2xl px-2 py-3.5 text-center transition ${
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
                  <span className="text-sm font-semibold leading-none tracking-[0.05em]">
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
                : renderPlaceholderPage()}
          </div>
        </div>
      </div>
    </main>
  );
}

export default App;
