# Chronolytic Design

## Product Vision (Current)

- Chronolytic is a local-first desktop productivity analytics app for focused work and study sessions.
- The product emphasizes effective time, interruption behavior, and historical patterns instead of simple stopwatch tracking.
- Data stays on-device in SQLite, with user-controlled backup import/export.

## Desktop-First UX Principles

- Prioritize fast keyboard/mouse workflows and wide-screen readability.
- Keep primary actions obvious: create session, pause/resume, finish, and review analytics.
- Preserve user trust with explicit, reversible flows where possible (filters, sorting, imports, deletes with confirmation).
- Show meaningful empty states instead of blank panels.

## Navigation Structure

- Home: active session workflow, timer, recovery notice, session creation modal.
- Analytics:
  - Dashboard: KPI cards, ratio indicators, category/weekday/energy/time-slot breakdowns, and temporal evolution charts.
  - Session History: table with search, filters, sorting, pagination, inline editing, and delete actions.
- Settings: language, theme, autostart toggle, and danger-zone delete-all.

## Visual and Theme System

- UI is built with Tailwind CSS utilities and app-level CSS variables.
- Theme tokens are defined in `src/index.css` (`--app-bg`, `--panel-bg`, `--text`, `--accent`, etc.) with light/dark variants.
- Default visual style is clean and data-first: card surfaces, subtle borders, restrained accent color, and readable contrast.
- Motion is lightweight (hover/focus transitions, startup overlay fade) and should support clarity, not decoration.

## Session Lifecycle

- A session starts with title, optional category, optional tags, and energy state (`bad`, `regular`, `good`).
- Runtime states are `running` and `paused`; pauses are tracked as explicit periods.
- Finishing a session writes a completed record with effective duration, paused duration, pause count, weekday, and energy.
- Discarding clears the active session without adding history.

## Persistence and Recovery Model

- Persistence uses SQLite via Tauri SQL plugin in `src/features/sessions/sessionRepository.ts`.
- `sessions` stores completed sessions; `active_session` stores resumable in-progress state.
- On startup, app restores completed sessions and attempts to recover active session safely as paused.
- Schema evolution is additive (column checks + `ALTER TABLE`) to protect existing local databases.

## Analytics Dashboard (Current Capabilities)

- Dashboard computes all metrics from completed sessions using reusable TypeScript helpers.
- Time range selector supports `7d`, `30d`, `90d`, and `all`; selected range drives dashboard KPIs and charts.
- Current KPI/insight coverage includes:
  - Total effective/paused time, completed sessions, pause count, average duration.
  - Focus/interruption ratios.
  - Most productive category, best time slot, most interrupted session.
- Current chart coverage includes:
  - Effective by category, weekday, and time slot.
  - Effective vs paused comparison.
  - Sessions by energy and energy vs interruptions.
  - Temporal evolution: effective time, paused time, completed sessions, and focus/interruption trend over time.

## Session History (Current Capabilities)

- Search by title/category/tags with normalized matching.
- Filters for weekday, energy, category, duration range, and pause presence.
- Sorting by start/end date, duration, pause count, and energy.
- Pagination for table usability.
- Inline editing for title, category, tags, weekday, and energy with validation.

## Backup Import/Export

- Export writes a JSON backup envelope with metadata and completed sessions.
- Import validates file origin, version, and payload shape before inserting.
- Duplicate session IDs are skipped and reported to users.

## Startup Loader

- Startup uses a branded overlay with a minimum visible duration and fade-out.
- Initial paint background is controlled in `index.html` to avoid white flash.
- Overlay completion is tied to session-state readiness, not optional settings loading.

## Roadmap (Realistic, Not Yet Implemented)

- Decompose `App.tsx` into focused UI components as complexity grows.
- Add richer trend analytics and comparison insights while preserving local-first performance.
- Improve desktop integration features (tray/background behavior, installer polish) as dedicated milestones.
- Strengthen long-term schema migration strategy for future data model evolution.
