# AGENTS.md

## Current State

- This repo has an initialized Tauri + React + TypeScript scaffold.
- Use executable config as source of truth (`package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`).
- Available scripts:
  - `pnpm run dev`
  - `pnpm run build`
  - `pnpm run typecheck`
  - `pnpm run format`
  - `pnpm run format:check`
  - `pnpm run preview`
  - `pnpm run tauri:dev`
  - `pnpm run tauri:build`

## Product Direction

- Chronolytic is a local-first desktop productivity analytics app, not a simple timer.
- Core value: track effective work/study sessions, detect inactivity, and turn personal time data into metrics, dashboards, trends, and behavioral insights.
- Initial target platform is Windows 11 with installer support, background execution, and system tray support.

## Planned Stack

- Desktop shell/native layer: Tauri, with OS/system concerns in Rust commands.
- UI: React + TypeScript + Tailwind CSS.
- Persistence: SQLite with Drizzle ORM (planned).
- Analytics/visualization: reusable TypeScript analytics logic plus Recharts (planned).

## Architecture Expectations

- Prefer feature-based modules over large type-based folders.
- Keep UI separate from business logic, persistence, analytics, and native/system integration.
- Keep SQLite/Drizzle access out of React components.
- Keep inactivity, screen-lock, tray, installer, and background-process concerns behind the Tauri/Rust boundary.
- Keep analytics calculations reusable and testable outside the UI.

## Domain Model To Preserve

- A session starts with a title/activity and may include category and tags.
- A session records start/end time, effective duration, pauses, and metadata needed for later analytics.
- Pause/resume/finish are manual workflow states; inactivity detection should ask whether inactive time should be discounted instead of silently deleting time.

## Workflow Conventions

- Use English for code, comments, documentation, branches, and commits.
- Follow conventional commits.
- Branch model from project context: `main` is stable, `develop` is integration, and `feature/*` or `chore/*` branches isolate work.
- Prefer small focused changes; avoid adding dependencies or abstractions before they are needed.

## Repository Hygiene

- Do not commit generated outputs (`dist/`, `src-tauri/target/`, `src-tauri/gen/`, `node_modules/`).
- Remove template/demo artifacts when replacing scaffold code.
- If docs conflict with executable config, update docs to match verified config.
