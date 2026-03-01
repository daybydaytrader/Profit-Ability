# Trading Transparency Dashboard (Local MVP)

This MVP is in-app editable (no CSV upload required), supports **session-first journaling**, and includes backup import/export controls.

## Run locally

```bash
cd public
python3 -m http.server 4173
```

Open: <http://localhost:4173>

## Journal model (updated)

- **Session-level fields**:
  - Date
  - Mistakes
  - Net (auto-calculated from trades)
  - Correct Decisions
  - Rules (dynamic from Rules page)
- **Trade-level fields inside each session**:
  - Symbol
  - Setup
  - R
  - Entry
  - Exit
  - PnL (auto-calculated as `exit - entry`)

## What you can test visually

- Left sidebar navigation: **Overview, Journal, Mistakes, Rules**
- Add/remove sessions
- Collapse/expand each session card via left arrow (▶ collapsed, ▼ open)
- Add/remove trades inside each session
- Edit session-level and trade-level fields inline
- Rules builder and dynamic session-level rule inputs
- Habit analytics on Overview
- Mistake + setup analytics on Mistakes tab
- Backup tools: export JSON / import JSON / reset to demo

## Backup format

Export file includes:

- `version`
- `exportedAt`
- `data.rules`
- `data.sessions` (with nested `trades`)
