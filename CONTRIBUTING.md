# Contributing to Chronolytic

Thanks for contributing.

## Prerequisites

- Node.js 20+
- pnpm
- Rust toolchain (required for Tauri development/builds)

## Setup

```bash
pnpm install
```

## Branching and Commits

- Branch model:
  - `main`: stable
  - `develop`: integration
  - feature work: `feature/*`
  - maintenance/chore work: `chore/*`
- Use conventional commits.
- Keep changes focused and small.

## Validation Before PR

```bash
pnpm run format:check
pnpm run typecheck
pnpm run test
pnpm run build
```

When desktop/runtime behavior changes, also verify:

```bash
pnpm run tauri:dev
```

## Testing Expectations

- Unit testing uses Vitest.
- Keep tests colocated using `*.test.ts`.
- Prefer testing pure TypeScript business logic first.
- Avoid adding UI/E2E tests unless specifically needed.

## Documentation and i18n Rules

- Keep docs aligned with real, implemented behavior.
- Do not describe roadmap items as currently available features.
- Add user-facing strings to both locale files:
  - `src/i18n/locales/en.json`
  - `src/i18n/locales/es.json`

## Generated Files Policy

Do not commit generated outputs:

- `dist/`
- `src-tauri/target/`
- `src-tauri/gen/`
- `node_modules/`

## Additional Guidance

- See `README.md` for project overview and usage.
- See `DESIGN.md` for UI/UX and analytics design principles.
- See `AGENTS.md` for repository-specific engineering constraints.
