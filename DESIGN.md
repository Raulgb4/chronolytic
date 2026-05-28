# Chronolytic Design

## Product Focus

- Chronolytic is a local-first productivity analytics desktop app.
- The core metric is effective time, not raw elapsed timer time.
- Interruption behavior (pauses, pause counts, pause time) is part of first-class analysis.

## UX Principles

- Keep primary session actions clear and fast: create, pause/resume, finish, discard.
- Require explicit confirmation for destructive or final actions.
- Keep analytics readable at a glance with clear hierarchy and compact cards.
- Preserve light/dark parity and contrast using shared theme tokens.
- Keep behavior predictable across narrower desktop windows.

## Information Architecture

- Home:
  - active session status and controls
  - create-session flow
  - recent sessions list
  - manual time-correction entry points
- Analytics:
  - Dashboard: KPI cards, category filter, charts, monthly productivity calendar
  - Session History: search, filters, sorting, pagination, inline edits, deletion
- Settings:
  - language
  - theme
  - autostart
  - danger zone delete-all
  - about metadata

## Session and Time Integrity

- Session runtime states are `running` and `paused`.
- Pauses are explicit periods and must preserve chronology.
- Effective duration is derived from total elapsed minus paused duration.
- Manual corrections must preserve data integrity:
  - forgotten start adjusts initial start timestamp
  - add-time reduces paused duration
  - remove-time appends synthetic closed pause period

## Confirmation Modal Principles

- Confirm before potentially destructive actions.
- Confirm before finalizing actions that materially change state.
- Cancel must keep state unchanged.
- Confirm must execute existing behavior without side effects.

## Analytics Principles

- Analytics derive from completed sessions only.
- Daily attribution uses local `startedAt` day.
- Weekly grouping uses Monday as first day.
- Calendar generation uses real month lengths and leap-year behavior.
- Productivity color bands:
  - low: `<4h`
  - medium: `4h-7h`
  - high: `>7h`
- Today highlight appears only for the real current day within current month view.

## Productivity Calendar UX

- Month navigation supports previous and next controls.
- Next navigation is disabled for future-month browsing.
- Calendar stays compact and readable in both themes.

## Visual System

- Tailwind utilities + shared CSS variables from `src/index.css`.
- Card-based, data-first layout with restrained accent emphasis.
- Keep motion minimal and meaningful (focus/hover/transition clarity).

## Implementation Boundaries

- Keep business logic out of JSX rendering blocks.
- Keep persistence and SQL access inside repository modules.
- Keep reusable calculations pure and unit-testable.
- Prefer additive schema evolution for local database safety.
