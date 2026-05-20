import { useEffect, useMemo, useState } from "react";
import logoHeader from "./assets/logo/logoHeader.png";

type Page = "home" | "goals" | "analytics" | "settings";

type PausePeriod = {
  startedAt: number;
  endedAt: number | null;
};

type ActiveSession = {
  id: string;
  title: string;
  category: string;
  tags: string[];
  startedAt: number;
  pauses: PausePeriod[];
  status: "running" | "paused";
};

type CompletedSession = {
  id: string;
  title: string;
  category: string;
  tags: string[];
  startedAt: number;
  endedAt: number;
  effectiveDurationMs: number;
  pauses: PausePeriod[];
};

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

function getGreeting(date: Date): string {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function App() {
  const [activePage, setActivePage] = useState<Page>("home");
  const [isCreateSessionOpen, setIsCreateSessionOpen] = useState<boolean>(false);
  const [now, setNow] = useState<number>(Date.now());
  const [title, setTitle] = useState<string>("");
  const [category, setCategory] = useState<string>("");
  const [tagsInput, setTagsInput] = useState<string>("");
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
  const [completedSessions, setCompletedSessions] = useState<CompletedSession[]>([]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => window.clearInterval(interval);
  }, []);

  const nowDate = useMemo(() => new Date(now), [now]);
  const greeting = useMemo(() => getGreeting(nowDate), [nowDate]);

  const effectiveDurationMs = useMemo(() => {
    if (!activeSession) return 0;
    return getEffectiveDuration(activeSession, now);
  }, [activeSession, now]);

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

  function finishSession() {
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

    setCompletedSessions((prev) => [completed, ...prev]);
    setActiveSession(null);
    setTitle("");
    setCategory("");
    setTagsInput("");
    setIsCreateSessionOpen(false);
  }

  function discardSession() {
    setActiveSession(null);
    setIsCreateSessionOpen(false);
  }

  function renderHeader() {
    return (
      <header className="flex h-20 shrink-0 items-center justify-between border-b border-slate-200 px-7">
        <div className="flex items-center">
          <img src={logoHeader} alt="Chronolytic" className="h-11 w-auto object-contain" />
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
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
            className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
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
      <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-900/35 p-6">
        <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
          <h2 className="text-lg font-semibold text-slate-900">Create Session</h2>
          <p className="mt-1 text-sm text-slate-600">
            Define title, category, and tags before starting.
          </p>

          <div className="mt-5 grid gap-4">
            <label className="flex flex-col gap-2 text-sm text-slate-700">
              Title
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-slate-300 transition focus:ring"
                placeholder="Study: Linear Algebra"
              />
            </label>

            <label className="flex flex-col gap-2 text-sm text-slate-700">
              Category
              <input
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-slate-300 transition focus:ring"
                placeholder="Study"
              />
            </label>

            <label className="flex flex-col gap-2 text-sm text-slate-700">
              Tags (comma-separated)
              <input
                value={tagsInput}
                onChange={(event) => setTagsInput(event.target.value)}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-slate-300 transition focus:ring"
                placeholder="math, focus, exam"
              />
            </label>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setIsCreateSessionOpen(false)}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={startSession}
              disabled={!canStartSession}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              Start session
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
          <p className="text-lg text-slate-600">{greeting}</p>
          <p className="mt-1 text-base text-slate-500">
            {nowDate.toLocaleDateString(undefined, {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}{" "}
            - {nowDate.toLocaleTimeString()}
          </p>

          <div className="mt-10 rounded-3xl border border-slate-200 bg-white px-10 py-8 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">
              Active session timer
            </p>
            <p className="mt-3 text-7xl font-semibold tracking-tight text-slate-900">
              {activeSession ? formatDuration(effectiveDurationMs) : "00:00:00"}
            </p>
            <div className="mt-4 flex items-center justify-center gap-2">
              <span
                className={`rounded-full px-3 py-1 text-sm font-medium ${
                  activeSession?.status === "running"
                    ? "bg-emerald-100 text-emerald-700"
                    : activeSession?.status === "paused"
                      ? "bg-amber-100 text-amber-700"
                      : "bg-slate-100 text-slate-600"
                }`}
              >
                {activeSession ? `Status: ${activeSession.status}` : "No active session"}
              </span>
            </div>
            {activeSession ? (
              <div className="mt-4 text-base text-slate-600">
                <p className="font-medium text-slate-800">{activeSession.title}</p>
                <p>{activeSession.category || "Uncategorized"}</p>
                {activeSession.tags.length > 0 ? (
                  <div className="mt-2 flex flex-wrap justify-center gap-2">
                    {activeSession.tags.map((tag) => (
                      <span
                        key={`${activeSession.id}-active-${tag}`}
                        className="rounded-full border border-slate-300 px-2 py-0.5 text-sm text-slate-700"
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
                className="rounded-xl bg-slate-900 px-5 py-2.5 text-base font-medium text-white transition duration-200 ease-out hover:-translate-y-0.5 hover:bg-slate-800 hover:opacity-95 active:translate-y-0"
              >
                Create Session
              </button>
            ) : null}

            {activeSession?.status === "running" ? (
              <button
                type="button"
                onClick={pauseSession}
                className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-base font-medium text-slate-800 transition duration-200 ease-out hover:-translate-y-0.5 hover:bg-slate-50 hover:opacity-95 active:translate-y-0"
              >
                Pause
              </button>
            ) : null}

            {activeSession?.status === "paused" ? (
              <button
                type="button"
                onClick={resumeSession}
                className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-base font-medium text-slate-800 transition duration-200 ease-out hover:-translate-y-0.5 hover:bg-slate-50 hover:opacity-95 active:translate-y-0"
              >
                Resume
              </button>
            ) : null}

            {activeSession ? (
              <>
                <button
                  type="button"
                  onClick={finishSession}
                  className="rounded-xl border border-emerald-300 bg-emerald-50 px-5 py-2.5 text-base font-medium text-emerald-800 transition duration-200 ease-out hover:-translate-y-0.5 hover:bg-emerald-100 hover:opacity-95 active:translate-y-0"
                >
                  Finish
                </button>

                <button
                  type="button"
                  onClick={discardSession}
                  className="rounded-xl border border-rose-300 bg-rose-50 px-5 py-2.5 text-base font-medium text-rose-800 transition duration-200 ease-out hover:-translate-y-0.5 hover:bg-rose-100 hover:opacity-95 active:translate-y-0"
                >
                  Discard
                </button>
              </>
            ) : null}
          </div>

          <div className="mt-10 w-full rounded-2xl border border-slate-200 bg-white p-5 text-left">
            <h2 className="text-lg font-semibold text-slate-900">Completed sessions</h2>
            {completedSessions.length === 0 ? (
              <p className="mt-3 text-base text-slate-600">No completed sessions yet.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {completedSessions.map((session) => (
                  <li
                    key={session.id}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                  >
                    <p className="text-base font-semibold text-slate-900">{session.title}</p>
                    <p className="mt-1 text-base text-slate-600">
                      {session.category || "Uncategorized"} -{" "}
                      {formatHumanDuration(session.effectiveDurationMs)}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      Started {new Date(session.startedAt).toLocaleTimeString()} - Finished{" "}
                      {new Date(session.endedAt).toLocaleTimeString()}
                    </p>
                    {session.tags.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {session.tags.map((tag) => (
                          <span
                            key={`${session.id}-${tag}`}
                            className="rounded-full border border-slate-300 px-2 py-0.5 text-sm text-slate-700"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {renderCreateSessionModal()}
      </section>
    );
  }

  function renderPlaceholderPage(page: Exclude<Page, "home">) {
    const titleMap: Record<Exclude<Page, "home">, string> = {
      goals: "Goals",
      analytics: "Analytics",
      settings: "Settings",
    };

    return (
      <section className="flex h-full items-center justify-center px-8 py-10">
        <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-[0_8px_28px_rgba(15,23,42,0.06)]">
          <p className="text-base font-semibold uppercase tracking-[0.14em] text-slate-500">
            Chronolytic
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">
            {titleMap[page]}
          </h1>
          <p className="mt-4 text-base leading-7 text-slate-600">
            This page is intentionally a placeholder for a future iteration.
          </p>
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
    if (page === "goals") {
      return (
        <svg
          viewBox="0 0 24 24"
          className={baseClass}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <circle cx="12" cy="12" r="8" />
          <circle cx="12" cy="12" r="3" />
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
    { page: "home", label: "Home" },
    { page: "goals", label: "Goals" },
    { page: "analytics", label: "Analytics" },
    { page: "settings", label: "Settings" },
  ];

  return (
    <main className="flex h-screen w-screen overflow-hidden">
      <div className="flex h-full w-full flex-col overflow-hidden bg-white/90">
        {renderHeader()}

        <div className="flex min-h-0 flex-1">
          <aside className="w-36 shrink-0 border-r border-slate-200 bg-slate-50/70 px-3 py-5">
            <nav className="flex flex-col gap-3">
              {navItems.map((item) => (
                <button
                  key={item.page}
                  type="button"
                  onClick={() => setActivePage(item.page)}
                  className={`flex flex-col items-center justify-center gap-2 rounded-2xl px-2 py-3.5 text-center transition ${
                    activePage === item.page
                      ? "bg-slate-900 text-white shadow-[0_6px_20px_rgba(15,23,42,0.18)]"
                      : "text-slate-600 hover:bg-slate-200/70"
                  }`}
                >
                  {renderNavIcon(item.page)}
                  <span className="text-sm font-semibold leading-none tracking-[0.05em]">
                    {item.label}
                  </span>
                </button>
              ))}
            </nav>
          </aside>

          <div className="min-w-0 flex-1 overflow-y-auto bg-white/80">
            {activePage === "home" ? renderHome() : renderPlaceholderPage(activePage)}
          </div>
        </div>
      </div>
    </main>
  );
}

export default App;
