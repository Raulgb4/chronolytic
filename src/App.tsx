import { useEffect, useMemo, useState } from "react";

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
      <header className="flex items-center justify-between border-b border-slate-200 px-8 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-sm font-semibold text-white">
            C
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Chronolytic
            </p>
            <p className="text-sm text-slate-800">Local-first productivity analytics</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            aria-label="Notifications"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
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
            className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            aria-label="Profile"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
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
          <p className="text-base text-slate-600">{greeting}</p>
          <p className="mt-1 text-sm text-slate-500">
            {nowDate.toLocaleDateString(undefined, {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}{" "}
            - {nowDate.toLocaleTimeString()}
          </p>

          <div className="mt-10 rounded-3xl border border-slate-200 bg-white px-10 py-8 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Active session timer
            </p>
            <p className="mt-3 text-7xl font-semibold tracking-tight text-slate-900">
              {activeSession ? formatDuration(effectiveDurationMs) : "00:00:00"}
            </p>
            <div className="mt-4 flex items-center justify-center gap-2">
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${
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
              <div className="mt-4 text-sm text-slate-600">
                <p className="font-medium text-slate-800">{activeSession.title}</p>
                <p>{activeSession.category || "Uncategorized"}</p>
                {activeSession.tags.length > 0 ? (
                  <div className="mt-2 flex flex-wrap justify-center gap-2">
                    {activeSession.tags.map((tag) => (
                      <span
                        key={`${activeSession.id}-active-${tag}`}
                        className="rounded-full border border-slate-300 px-2 py-0.5 text-xs text-slate-700"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => setIsCreateSessionOpen(true)}
              disabled={Boolean(activeSession)}
              className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              Create Session
            </button>

            <button
              type="button"
              onClick={pauseSession}
              disabled={!activeSession || activeSession.status !== "running"}
              className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Pause
            </button>

            <button
              type="button"
              onClick={resumeSession}
              disabled={!activeSession || activeSession.status !== "paused"}
              className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Resume
            </button>

            <button
              type="button"
              onClick={finishSession}
              disabled={!activeSession}
              className="rounded-xl border border-emerald-300 bg-emerald-50 px-5 py-2.5 text-sm font-medium text-emerald-800 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Finish
            </button>

            <button
              type="button"
              onClick={discardSession}
              disabled={!activeSession}
              className="rounded-xl border border-rose-300 bg-rose-50 px-5 py-2.5 text-sm font-medium text-rose-800 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Discard
            </button>
          </div>

          <div className="mt-10 w-full rounded-2xl border border-slate-200 bg-white p-5 text-left">
            <h2 className="text-base font-semibold text-slate-900">Completed sessions</h2>
            {completedSessions.length === 0 ? (
              <p className="mt-3 text-sm text-slate-600">No completed sessions yet.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {completedSessions.map((session) => (
                  <li
                    key={session.id}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                  >
                    <p className="text-sm font-semibold text-slate-900">{session.title}</p>
                    <p className="mt-1 text-sm text-slate-600">
                      {session.category || "Uncategorized"} -{" "}
                      {formatDuration(session.effectiveDurationMs)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Started {new Date(session.startedAt).toLocaleTimeString()} - Finished{" "}
                      {new Date(session.endedAt).toLocaleTimeString()}
                    </p>
                    {session.tags.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {session.tags.map((tag) => (
                          <span
                            key={`${session.id}-${tag}`}
                            className="rounded-full border border-slate-300 px-2 py-0.5 text-xs text-slate-700"
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
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">
            Chronolytic
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">
            {titleMap[page]}
          </h1>
          <p className="mt-4 text-sm leading-7 text-slate-600">
            This page is intentionally a placeholder for a future iteration.
          </p>
        </div>
      </section>
    );
  }

  const navItems: Array<{ page: Page; label: string }> = [
    { page: "home", label: "Home" },
    { page: "goals", label: "Goals" },
    { page: "analytics", label: "Analytics" },
    { page: "settings", label: "Settings" },
  ];

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1400px] px-6 py-8">
      <div className="flex w-full overflow-hidden rounded-3xl border border-slate-200 bg-white/90 shadow-[0_24px_60px_rgba(15,23,42,0.12)] backdrop-blur">
        <aside className="w-64 shrink-0 border-r border-slate-200 bg-slate-50/70 p-5">
          <p className="px-2 pb-4 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            Navigation
          </p>
          <nav className="flex flex-col gap-1">
            {navItems.map((item) => (
              <button
                key={item.page}
                type="button"
                onClick={() => setActivePage(item.page)}
                className={`rounded-xl px-3 py-2 text-left text-sm transition ${
                  activePage === item.page
                    ? "bg-slate-900 text-white"
                    : "text-slate-700 hover:bg-slate-200/70"
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </aside>

        <div className="flex min-h-[760px] flex-1 flex-col bg-white/80">
          {renderHeader()}
          <div className="flex-1">
            {activePage === "home" ? renderHome() : renderPlaceholderPage(activePage)}
          </div>
        </div>
      </div>
    </main>
  );
}

export default App;
