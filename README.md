# DayByDay Dashboard (Local MVP)

This MVP is in-app editable (no CSV upload required), supports **session-first journaling**, and now uses the **DayByDay** branding/theme with backup import/export controls.

## Run locally

```bash
cd public
python3 -m http.server 4173
```

Open: <http://localhost:4173>

## Journal model (updated)

- **Session-level fields**:
  - Date (calendar date picker)
  - Mistakes (max 300 chars + live counter)
  - Net (result-style USD value, auto-calculated from trades)
  - Correct Decisions (max 300 chars + live counter)
  - Rule Adherence % score per session (green if `>=75%`, red if `<75%`)
  - Rules (dynamic from Rules page)
- **Trade-level fields inside each session**:
  - Symbol
  - Setup
  - Type (`long` / `short`)
  - Size
  - Entry (numeric)
  - Exit (numeric)
  - Stop (numeric)
  - R (read-only) = `ceil((abs(exit - entry) / stop) * 10) / 10`
  - PnL auto-calculated as: `(size * 2) * (exit - entry)`

## UX behavior

- Entry/Exit fields stay numeric (no currency symbol formatting).
- PnL and Net are displayed in USD (prefixed with `$`).
- Rule checkbox-type values are rectangular red/green toggle buttons with the rule label inside the button.
- Session textareas expand on hover/focus to reveal full text and stay expanded while focused.
- Journal remains the place for session CRUD, date/account filtering, and full trade/rule editing.
- Symbols are managed from the dedicated **Symbols** tab, and custom symbols cannot be removed there while Journal trades still reference them.

## What you can test visually

- Left sidebar navigation: **Overview, Journal, Mistakes, Rules**
- Add/remove sessions
- Collapse/expand each session card via left arrow (▶ collapsed, ▼ open)
- Add/remove trades inside each session
- Edit session-level and trade-level fields inline without typing interruption
- Rules builder and dynamic session-level rule inputs
- Backup tools: export JSON / import JSON / reset to demo

## Backup format

Export file includes:

- `version`
- `exportedAt`
- `data.rules`
- `data.sessions` (with nested `trades`)
