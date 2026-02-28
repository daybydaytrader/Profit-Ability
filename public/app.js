const STORAGE_KEY = "trading_dashboard_state_v2";

const seed = {
  rules: [
    { id: "r1", name: "Entry from plan", type: "checkbox", options: [] },
    { id: "r2", name: "Market condition", type: "select", options: ["Trending", "Choppy", "News-driven"] },
  ],
  trades: [
    { id: "t1", date: "2026-02-24", symbol: "TSLA", setup: "ORB", r: 1.6, net: 420, mistakes: "", rules: { r1: true, r2: "Trending" } },
    { id: "t2", date: "2026-02-25", symbol: "NVDA", setup: "Pullback", r: -1.1, net: -250, mistakes: "late entry, moved stop", rules: { r1: false, r2: "Choppy" } },
    { id: "t3", date: "2026-02-26", symbol: "AAPL", setup: "VWAP Reclaim", r: 1.1, net: 280, mistakes: "", rules: { r1: true, r2: "Trending" } },
  ],
};

const state = loadState();

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return structuredClone(seed);
  try {
    return JSON.parse(raw);
  } catch {
    return structuredClone(seed);
  }
}
function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

function money(v) { return `$${Number(v).toFixed(2)}`; }

function switchTab(name) {
  document.querySelectorAll(".nav-tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.id === `tab-${name}`));
}

function metrics() {
  const t = state.trades;
  const net = t.reduce((a, x) => a + Number(x.net || 0), 0);
  const wins = t.filter((x) => Number(x.r) > 0).length;
  const winRate = t.length ? (wins / t.length) * 100 : 0;
  const ruleChecks = state.rules.filter((r) => r.type === "checkbox");
  let totalChecks = 0;
  let passedChecks = 0;
  t.forEach((tr) => {
    ruleChecks.forEach((r) => {
      if (typeof tr.rules?.[r.id] === "boolean") {
        totalChecks += 1;
        if (tr.rules[r.id]) passedChecks += 1;
      }
    });
  });
  const ruleScore = totalChecks ? (passedChecks / totalChecks) * 100 : 0;
  return { net, trades: t.length, winRate, ruleScore };
}

function renderOverview() {
  const m = metrics();
  const cards = [
    ["Net P/L", money(m.net), m.net >= 0],
    ["Trades", `${m.trades}`, true],
    ["Win Rate", `${m.winRate.toFixed(1)}%`, m.winRate >= 50],
    ["Rule Discipline", `${m.ruleScore.toFixed(1)}%`, m.ruleScore >= 80],
  ];
  document.getElementById("scorecards").innerHTML = cards.map(([l, v, good]) => `
    <div class="card"><div class="muted">${l}</div><div class="value ${good ? "good" : "bad"}">${v}</div></div>
  `).join("");

  const habitScores = state.rules.map((rule) => {
    if (rule.type !== "checkbox") return null;
    const vals = state.trades.map((t) => t.rules?.[rule.id]).filter((x) => typeof x === "boolean");
    const pct = vals.length ? (vals.filter(Boolean).length / vals.length) * 100 : 0;
    return { name: rule.name, pct };
  }).filter(Boolean).sort((a, b) => b.pct - a.pct);

  const best = habitScores.slice(0, 3);
  const worst = [...habitScores].reverse().slice(0, 3);
  document.getElementById("bestHabits").innerHTML = best.length ? best.map((h) => `<li>${h.name} <span class="pill">${h.pct.toFixed(0)}%</span></li>`).join("") : "<li>No checkbox rules yet.</li>";
  document.getElementById("worstHabits").innerHTML = worst.length ? worst.map((h) => `<li>${h.name} <span class="pill">${h.pct.toFixed(0)}%</span></li>`).join("") : "<li>No checkbox rules yet.</li>";

  drawEquity();
}

function drawEquity() {
  const canvas = document.getElementById("equityChart");
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  const sorted = [...state.trades].sort((a, b) => a.date.localeCompare(b.date));
  const points = [10000];
  sorted.forEach((t) => points.push(points.at(-1) + Number(t.net || 0)));
  const min = Math.min(...points), max = Math.max(...points), range = max - min || 1;
  ctx.strokeStyle = "#324576";
  for (let i = 0; i < 4; i++) { const y = 20 + i * ((h - 40) / 3); ctx.beginPath(); ctx.moveTo(36, y); ctx.lineTo(w - 8, y); ctx.stroke(); }
  ctx.strokeStyle = "#60a5fa"; ctx.lineWidth = 2; ctx.beginPath();
  points.forEach((v, i) => {
    const x = 36 + (i * (w - 50)) / Math.max(points.length - 1, 1);
    const y = h - 20 - ((v - min) / range) * (h - 40);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

function journalHeaders() {
  const fixed = ["Date", "Symbol", "Setup", "R", "Net", "Mistakes"];
  return [...fixed, ...state.rules.map((r) => r.name), "Actions"];
}

function renderJournal() {
  document.getElementById("journalHead").innerHTML = `<tr>${journalHeaders().map((h) => `<th>${h}</th>`).join("")}</tr>`;
  const rows = state.trades.map((t) => {
    const fixed = `
      <td><input data-k="date" data-id="${t.id}" value="${t.date || ""}"/></td>
      <td><input data-k="symbol" data-id="${t.id}" value="${t.symbol || ""}"/></td>
      <td><input data-k="setup" data-id="${t.id}" value="${t.setup || ""}"/></td>
      <td><input data-k="r" data-id="${t.id}" type="number" step="0.1" value="${t.r ?? 0}"/></td>
      <td><input data-k="net" data-id="${t.id}" type="number" step="0.01" value="${t.net ?? 0}"/></td>
      <td><input data-k="mistakes" data-id="${t.id}" value="${t.mistakes || ""}"/></td>
    `;
    const ruleCells = state.rules.map((rule) => {
      const val = t.rules?.[rule.id];
      if (rule.type === "checkbox") return `<td><input data-rule="${rule.id}" data-id="${t.id}" type="checkbox" ${val ? "checked" : ""}/></td>`;
      if (rule.type === "select") return `<td><select data-rule="${rule.id}" data-id="${t.id}"><option value="">—</option>${rule.options.map((o) => `<option ${val === o ? "selected" : ""}>${o}</option>`).join("")}</select></td>`;
      return `<td><input data-rule="${rule.id}" data-id="${t.id}" value="${val || ""}"/></td>`;
    }).join("");
    return `<tr>${fixed}${ruleCells}<td><button data-del="${t.id}">Delete</button></td></tr>`;
  }).join("");
  document.getElementById("journalBody").innerHTML = rows || `<tr><td colspan="99">No trades yet.</td></tr>`;
}

function renderRules() {
  document.getElementById("ruleList").innerHTML = state.rules.map((r) =>
    `<li><strong>${r.name}</strong> <span class="pill">${r.type}</span> ${r.options?.length ? `• ${r.options.join(", ")}` : ""} <button data-remove-rule="${r.id}">Remove</button></li>`
  ).join("") || "<li>No rules yet.</li>";
}

function renderMistakes() {
  const count = new Map();
  state.trades.forEach((t) => (t.mistakes || "").split(",").map((x) => x.trim()).filter(Boolean).forEach((m) => count.set(m, (count.get(m) || 0) + 1)));
  const top = [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  document.getElementById("mistakeList").innerHTML = top.length ? top.map(([m, n]) => `<li>${m} (${n})</li>`).join("") : "<li>No mistakes logged yet.</li>";

  const bySetup = new Map();
  state.trades.forEach((t) => {
    if (!bySetup.has(t.setup)) bySetup.set(t.setup, []);
    bySetup.get(t.setup).push(Number(t.r || 0));
  });
  const setupAvg = [...bySetup.entries()].map(([s, vals]) => ({ setup: s, avg: vals.reduce((a, v) => a + v, 0) / vals.length }))
    .sort((a, b) => a.avg - b.avg)
    .slice(0, 5);
  document.getElementById("worstSetupList").innerHTML = setupAvg.length ? setupAvg.map((s) => `<li>${s.setup}: ${s.avg.toFixed(2)}R</li>`).join("") : "<li>No setup data yet.</li>";
}

function rerender() {
  saveState();
  renderOverview();
  renderJournal();
  renderRules();
  renderMistakes();
}

function addTrade() {
  state.trades.unshift({
    id: `t${Date.now()}`,
    date: new Date().toISOString().slice(0, 10),
    symbol: "",
    setup: "",
    r: 0,
    net: 0,
    mistakes: "",
    rules: {},
  });
  rerender();
}

function addRule() {
  const name = document.getElementById("ruleName").value.trim();
  const type = document.getElementById("ruleType").value;
  const optionsRaw = document.getElementById("ruleOptions").value.trim();
  if (!name) return;
  const options = type === "select" ? optionsRaw.split(",").map((x) => x.trim()).filter(Boolean) : [];
  state.rules.push({ id: `r${Date.now()}`, name, type, options });
  document.getElementById("ruleName").value = "";
  document.getElementById("ruleOptions").value = "";
  rerender();
}

document.getElementById("navTabs").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-tab]");
  if (!btn) return;
  switchTab(btn.dataset.tab);
});

document.getElementById("addTradeBtn").addEventListener("click", addTrade);
document.getElementById("addRuleBtn").addEventListener("click", addRule);

document.getElementById("journalBody").addEventListener("input", (e) => {
  const id = e.target.dataset.id;
  const trade = state.trades.find((t) => t.id === id);
  if (!trade) return;
  if (e.target.dataset.k) {
    const key = e.target.dataset.k;
    const val = ["r", "net"].includes(key) ? Number(e.target.value || 0) : e.target.value;
    trade[key] = val;
  }
  if (e.target.dataset.rule) {
    const rid = e.target.dataset.rule;
    const inputType = e.target.type;
    if (!trade.rules) trade.rules = {};
    trade.rules[rid] = inputType === "checkbox" ? e.target.checked : e.target.value;
  }
  rerender();
});

document.getElementById("journalBody").addEventListener("click", (e) => {
  const id = e.target.dataset.del;
  if (!id) return;
  state.trades = state.trades.filter((t) => t.id !== id);
  rerender();
});

document.getElementById("ruleList").addEventListener("click", (e) => {
  const rid = e.target.dataset.removeRule;
  if (!rid) return;
  state.rules = state.rules.filter((r) => r.id !== rid);
  state.trades.forEach((t) => { if (t.rules) delete t.rules[rid]; });
  rerender();
});

rerender();
