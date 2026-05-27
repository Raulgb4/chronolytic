import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";

import { getEnergyFromIndex, getEnergyIndex } from "../../../shared/utils/energyUtils";
import { type EnergyLevel } from "../../sessions/sessionTypes";

type CreateSessionModalProps = {
  isOpen: boolean;
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
  isStartingSession: boolean;
  canStartSession: boolean;
  requestStartSession: () => Promise<void>;
  onClose: () => void;
  renderMoodFace: (level: EnergyLevel, className: string) => ReactNode;
  duplicateTitleCandidate: string | null;
  setDuplicateTitleCandidate: (value: string | null) => void;
  commitStartSession: (nextTitle: string) => Promise<void>;
  getAutoRenamedSessionTitle: (baseTitle: string) => string;
};

export function CreateSessionModal({
  isOpen,
  title,
  setTitle,
  category,
  setCategory,
  forgottenStartMinutes,
  setForgottenStartMinutes,
  isForgottenStartMinutesValid,
  energy,
  setEnergy,
  categorySuggestionsOpen,
  setCategorySuggestionsOpen,
  filteredCategorySuggestions,
  isStartingSession,
  canStartSession,
  requestStartSession,
  onClose,
  renderMoodFace,
  duplicateTitleCandidate,
  setDuplicateTitleCandidate,
  commitStartSession,
  getAutoRenamedSessionTitle,
}: CreateSessionModalProps) {
  const { t } = useTranslation();

  if (!isOpen) return null;

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
            {categorySuggestionsOpen && filteredCategorySuggestions.length > 0 ? (
              <ul className="absolute left-0 right-0 top-full z-10 mt-1 max-h-40 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--panel-bg)] shadow-lg">
                {filteredCategorySuggestions.map((suggestion) => (
                  <li
                    key={suggestion}
                    className="cursor-pointer px-3 py-2 text-sm text-[var(--text)] hover:bg-[var(--panel-muted)]"
                    onMouseDown={() => {
                      setCategory(suggestion);
                      setCategorySuggestionsOpen(false);
                    }}
                  >
                    {suggestion}
                  </li>
                ))}
              </ul>
            ) : null}
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
                <div className="absolute left-0 right-0 top-1/2 h-2 -translate-y-1/2 rounded-full border border-slate-200 bg-white dark:border-[var(--border)] dark:bg-[var(--panel-bg)]" />
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
                            setEnergy((previous) =>
                              getEnergyFromIndex(getEnergyIndex(previous) + 1),
                            );
                          }
                          if (event.key === "ArrowLeft") {
                            event.preventDefault();
                            setEnergy((previous) =>
                              getEnergyFromIndex(getEnergyIndex(previous) - 1),
                            );
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

          <label className="flex flex-col gap-2 text-sm text-[var(--text-muted)]">
            <span>{t("sessionModal.forgottenMinutes.label")}</span>
            <span className="text-xs text-[var(--text-muted)]/90">
              {t("sessionModal.forgottenMinutes.description")}
            </span>
            <input
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              value={forgottenStartMinutes}
              onChange={(event) => setForgottenStartMinutes(event.target.value)}
              className="rounded-xl border border-[var(--border)] bg-[var(--panel-muted)] px-3 py-2 text-sm text-[var(--text)] outline-none ring-[var(--accent)] transition focus:ring"
            />
            {!isForgottenStartMinutesValid ? (
              <span className="text-xs text-rose-600 dark:text-rose-300">
                {t("sessionModal.forgottenMinutes.invalid")}
              </span>
            ) : null}
          </label>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isStartingSession}
            className="rounded-xl border border-[var(--border)] bg-[var(--panel-muted)] px-4 py-2 text-sm font-medium text-[var(--text-muted)] hover:opacity-90"
          >
            {t("sessionModal.cancel")}
          </button>
          <button
            type="button"
            onClick={() => void requestStartSession()}
            disabled={!canStartSession}
            className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isStartingSession ? t("sessionModal.starting") : t("sessionModal.start")}
          </button>
        </div>
      </div>

      {duplicateTitleCandidate ? (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/45 p-6">
          <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--panel-bg)] p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-[var(--text)]">
              {t("sessionModal.duplicateTitle.title")}
            </h3>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              {t("sessionModal.duplicateTitle.description", { title: duplicateTitleCandidate })}
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setDuplicateTitleCandidate(null)}
                disabled={isStartingSession}
                className="rounded-xl border border-[var(--border)] bg-[var(--panel-muted)] px-3 py-2 text-sm font-medium text-[var(--text-muted)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t("sessionModal.duplicateTitle.cancel")}
              </button>
              <button
                type="button"
                onClick={() => void commitStartSession(duplicateTitleCandidate)}
                disabled={isStartingSession}
                className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t("sessionModal.duplicateTitle.createAnyway")}
              </button>
              <button
                type="button"
                onClick={() =>
                  void commitStartSession(getAutoRenamedSessionTitle(duplicateTitleCandidate))
                }
                disabled={isStartingSession}
                className="rounded-xl bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t("sessionModal.duplicateTitle.autoRename")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
