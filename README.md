# Chronolytic

Chronolytic is a local-first desktop productivity analytics platform for tracking effective work/study sessions, detecting inactivity, and turning personal time data into actionable insights.

It is designed as a serious analytics product, not a simple timer app.

## Overview

Chronolytic helps users understand how focused time is actually spent across days, weeks, and months. Instead of only counting elapsed time, it emphasizes effective duration, session quality, and behavioral patterns.

The product combines session tracking, inactivity-aware time accounting, and analytics dashboards to support better productivity decisions.

## Product Vision

Raw time tracking is not enough to improve performance. Chronolytic aims to provide a reliable personal productivity data layer that reveals trends, strengths, and friction points over time.

## Core Workflow

1. Start a session with a title/activity.
2. Optionally assign category and tags.
3. Pause, resume, or finish manually.
4. Detect inactivity or screen lock events.
5. Ask whether inactive time should be discounted.
6. Store structured session data for analytics.
7. Visualize metrics, trends, and behavioral patterns.

## Key Features

Planned initial capabilities:

- Session tracking with manual start/pause/resume/finish flow.
- Effective duration accounting with inactivity review.
- Local-first persistence for reliable personal data ownership.
- Dashboard analytics for trends, comparisons, and patterns.
- Desktop-focused productivity UX for Windows 11.

## Screenshots And Demo

Screenshots and short workflow GIFs will be added as the interface and session flow stabilize.

Recommended future media order:

1. Dashboard overview screenshot.
2. Session workflow GIF (start -> pause/resume -> finish).
3. Inactivity discount prompt screenshot.
4. Analytics trends view screenshot.

## Tech Stack

| Layer | Technology | Purpose |
| --- | --- | --- |
| Desktop shell/native | Tauri + Rust | OS integration, background behavior, system-level events |
| UI | React + TypeScript | Desktop interface and interaction flows |
| Styling | Tailwind CSS | Consistent design system and rapid UI composition |
| Persistence | SQLite | Local-first storage for sessions and analytics data |
| ORM | Drizzle ORM | Typed database access and schema management |
| Visualization | Recharts | Productivity charts and dashboard visuals |

## Architecture

Chronolytic follows feature-oriented modular boundaries:

- UI layer: screens, components, interaction states.
- Application layer: session workflows and business rules.
- Data layer: SQLite and persistence access.
- Analytics layer: reusable calculations and metrics logic.
- Native layer: inactivity/screen-lock/tray/background concerns via Tauri/Rust commands.

Design goals:

- Keep UI separate from business logic and persistence.
- Keep SQLite/Drizzle access out of React components.
- Keep analytics logic reusable and testable outside the UI.

## Analytics Scope

Planned analytics include:

- Hours per day/week/month.
- Daily and weekly averages.
- Time by category.
- Number of sessions.
- Average session duration.
- Productivity streaks.
- Most productive days/hours.
- Focus duration patterns.
- Monthly comparisons.
- Trends and heatmaps.

## Project Status

Chronolytic is currently in early initialization (pre-scaffold).

- Product direction, architecture, and design guidelines are defined.
- Executable app scaffold and development scripts are not yet added.
- Commands will be documented once `package.json`/Tauri/Cargo config exists.

## Roadmap

### Foundation

- Scaffold Tauri + React + TypeScript desktop project.
- Add Tailwind CSS setup.
- Add SQLite + Drizzle foundation.

### Session Tracking

- Implement start/pause/resume/finish session lifecycle.
- Persist session metadata (title, category, tags, timestamps).
- Calculate effective duration with pause history.

### Desktop Integration

- Inactivity detection and discount flow.
- Screen lock awareness.
- Background execution.
- System tray integration.
- Windows installer support.

### Analytics

- Core KPI dashboard and trend views.
- Category and time-distribution analytics.
- Streaks, comparisons, and pattern visualizations.

### Future Extensions

- Automatic insights.
- Weekly summaries.
- Productivity recommendations.
- Goals, records, and light gamification.
- AI/LLM-generated insight layer.

## Development

This repository is currently pre-scaffold. Development commands will be added once executable project configuration is present.

Until then:

- Do not assume `npm`/`pnpm` scripts exist.
- Do not document unverified commands.
- Treat config files as the source of truth when they are added.

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
