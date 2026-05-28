# AGENTS.md

## Current State

- Chronolytic is an active Tauri desktop app, not a scaffold-only repo.
- Use executable config as source of truth (`package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`).
- Available scripts:
  - `pnpm run dev`
  - `pnpm run build`
  - `pnpm run typecheck`
  - `pnpm run test`
  - `pnpm run test:watch`
  - `pnpm run test:coverage`
  - `pnpm run format`
  - `pnpm run format:check`
  - `pnpm run preview`
  - `pnpm run tauri:dev`
  - `pnpm run tauri:build`

## Product Direction

- Chronolytic is a local-first desktop productivity analytics app, not a simple timer.
- Core value: track effective work/study sessions and transform personal time data into metrics, dashboards, trends, and behavioral insights.
- Current navigation and features are implemented across Home, Analytics (Dashboard + Session History), and Settings.
- Windows desktop remains the primary target platform.

## Current Stack

- Desktop shell/native layer: Tauri, with OS/system concerns in Rust commands.
- UI: React + TypeScript + Tailwind CSS.
- Persistence: SQLite via `@tauri-apps/plugin-sql` with repository helpers.
- i18n: i18next + react-i18next (EN/ES).
- Tauri plugins in use: autostart, dialog, fs, opener, sql.

## Folder Structure (Current)

- `src/App.tsx`: current main app shell and page rendering (Home, Analytics, Settings).
- `src/features/sessions/sessionTypes.ts`: shared domain types.
- `src/features/sessions/sessionRepository.ts`: SQLite access, schema checks, active/completed session persistence.
- `src/features/sessions/sessionBackup.ts`: backup envelope creation and strict import parsing/validation.
- `src/features/sessions/sessionTimeCorrections.ts`: pure manual time-correction helpers.
- `src/features/analytics/analyticsSummary.ts`: reusable analytics aggregation logic.
- `src/i18n/index.ts` + `src/i18n/locales/{en,es}.json`: language setup and translations.
- `src/index.css`: theme tokens and base visual system.
- `vitest.config.ts`: unit-test runner configuration.
- `src-tauri/`: desktop runtime config/capabilities and Rust entrypoint.

## Architecture Expectations

- Prefer feature-based modules over large type-based folders.
- Keep UI separate from business logic, persistence, analytics, and native/system integration.
- Keep SQLite access out of React components.
- Keep analytics calculations reusable and testable outside the UI.

## App.tsx Change Boundaries

- Small page-level UI adjustments can stay in `src/App.tsx`.
- Extract helpers to feature modules when logic is reusable, testable, or shared across views.
- Prefer extracting components when sections become repeated or hard to reason about.
- Do not move persistence logic or SQL access into JSX/UI event handlers.

## Domain Model To Preserve

- A session starts with a title/activity and may include category and tags.
- A session records start/end time, effective duration, pauses, and metadata needed for later analytics.
- Pause/resume/finish are explicit workflow states and must preserve time integrity.

## Persistence Rules

- All completed/active session reads and writes must go through `sessionRepository.ts`.
- Backup import/export behavior must remain in `sessionBackup.ts` plus repository integration points.
- Keep `sessions` and `active_session` tables backward compatible with existing local data.

## SQLite and Schema Safety

- Prefer additive, non-destructive schema evolution (`PRAGMA table_info` checks + `ALTER TABLE ADD COLUMN`).
- Do not drop/rename columns or tables without a deliberate migration strategy and rollback plan.
- Do not assume fresh databases; handle legacy rows defensively.
- Preserve parsing fallbacks for legacy energy values and missing columns.

## Analytics Rules

- Use `CompletedSession[]` as the analytics source of truth.
- Keep pure analytics aggregations in `analyticsSummary.ts` (not in JSX rendering blocks).
- Dashboard category filtering should drive dashboard aggregations without mutating source data.
- Monthly productivity calendar should preserve Monday-first alignment, leap-year correctness, and local `startedAt` attribution.

## UI/UX Constraints

- Preserve light/dark theme parity and readability using existing CSS variables.
- Keep dashboard and session-history empty states explicit and actionable.
- Maintain responsive behavior for desktop widths and narrower window sizes.

## i18n Conventions

- Add every new user-facing string to both `en.json` and `es.json`.
- Reference translations via keys in UI; avoid hardcoded display strings.
- Keep key naming consistent with existing namespaces (e.g., `analytics.dashboard.*`).

## Workflow Conventions

- Use English for code, comments, documentation, branches, and commits.
- Follow conventional commits.
- Branch model from project context: `main` is stable, `develop` is integration, and `feature/*` or `chore/*` branches isolate work.
- Prefer small focused changes; avoid adding dependencies or abstractions before they are needed.

## Validation Commands

- Required for most feature/docs PRs:
  - `pnpm run format:check`
  - `pnpm run typecheck`
  - `pnpm run test`
  - `pnpm run build`
- When desktop/runtime behavior changes, also verify with:
  - `pnpm run tauri:dev`

## Testing Conventions

- Use Vitest for unit tests of pure TypeScript business logic.
- Keep tests colocated with source files using `*.test.ts` naming.
- Prefer explicit Vitest imports in test files instead of global APIs.
- Prioritize deterministic tests for time/date logic (fake timers when needed).
- Avoid UI/E2E expansion by default unless explicitly requested.

## Repository Hygiene

- Do not commit generated outputs (`dist/`, `src-tauri/target/`, `src-tauri/gen/`, `node_modules/`).
- Remove template/demo artifacts when replacing scaffold code.
- If docs conflict with executable config, update docs to match verified config.

## Roadmap vs Current Behavior

- Do not document unimplemented tray/background/installer features as already available.
- When mentioning future features, clearly label them as roadmap items.
