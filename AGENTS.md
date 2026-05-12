# AGENTS.md

## Current State
- This repo is currently pre-scaffold: only `README.md`, `.gitignore`, and `LICENSE` are present.
- Do not invent developer commands yet; there is no `package.json`, Tauri config, Cargo manifest, CI, or test/lint/typecheck config in the repo.

## Product Direction
- Chronolytic is a local-first desktop productivity analytics app, not a simple timer.
- Core value: track effective work/study sessions, detect inactivity, and turn personal time data into metrics, dashboards, trends, and behavioral insights.
- Initial target platform is Windows 11 with installer support, background execution, and system tray support.

## Planned Stack
- Desktop shell/native layer: Tauri, with OS/system concerns in Rust commands.
- UI: React, TypeScript, Tailwind CSS.
- Persistence: SQLite with Drizzle ORM.
- Analytics/visualization: reusable TypeScript analytics logic plus Recharts for charts.

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
- Prefer small focused changes; avoid adding dependencies or abstractions before the scaffold requires them.

## When Scaffolding Starts
- Add exact `dev`, `build`, `lint`, `typecheck`, `test`, migration, and Tauri commands here once they exist in executable config.
- If docs and executable config disagree, trust the executable config and update this file only with verified commands.
