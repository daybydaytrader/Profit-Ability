const state = {
  trades: [],
  filteredTrades: [],
};

const sampleTrades = [
  { trade_id: "T1", date: "2026-01-05", symbol: "TSLA", direction: "long", setup_tag: "ORB", entry_price: 240.1, stop_price: 237.8, exit_price: 245.6, size: 80, fees: 5.2, net_pl: 435.6, r_multiple: 1.8, rule_followed: true, mistake_tags: "", notes: "Clean opening range breakout." },
  { trade_id: "T2", date: "2026-01-05", symbol: "NVDA", direction: "short", setup_tag: "VWAPReject", entry_price: 801.2, stop_price: 805.4, exit_price: 807.5, size: 25, fees: 3.8, net_pl: -161.3, r_multiple: -0.9, rule_followed: false, mistake_tags: "late-entry", notes: "Chased after candle close." },
  { trade_id: "T3", date: "2026-01-06", symbol: "AAPL", direction: "long", setup_tag: "Pullback", entry_price: 187.4, stop_price: 186.2, exit_price: 190.1, size: 120, fees: 4.3, net_pl: 319.7, r_multiple: 1.5, rule_followed: true, mistake_tags: "", notes: "Waited for reclaim and volume confirmation." },
  { trade_id: "T4", date: "2026-01-07", symbol: "META", direction: "long", setup_tag: "VWAPReclaim", entry_price: 512.5, stop_price: 507.8, exit_price: 507.0, size: 45, fees: 5.1, net_pl: -252.6, r_multiple: -1.1, rule_followed: true, mistake_tags: "", notes: "Stopped out as planned." },
  { trade_id: "T5", date: "2026-01-07", symbol: "TSLA", direction: "short", setup_tag: "Breakdown", entry_price: 236.2, stop_price: 238.0, exit_price: 230.3, size: 90, fees: 5.0, net_pl: 520.1, r_multiple: 2.3, rule_followed: true, mistake_tags: "", notes: "Strong breakdown, held to target." },
  { trade_id: "T6", date: "2026-01-08", symbol: "AMD", direction: "long", setup_tag: "Pullback", entry_price: 164.1, stop_price: 162.9, exit_price: 162.4, size: 100, fees: 4.0, net_pl: -174.0, r_multiple: -1.0, rule_followed: false, mistake_tags: "moved-stop,revenge", notes: "Broke plan after prior loss." }
];

