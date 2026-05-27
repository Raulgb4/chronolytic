# Chronolytic

Chronolytic is a local-first Tauri desktop app for tracking focused work/study sessions and turning personal time data into actionable analytics.

It prioritizes effective time, interruption patterns, and historical evolution, not just stopwatch totals.

## Installation (Windows)

Chronolytic v1.0.0 currently supports Windows desktop.

1. Open this repository's **Releases** page on GitHub.
2. Download the Windows installer file (`.exe`) for the version you want.
3. Run the installer and follow the setup wizard steps.
4. Launch Chronolytic from the Start menu or desktop shortcut.

Note: Windows may show a security warning because the application is not digitally signed yet. You can click `More info` -> `Run anyway` if you trust the release source.

## Current Features

- Local-first desktop app with SQLite persistence (no cloud dependency).
- Session lifecycle: create, pause, resume, finish, discard, and safe recovery on startup.
- Manual time correction tools:
  - forgotten start offset at session creation
  - add time while paused
  - remove distracted time while running
- Analytics Dashboard:
  - core KPIs (effective, paused, completed, averages)
  - weekly/monthly productivity stats
  - category filter
  - monthly productivity calendar
  - category, weekday, time-slot, energy-interruption insights
- Session History with search, filters, sorting, pagination, inline editing, and deletion confirmation.
- Backup export/import for completed sessions with strict envelope validation.
- EN/ES localization, light/dark themes, Windows autostart toggle.
- Diagnostics tools (local error logs, copy/export debug report).

## Navigation

- Home: active session workflow and controls.
- Analytics:
  - Dashboard
  - Session History
- Settings

## Screenshots

Add project screenshots here when available:

- `docs/screenshots/home.png`
- `docs/screenshots/analytics-dashboard.png`
- `docs/screenshots/session-history.png`
- `docs/screenshots/settings.png`

## Tech Stack

| Layer                | Technology                        | Purpose                                             |
| -------------------- | --------------------------------- | --------------------------------------------------- |
| Desktop shell/native | Tauri v2 + Rust                   | Desktop runtime and native integration              |
| UI                   | React 19 + TypeScript             | App interface and interaction flows                 |
| Styling              | Tailwind CSS v4                   | Utility-first responsive styling                    |
| Persistence          | SQLite (`@tauri-apps/plugin-sql`) | Local-first storage for sessions and analytics data |
| i18n                 | i18next + react-i18next           | EN/ES localization                                  |

## Architecture

Feature-oriented modules:

- `src/App.tsx`: app shell and page-level rendering.
- `src/features/sessions/sessionRepository.ts`: SQLite reads/writes and schema checks.
- `src/features/sessions/sessionBackup.ts`: backup export/import parsing and validation.
- `src/features/analytics/analyticsSummary.ts`: reusable analytics calculations.
- `src/i18n/`: language setup and EN/ES resources.

Design goals:

- Keep persistence and SQL access out of UI event handlers.
- Keep analytics calculations reusable and testable outside JSX.
- Keep schema evolution additive and backward compatible.

## Setup

Requirements:

- Node.js 20+
- pnpm
- Rust toolchain (for Tauri desktop builds)

Install dependencies:

```bash
pnpm install
```

Run desktop app in development:

```bash
pnpm run tauri:dev
```

Build desktop app:

```bash
pnpm run tauri:build
```

## Validation

```bash
pnpm run format:check
pnpm run typecheck
pnpm run build
```

## Release Flow (Windows)

1. Build a release installer with `pnpm run tauri:build`.
2. Upload generated `.exe` installer artifacts to a GitHub Release.
3. Users download and run the installer from the Release page.

Note: Windows may show a security warning because releases are not digitally signed yet. Users can select `More info` -> `Run anyway` if they trust the source.

## Roadmap

- Extract dashboard/session-history sections from `App.tsx` into focused components.
- Expand analytics insights (comparisons, trend interpretation, behavior patterns).
- Add richer desktop integration milestones (tray/background behavior, installer polish).
- Strengthen long-term schema migration strategy for evolving local data safely.

## Development

Common commands:

- `pnpm run dev` - run Vite dev server.
- `pnpm run typecheck` - run TypeScript project checks.
- `pnpm run format` - apply Prettier formatting across the repository.
- `pnpm run format:check` - validate formatting with Prettier.
- `pnpm run build` - run TypeScript build checks and Vite production build.
- `pnpm run preview` - preview production frontend build.
- `pnpm run tauri:dev` - run desktop app in Tauri development mode.
- `pnpm run tauri:build` - build desktop app bundles via Tauri.

## Design Principles

See `DESIGN.md` for UI/UX consistency guidelines, visual philosophy, chart clarity rules, and reusable desktop patterns.

## Contributing

- Use English for code, comments, documentation, branches, and commits.
- Follow conventional commits.
- Branch model: `main` (stable), `develop` (integration), `feature/*` and `chore/*` (isolated work).
- Prefer small, focused changes.

For agent-specific repository guidance, see `AGENTS.md`.

## License

This project is licensed under the MIT License. See `LICENSE` for details.
