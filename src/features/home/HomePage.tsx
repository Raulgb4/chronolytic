import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";

import { getDateLocale } from "../../shared/utils/dateUtils";
import { formatDuration } from "../../shared/utils/durationUtils";
import { type Language } from "../../app/appTypes";
import { type ActiveSession, type EnergyLevel } from "../sessions/sessionTypes";
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
  tagsInput: string;
  setTagsInput: (value: string) => void;
  energy: EnergyLevel;
  setEnergy: (value: EnergyLevel | ((previous: EnergyLevel) => EnergyLevel)) => void;
  categorySuggestionsOpen: boolean;
  setCategorySuggestionsOpen: (value: boolean) => void;
  filteredCategorySuggestions: string[];
  tagSuggestionsOpen: boolean;
  setTagSuggestionsOpen: (value: boolean) => void;
  filteredTagSuggestions: string[];
  canStartSession: boolean;
  requestStartSession: () => Promise<void>;
  closeCreateSession: () => void;
  renderMoodFace: (level: EnergyLevel, className: string) => ReactNode;
  duplicateTitleCandidate: string | null;
  setDuplicateTitleCandidate: (value: string | null) => void;
  commitStartSession: (nextTitle: string) => Promise<void>;
  getAutoRenamedSessionTitle: (baseTitle: string) => string;
};

export function HomePage(props: HomePageProps) {
  const { t } = useTranslation();

  return (
    <section className="relative flex h-full flex-col px-10 py-9 lg:px-12 lg:py-10">
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center text-center">
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
              {props.activeSession.tags.length > 0 ? (
                <div className="mt-2 flex flex-wrap justify-center gap-2">
                  {props.activeSession.tags.map((tag) => (
                    <span
                      key={`${props.activeSession?.id}-active-${tag}`}
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

          {props.activeSession ? (
            <>
              <button
                type="button"
                onClick={props.finishSession}
                disabled={props.isFinishingSession}
                className="rounded-xl border border-emerald-300 bg-emerald-50 px-5 py-2.5 text-base font-medium text-emerald-800 transition duration-200 ease-out hover:-translate-y-0.5 hover:bg-emerald-100 hover:opacity-95 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {props.isFinishingSession ? t("home.finishing") : t("home.finish")}
              </button>

              <button
                type="button"
                onClick={props.discardSession}
                className="rounded-xl border border-rose-300 bg-rose-50 px-5 py-2.5 text-base font-medium text-rose-800 transition duration-200 ease-out hover:-translate-y-0.5 hover:bg-rose-100 hover:opacity-95 active:translate-y-0"
              >
                {t("home.discard")}
              </button>
            </>
          ) : null}
        </div>
      </div>

      <CreateSessionModal
        isOpen={props.isCreateSessionOpen}
        title={props.title}
        setTitle={props.setTitle}
        category={props.category}
        setCategory={props.setCategory}
        tagsInput={props.tagsInput}
        setTagsInput={props.setTagsInput}
        energy={props.energy}
        setEnergy={props.setEnergy}
        categorySuggestionsOpen={props.categorySuggestionsOpen}
        setCategorySuggestionsOpen={props.setCategorySuggestionsOpen}
        filteredCategorySuggestions={props.filteredCategorySuggestions}
        tagSuggestionsOpen={props.tagSuggestionsOpen}
        setTagSuggestionsOpen={props.setTagSuggestionsOpen}
        filteredTagSuggestions={props.filteredTagSuggestions}
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
    </section>
  );
}