function formatMoney(v) {
  return `$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function parseCSV(text) {
  const rows = text.trim().split(/\r?\n/);
  const headers = rows[0].split(",").map((h) => h.trim());
  return rows.slice(1).map((line) => {
    const cols = line.split(",");
    const row = {};
    headers.forEach((h, i) => (row[h] = (cols[i] ?? "").trim()));
    return normalizeTrade(row);
  }).filter(Boolean);
}

function normalizeTrade(row) {
  if (!row.trade_id || !row.date || !row.symbol) return null;
  return {
    ...row,
    entry_price: Number(row.entry_price ?? 0),
    stop_price: Number(row.stop_price ?? 0),
    exit_price: Number(row.exit_price ?? 0),
    size: Number(row.size ?? 0),
    fees: Number(row.fees ?? 0),
    net_pl: Number(row.net_pl ?? 0),
    r_multiple: Number(row.r_multiple ?? 0),
    rule_followed: String(row.rule_followed).toLowerCase() === "true",
  };
}

function calcMetrics(trades) {
  const net = trades.reduce((a, t) => a + t.net_pl, 0);
  const wins = trades.filter((t) => t.net_pl > 0);
  const losses = trades.filter((t) => t.net_pl < 0);
  const grossWin = wins.reduce((a, t) => a + t.net_pl, 0);
  const grossLoss = Math.abs(losses.reduce((a, t) => a + t.net_pl, 0));
  const ruleFollowed = trades.filter((t) => t.rule_followed).length;
  const startEq = 10000;
  return {
    net,
    retPct: (net / startEq) * 100,
    winRate: trades.length ? (wins.length / trades.length) * 100 : 0,
    profitFactor: grossLoss ? grossWin / grossLoss : grossWin ? 99 : 0,
    ruleRate: trades.length ? (ruleFollowed / trades.length) * 100 : 0,
  };
}

function renderScorecards(metrics) {
  const cards = [
    ["Net P/L", formatMoney(metrics.net), metrics.net >= 0],
    ["Return %", `${metrics.retPct.toFixed(2)}%`, metrics.retPct >= 0],
    ["Win Rate", `${metrics.winRate.toFixed(1)}%`, true],
    ["Profit Factor", metrics.profitFactor.toFixed(2), metrics.profitFactor >= 1],
    ["Rule Adherence", `${metrics.ruleRate.toFixed(1)}%`, metrics.ruleRate >= 80],
  ];
  document.getElementById("scorecards").innerHTML = cards.map(([label, value, isGood]) => `
    <article class="card">
      <div class="label">${label}</div>
      <div class="value ${isGood ? "good" : "bad"}">${value}</div>
    </article>`).join("");
}

function renderTable(trades) {
  const body = document.getElementById("tradeTableBody");
  body.innerHTML = trades.map((t) => `
    <tr>
      <td>${t.date}</td>
      <td>${t.symbol}</td>
      <td>${t.setup_tag}</td>
      <td class="${t.r_multiple >= 0 ? "good" : "bad"}">${t.r_multiple.toFixed(2)}</td>
      <td class="${t.net_pl >= 0 ? "good" : "bad"}">${formatMoney(t.net_pl)}</td>
      <td>${t.rule_followed ? "Yes" : "No"}</td>
      <td>${t.mistake_tags || "—"}</td>
    </tr>`).join("");
}

function renderMistakes(trades) {
  const map = new Map();
  trades.forEach((t) => {
    (t.mistake_tags || "").split(";").flatMap(x=>x.split(",")).map((x) => x.trim()).filter(Boolean).forEach((m) => {
      map.set(m, (map.get(m) || 0) + 1);
    });
  });
  const top = [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  document.getElementById("mistakeList").innerHTML = top.length
    ? top.map(([m, c]) => `<li>${m} (${c})</li>`).join("")
    : "<li>No mistakes tagged yet.</li>";
}

function renderWeeklySummary(trades, metrics) {
  if (!trades.length) {
    document.getElementById("weeklySummary").textContent = "No trades available.";
    return;
  }
  const best = [...trades].sort((a, b) => b.r_multiple - a.r_multiple)[0];
  const worst = [...trades].sort((a, b) => a.r_multiple - b.r_multiple)[0];
  document.getElementById("weeklySummary").innerHTML = `
    <p><strong>Trades:</strong> ${trades.length}</p>
    <p><strong>Total Net P/L:</strong> ${formatMoney(metrics.net)}</p>
    <p><strong>Best trade:</strong> ${best.symbol} (${best.r_multiple.toFixed(2)}R)</p>
    <p><strong>Worst trade:</strong> ${worst.symbol} (${worst.r_multiple.toFixed(2)}R)</p>
    <p><strong>Focus next week:</strong> Reduce rule breaks and avoid late entries.</p>
  `;
}

function drawEquityCurve(trades) {
  const canvas = document.getElementById("equityChart");
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const sorted = [...trades].sort((a, b) => a.date.localeCompare(b.date));
  const points = [10000];
  sorted.forEach((t) => points.push(points[points.length - 1] + t.net_pl));

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;

  ctx.strokeStyle = "#2f3c5c";
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    const y = 20 + i * ((h - 40) / 3);
    ctx.beginPath();
    ctx.moveTo(40, y);
    ctx.lineTo(w - 10, y);
    ctx.stroke();
  }

  ctx.strokeStyle = "#38bdf8";
  ctx.lineWidth = 2;
  ctx.beginPath();
  points.forEach((val, i) => {
    const x = 40 + (i * (w - 60)) / Math.max(points.length - 1, 1);
    const y = h - 20 - ((val - min) / range) * (h - 40);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  ctx.fillStyle = "#93a4c5";
  ctx.fillText(`Min: ${formatMoney(min)}`, 44, h - 6);
  ctx.fillText(`Max: ${formatMoney(max)}`, w - 170, h - 6);
}

function refresh() {
  const setup = document.getElementById("setupFilter").value;
  const rule = document.getElementById("ruleFilter").value;
  const symbol = document.getElementById("symbolFilter").value.trim().toUpperCase();

  state.filteredTrades = state.trades.filter((t) => {
    const setupOK = setup === "ALL" || t.setup_tag === setup;
    const ruleOK = rule === "ALL" || String(t.rule_followed) === rule;
    const symbolOK = !symbol || t.symbol.toUpperCase().includes(symbol);
    return setupOK && ruleOK && symbolOK;
  });

  const metrics = calcMetrics(state.filteredTrades);
  renderScorecards(metrics);
  renderTable(state.filteredTrades);
  renderMistakes(state.filteredTrades);
  renderWeeklySummary(state.filteredTrades, metrics);
  drawEquityCurve(state.filteredTrades);
  document.getElementById("tradeCount").textContent = `${state.filteredTrades.length} trades shown`;
}

function populateSetups() {
  const select = document.getElementById("setupFilter");
  const setups = [...new Set(state.trades.map((t) => t.setup_tag))].sort();
  select.innerHTML = `<option value="ALL">All setups</option>${setups.map((s) => `<option>${s}</option>`).join("")}`;
}

function loadTrades(trades) {
  state.trades = trades;
  populateSetups();
  refresh();
}

document.getElementById("csvInput").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text();
  loadTrades(parseCSV(text));
});

document.getElementById("loadSampleBtn").addEventListener("click", () => loadTrades(sampleTrades));
document.getElementById("setupFilter").addEventListener("change", refresh);
document.getElementById("ruleFilter").addEventListener("change", refresh);
document.getElementById("symbolFilter").addEventListener("input", refresh);

loadTrades(sampleTrades);
