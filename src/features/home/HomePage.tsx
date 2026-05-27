import { useTranslation } from "react-i18next";
import { useState } from "react";
import type { ReactNode } from "react";

import { getDateLocale } from "../../shared/utils/dateUtils";
import { formatDuration, formatHumanDuration } from "../../shared/utils/durationUtils";
import { type Language } from "../../app/appTypes";
import { type ActiveSession, type CompletedSession, type EnergyLevel } from "../sessions/sessionTypes";
import { CreateSessionModal } from "./components/CreateSessionModal";

type HomePageProps = {
  recoveryNoticeVisible: boolean;
  onDismissRecoveryNotice: () => void;
  greetingKey: string;
  nowDate: Date;
  language: Language;
  activeSession: ActiveSession | null;
  effectiveDurationMs: number;
  onOpenCreateSession: () => void;
  pauseSession: () => void;
  resumeSession: () => void;
  finishSession: () => void;
  discardSession: () => void;
  isStartingSession: boolean;
  isPausingSession: boolean;
  isResumingSession: boolean;
  isFinishingSession: boolean;
  isCreateSessionOpen: boolean;
  title: string;
  setTitle: (value: string) => void;
  category: string;
  setCategory: (value: string) => void;
  forgottenStartMinutes: string;
  setForgottenStartMinutes: (value: string) => void;
  isForgottenStartMinutesValid: boolean;
  energy: EnergyLevel;
  setEnergy: (value: EnergyLevel | ((previous: EnergyLevel) => EnergyLevel)) => void;
  categorySuggestionsOpen: boolean;
  setCategorySuggestionsOpen: (value: boolean) => void;
  filteredCategorySuggestions: string[];
  canStartSession: boolean;
  requestStartSession: () => Promise<void>;
  closeCreateSession: () => void;
  renderMoodFace: (level: EnergyLevel, className: string) => ReactNode;
  duplicateTitleCandidate: string | null;
  setDuplicateTitleCandidate: (value: string | null) => void;
  commitStartSession: (nextTitle: string) => Promise<void>;
  getAutoRenamedSessionTitle: (baseTitle: string) => string;
  recentHomeSessions: CompletedSession[];
  onOpenAddTimeModal: () => void;
  onOpenRemoveTimeModal: () => void;
  timeCorrectionMode: "addDuringPause" | "removeDistracted" | null;
  timeCorrectionMinutes: string;
  setTimeCorrectionMinutes: (value: string) => void;
  timeCorrectionError: string | null;
  isApplyingTimeCorrection: boolean;
  onCloseTimeCorrectionModal: () => void;
  onApplyTimeCorrection: () => Promise<void>;
};

