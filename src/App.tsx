function App() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl items-center px-8 py-16">
      <section className="w-full rounded-3xl border border-slate-200 bg-white/95 p-10 shadow-[0_14px_42px_rgba(15,23,42,0.08)] backdrop-blur">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
          Chronolytic
        </p>
        <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight text-slate-900">
          Calm desktop foundation for local-first productivity analytics.
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600">
          This interface is a static baseline for upcoming development. It establishes visual
          direction and reusable UI patterns before session tracking, analytics, and persistence are
          implemented.
        </p>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          <article className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <h2 className="text-sm font-medium text-slate-900">Session Capture</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Planned area for start, pause, resume, and finish workflows.
            </p>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <h2 className="text-sm font-medium text-slate-900">Inactivity Review</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Planned area for inactivity and screen-lock discount confirmations.
            </p>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <h2 className="text-sm font-medium text-slate-900">Analytics Workspace</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Planned area for dashboards, trends, and productivity insights.
            </p>
          </article>
        </div>
      </section>
    </main>
  );
}

export default App;
