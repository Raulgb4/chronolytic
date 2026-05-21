import { useTranslation } from "react-i18next";

import { type Language, type ThemeMode } from "../../app/appTypes";
import { type DebugLogEntry } from "../diagnostics/debugLog";

type SettingsFeedback = {
  type: "success" | "error";
  message: string;
};

type SettingsPageProps = {
  settingsFeedback: SettingsFeedback | null;
  language: Language;
  setLanguage: (language: Language) => void;
  themeMode: ThemeMode;
  toggleThemeMode: () => void;
  handleToggleAutostart: () => Promise<void>;
  isAutostartLoading: boolean;
  isAutostartEnabled: boolean;
  openDeleteAllConfirm: () => void;
  debugLogEntries: DebugLogEntry[];
  isDebugActionBusy: boolean;
  handleCopyDebugInfo: () => Promise<void>;
  handleClearDebugLogs: () => void;
  handleExportDebugReport: () => Promise<void>;
  isDeleteAllConfirmOpen: boolean;
  closeDeleteAllConfirm: () => void;
  isDeletingAllSessions: boolean;
  handleConfirmDeleteAllSessions: () => Promise<void>;
};

export function SettingsPage(props: SettingsPageProps) {
  const { t } = useTranslation();

  return (
    <section className="flex h-full items-start justify-center px-8 py-10">
      <div className="w-full max-w-3xl space-y-4">
        {props.settingsFeedback ? (
          <div
            className={`rounded-xl border px-4 py-3 text-sm ${
              props.settingsFeedback.type === "success"
                ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                : "border-rose-300 bg-rose-50 text-rose-800"
            }`}
          >
            {props.settingsFeedback.message}
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
              value={props.language}
              onChange={(event) => props.setLanguage(event.target.value as Language)}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--panel-muted)] px-3 py-2 text-sm text-[var(--text)] outline-none ring-[var(--accent)] transition focus:ring"
            >
              <option value="en">{t("settings.english")}</option>
              <option value="es">{t("settings.spanish")}</option>
            </select>
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel-bg)] p-6 shadow-[0_8px_28px_rgba(15,23,42,0.06)]">
          <h2 className="text-lg font-semibold text-[var(--text)]">{t("settings.theme")}</h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">{t("settings.themeDescription")}</p>
          <div className="mt-4 flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--panel-muted)] p-3">
            <span className="text-sm font-medium text-[var(--text-muted)]">
              {props.themeMode === "light" ? t("settings.lightMode") : t("settings.darkMode")}
            </span>
            <button
              type="button"
              onClick={props.toggleThemeMode}
              className={`relative h-8 w-14 shrink-0 rounded-full transition-colors duration-200 ${
                props.themeMode === "dark" ? "bg-[var(--accent)]" : "bg-slate-300"
              }`}
              aria-label="Toggle theme"
            >
              <span
                className={`absolute left-1 top-1 h-6 w-6 rounded-full bg-[var(--panel-bg)] shadow transition-transform duration-200 ${
                  props.themeMode === "dark" ? "translate-x-6" : "translate-x-0"
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
              onClick={() => void props.handleToggleAutostart()}
              disabled={props.isAutostartLoading}
              className={`relative h-8 w-14 shrink-0 rounded-full transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-60 ${
                props.isAutostartEnabled ? "bg-[var(--accent)]" : "bg-slate-300"
              }`}
              aria-label={t("settings.openAtStartup")}
            >
              <span
                className={`absolute left-1 top-1 h-6 w-6 rounded-full bg-[var(--panel-bg)] shadow transition-transform duration-200 ${
                  props.isAutostartEnabled ? "translate-x-6" : "translate-x-0"
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
            onClick={props.openDeleteAllConfirm}
            className="mt-4 rounded-xl border border-rose-700 bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition duration-200 ease-out hover:bg-rose-700"
          >
            {t("settings.deleteAllSessions")}
          </button>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel-bg)] p-6 shadow-[0_8px_28px_rgba(15,23,42,0.06)]">
          <h2 className="text-lg font-semibold text-[var(--text)]">{t("settings.helpAbout")}</h2>
          <p className="mt-3 text-sm text-[var(--text-muted)]">{t("settings.aboutDescription")}</p>
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
          <h2 className="text-lg font-semibold text-[var(--text)]">{t("settings.debug.title")}</h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">{t("settings.debug.description")}</p>
          <p className="mt-3 text-sm text-[var(--text-muted)]">
            {t("settings.debug.recentErrors", { count: props.debugLogEntries.length })}
          </p>

          {props.debugLogEntries.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--text-muted)]">{t("settings.debug.empty")}</p>
          ) : (
            <div className="mt-3 max-h-64 space-y-2 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--panel-muted)] p-3">
              {props.debugLogEntries.slice(0, 10).map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-lg border border-[var(--border)] bg-[var(--panel-bg)] p-3"
                >
                  <div className="text-xs text-[var(--text-muted)]">{entry.timestamp}</div>
                  <div className="mt-1 text-sm font-medium text-[var(--text)]">{entry.source}</div>
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
              onClick={() => void props.handleCopyDebugInfo()}
              disabled={props.isDebugActionBusy}
              className="rounded-xl border border-[var(--border)] bg-[var(--panel-muted)] px-3 py-2 text-sm font-medium text-[var(--text)] transition hover:bg-[var(--panel-bg)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {t("settings.debug.copy")}
            </button>
            <button
              type="button"
              onClick={props.handleClearDebugLogs}
              disabled={props.isDebugActionBusy || props.debugLogEntries.length === 0}
              className="rounded-xl border border-[var(--border)] bg-[var(--panel-muted)] px-3 py-2 text-sm font-medium text-[var(--text)] transition hover:bg-[var(--panel-bg)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {t("settings.debug.clear")}
            </button>
            <button
              type="button"
              onClick={() => void props.handleExportDebugReport()}
              disabled={props.isDebugActionBusy}
              className="rounded-xl border border-[var(--border)] bg-[var(--panel-muted)] px-3 py-2 text-sm font-medium text-[var(--text)] transition hover:bg-[var(--panel-bg)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {t("settings.debug.export")}
            </button>
          </div>
        </div>

        {props.isDeleteAllConfirmOpen ? (
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
                  onClick={props.closeDeleteAllConfirm}
                  disabled={props.isDeletingAllSessions}
                  className="rounded-xl border border-[var(--border)] bg-[var(--panel-bg)] px-4 py-2 text-sm font-medium text-[var(--text)] transition duration-200 ease-out hover:bg-[var(--panel-muted)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {t("settings.cancel")}
                </button>
                <button
                  type="button"
                  onClick={() => void props.handleConfirmDeleteAllSessions()}
                  disabled={props.isDeletingAllSessions}
                  className="rounded-xl border border-rose-700 bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition duration-200 ease-out hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {props.isDeletingAllSessions
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
