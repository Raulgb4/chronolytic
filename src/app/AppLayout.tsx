import type { ReactNode } from "react";
import type { NavItem, Page } from "./appTypes";

type AppLayoutProps = {
  children: ReactNode;
  header: ReactNode;
  navItems: NavItem[];
  activePage: Page;
  onNavigate: (page: Page) => void;
  renderNavIcon: (page: Page) => ReactNode;
  isStartupComplete: boolean;
  isStartupLeaving: boolean;
  sessionSavedFeedbackVisible: boolean;
  sessionSavedFeedbackMessage: string;
  startupLogoSrc: string;
};

function AppLayout({
  children,
  header,
  navItems,
  activePage,
  onNavigate,
  renderNavIcon,
  isStartupComplete,
  isStartupLeaving,
  sessionSavedFeedbackVisible,
  sessionSavedFeedbackMessage,
  startupLogoSrc,
}: AppLayoutProps) {
  return (
    <>
      {!isStartupComplete && (
        <div
          className={`fixed inset-0 z-50 flex flex-col items-center justify-center transition-opacity duration-300 ${isStartupLeaving ? "opacity-0" : "opacity-100"}`}
          style={{ background: "radial-gradient(ellipse at 50% 40%, #131c31 0%, #0a0f1a 100%)" }}
        >
          <style>{`@keyframes dot-pulse{0%,20%{opacity:.2;transform:scale(.6)}50%{opacity:1;transform:scale(1)}80%,100%{opacity:.2;transform:scale(.6)}}`}</style>
          <img src={startupLogoSrc} alt="Chronolytic" className="h-40 w-auto object-contain" />
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

      {sessionSavedFeedbackVisible ? (
        <div className="fixed right-6 top-6 z-40 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 shadow-[0_10px_24px_rgba(16,185,129,0.22)] dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
          {sessionSavedFeedbackMessage}
        </div>
      ) : null}

      <main className="flex h-screen w-screen overflow-hidden">
        <div className="flex h-full w-full flex-col overflow-hidden bg-[var(--shell-bg)] text-[var(--text)]">
          {header}

          <div className="flex min-h-0 flex-1">
            <aside className="flex w-56 shrink-0 border-r border-[var(--border)] bg-[var(--sidebar-bg)] px-4 py-7">
              <nav className="flex h-full w-full flex-col justify-evenly">
                {navItems.map((item) => (
                  <button
                    key={item.page}
                    type="button"
                    onClick={() => onNavigate(item.page)}
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

            <div className="min-w-0 flex-1 overflow-y-auto bg-[var(--panel-bg)]">{children}</div>
          </div>
        </div>
      </main>
    </>
  );
}

export default AppLayout;
