# Trading Transparency Dashboard (Local MVP)

This MVP is in-app editable (no CSV upload required) and now includes backup import/export controls so you can move your data between machines or recover from merge mistakes.

## Run locally

```bash
cd public
python3 -m http.server 4173
```

Open: <http://localhost:4173>

## What you can test visually

- Left sidebar navigation: **Overview, Journal, Mistakes, Rules**
- Journal updates directly in the table (add/edit/delete trades)
- Rules builder (custom rule name + type)
- Dynamic journal columns generated from your custom rules
- Habit analytics on Overview (best/worst habits from checkbox rules)
- Mistake analytics (top mistakes + worst setups by avg R)
- Local persistence via browser `localStorage`
- Backup tools: export JSON / import JSON / reset to demo

## Rule types

- **Checkbox**: yes/no discipline checks
- **Select**: controlled state list (comma-separated options)
- **Text**: free-form note per trade

## Backup format

The export file includes:

- `version`
- `exportedAt`
- `data.rules`
- `data.trades`