export function HomePage(props: HomePageProps) {
  const { t } = useTranslation();
  const [pendingSessionAction, setPendingSessionAction] = useState<"finish" | "discard" | null>(
    null,
  );

  const closeSessionActionConfirm = () => setPendingSessionAction(null);

  const confirmSessionAction = () => {
    if (pendingSessionAction === "finish") {
      void props.finishSession();
    } else if (pendingSessionAction === "discard") {
      void props.discardSession();
    }
    setPendingSessionAction(null);
  };
  const formatLocalizedDuration = (value: number): string =>
    formatHumanDuration(value, {
      second: t("duration.second"),
      seconds: t("duration.seconds"),
      minute: t("duration.minute"),
      minutes: t("duration.minutes"),
      hour: t("duration.hour"),
      hours: t("duration.hours"),
    });

  return (
    <section className="relative flex h-full flex-col px-10 py-9 lg:px-12 lg:py-10">
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center pb-8 text-center lg:pb-10">
        {props.recoveryNoticeVisible ? (
          <div className="mb-5 w-full max-w-3xl rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <div className="flex items-center justify-between gap-3">
              <p>{t("home.recoveredPausedSession")}</p>
              <button
                type="button"
                onClick={props.onDismissRecoveryNotice}
                className="rounded-lg border border-amber-300 bg-amber-100 px-2 py-1 text-xs font-medium text-amber-900 hover:bg-amber-200"
              >
                {t("home.dismissRecoveryNotice")}
              </button>
            </div>
          </div>
        ) : null}

        <p className="text-2xl font-medium text-[var(--text-muted)] lg:text-3xl">
          {t(props.greetingKey)}
        </p>
        <p className="mt-1.5 text-lg text-[var(--text-muted)] lg:text-xl">
          {props.nowDate.toLocaleDateString(getDateLocale(props.language), {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          })}{" "}
          - {props.nowDate.toLocaleTimeString(getDateLocale(props.language))}
        </p>

        <div className="mt-12 rounded-[1.75rem] border border-[var(--border)] bg-[var(--panel-bg)] px-12 py-10 shadow-[0_10px_30px_rgba(15,23,42,0.06)] lg:mt-14 lg:px-14 lg:py-12">
          <p className="text-base font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)] lg:text-lg">
            {t("home.activeSessionTimer")}
          </p>
          <p className="mt-4 text-[4.2rem] leading-none font-semibold tracking-tight text-[var(--text)] lg:text-[6rem]">
            {props.activeSession ? formatDuration(props.effectiveDurationMs) : "00:00:00"}
          </p>
          <div className="mt-5 flex items-center justify-center gap-2.5">
            <span
              className={`rounded-full px-4 py-1.5 text-base font-medium lg:px-5 lg:py-2 lg:text-lg ${
                props.activeSession?.status === "running"
                  ? "bg-emerald-100 text-emerald-700"
                  : props.activeSession?.status === "paused"
                    ? "bg-amber-100 text-amber-700"
                    : "bg-[var(--panel-muted)] text-[var(--text-muted)]"
              }`}
            >
              {props.activeSession
                ? props.activeSession.status === "running"
                  ? t("home.statusRunning")
                  : t("home.statusPaused")
                : t("home.noActiveSession")}
            </span>
          </div>
          {props.activeSession ? (
            <div className="mt-4 text-base text-[var(--text-muted)]">
              <p className="font-medium text-[var(--text)]">{props.activeSession.title}</p>
              <p>{props.activeSession.category || t("home.uncategorized")}</p>
            </div>
          ) : null}
        </div>

        <div className="mt-10 flex min-h-16 flex-wrap items-center justify-center gap-4 lg:mt-12 lg:gap-5">
          {!props.activeSession ? (
            <button
              type="button"
              onClick={props.onOpenCreateSession}
              className="rounded-full bg-gradient-to-r from-[#4E89FF] to-[#5F8FFF] px-10 py-4 text-xl font-semibold text-white shadow-[0_10px_24px_rgba(78,137,255,0.34)] transition duration-200 ease-out hover:scale-[1.02] hover:from-[#5B93FF] hover:to-[#6D9BFF] hover:shadow-[0_14px_30px_rgba(78,137,255,0.42)] active:scale-[0.98] lg:px-12 lg:py-5 lg:text-2xl"
            >
              {t("home.createSession")}
            </button>
          ) : null}

          {props.activeSession?.status === "running" ? (
            <button
              type="button"
              onClick={props.pauseSession}
              disabled={
                props.isPausingSession ||
                props.isResumingSession ||
                props.isStartingSession ||
                props.isFinishingSession
              }
              className="rounded-xl border border-[var(--border)] bg-[var(--panel-bg)] px-5 py-2.5 text-base font-medium text-[var(--text)] transition duration-200 ease-out hover:-translate-y-0.5 hover:bg-[var(--panel-muted)] hover:opacity-95 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {t("home.pause")}
            </button>
          ) : null}

          {props.activeSession?.status === "paused" ? (
            <button
              type="button"
              onClick={props.resumeSession}
              disabled={
                props.isResumingSession ||
                props.isPausingSession ||
                props.isStartingSession ||
                props.isFinishingSession
              }
              className="rounded-xl border border-[var(--border)] bg-[var(--panel-bg)] px-5 py-2.5 text-base font-medium text-[var(--text)] transition duration-200 ease-out hover:-translate-y-0.5 hover:bg-[var(--panel-muted)] hover:opacity-95 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {t("home.resume")}
            </button>
          ) : null}

          {props.activeSession?.status === "paused" ? (
            <button
              type="button"
              onClick={props.onOpenAddTimeModal}
              className="rounded-xl border border-sky-300 bg-sky-50 px-5 py-2.5 text-base font-medium text-sky-800 transition duration-200 ease-out hover:-translate-y-0.5 hover:bg-sky-100 hover:opacity-95 active:translate-y-0"
            >
              {t("home.addTime")}
            </button>
          ) : null}

          {props.activeSession?.status === "running" ? (
            <button
              type="button"
              onClick={props.onOpenRemoveTimeModal}
              className="rounded-xl border border-orange-300 bg-orange-50 px-5 py-2.5 text-base font-medium text-orange-800 transition duration-200 ease-out hover:-translate-y-0.5 hover:bg-orange-100 hover:opacity-95 active:translate-y-0"
            >
              {t("home.removeTime")}
            </button>
          ) : null}

          {props.activeSession ? (
            <>
              <button
                type="button"
                onClick={() => setPendingSessionAction("finish")}
                disabled={props.isFinishingSession}
                className="rounded-xl border border-emerald-300 bg-emerald-50 px-5 py-2.5 text-base font-medium text-emerald-800 transition duration-200 ease-out hover:-translate-y-0.5 hover:bg-emerald-100 hover:opacity-95 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {props.isFinishingSession ? t("home.finishing") : t("home.finish")}
              </button>

              <button
                type="button"
                onClick={() => setPendingSessionAction("discard")}
                className="rounded-xl border border-rose-300 bg-rose-50 px-5 py-2.5 text-base font-medium text-rose-800 transition duration-200 ease-out hover:-translate-y-0.5 hover:bg-rose-100 hover:opacity-95 active:translate-y-0"
              >
                {t("home.discard")}
              </button>
            </>
          ) : null}
        </div>

        <div className="mt-9 w-full max-w-3xl rounded-2xl border border-[var(--border)]/75 bg-[var(--panel-bg)]/92 p-4 text-left shadow-[0_6px_16px_rgba(15,23,42,0.045)]">
          <h3 className="text-xs font-semibold uppercase tracking-[0.07em] text-[var(--text-muted)]/90">
            {t("home.recentSessions.title")}
          </h3>

          {props.recentHomeSessions.length === 0 ? (
            <p className="mt-2.5 text-xs text-[var(--text-muted)]/90">{t("home.recentSessions.empty")}</p>
          ) : (
            <div className="mt-2.5 space-y-1.5">
              {props.recentHomeSessions.map((session) => (
                <div
                  key={`${session.id}-home-recent`}
                  className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-[var(--border)]/70 bg-[var(--panel-muted)]/24 px-3 py-1.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-[var(--text)]">{session.title}</p>
                    <p className="text-[11px] text-[var(--text-muted)]/90">
                      {session.category || t("home.uncategorized")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2.5 text-[11px] text-[var(--text-muted)]/90">
                    <span>
                      {new Date(session.endedAt).toLocaleDateString(getDateLocale(props.language), {
                        weekday: "short",
                      })}
                    </span>
                    <span>{formatLocalizedDuration(session.effectiveDurationMs)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <CreateSessionModal
        isOpen={props.isCreateSessionOpen}
        title={props.title}
        setTitle={props.setTitle}
        category={props.category}
        setCategory={props.setCategory}
        forgottenStartMinutes={props.forgottenStartMinutes}
        setForgottenStartMinutes={props.setForgottenStartMinutes}
        isForgottenStartMinutesValid={props.isForgottenStartMinutesValid}
        energy={props.energy}
        setEnergy={props.setEnergy}
        categorySuggestionsOpen={props.categorySuggestionsOpen}
        setCategorySuggestionsOpen={props.setCategorySuggestionsOpen}
        filteredCategorySuggestions={props.filteredCategorySuggestions}
        isStartingSession={props.isStartingSession}
        canStartSession={props.canStartSession}
        requestStartSession={props.requestStartSession}
        onClose={props.closeCreateSession}
        renderMoodFace={props.renderMoodFace}
        duplicateTitleCandidate={props.duplicateTitleCandidate}
        setDuplicateTitleCandidate={props.setDuplicateTitleCandidate}
        commitStartSession={props.commitStartSession}
        getAutoRenamedSessionTitle={props.getAutoRenamedSessionTitle}
      />

      {props.timeCorrectionMode ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/45 p-6">
          <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--panel-bg)] p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-[var(--text)]">
              {props.timeCorrectionMode === "addDuringPause"
                ? t("timeCorrection.add.title")
                : t("timeCorrection.remove.title")}
            </h3>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              {props.timeCorrectionMode === "addDuringPause"
                ? t("timeCorrection.add.description")
                : t("timeCorrection.remove.description")}
            </p>

            <label className="mt-4 flex flex-col gap-2 text-sm text-[var(--text-muted)]">
              <span>{t("timeCorrection.minutesLabel")}</span>
              <input
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={props.timeCorrectionMinutes}
                onChange={(event) => props.setTimeCorrectionMinutes(event.target.value)}
                className="rounded-xl border border-[var(--border)] bg-[var(--panel-muted)] px-3 py-2 text-sm text-[var(--text)] outline-none ring-[var(--accent)] transition focus:ring"
              />
            </label>

            {props.timeCorrectionError ? (
              <p className="mt-3 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                {props.timeCorrectionError}
              </p>
            ) : null}

            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={props.onCloseTimeCorrectionModal}
                disabled={props.isApplyingTimeCorrection}
                className="rounded-xl border border-[var(--border)] bg-[var(--panel-muted)] px-4 py-2 text-sm font-medium text-[var(--text-muted)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t("timeCorrection.cancel")}
              </button>
              <button
                type="button"
                onClick={() => void props.onApplyTimeCorrection()}
                disabled={props.isApplyingTimeCorrection}
                className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t("timeCorrection.apply")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {pendingSessionAction ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/45 p-6">
          <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--panel-bg)] p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-[var(--text)]">
              {pendingSessionAction === "finish"
                ? t("home.sessionConfirm.finish.title")
                : t("home.sessionConfirm.discard.title")}
            </h3>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              {pendingSessionAction === "finish"
                ? t("home.sessionConfirm.finish.description")
                : t("home.sessionConfirm.discard.description")}
            </p>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeSessionActionConfirm}
                disabled={props.isFinishingSession}
                className="rounded-xl border border-[var(--border)] bg-[var(--panel-bg)] px-4 py-2 text-sm font-medium text-[var(--text)] transition duration-200 ease-out hover:bg-[var(--panel-muted)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {t("home.sessionConfirm.cancel")}
              </button>
              <button
                type="button"
                onClick={confirmSessionAction}
                disabled={props.isFinishingSession}
                className={`rounded-xl px-4 py-2 text-sm font-semibold text-white transition duration-200 ease-out disabled:cursor-not-allowed disabled:opacity-60 ${
                  pendingSessionAction === "finish"
                    ? "border border-emerald-700 bg-emerald-600 hover:bg-emerald-700"
                    : "border border-rose-700 bg-rose-600 hover:bg-rose-700"
                }`}
              >
                {pendingSessionAction === "finish"
                  ? t("home.sessionConfirm.finish.confirm")
                  : t("home.sessionConfirm.discard.confirm")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
