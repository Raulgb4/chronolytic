# Chronolytic Design Guidelines

## Purpose

- Keep Chronolytic visually consistent, calm, and data-focused.
- Guide both humans and AI agents toward the same UI and UX decisions.
- Optimize for desktop productivity workflows on Windows first.

## Visual Philosophy

- Clean, modern, and minimal interface inspired by Apple desktop products.
- Calm and elegant over playful or gamified.
- Data is the hero: visual style supports interpretation, not decoration.
- Prefer clarity, whitespace, and hierarchy over dense screens.

## Core UX Principles

- Desktop-first: prioritize keyboard + mouse efficiency and wide layouts.
- Show clear session states at all times: running, paused, inactive review, finished.
- Use progressive disclosure: show key metrics first, advanced details on demand.
- Keep flows predictable: same actions, same locations, same labels.
- Reduce cognitive load: one primary action per area.

## Layout And Spacing

- Use modular dashboard blocks (cards/panels) with consistent internal structure.
- Maintain generous whitespace between sections to separate concerns.
- Use a consistent spacing scale (e.g., 4/8/12/16/24/32).
- Keep visual hierarchy explicit:
  - Primary: current session + top productivity KPIs.
  - Secondary: trends, comparisons, category breakdowns.
  - Tertiary: metadata, tips, and non-critical controls.

## Typography

- Use a clean sans-serif stack suitable for desktop readability.
- Rely on size/weight/line-height for hierarchy, not excessive color changes.
- Keep text concise, scannable, and plain-language.
- Avoid decorative typography and avoid all-caps in long labels.

## Color System

- Neutral-first palette for surfaces, borders, and background.
- Restrained accent colors for actions and key highlights.
- Semantic colors only when they communicate meaning:
  - Success: valid/complete states.
  - Warning: inactivity discount decisions or risky actions.
  - Error: failed operations or invalid inputs.
- Do not use many saturated colors in analytics views.

## Charts And Analytics Clarity

- Choose chart types by question:
  - Trend over time -> line/area.
  - Category comparison -> bar.
  - Distribution/pattern -> heatmap/histogram where useful.
- Keep chart chrome minimal: light gridlines, concise labels, clear units.
- Preserve color meaning across charts (same metric/category = same color).
- Surface insights near charts (delta, average, streak) without crowding.
- Always include empty/loading/error chart states with clear next steps.

## Interaction And Motion

- Interactions should be subtle, fast, and informative.
- Use short transitions (generally 120-220ms) with smooth easing.
- Animate only where it improves comprehension (state change, panel reveal, chart update).
- Avoid decorative motion loops and attention-grabbing effects.
- Keep hover/focus/active states clearly distinguishable.

## Reusable UI Patterns

- Standardize these primitives early:
  - Metric tile
  - Dashboard card
  - Section header with actions
  - Filter bar (date range, category, tags)
  - Session control group (start/pause/resume/finish)
  - Empty/loading/error states
- Reuse existing patterns before introducing new variants.
- New components should define intended context and states explicitly.

## Content And Microcopy

- Use direct, neutral language focused on action and outcomes.
- Keep labels consistent across screens (do not rename the same concept).
- Explain inactivity discount prompts clearly; never obscure impact on metrics.
- Prefer helpful guidance over celebratory/gamified messaging.

## Consistency Rules For Agents

- Match existing spacing, typography, radius, and elevation tokens.
- Reuse shared components; do not clone patterns with small visual differences.
- Keep business logic and analytics logic out of presentational components.
- If a UI decision is unclear, choose the more minimal and readable option.
- When adding a new pattern, document it in this file in one short bullet.

## Quality Checklist (Before Merging UI Changes)

- Is the screen visually calm and uncluttered?
- Is there a clear primary action and hierarchy?
- Are typography, spacing, and color usage consistent with existing patterns?
- Are charts readable with clear units, labels, and stable color semantics?
- Are interactions subtle and useful rather than decorative?
- Does the layout work well on common desktop resolutions?
