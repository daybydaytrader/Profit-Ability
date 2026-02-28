# Trading Transparency Dashboard (Local MVP)

This MVP is now **in-app editable** (no CSV upload required).
# Trading Transparency Dashboard MVP

A simple local-first dashboard you can run on localhost and test visually.

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
- Local persistence via browser localStorage

## Rule types

- **Checkbox**: yes/no discipline checks
- **Select**: controlled state list (comma-separated options)
- **Text**: free-form note per trade
Then open: <http://localhost:4173>

## What this MVP includes

- CSV upload for trades
- Core scorecards (Net P/L, Return %, Win Rate, Profit Factor, Rule Adherence)
- Equity curve chart
- Top mistake frequency list
- Weekly summary block
- Trade journal table
- Basic filters (setup, rule-followed, symbol)

## CSV format

Use `public/sample-trades.csv` as the template.

Required columns:

- `trade_id,date,symbol,direction,setup_tag,entry_price,stop_price,exit_price,size,fees,net_pl,r_multiple,rule_followed,mistake_tags,notes`
