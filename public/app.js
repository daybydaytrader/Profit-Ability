const STORAGE_KEY = "trading_dashboard_state_v2";
const SESSION_TEXT_MAX = 300;

const seed = {
  rules: [
    { id: "r1", name: "Entry from plan", type: "checkbox", options: [] },
    { id: "r2", name: "Market condition", type: "select", options: ["Trending", "Choppy", "News-driven"] },
  ],
  sessions: [
    {
      id: "s1",
      date: "2026-02-24",
      mistakes: "late entry",
      correctDecisions: "Waited for breakout confirmation",
      rules: { r1: true, r2: "Trending" },
      trades: [
        { id: "t1", symbol: "TSLA", setup: "ORB", r: 1.6, entry: 240.1, exit: 245.6 },
        { id: "t2", symbol: "NVDA", setup: "Pullback", r: -1.1, entry: 801.2, exit: 799.0 },
      ],
    },
    {
      id: "s2",
      date: "2026-02-25",
      mistakes: "",
      correctDecisions: "Cut loser quickly",
      rules: { r1: true, r2: "Trending" },
      trades: [{ id: "t3", symbol: "AAPL", setup: "VWAP Reclaim", r: 1.1, entry: 187.4, exit: 190.1 }],
    },
  ],
};

const state = loadState();

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function normalizeSession(session) {
  return {
    id: session.id || `s${Date.now()}`,
    date: session.date || new Date().toISOString().slice(0, 10),
    mistakes: String(session.mistakes || "").slice(0, SESSION_TEXT_MAX),
    correctDecisions: String(session.correctDecisions || "").slice(0, SESSION_TEXT_MAX),
    rules: session.rules || {},
    collapsed: Boolean(session.collapsed),
    trades: Array.isArray(session.trades)
      ? session.trades.map((t) => ({
          id: t.id || `t${Date.now()}`,
          symbol: t.symbol || "",
          setup: t.setup || "",
          r: Number(t.r || 0),
          entry: Number(t.entry || 0),
          exit: Number(t.exit || 0),
        }))
      : [],
  };
}

