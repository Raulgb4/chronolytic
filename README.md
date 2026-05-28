# Chronolytic

Chronolytic is a local-first Tauri desktop app for tracking focused work and study sessions, then turning personal time data into actionable analytics.

## Version

Current stable release: `v1.0.0`

## Installation (Windows)

Chronolytic `v1.0.0` currently targets Windows desktop.

1. Open the GitHub **Releases** page.
2. Download the `.exe` installer for the desired version.
3. Run the installer and follow the setup steps.
4. Launch Chronolytic from Start menu or desktop shortcut.

Windows SmartScreen note: installers are currently unsigned, so Windows may show a security warning. If you trust the release source, choose `More info` -> `Run anyway`.

## Current Features

- Local-first SQLite persistence (no cloud dependency).
- Session lifecycle: create, pause, resume, finish, discard, and startup recovery of active sessions.
- Safety confirmations for destructive/final actions:
  - finish active session
  - discard active session
  - delete all sessions (danger zone)
- Manual time correction:
  - optional forgotten-start adjustment on session creation
  - add time while paused
  - remove distracted time while running
- Analytics Dashboard:
  - KPI cards for effective/paused/completed and averages
  - category filter
  - category, weekday, time-slot, and energy interruption insights
  - monthly productivity calendar with month navigation (no future-month browsing)
- Session History:
  - search, filters, sorting, pagination
  - inline editing
  - delete confirmation
- Backup and restore of completed sessions with strict import validation.
- EN/ES localization.
- Light/dark theme support.
- Windows autostart toggle.

## Navigation

- Home
- Analytics
  - Dashboard
  - Session History
- Settings

## Screenshots

Screenshots are pending and will be added in a later documentation update.

## Tech Stack

| Layer                | Technology                          |
| -------------------- | ----------------------------------- |
| Desktop shell/native | Tauri v2 + Rust                     |
| UI                   | React 19 + TypeScript               |
| Styling              | Tailwind CSS v4                     |
| Persistence          | SQLite via `@tauri-apps/plugin-sql` |
| i18n                 | i18next + react-i18next             |
| Unit testing         | Vitest                              |

## Architecture

- `src/App.tsx`: app-level orchestration and page wiring.
- `src/features/analytics/analyticsSummary.ts`: pure analytics calculations.
- `src/features/sessions/sessionRepository.ts`: SQLite persistence and schema checks.
- `src/features/sessions/sessionBackup.ts`: backup envelope creation and strict import parsing.
- `src/features/sessions/sessionTimeCorrections.ts`: pure time-correction helpers.
- `src/i18n/`: language setup and locale resources.

## Setup

Requirements:

- Node.js 20+
- pnpm
- Rust toolchain (for Tauri desktop development/builds)

Install dependencies:

```bash
pnpm install
```

## Development Commands

- `pnpm run dev`
- `pnpm run preview`
- `pnpm run tauri:dev`
- `pnpm run tauri:build`
- `pnpm run format`
- `pnpm run format:check`
- `pnpm run typecheck`
- `pnpm run test`
- `pnpm run test:watch`
- `pnpm run test:coverage`
- `pnpm run build`

## Validation

```bash
pnpm run format:check
pnpm run typecheck
pnpm run test
pnpm run build
```

## Backup and Restore

- Export writes a JSON backup envelope with metadata and completed sessions.
- Import validates origin, version, and payload shape before insert.
- Duplicate session IDs are safely rejected/skipped by import flow rules.

## Release Flow (Windows)

1. Run `pnpm run tauri:build`.
2. Upload generated Windows installer artifacts to a GitHub Release.
3. Publish release notes for the version.

## Roadmap

- Continue decomposing large app-level UI sections into focused components.
- Expand analytics interpretation and behavior insights.
- Improve desktop integration polish in dedicated milestones.
- Strengthen long-term schema migration strategy.

## Contributing

See `CONTRIBUTING.md` for setup, workflow, validation, and contribution standards.

## Design Guidelines

See `DESIGN.md` for current UI/UX principles and analytics presentation rules.

## License

MIT. See `LICENSE`.