function migrateLegacyToSessions(raw) {
  if (Array.isArray(raw.sessions) && raw.sessions.length && raw.sessions[0].trades) {
    return raw;
  }

  if (Array.isArray(raw.sessions) && Array.isArray(raw.trades)) {
    const grouped = raw.sessions.map((s) => ({
      id: s.id,
      date: s.date || new Date().toISOString().slice(0, 10),
      mistakes: s.mistakes || "",
      correctDecisions: s.correctDecisions || "",
      rules: s.rules || {},
      trades: raw.trades
        .filter((t) => t.sessionId === s.id)
        .map((t) => ({ id: t.id, symbol: t.symbol, setup: t.setup, r: t.r, entry: t.entry || 0, exit: t.exit || 0 })),
    }));
    return { rules: raw.rules || [], sessions: grouped };
  }

  return raw;
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  let parsed;
  try {
    parsed = raw ? JSON.parse(raw) : structuredClone(seed);
  } catch {
    parsed = structuredClone(seed);
  }

  parsed = migrateLegacyToSessions(parsed);

  const rules = Array.isArray(parsed.rules) ? parsed.rules : [];
  const sessions = Array.isArray(parsed.sessions) ? parsed.sessions.map(normalizeSession) : [];

  return {
    rules,
    sessions: sessions.length ? sessions : structuredClone(seed.sessions),
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  const stamp = new Date().toLocaleString();
  document.getElementById("saveStatus").textContent = `Saved locally • ${stamp}`;
}

function switchTab(name) {
  document.querySelectorAll(".nav-tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.id === `tab-${name}`));
}

function calcTradePnl(trade) {
  return Number(trade.exit || 0) - Number(trade.entry || 0);
}

function getAllTrades() {
  return state.sessions.flatMap((s) => s.trades || []);
}

function getSessionNet(session) {
  return (session.trades || []).reduce((acc, t) => acc + calcTradePnl(t), 0);
}

function money(v) {
  return `$${Number(v).toFixed(2)}`;
}

function metrics() {
  const allTrades = getAllTrades();
  const net = allTrades.reduce((a, t) => a + calcTradePnl(t), 0);
  const wins = allTrades.filter((t) => calcTradePnl(t) > 0).length;
  const winRate = allTrades.length ? (wins / allTrades.length) * 100 : 0;

  const checkboxRules = state.rules.filter((r) => r.type === "checkbox");
  let totalChecks = 0;
  let passedChecks = 0;

  state.sessions.forEach((s) => {
    checkboxRules.forEach((r) => {
      if (typeof s.rules?.[r.id] === "boolean") {
        totalChecks += 1;
        if (s.rules[r.id]) passedChecks += 1;
      }
    });
  });

  const ruleScore = totalChecks ? (passedChecks / totalChecks) * 100 : 0;
  return { net, trades: allTrades.length, sessions: state.sessions.length, winRate, ruleScore };
}

function drawEquity() {
  const canvas = document.getElementById("equityChart");
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);
  const trades = getAllTrades();
  const points = [10000];
  trades.forEach((t) => points.push(points.at(-1) + calcTradePnl(t)));

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;

  ctx.strokeStyle = "#324576";
  for (let i = 0; i < 4; i += 1) {
    const y = 20 + i * ((h - 40) / 3);
    ctx.beginPath();
    ctx.moveTo(36, y);
    ctx.lineTo(w - 8, y);
    ctx.stroke();
  }

  ctx.strokeStyle = "#60a5fa";
  ctx.lineWidth = 2;
  ctx.beginPath();

  points.forEach((v, i) => {
    const x = 36 + (i * (w - 50)) / Math.max(points.length - 1, 1);
    const y = h - 20 - ((v - min) / range) * (h - 40);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });

  ctx.stroke();
}

function renderOverview() {
  const m = metrics();
  const cards = [
    ["Net P/L", money(m.net), m.net >= 0],
    ["Sessions", `${m.sessions}`, true],
    ["Trades", `${m.trades}`, true],
    ["Win Rate", `${m.winRate.toFixed(1)}%`, m.winRate >= 50],
    ["Rule Discipline", `${m.ruleScore.toFixed(1)}%`, m.ruleScore >= 80],
  ];

  document.getElementById("scorecards").innerHTML = cards
    .map(([label, value, good]) => `<div class="card"><div class="muted">${label}</div><div class="value ${good ? "good" : "bad"}">${value}</div></div>`)
    .join("");

  const habitScores = state.rules
    .map((rule) => {
      if (rule.type !== "checkbox") return null;
      const vals = state.sessions.map((s) => s.rules?.[rule.id]).filter((x) => typeof x === "boolean");
      const pct = vals.length ? (vals.filter(Boolean).length / vals.length) * 100 : 0;
      return { name: rule.name, pct };
    })
    .filter(Boolean)
    .sort((a, b) => b.pct - a.pct);

  const best = habitScores.slice(0, 3);
  const worst = [...habitScores].reverse().slice(0, 3);

  document.getElementById("bestHabits").innerHTML = best.length
    ? best.map((h) => `<li>${h.name} <span class="pill">${h.pct.toFixed(0)}%</span></li>`).join("")
    : "<li>No checkbox rules yet.</li>";

  document.getElementById("worstHabits").innerHTML = worst.length
    ? worst.map((h) => `<li>${h.name} <span class="pill">${h.pct.toFixed(0)}%</span></li>`).join("")
    : "<li>No checkbox rules yet.</li>";

  drawEquity();
}

function renderSessionRules(session) {
  return state.rules
    .map((rule) => {
      const val = session.rules?.[rule.id];
      if (rule.type === "checkbox") {
        return `<label>${rule.name}<input data-session-rule="${rule.id}" data-session-id="${session.id}" type="checkbox" ${val ? "checked" : ""}/></label>`;
      }
      if (rule.type === "select") {
        return `<label>${rule.name}<select data-session-rule="${rule.id}" data-session-id="${session.id}"><option value="">—</option>${rule.options.map((o) => `<option ${val === o ? "selected" : ""}>${escapeHtml(o)}</option>`).join("")}</select></label>`;
      }
      const safeVal = escapeHtml(val || "");
      return `
        <label class="field-with-counter">${rule.name}
          <textarea class="session-input session-expandable" data-expandable data-session-rule="${rule.id}" data-session-id="${session.id}" maxlength="${SESSION_TEXT_MAX}" rows="1">${safeVal}</textarea>
          <span class="char-counter" data-counter-for="${rule.id}" data-counter-scope="rule">0/${SESSION_TEXT_MAX}</span>
        </label>
      `;
    })
    .join("");
}

function renderSessionTrades(session) {
  const rows = (session.trades || [])
    .map((t) => {
      const pnl = calcTradePnl(t);
      return `
      <tr>
        <td><input data-trade-k="symbol" data-session-id="${session.id}" data-trade-id="${t.id}" value="${escapeHtml(t.symbol || "")}"/></td>
        <td><input data-trade-k="setup" data-session-id="${session.id}" data-trade-id="${t.id}" value="${escapeHtml(t.setup || "")}"/></td>
        <td><input data-trade-k="r" data-session-id="${session.id}" data-trade-id="${t.id}" type="number" step="0.1" value="${t.r ?? 0}"/></td>
        <td><input data-trade-k="entry" data-session-id="${session.id}" data-trade-id="${t.id}" type="number" step="0.01" value="${t.entry ?? 0}"/></td>
        <td><input data-trade-k="exit" data-session-id="${session.id}" data-trade-id="${t.id}" type="number" step="0.01" value="${t.exit ?? 0}"/></td>
        <td data-trade-pnl="${t.id}" class="${pnl >= 0 ? "good" : "bad"}">${money(pnl)}</td>
        <td><button data-del-trade="${t.id}" data-session-id="${session.id}">Delete</button></td>
      </tr>
    `;
    })
    .join("");

  return rows || `<tr><td colspan="7" class="muted">No trades yet.</td></tr>`;
}

function renderJournal() {
  const html = state.sessions
    .map((s) => {
      const net = getSessionNet(s);
      return `
      <article class="session-card" data-session-card="${s.id}">
        <div class="session-top">
          <button class="collapse-arrow" title="Toggle session" data-toggle-session="${s.id}" aria-label="Toggle session">${s.collapsed ? "▶" : "▼"}</button>
          <label>Date
            <input type="date" data-session-k="date" data-session-id="${s.id}" value="${s.date || ""}"/>
          </label>
          <label class="field-with-counter">Mistakes
            <textarea class="session-input session-expandable" data-expandable data-session-k="mistakes" data-session-id="${s.id}" maxlength="${SESSION_TEXT_MAX}" rows="1">${escapeHtml(s.mistakes || "")}</textarea>
            <span class="char-counter" data-counter-for="mistakes" data-session-id="${s.id}">0/${SESSION_TEXT_MAX}</span>
          </label>
          <div class="net-result-wrap">
            <div class="muted">Net</div>
            <div data-session-net="${s.id}" class="net-result ${net >= 0 ? "good" : "bad"}">${money(net)}</div>
          </div>
          <label class="field-with-counter">Correct Decisions
            <textarea class="session-input session-expandable" data-expandable data-session-k="correctDecisions" data-session-id="${s.id}" maxlength="${SESSION_TEXT_MAX}" rows="1">${escapeHtml(s.correctDecisions || "")}</textarea>
            <span class="char-counter" data-counter-for="correctDecisions" data-session-id="${s.id}">0/${SESSION_TEXT_MAX}</span>
          </label>
          <div class="session-top-actions">
            <button data-del-session="${s.id}">Delete Session</button>
          </div>
        </div>
        <div class="session-rules">${renderSessionRules(s) || '<span class="muted">No rules yet.</span>'}</div>
        ${
          s.collapsed
            ? ""
            : `
          <div class="session-actions">
            <span class="pill">${s.trades.length} trades</span>
            <button data-add-trade="${s.id}">+ Add Trade</button>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr><th>Symbol</th><th>Setup</th><th>R</th><th>Entry</th><th>Exit</th><th>PnL</th><th>Actions</th></tr>
              </thead>
              <tbody>
                ${renderSessionTrades(s)}
              </tbody>
            </table>
          </div>
        `
        }
      </article>
    `;
    })
    .join("");

  document.getElementById("sessionList").innerHTML = html;
  updateAllCounters();
}

function renderRules() {
  document.getElementById("ruleList").innerHTML =
    state.rules
      .map(
        (r) =>
          `<li><strong>${escapeHtml(r.name)}</strong> <span class="pill">${r.type}</span> ${r.options?.length ? `• ${r.options.map(escapeHtml).join(", ")}` : ""} <button data-remove-rule="${r.id}">Remove</button></li>`
      )
      .join("") || "<li>No rules yet.</li>";
}

function renderMistakes() {
  const mistakeMap = new Map();
  state.sessions.forEach((s) => {
    (s.mistakes || "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean)
      .forEach((m) => {
        mistakeMap.set(m, (mistakeMap.get(m) || 0) + 1);
      });
  });

  const top = [...mistakeMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  document.getElementById("mistakeList").innerHTML = top.length
    ? top.map(([m, n]) => `<li>${escapeHtml(m)} (${n})</li>`).join("")
    : "<li>No mistakes logged yet.</li>";

  const bySetup = new Map();
  getAllTrades().forEach((t) => {
    if (!bySetup.has(t.setup)) bySetup.set(t.setup, []);
    bySetup.get(t.setup).push(Number(t.r || 0));
  });

  const worstSetups = [...bySetup.entries()]
    .map(([setup, vals]) => ({ setup, avg: vals.reduce((a, v) => a + v, 0) / vals.length }))
    .sort((a, b) => a.avg - b.avg)
    .slice(0, 5);

  document.getElementById("worstSetupList").innerHTML = worstSetups.length
    ? worstSetups.map((s) => `<li>${escapeHtml(s.setup)}: ${s.avg.toFixed(2)}R</li>`).join("")
    : "<li>No setup data yet.</li>";
}

function rerender() {
  saveState();
  renderOverview();
  renderJournal();
  renderRules();
  renderMistakes();
}

function addSession() {
  state.sessions.unshift(
    normalizeSession({
      id: `s${Date.now()}`,
      date: new Date().toISOString().slice(0, 10),
      mistakes: "",
      correctDecisions: "",
      rules: {},
      trades: [],
    })
  );
  rerender();
}

function addTradeToSession(sessionId) {
  const session = state.sessions.find((s) => s.id === sessionId);
  if (!session) return;
  session.trades.unshift({ id: `t${Date.now()}`, symbol: "", setup: "", r: 0, entry: 0, exit: 0 });
  rerender();
}

function addRule() {
  const name = document.getElementById("ruleName").value.trim();
  const type = document.getElementById("ruleType").value;
  const optionsRaw = document.getElementById("ruleOptions").value.trim();
  if (!name) return;

  const options = type === "select" ? optionsRaw.split(",").map((x) => x.trim()).filter(Boolean) : [];
  const newRule = { id: `r${Date.now()}`, name, type, options };
  state.rules.push(newRule);

  document.getElementById("ruleName").value = "";
  document.getElementById("ruleOptions").value = "";
  rerender();
}

function exportBackup() {
  const payload = { version: 4, exportedAt: new Date().toISOString(), data: state };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `trading-dashboard-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importBackupFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      const imported = parsed?.data || parsed;
      const migrated = migrateLegacyToSessions(imported);
      if (!Array.isArray(migrated?.sessions) || !Array.isArray(migrated?.rules)) throw new Error("Invalid backup format.");

      state.rules = migrated.rules;
      state.sessions = migrated.sessions.map(normalizeSession);
      rerender();
    } catch (err) {
      alert(`Import failed: ${err.message}`);
    }
  };
  reader.readAsText(file);
}

function resetToDemo() {
  state.rules = structuredClone(seed.rules);
  state.sessions = structuredClone(seed.sessions);
  rerender();
}

function updateSessionField(target) {
  const session = state.sessions.find((s) => s.id === target.dataset.sessionId);
  if (!session) return;

  if (target.dataset.sessionK) {
    if (["mistakes", "correctDecisions"].includes(target.dataset.sessionK)) {
      session[target.dataset.sessionK] = String(target.value).slice(0, SESSION_TEXT_MAX);
    } else {
      session[target.dataset.sessionK] = target.value;
    }
  }

  if (target.dataset.sessionRule) {
    const rid = target.dataset.sessionRule;
    const inputType = target.type;
    if (inputType === "checkbox") {
      session.rules[rid] = target.checked;
    } else if (target.tagName === "TEXTAREA") {
      session.rules[rid] = String(target.value).slice(0, SESSION_TEXT_MAX);
    } else {
      session.rules[rid] = target.value;
    }
  }
}

function updateTradeField(target) {
  const session = state.sessions.find((s) => s.id === target.dataset.sessionId);
  if (!session) return null;
  const trade = session.trades.find((t) => t.id === target.dataset.tradeId);
  if (!trade) return null;

  const key = target.dataset.tradeK;
  if (!key) return null;
  trade[key] = ["r", "entry", "exit"].includes(key) ? Number(target.value || 0) : target.value;
  return { session, trade };
}

function updateAllCounters() {
  document.querySelectorAll("textarea[maxlength]").forEach((el) => {
    const key = el.dataset.sessionK || el.dataset.sessionRule;
    const sessionId = el.dataset.sessionId;
    const selector = el.dataset.sessionK
      ? `.char-counter[data-counter-for="${key}"][data-session-id="${sessionId}"]`
      : `.char-counter[data-counter-for="${key}"][data-counter-scope="rule"]`;
    const counter = el.closest("label")?.querySelector(".char-counter") || document.querySelector(selector);
    if (counter) counter.textContent = `${el.value.length}/${SESSION_TEXT_MAX}`;
  });
}

function updateTradeComputedUI(sessionId, tradeId) {
  const session = state.sessions.find((s) => s.id === sessionId);
  if (!session) return;
  const trade = session.trades.find((t) => t.id === tradeId);
  if (!trade) return;

  const pnlCell = document.querySelector(`[data-trade-pnl="${tradeId}"]`);
  if (pnlCell) {
    const pnl = calcTradePnl(trade);
    pnlCell.textContent = money(pnl);
    pnlCell.classList.toggle("good", pnl >= 0);
    pnlCell.classList.toggle("bad", pnl < 0);
  }

  const sessionNetEl = document.querySelector(`[data-session-net="${sessionId}"]`);
  if (sessionNetEl) {
    const sessionNet = getSessionNet(session);
    sessionNetEl.textContent = money(sessionNet);
    sessionNetEl.classList.toggle("good", sessionNet >= 0);
    sessionNetEl.classList.toggle("bad", sessionNet < 0);
  }
}

function refreshAnalyticsOnly() {
  saveState();
  renderOverview();
  renderMistakes();
}

document.getElementById("navTabs").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-tab]");
  if (!btn) return;
  switchTab(btn.dataset.tab);
});

document.getElementById("addSessionBtn").addEventListener("click", addSession);
document.getElementById("addRuleBtn").addEventListener("click", addRule);
document.getElementById("exportBtn").addEventListener("click", exportBackup);
document.getElementById("importBtn").addEventListener("click", () => document.getElementById("importInput").click());
document.getElementById("importInput").addEventListener("change", (e) => importBackupFile(e.target.files[0]));
document.getElementById("resetBtn").addEventListener("click", resetToDemo);

document.getElementById("sessionList").addEventListener("input", (e) => {
  const t = e.target;
  if (t.dataset.sessionK || t.dataset.sessionRule) {
    updateSessionField(t);
    if (t.tagName === "TEXTAREA") updateAllCounters();
    refreshAnalyticsOnly();
  }

  if (t.dataset.tradeK) {
    const updated = updateTradeField(t);
    if (updated) updateTradeComputedUI(updated.session.id, updated.trade.id);
    refreshAnalyticsOnly();
  }
});

document.getElementById("sessionList").addEventListener("change", (e) => {
  const t = e.target;
  if (t.dataset.sessionK || t.dataset.sessionRule) {
    updateSessionField(t);
    if (t.tagName === "TEXTAREA") updateAllCounters();
    refreshAnalyticsOnly();
  }

  if (t.dataset.tradeK) {
    const updated = updateTradeField(t);
    if (updated) updateTradeComputedUI(updated.session.id, updated.trade.id);
    refreshAnalyticsOnly();
  }
});

document.getElementById("sessionList").addEventListener("click", (e) => {
  const addTradeSessionId = e.target.dataset.addTrade;
  if (addTradeSessionId) {
    addTradeToSession(addTradeSessionId);
    return;
  }

  const toggleSessionId = e.target.dataset.toggleSession;
  if (toggleSessionId) {
    const session = state.sessions.find((s) => s.id === toggleSessionId);
    if (!session) return;
    session.collapsed = !session.collapsed;
    rerender();
    return;
  }

  const sessionId = e.target.dataset.delSession;
  if (sessionId) {
    state.sessions = state.sessions.filter((s) => s.id !== sessionId);
    if (!state.sessions.length) addSession();
    else rerender();
    return;
  }

  const tradeId = e.target.dataset.delTrade;
  if (tradeId) {
    const parentSessionId = e.target.dataset.sessionId;
    const session = state.sessions.find((s) => s.id === parentSessionId);
    if (!session) return;
    session.trades = session.trades.filter((t) => t.id !== tradeId);
    rerender();
  }
});

document.getElementById("ruleList").addEventListener("click", (e) => {
  const rid = e.target.dataset.removeRule;
  if (!rid) return;
  state.rules = state.rules.filter((r) => r.id !== rid);
  state.sessions.forEach((s) => {
    if (s.rules) delete s.rules[rid];
  });
  rerender();
});

rerender();
