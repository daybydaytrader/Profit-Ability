const STORAGE_KEY = "trading_dashboard_state";
const LEGACY_STORAGE_KEYS = ["trading_dashboard_state_v3", "trading_dashboard_state_v2", "trading_dashboard_state_v1"];
const SESSION_TEXT_MAX = 300;
const DEFAULT_STARTING_BALANCE = 50000;
const DEFAULT_ACCOUNT_ID = "acc1";

const SYMBOL_OPTIONS = ["NQ", "MNQ", "ES", "MES", "GC", "MGC"];
const POINT_VALUE_BY_SYMBOL = {
  NQ: 20,
  MNQ: 2,
  ES: 50,
  MES: 5,
  GC: 100,
  MGC: 10,
};

const seed = {
  accounts: [{ id: DEFAULT_ACCOUNT_ID, name: "Main Account", startingBalance: DEFAULT_STARTING_BALANCE }],
  groups: [],
  playbook: [{ id: "pb1", title: "ORB", confluences: "", perfectSetup: "", perfectSetupEdits: { lines: [], texts: [], history: [], future: [] } }, { id: "pb2", title: "Pullback", confluences: "", perfectSetup: "", perfectSetupEdits: { lines: [], texts: [], history: [], future: [] } }],
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
      accountId: DEFAULT_ACCOUNT_ID,
      trades: [
        { id: "t1", symbol: "MNQ", entryTime: "09:35", exitTime: "10:02", setup: "ORB", type: "long", size: 10, entry: 240.1, exit: 245.6, stop: 2.5 },
        { id: "t2", symbol: "NQ", entryTime: "10:10", exitTime: "10:41", setup: "Pullback", type: "short", size: 4, entry: 801.2, exit: 799.0, stop: 1.2 },
      ],
    },
  ],
  customSymbols: [],
};

let state;

function normalizeCustomSymbol(symbol) {
  const ticker = String(symbol?.ticker || "").trim().toUpperCase();
  const tickSize = Number(symbol?.tickSize);
  const tickValue = Number(symbol?.tickValue);
  if (!ticker || !Number.isFinite(tickSize) || tickSize <= 0 || !Number.isFinite(tickValue) || tickValue <= 0) return null;
  return { ticker, tickSize, tickValue };
}

function getAllSymbolOptions() {
  const custom = (state?.customSymbols || []).map((item) => item.ticker);
  return [...new Set([...SYMBOL_OPTIONS, ...custom])];
}

function getBasePriceStep(symbol) {
  if (["NQ", "MNQ", "ES", "MES"].includes(symbol)) return 0.25;
  if (["GC", "MGC"].includes(symbol)) return 0.1;
  return 0.01;
}

function getSymbolConfig(symbol) {
  const normalized = String(symbol || "").trim().toUpperCase();
  const custom = (state?.customSymbols || []).find((item) => item.ticker === normalized);
  if (custom) return { tickSize: custom.tickSize, pointValue: custom.tickValue / custom.tickSize };
  const pointValue = POINT_VALUE_BY_SYMBOL[normalized] || 2;
  return { tickSize: getBasePriceStep(normalized), pointValue };
}

state = loadState();
const uiState = {
  activeImageTarget: null,
  activeLinkSessionId: null,
  activePlaybookSetupId: null,
  activeRuleId: null,
  activeDeleteSessionId: null,
  pendingAccountGroupId: "",
  groupPickerSelectedId: "",
  groupBuilderSelection: [],
  editingGroupId: null,
  filters: {
    overviewAccountId: "all",
    overviewFrom: "",
    overviewTo: "",
    journalAccountId: "all",
    journalFrom: "",
    journalTo: "",
  },
  imageEditor: {
    visible: false,
    expanded: false,
    mode: "cursor",
    lineColor: "#ff5f7a",
    textColor: "#67d98d",
    lines: [],
    texts: [],
    drawingLine: null,
    history: [],
    future: [],
    blockUntil: 0,
    baseImage: null,
    selectedTextId: null,
  },
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function toNum(v) {
  if (typeof v === "number") return v;
  const cleaned = String(v ?? "").replace(/[^0-9.-]/g, "");
  return Number(cleaned || 0);
}

function normalizeTradeTime(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
  return match ? raw : "";
}

function getPriceStep(symbol) {
  return getSymbolConfig(symbol).tickSize;
}

function snapPriceToSymbol(value, symbol) {
  const step = getPriceStep(symbol);
  const num = toNum(value);
  const snapped = Math.round(num / step) * step;
  return Number(snapped.toFixed(4));
}

function formatWithThousands(value, decimals = 2) {
  const fixed = Number(value || 0).toFixed(decimals);
  const [intPart, fracPart] = fixed.split(".");
  const signed = intPart.startsWith("-") ? "-" : "";
  const absInt = signed ? intPart.slice(1) : intPart;
  const grouped = Number(absInt || 0).toLocaleString("en-US");
  if (!fracPart) return `${signed}${grouped}`;
  if (/^0+$/.test(fracPart)) return `${signed}${grouped}`;
  return `${signed}${grouped}.${fracPart}`;
}

function formatTradePrice(value, symbol) {
  const step = getPriceStep(symbol);
  const decimals = Math.max(0, String(step).split(".")[1]?.length || 0);
  return formatWithThousands(snapPriceToSymbol(value, symbol), decimals || 2);
}

function normalizeTrade(t) {
  const symbol = String(t.symbol || "MNQ").trim().toUpperCase();
  return {
    id: t.id || `t${Date.now()}`,
    accountId: String(t.accountId || ""),
    symbol,
    entryTime: normalizeTradeTime(t.entryTime || t.time),
    exitTime: normalizeTradeTime(t.exitTime),
    setup: t.setup || "",
    type: t.type === "short" ? "short" : "long",
    size: Number(t.size || 0),
    entry: snapPriceToSymbol(t.entry, symbol),
    exit: snapPriceToSymbol(t.exit, symbol),
    stop: toNum(t.stop),
  };
}

function normalizePlaybook(playbook) {
  const seen = new Set();
  return (Array.isArray(playbook) ? playbook : [])
    .map((item) => {
      if (typeof item === "string") {
        return {
          id: `pb${Date.now()}${Math.random().toString(16).slice(2, 6)}`,
          title: item.trim(),
          confluences: "",
          perfectSetup: "",
          perfectSetupEdits: { lines: [], texts: [], history: [], future: [] },
        };
      }
      return {
        id: item?.id || `pb${Date.now()}${Math.random().toString(16).slice(2, 6)}`,
        title: String(item?.title || item?.name || "").trim(),
        confluences: String(item?.confluences || ""),
        perfectSetup: String(item?.perfectSetup || ""),
        perfectSetupEdits: {
          lines: Array.isArray(item?.perfectSetupEdits?.lines) ? item.perfectSetupEdits.lines : [],
          texts: Array.isArray(item?.perfectSetupEdits?.texts) ? item.perfectSetupEdits.texts : [],
          history: Array.isArray(item?.perfectSetupEdits?.history) ? item.perfectSetupEdits.history : [],
          future: Array.isArray(item?.perfectSetupEdits?.future) ? item.perfectSetupEdits.future : [],
        },
      };
    })
    .filter((setup) => setup.title && !seen.has(setup.title.toLowerCase()) && seen.add(setup.title.toLowerCase()));
}

function getPlaybookTitles() {
  return state.playbook.map((setup) => setup.title);
}

function getImageTargetData(target) {
  if (!target?.id) return null;
  if (target.type === "session") {
    const session = state.sessions.find((item) => item.id === target.id);
    if (!session) return null;
    return { screenshot: session.screenshot, edits: session.screenshotEdits || { lines: [], texts: [], history: [], future: [] } };
  }
  if (target.type === "playbook") {
    const setup = state.playbook.find((item) => item.id === target.id);
    if (!setup) return null;
    return { screenshot: setup.perfectSetup, edits: setup.perfectSetupEdits || { lines: [], texts: [], history: [], future: [] } };
  }
  return null;
}

function normalizeAccount(account) {
  const name = String(account?.name || "").trim();
  const startingBalance = Number(account?.startingBalance);
  const maxDrawdown = Number(account?.maxDrawdown);
  return {
    id: account?.id || `acc${Date.now()}${Math.random().toString(16).slice(2, 6)}` ,
    name: name || "Account",
    startingBalance: Number.isFinite(startingBalance) && startingBalance >= 0 ? startingBalance : DEFAULT_STARTING_BALANCE,
    maxDrawdown: Number.isFinite(maxDrawdown) && maxDrawdown >= 0 ? maxDrawdown : 0,
    groupId: String(account?.groupId || ""),
  };
}

function normalizeGroup(group) {
  const name = String(group?.name || "").trim();
  return {
    id: group?.id || `grp${Date.now()}${Math.random().toString(16).slice(2, 6)}`,
    name: name || "Group",
  };
}

function normalizeSession(session) {
  return {
    id: session.id || `s${Date.now()}`,
    date: session.date || new Date().toISOString().slice(0, 10),
    mistakes: String(session.mistakes || "").slice(0, SESSION_TEXT_MAX),
    correctDecisions: String(session.correctDecisions || "").slice(0, SESSION_TEXT_MAX),
    rules: session.rules || {},
    accountId: String(session.accountId || DEFAULT_ACCOUNT_ID),
    screenshot: typeof session.screenshot === "string" ? session.screenshot : "",
    screenshotEdits: {
      lines: Array.isArray(session.screenshotEdits?.lines) ? session.screenshotEdits.lines : [],
      texts: Array.isArray(session.screenshotEdits?.texts) ? session.screenshotEdits.texts : [],
      history: Array.isArray(session.screenshotEdits?.history) ? session.screenshotEdits.history : [],
      future: Array.isArray(session.screenshotEdits?.future) ? session.screenshotEdits.future : [],
    },
    videoLink: {
      url: String(session.videoLink?.url || ""),
      title: String(session.videoLink?.title || ""),
      thumbnail: String(session.videoLink?.thumbnail || ""),
    },
    collapsed: Boolean(session.collapsed),
    trades: Array.isArray(session.trades) ? session.trades.map(normalizeTrade) : [],
  };
}

function migrateLegacyToSessions(raw) {
  if (Array.isArray(raw.sessions) && raw.sessions.length && raw.sessions[0].trades) return raw;
  if (Array.isArray(raw.sessions) && Array.isArray(raw.trades)) {
    const grouped = raw.sessions.map((s) => ({
      id: s.id,
      date: s.date || new Date().toISOString().slice(0, 10),
      mistakes: s.mistakes || "",
      correctDecisions: s.correctDecisions || "",
      rules: s.rules || {},
      trades: raw.trades
        .filter((t) => t.sessionId === s.id)
        .map((t) => ({
          id: t.id,
          symbol: t.symbol,
          entryTime: normalizeTradeTime(t.entryTime || t.time),
          exitTime: normalizeTradeTime(t.exitTime),
          setup: t.setup,
          type: t.type || "long",
          size: t.size || 0,
          entry: t.entry || 0,
          exit: t.exit || 0,
          stop: t.stop || 0,
        })),
    }));
    return { rules: raw.rules || [], sessions: grouped };
  }
  return raw;
}

function loadState() {
  const availableKey = [STORAGE_KEY, ...LEGACY_STORAGE_KEYS].find((key) => localStorage.getItem(key));
  const raw = availableKey ? localStorage.getItem(availableKey) : null;
  let parsed;
  try {
    parsed = raw ? JSON.parse(raw) : structuredClone(seed);
  } catch {
    parsed = structuredClone(seed);
  }
  parsed = migrateLegacyToSessions(parsed);
  const rules = Array.isArray(parsed.rules) ? parsed.rules : [];
  const sessions = Array.isArray(parsed.sessions) ? parsed.sessions.map(normalizeSession) : [];
  const inferredSetups = sessions.flatMap((session) => session.trades.map((trade) => String(trade.setup || "").trim())).filter(Boolean);
  const playbook = normalizePlaybook(parsed.playbook?.length ? parsed.playbook : inferredSetups);
  const customSymbols = Array.isArray(parsed.customSymbols) ? parsed.customSymbols.map(normalizeCustomSymbol).filter(Boolean) : [];
  const legacyStart = Number(parsed.accountStart);
  const legacyAccount = { id: DEFAULT_ACCOUNT_ID, name: "Main Account", startingBalance: Number.isFinite(legacyStart) && legacyStart >= 0 ? legacyStart : DEFAULT_STARTING_BALANCE };
  const accounts = (Array.isArray(parsed.accounts) ? parsed.accounts : [legacyAccount]).map(normalizeAccount);
  const groups = (Array.isArray(parsed.groups) ? parsed.groups : []).map(normalizeGroup);
  const accountIds = new Set(accounts.map((a) => a.id));
  const groupIds = new Set(groups.map((g) => g.id));
  sessions.forEach((session) => {
    if (!accountIds.has(session.accountId) && !groupIds.has(session.accountId)) session.accountId = accounts[0]?.id || "";
    session.trades.forEach((trade) => {
      const targetId = getTradeAccountTargetId(trade, session);
      if (!accountIds.has(targetId) && !groupIds.has(targetId)) trade.accountId = session.accountId;
      else trade.accountId = targetId;
    });
  });
  return {
    accounts,
    groups,
    playbook: playbook.length ? playbook : structuredClone(seed.playbook),
    rules,
    sessions: sessions.length ? sessions : structuredClone(seed.sessions),
    customSymbols,
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  LEGACY_STORAGE_KEYS.forEach((key) => {
    if (key !== STORAGE_KEY) localStorage.removeItem(key);
  });
  document.getElementById("saveStatus").textContent = `Saved locally • ${new Date().toLocaleString()}`;
}

function switchTab(name) {
  document.querySelectorAll(".nav-tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.id === `tab-${name}`));
}


function getAccountById(accountId) {
  return state.accounts.find((account) => account.id === accountId) || state.accounts[0];
}

function getGroupById(groupId) {
  return state.groups.find((group) => group.id === groupId) || null;
}

function getGroupAccountCount(groupId) {
  return state.accounts.filter((account) => account.groupId === groupId).length;
}

function getSessionMultiplier(session) {
  const group = getGroupById(session.accountId);
  return group ? Math.max(1, getGroupAccountCount(group.id)) : 1;
}

function getTradeAccountTargetId(trade, session) {
  return String(trade?.accountId || session?.accountId || "");
}

function getTradeMultiplier(trade, session) {
  const targetId = getTradeAccountTargetId(trade, session);
  const group = getGroupById(targetId);
  if (!group) return 1;
  return getGroupAccountCount(group.id);
}

function calcTradeNet(trade, session) {
  return calcTradePnl(trade) * getTradeMultiplier(trade, session);
}

function accountTargetLabel(id) {
  const group = getGroupById(id);
  if (group) return `${group.name} (Group • ${getGroupAccountCount(group.id)} accounts)`;
  const account = getAccountById(id);
  return account?.id === id ? account.name : "Main Account";
}

function getFilteredSessions({ accountId = "all", from = "", to = "" } = {}) {
  return state.sessions.filter((session) => {
    if (accountId !== "all" && session.accountId !== accountId) return false;
    if (from && session.date < from) return false;
    if (to && session.date > to) return false;
    return true;
  });
}

function calcR(trade) {
  const stop = Math.abs(toNum(trade.stop));
  if (!stop) return 0;
  const ratio = Math.abs(toNum(trade.exit) - toNum(trade.entry)) / stop;
  return Math.ceil(ratio * 10) / 10;
}

function calcTradePnl(trade) {
  const entry = toNum(trade.entry);
  const exit = toNum(trade.exit);
  const size = Number(trade.size || 0);
  const symbol = String(trade.symbol || "").trim().toUpperCase();
  const pointValue = getSymbolConfig(symbol).pointValue;
  const direction = trade.type === "short" ? entry - exit : exit - entry;
  return size * pointValue * direction;
}

function timeToMinutes(value) {
  const normalized = normalizeTradeTime(value);
  if (!normalized) return null;
  const [hours, minutes] = normalized.split(":").map(Number);
  return hours * 60 + minutes;
}

function calcTradeDuration(trade) {
  const start = timeToMinutes(trade.entryTime);
  const end = timeToMinutes(trade.exitTime);
  if (start === null || end === null || end < start) return "—";
  const diff = end - start;
  const hours = Math.floor(diff / 60);
  const minutes = diff % 60;
  if (hours) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function getAllTrades() {
  return state.sessions.flatMap((s) => s.trades || []);
}

function getSessionNet(session) {
  return session.trades.reduce((acc, trade) => {
    const tradeNet = calcTradePnl(trade) * getTradeMultiplier(trade, session);
    return acc + tradeNet;
  }, 0);
}

function getSessionTotalNet(session) {
  return getSessionNet(session);
}

function getAccountCurrentEquity(accountId) {
  const account = state.accounts.find((item) => item.id === accountId);
  if (!account) return 0;
  const net = state.sessions.reduce((sum, session) => sum + session.trades.reduce((tradeSum, trade) => {
    const targetId = getTradeAccountTargetId(trade, session);
    return targetId === accountId ? tradeSum + calcTradePnl(trade) : tradeSum;
  }, 0), 0);
  return account.startingBalance + net;
}

function getSessionRuleAdherence(session) {
  const checks = state.rules.filter((r) => r.type === "checkbox");
  if (!checks.length) return null;
  const passed = checks.filter((r) => Boolean(session.rules?.[r.id])).length;
  return (passed / checks.length) * 100;
}

function metrics() {
  const allTrades = getAllTrades();
  const net = state.sessions.reduce((acc, session) => acc + getSessionTotalNet(session), 0);
  const wins = allTrades.filter((t) => calcTradePnl(t) > 0).length;
  const winRate = allTrades.length ? (wins / allTrades.length) * 100 : 0;

  const sessionAdherences = state.sessions
    .map((session) => getSessionRuleAdherence(session))
    .filter((value) => value !== null);
  const ruleScore = sessionAdherences.length
    ? sessionAdherences.reduce((acc, value) => acc + value, 0) / sessionAdherences.length
    : 0;

  return { net, trades: allTrades.length, sessions: state.sessions.length, winRate, ruleScore };
}

function drawEquity() {
  const root = document.getElementById("equityChart");
  if (!root) return;
  const sessions = getFilteredSessions({
    accountId: uiState.filters.overviewAccountId,
    from: uiState.filters.overviewFrom,
    to: uiState.filters.overviewTo,
  }).sort((a, b) => a.date.localeCompare(b.date));
  const selectedId = uiState.filters.overviewAccountId;
  const group = selectedId === "all" ? null : getGroupById(selectedId);
  const account = selectedId === "all" || group ? null : getAccountById(selectedId);
  const start = group
    ? state.accounts.filter((account) => account.groupId === group.id).reduce((sum, account) => sum + account.startingBalance, 0)
    : account
      ? account.startingBalance
      : state.accounts.reduce((sum, acc) => sum + acc.startingBalance, 0);
  const points = [start];
  sessions.forEach((session) => points.push(points.at(-1) + getSessionTotalNet(session)));
  const labels = ["Start", ...sessions.map((session) => session.date)];
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = Math.max(1, max - min);

  const left = 64;
  const right = 18;
  const top = 16;
  const bottom = 42;
  const w = 1000;
  const h = 260;
  const chartW = w - left - right;
  const chartH = h - top - bottom;

  const pointRows = points.map((value, i) => {
    const x = left + (i * chartW) / Math.max(points.length - 1, 1);
    const y = top + ((max - value) / range) * chartH;
    return { x, y, value };
  });
  const path = pointRows.map((p, idx) => `${idx === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");

  const yGrid = Array.from({ length: 4 }, (_, i) => {
    const y = top + i * (chartH / 3);
    const val = max - (i * range) / 3;
    return `<line x1="${left}" y1="${y}" x2="${w - right}" y2="${y}" stroke="rgba(217,221,228,0.22)"/><text x="${left - 8}" y="${y + 4}" text-anchor="end" fill="#b6bbc6" font-size="11">$${Math.round(val).toLocaleString()}</text>`;
  }).join("");

  const xTicks = pointRows.map((p, i) => `<text x="${p.x}" y="${h - 12}" text-anchor="middle" fill="#b6bbc6" font-size="10">${labels[i] === "Start" ? "Start" : labels[i].slice(5)}</text>`).join("");
  const dots = pointRows.map((p) => `<circle cx="${p.x}" cy="${p.y}" r="3" fill="#d9dde4"/>`).join("");

  root.innerHTML = `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Equity curve chart"><rect x="0" y="0" width="${w}" height="${h}" fill="transparent"/>${yGrid}<path d="${path}" fill="none" stroke="#d9dde4" stroke-width="2.5"/>${dots}${xTicks}</svg>`;
}

function renderOverview() {
  const m = metrics();
  const cards = [
    ["Net P/L", `$${m.net.toFixed(2)}`, m.net >= 0],
    ["Sessions", `${m.sessions}`, true],
    ["Trades", `${m.trades}`, true],
    ["Win Rate", `${m.winRate.toFixed(1)}%`, m.winRate >= 50],
    ["Rule Adherence", `${m.ruleScore.toFixed(1)}%`, m.ruleScore >= 80],
  ];
  document.getElementById("scorecards").innerHTML = cards
    .map(([label, value, good]) => `<div class="card"><div class="muted">${label}</div><div class="value ${good ? "good" : "bad"}">${value}</div></div>`)
    .join("");

  const habits = state.rules
    .map((rule) => {
      if (rule.type !== "checkbox") return null;
      const vals = state.sessions.map((s) => s.rules?.[rule.id]).filter((x) => typeof x === "boolean");
      const pct = vals.length ? (vals.filter(Boolean).length / vals.length) * 100 : 0;
      return { name: rule.name, pct };
    })
    .filter(Boolean)
    .sort((a, b) => b.pct - a.pct);

  document.getElementById("bestHabits").innerHTML = habits.length
    ? habits.slice(0, 3).map((h) => `<li>${escapeHtml(h.name)} <span class="pill">${h.pct.toFixed(0)}%</span></li>`).join("")
    : "<li>No checkbox rules yet.</li>";
  document.getElementById("worstHabits").innerHTML = habits.length
    ? [...habits].reverse().slice(0, 3).map((h) => `<li>${escapeHtml(h.name)} <span class="pill">${h.pct.toFixed(0)}%</span></li>`).join("")
    : "<li>No checkbox rules yet.</li>";

  const setups = new Map();
  getAllTrades().forEach((trade) => {
    const name = String(trade.setup || "").trim();
    if (!name) return;
    const pnl = calcTradePnl(trade);
    const current = setups.get(name) || { wins: 0, total: 0 };
    current.total += 1;
    if (pnl > 0) current.wins += 1;
    setups.set(name, current);
  });

  const bestSetups = [...setups.entries()]
    .map(([name, stats]) => ({
      name,
      winRate: stats.total ? (stats.wins / stats.total) * 100 : 0,
      wins: stats.wins,
      total: stats.total,
    }))
    .sort((a, b) => b.winRate - a.winRate || b.total - a.total || a.name.localeCompare(b.name))
    .slice(0, 3);

  document.getElementById("bestSetupList").innerHTML = bestSetups.length
    ? bestSetups.map((setup) => `<li><span class="pill">${setup.winRate.toFixed(0)}%</span> ${escapeHtml(setup.name)} (${setup.wins}/${setup.total})</li>`).join("")
    : "<li>No setup data yet.</li>";

  drawEquity();
}



function accountOptions(selected = "") {
  const accountOptionsHtml = state.accounts
    .map((account) => `<option value="${account.id}" ${selected === account.id ? "selected" : ""}>${escapeHtml(account.name)}</option>`)
    .join("");
  const groupOptionsHtml = state.groups
    .map((group) => `<option value="${group.id}" ${selected === group.id ? "selected" : ""}>${escapeHtml(group.name)} (${getGroupAccountCount(group.id)} acc)</option>`)
    .join("");
  return `${accountOptionsHtml}${groupOptionsHtml}`;
}

function renderFilterSelects() {
  const equity = document.getElementById("equityAccountFilter");
  const journal = document.getElementById("journalAccountFilter");
  if (equity) { equity.innerHTML = `<option value="all">All accounts</option>${accountOptions(uiState.filters.overviewAccountId)}`; equity.value = uiState.filters.overviewAccountId; }
  if (journal) { journal.innerHTML = `<option value="all">All accounts</option>${accountOptions(uiState.filters.journalAccountId)}`; journal.value = uiState.filters.journalAccountId; }
  const map = [["equityDateFrom","overviewFrom"],["equityDateTo","overviewTo"],["journalDateFrom","journalFrom"],["journalDateTo","journalTo"]];
  map.forEach(([id,key]) => { const input = document.getElementById(id); if (input && document.activeElement !== input) input.value = uiState.filters[key]; });
}

function renderAccounts() {
  const list = document.getElementById("accountsList");
  const groupsList = document.getElementById("groupsList");
  if (list) {
    list.innerHTML = state.accounts.length
      ? state.accounts
          .map((account) => `<article class="playbook-card" data-open-account="${account.id}"><div class="playbook-card-head"><h4>${escapeHtml(account.name)}</h4><div><span class="pill">$${formatWithThousands(account.startingBalance, 0)}</span> <button type="button" class="danger" data-remove-account="${account.id}">Remove</button></div></div><p class="muted small">Max DD: $${formatWithThousands(account.maxDrawdown || 0, 0)}</p><p class="muted small">Group: ${escapeHtml(account.groupId ? accountTargetLabel(account.groupId) : "—")}</p></article>`)
          .join("")
      : '<div class="muted small">No accounts yet.</div>';
  }
  if (groupsList) {
    groupsList.innerHTML = state.groups.length
      ? state.groups
          .map((group) => `<article class="playbook-card" data-open-group="${group.id}"><div class="playbook-card-head"><h4>${escapeHtml(group.name)}</h4><div><span class="pill">${getGroupAccountCount(group.id)} acc</span> <button type="button" class="danger" data-remove-group="${group.id}">Remove</button></div></div><p class="muted small">Click to view/edit members.</p></article>`)
          .join("")
      : '<div class="muted small">No groups yet.</div>';
  }
}

function renderSessionRules(session) {
  return state.rules
    .map((rule) => {
      const val = session.rules?.[rule.id];
      if (rule.type === "checkbox") {
        const active = Boolean(val);
        return `<button type="button" class="rule-pill ${active ? "is-true" : "is-false"}" data-rule-toggle="${rule.id}" data-session-id="${session.id}">${escapeHtml(rule.name)}</button>`;
      }
      if (rule.type === "select") {
        return `<label>${escapeHtml(rule.name)}<select data-session-rule="${rule.id}" data-session-id="${session.id}"><option value="">—</option>${rule.options.map((o) => `<option ${val === o ? "selected" : ""}>${escapeHtml(o)}</option>`).join("")}</select></label>`;
      }
      return `
        <label class="field-with-counter">${escapeHtml(rule.name)}
          <textarea class="session-input session-expandable" data-expandable data-session-rule="${rule.id}" data-session-id="${session.id}" maxlength="${SESSION_TEXT_MAX}" rows="1">${escapeHtml(val || "")}</textarea>
          <span class="char-counter">0/${SESSION_TEXT_MAX}</span>
        </label>
      `;
    })
    .join("");
}

function renderSessionTrades(session) {
  const symbolOptions = getAllSymbolOptions();
  const rows = session.trades
    .map((t) => {
      const pnl = calcTradePnl(t);
      const multiplier = getTradeMultiplier(t, session);
      const totalPnl = pnl * multiplier;
      const r = calcR(t);
      const tradeTargetId = getTradeAccountTargetId(t, session);
      return `
      <tr>
        <td><select data-trade-k="accountId" data-session-id="${session.id}" data-trade-id="${t.id}">${accountOptions(tradeTargetId)}</select></td>
        <td>
          <select data-trade-k="symbol" data-session-id="${session.id}" data-trade-id="${t.id}">
            ${symbolOptions.map((symbol) => `<option value="${symbol}" ${t.symbol === symbol ? "selected" : ""}>${symbol}</option>`).join("")}
            ${t.symbol && !symbolOptions.includes(t.symbol) ? `<option value="${escapeHtml(t.symbol)}" selected>${escapeHtml(t.symbol)} (legacy)</option>` : ""}
          </select>
        </td>
        <td>
          <select data-trade-k="setup" data-session-id="${session.id}" data-trade-id="${t.id}">
            <option value="">— Select setup —</option>
            ${getPlaybookTitles().map((setup) => `<option value="${escapeHtml(setup)}" ${t.setup === setup ? "selected" : ""}>${escapeHtml(setup)}</option>`).join("")}
            ${t.setup && !getPlaybookTitles().includes(t.setup) ? `<option value="${escapeHtml(t.setup)}" selected>${escapeHtml(t.setup)} (legacy)</option>` : ""}
          </select>
        </td>
        <td><select data-trade-k="type" data-session-id="${session.id}" data-trade-id="${t.id}"><option value="long" ${t.type === "long" ? "selected" : ""}>long</option><option value="short" ${t.type === "short" ? "selected" : ""}>short</option></select></td>
        <td><input data-trade-k="size" data-session-id="${session.id}" data-trade-id="${t.id}" type="number" step="1" value="${t.size ?? 0}"/></td>
        <td><input data-trade-k="entry" data-session-id="${session.id}" data-trade-id="${t.id}" value="${formatTradePrice(t.entry, t.symbol)}"/></td>
        <td><input data-trade-k="entryTime" data-session-id="${session.id}" data-trade-id="${t.id}" type="time" value="${normalizeTradeTime(t.entryTime)}"/></td>
        <td><input data-trade-k="exit" data-session-id="${session.id}" data-trade-id="${t.id}" value="${formatTradePrice(t.exit, t.symbol)}"/></td>
        <td><input data-trade-k="exitTime" data-session-id="${session.id}" data-trade-id="${t.id}" type="time" value="${normalizeTradeTime(t.exitTime)}"/></td>
        <td><input data-trade-k="stop" data-session-id="${session.id}" data-trade-id="${t.id}" type="number" step="0.01" value="${toNum(t.stop)}"/></td>
        <td data-trade-duration="${t.id}">${calcTradeDuration(t)}</td>
        <td data-trade-r="${t.id}">${r.toFixed(1)}</td>
        <td data-trade-pnl="${t.id}" class="${totalPnl >= 0 ? "good" : "bad"}">$${pnl.toFixed(2)}${multiplier > 1 ? `<div class="muted small">${escapeHtml(accountTargetLabel(tradeTargetId))}: $${totalPnl.toFixed(2)}</div>` : ""}</td>
        <td><button data-del-trade="${t.id}" data-session-id="${session.id}">Delete</button></td>
      </tr>`;
    })
    .join("");

  return rows || `<tr><td colspan="14" class="muted">No trades yet.</td></tr>`;
}

function parseYoutubeId(url) {
  const value = String(url || "").trim();
  if (!value) return "";
  const match = value.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([a-zA-Z0-9_-]{6,})/);
  return match ? match[1] : "";
}

function getYoutubeThumbnail(url) {
  const id = parseYoutubeId(url);
  return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : "";
}

function getSafeExternalUrl(url) {
  try {
    const parsed = new URL(String(url || "").trim());
    if (!["http:", "https:"].includes(parsed.protocol)) return "";
    return parsed.href;
  } catch {
    return "";
  }
}

async function getYoutubeTitle(url) {
  try {
    const endpoint = `https://noembed.com/embed?url=${encodeURIComponent(url)}`;
    const res = await fetch(endpoint);
    if (!res.ok) return "";
    const data = await res.json();
    return String(data?.title || "");
  } catch {
    return "";
  }
}

function renderJournal() {
  const customList = document.getElementById("customSymbolList");
  if (customList) {
    customList.innerHTML = state.customSymbols.length
      ? state.customSymbols
          .map((item) => `<li><strong>${escapeHtml(item.ticker)}</strong> • tick ${item.tickSize} • $${item.tickValue}/tick <button type="button" data-del-symbol="${item.ticker}">Remove</button></li>`)
          .join("")
      : '<li class="muted">No custom symbols yet.</li>';
  }
  const filteredSessions = getFilteredSessions({
    accountId: uiState.filters.journalAccountId,
    from: uiState.filters.journalFrom,
    to: uiState.filters.journalTo,
  });
  const html = filteredSessions
    .map((s) => {
      const net = getSessionNet(s);
      const adherence = getSessionRuleAdherence(s);
      return `
      <article class="session-card">
        <div class="session-top">
          <button class="collapse-arrow" title="Toggle session" data-toggle-session="${s.id}" aria-label="Toggle session">${s.collapsed ? "▶" : "▼"}</button>
          <label>Date
            <input class="date-input" type="date" data-session-k="date" data-session-id="${s.id}" value="${s.date || ""}"/>
          </label>
          <label>Environment
            <select data-session-k="accountId" data-session-id="${s.id}">${accountOptions(s.accountId)}</select>
          </label>
          <div class="session-link-wrap">
            ${s.videoLink?.url ? `<button type="button" class="session-shot session-link-card" data-open-link="${s.id}" title="Edit video link"><span class="session-link-play" data-play-link="${s.id}" title="Open video" aria-label="Open YouTube video">▶</span><span class="link-title">${escapeHtml(s.videoLink.title || "YouTube Video")}</span>${s.videoLink.thumbnail ? `<img src="${escapeHtml(s.videoLink.thumbnail)}" alt="Linked video thumbnail"/>` : `<span class="link-thumb-fallback">No thumbnail</span>`}</button>` : `<button type="button" class="session-shot session-shot-empty" data-open-link="${s.id}">Add Link</button>`}
          </div>
          <label class="field-with-counter">Mistakes
            <textarea class="session-input session-expandable" data-expandable data-session-k="mistakes" data-session-id="${s.id}" maxlength="${SESSION_TEXT_MAX}" rows="1">${escapeHtml(s.mistakes || "")}</textarea>
            <span class="char-counter">0/${SESSION_TEXT_MAX}</span>
          </label>
          <div class="session-shot-wrap">
            ${s.screenshot ? `<button type="button" class="session-shot" data-shot-preview="${s.id}" title="Open screenshot"><img src="${escapeHtml(s.screenshot)}" alt="Session screenshot"/><span class="shot-corner-arrow" data-upload-shot="${s.id}" title="Change screenshot">↗</span></button>` : `<button type="button" class="session-shot session-shot-empty" data-upload-shot="${s.id}">Add screenshot</button>`}
          </div>
          <div class="net-result-wrap">
            <div class="muted">Net PnL</div>
            <div data-session-net="${s.id}" class="net-result ${net >= 0 ? "good" : "bad"}">$${net.toFixed(2)}</div>
            <div class="muted small">Sum of all trade PnL × accounts traded.</div>
            <div class="adherence-badge ${adherence !== null && adherence >= 75 ? "good" : "bad"}">Rule Adherence: ${adherence === null ? "N/A" : `${adherence.toFixed(0)}%`}</div>
          </div>
          <label class="field-with-counter">Good Decisions
            <textarea class="session-input session-expandable" data-expandable data-session-k="correctDecisions" data-session-id="${s.id}" maxlength="${SESSION_TEXT_MAX}" rows="1">${escapeHtml(s.correctDecisions || "")}</textarea>
            <span class="char-counter">0/${SESSION_TEXT_MAX}</span>
          </label>
          <div class="session-top-actions">
            <button class="danger session-delete-btn" data-del-session="${s.id}">Delete Session</button>
            <input type="file" accept="image/*" hidden data-session-shot-input="${s.id}" />
          </div>
        </div>

        <div class="session-rules">${renderSessionRules(s) || '<span class="muted">No rules yet.</span>'}</div>

        ${
          s.collapsed
            ? ""
            : `<div class="session-actions"><span class="pill">${s.trades.length} trades</span><button data-add-trade="${s.id}">+ Add Trade</button></div>
               <div class="table-wrap"><table><thead><tr><th>Environment</th><th>Symbol</th><th>Setup</th><th>Type</th><th>Size</th><th>Entry</th><th>Entry Time</th><th>Exit</th><th>Exit Time</th><th>Stop</th><th>Duration</th><th>R</th><th>PnL</th><th>Actions</th></tr></thead><tbody>${renderSessionTrades(s)}</tbody></table></div>`
        }
      </article>`;
    })
    .join("");

  document.getElementById("sessionList").innerHTML = html || '<p class="muted">No sessions yet.</p>';
  updateAllCounters();
}

function renderRules() {
  document.getElementById("ruleList").innerHTML =
    state.rules
      .map((r) => `
        <article class="playbook-card" data-open-rule="${r.id}">
          <div class="playbook-card-head">
            <h4>${escapeHtml(r.name)}</h4>
            <button type="button" data-remove-rule="${r.id}">Remove</button>
          </div>
          <p class="muted small"><span class="pill">${escapeHtml(r.type)}</span>${r.options?.length ? ` • ${r.options.map(escapeHtml).join(", ")}` : ""}</p>
        </article>
      `)
      .join("") || '<p class="muted">No rules yet.</p>';
}

function renderRuleModal(rule) {
  if (!rule) return;
  document.getElementById("ruleModalNameInput").value = rule.name;
  document.getElementById("ruleModalTypeInput").value = ["checkbox", "select"].includes(rule.type) ? rule.type : "checkbox";
  document.getElementById("ruleModalOptionsInput").value = (rule.options || []).join(", ");
  document.getElementById("ruleModalOptionsWrap").hidden = document.getElementById("ruleModalTypeInput").value !== "select";
}

function openRuleModal(ruleId) {
  const rule = state.rules.find((item) => item.id === ruleId);
  if (!rule) return;
  uiState.activeRuleId = ruleId;
  renderRuleModal(rule);
  document.getElementById("ruleDetailModal").hidden = false;
  document.body.style.overflow = "hidden";
}

function closeRuleModal() {
  document.getElementById("ruleDetailModal").hidden = true;
  uiState.activeRuleId = null;
  if (document.getElementById("imageModal").hidden && document.getElementById("playbookDetailModal").hidden && document.getElementById("linkModal").hidden && document.getElementById("customSymbolModal").hidden && document.getElementById("accountDetailModal").hidden && document.getElementById("accountGroupPickerModal").hidden && document.getElementById("groupBuilderModal").hidden && document.getElementById("accountEntityModal").hidden) {
    document.body.style.overflow = "";
  }
}

function renderPlaybook() {
  document.getElementById("playbookList").innerHTML =
    state.playbook
      .map((setup) => `
        <article class="playbook-card" data-open-playbook="${setup.id}">
          <div class="playbook-card-head">
            <h4>${escapeHtml(setup.title)}</h4>
            <span class="pill">Setup</span>
          </div>
          <p class="muted small"><strong>Name:</strong> ${escapeHtml(setup.title)}</p>
          <p class="muted small"><strong>Confluences:</strong> ${setup.confluences ? escapeHtml(setup.confluences) : "No confluences added yet."}</p>
          <div class="playbook-shot-wrap">
            ${setup.perfectSetup ? `<button type="button" class="session-shot" data-shot-preview-playbook="${setup.id}"><img src="${escapeHtml(setup.perfectSetup)}" alt="Perfect setup screenshot"/></button>` : `<div class="session-shot session-shot-empty">No screenshot</div>`}
          </div>
        </article>
      `)
      .join("") || '<p class="muted">No setups yet.</p>';
}


function renderPlaybookModalShot(setup) {
  const shotBtn = document.getElementById("playbookModalShotBtn");
  if (!shotBtn) return;
  shotBtn.classList.toggle("session-shot-empty", !setup?.perfectSetup);
  shotBtn.innerHTML = setup?.perfectSetup
    ? `<img src="${escapeHtml(setup.perfectSetup)}" alt="Perfect setup screenshot"/><span class="shot-corner-arrow" data-upload-playbook-shot="1">↗</span>`
    : "Add screenshot";
}

function togglePlaybookRemoveButton() {
  const removeBtn = document.getElementById("removePlaybookSetupBtn");
  if (!removeBtn) return;
  removeBtn.hidden = !uiState.activePlaybookSetupId;
}

function renderMistakes() {
  const map = new Map();
  state.sessions.forEach((s) => {
    (s.mistakes || "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean)
      .forEach((m) => map.set(m, (map.get(m) || 0) + 1));
  });

  const top = [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  document.getElementById("mistakeList").innerHTML = top.length
    ? top.map(([m, n]) => `<li>${escapeHtml(m)} (${n})</li>`).join("")
    : "<li>No mistakes logged yet.</li>";

  const bySetup = new Map();
  getAllTrades().forEach((t) => {
    if (!bySetup.has(t.setup)) bySetup.set(t.setup, []);
    bySetup.get(t.setup).push(calcR(t));
  });

  const worst = [...bySetup.entries()]
    .map(([setup, vals]) => ({ setup, avg: vals.reduce((a, v) => a + v, 0) / vals.length }))
    .sort((a, b) => a.avg - b.avg)
    .slice(0, 5);

  document.getElementById("worstSetupList").innerHTML = worst.length
    ? worst.map((s) => `<li>${escapeHtml(s.setup)}: ${s.avg.toFixed(2)}R</li>`).join("")
    : "<li>No setup data yet.</li>";
}


function getImageEditorElements() {
  return {
    menu: document.getElementById("imageEditMenu"),
    stage: document.getElementById("imageStage"),
    canvas: document.getElementById("imageEditCanvas"),
    img: document.getElementById("imageModalImg"),
    textOverlay: document.getElementById("textOverlay"),
  };
}

function pushEditorHistory() {
  const editor = uiState.imageEditor;
  editor.history.push({
    lines: structuredClone(editor.lines),
    texts: structuredClone(editor.texts),
  });
  if (editor.history.length > 100) editor.history.shift();
  editor.future = [];
  persistActiveScreenshotEdits();
}

function persistActiveScreenshotEdits() {
  const target = uiState.activeImageTarget;
  if (!target?.id) return;
  const editor = uiState.imageEditor;
  if (target.type === "session") {
    const session = state.sessions.find((item) => item.id === target.id);
    if (!session) return;
    session.screenshotEdits = {
      lines: structuredClone(editor.lines),
      texts: structuredClone(editor.texts),
      history: structuredClone(editor.history),
      future: structuredClone(editor.future),
    };
  } else if (target.type === "playbook") {
    const setup = state.playbook.find((item) => item.id === target.id);
    if (!setup) return;
    setup.perfectSetupEdits = {
      lines: structuredClone(editor.lines),
      texts: structuredClone(editor.texts),
      history: structuredClone(editor.history),
      future: structuredClone(editor.future),
    };
  }
  saveState();
}

function syncEditorControls() {
  const editor = uiState.imageEditor;
  const menu = document.getElementById("imageEditMenu");
  const stage = document.getElementById("imageStage");
  const frame = document.querySelector(".image-modal-content.image-modal-editor-shell");
  const canvas = document.getElementById("imageEditCanvas");
  const textOverlay = document.getElementById("textOverlay");
  const modeSelect = document.getElementById("editModeSelect");
  const lineColor = document.getElementById("lineColorInput");
  const textColor = document.getElementById("textColorInput");
  if (!menu || !stage || !frame || !canvas || !textOverlay || !modeSelect || !lineColor || !textColor) return;
  menu.hidden = !(editor.visible && editor.expanded);
  frame.classList.toggle("expanded", editor.expanded);
  stage.classList.toggle("line-mode", editor.visible && editor.expanded && editor.mode === "line");
  canvas.classList.toggle("editable", editor.visible && editor.expanded && editor.mode === "line");
  textOverlay.classList.toggle("editable", editor.visible && editor.expanded && editor.mode !== "line");
  modeSelect.value = editor.mode;
  lineColor.value = editor.lineColor;
  textColor.value = editor.textColor;
}

function setEditorExpanded(expanded) {
  uiState.imageEditor.expanded = expanded;
  uiState.imageEditor.visible = expanded;
  syncEditorControls();
  resizeEditCanvas();
  redrawEditCanvas();
}

function getBaseImageDrawRect(canvas) {
  const base = uiState.imageEditor.baseImage;
  if (!canvas || !base?.naturalWidth || !base?.naturalHeight) {
    return { x: 0, y: 0, width: canvas?.width || 1, height: canvas?.height || 1 };
  }
  const scale = Math.min(canvas.width / base.naturalWidth, canvas.height / base.naturalHeight);
  const width = base.naturalWidth * scale;
  const height = base.naturalHeight * scale;
  return {
    x: (canvas.width - width) / 2,
    y: (canvas.height - height) / 2,
    width,
    height,
  };
}

function resizeEditCanvas() {
  const { canvas, stage } = getImageEditorElements();
  if (!canvas || !stage) return;
  const w = Math.max(1, Math.round(stage.clientWidth));
  const h = Math.max(1, Math.round(stage.clientHeight));
  canvas.width = w;
  canvas.height = h;
}


function renderTextOverlay() {
  const { textOverlay, canvas } = getImageEditorElements();
  if (!textOverlay || !canvas) return;
  const editor = uiState.imageEditor;
  const imageRect = getBaseImageDrawRect(canvas);
  textOverlay.innerHTML = editor.texts
    .map((txt) => {
      const left = imageRect.x + txt.x * imageRect.width;
      const top = imageRect.y + txt.y * imageRect.height;
      const width = Math.max(80, (txt.w || 0.2) * imageRect.width);
      const height = Math.max(36, (txt.h || 0.12) * imageRect.height);
      const selected = editor.selectedTextId === txt.id ? " selected" : "";
      const deleteButton = editor.selectedTextId === txt.id ? '<button type="button" class="text-box-delete" title="Delete text" aria-label="Delete text">×</button>' : "";
      return `<div class="text-box${selected}" data-text-id="${txt.id}" style="left:${left}px;top:${top}px;width:${width}px;height:${height}px;">
        <div class="text-box-handle" title="Drag"></div>
        ${deleteButton}
        <textarea style="color:${escapeHtml(txt.color || editor.textColor)};">${escapeHtml(txt.text || "")}</textarea>
      </div>`;
    })
    .join("");
}

function removeEditorTextById(textId) {
  const editor = uiState.imageEditor;
  if (!textId || !editor.texts.some((txt) => txt.id === textId)) return;
  pushEditorHistory();
  editor.texts = editor.texts.filter((txt) => txt.id !== textId);
  if (editor.selectedTextId === textId) editor.selectedTextId = null;
  persistActiveScreenshotEdits();
  redrawEditCanvas();
}

function redrawEditCanvas() {
  const { canvas } = getImageEditorElements();
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const base = uiState.imageEditor.baseImage;
  const imageRect = getBaseImageDrawRect(canvas);
  if (base?.naturalWidth && base?.naturalHeight) {
    ctx.drawImage(base, imageRect.x, imageRect.y, imageRect.width, imageRect.height);
  }

  uiState.imageEditor.lines.forEach((line) => {
    if (!line.points?.length) return;
    ctx.strokeStyle = line.color || "#ff5f7a";
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    line.points.forEach((pt, index) => {
      const x = imageRect.x + pt.x * imageRect.width;
      const y = imageRect.y + pt.y * imageRect.height;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  });

  const current = uiState.imageEditor.drawingLine;
  if (current?.points?.length) {
    ctx.strokeStyle = current.color || "#ff5f7a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    current.points.forEach((pt, index) => {
      const x = imageRect.x + pt.x * imageRect.width;
      const y = imageRect.y + pt.y * imageRect.height;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  renderTextOverlay();
}

function resetImageEditorState() {
  uiState.imageEditor.visible = false;
  uiState.imageEditor.expanded = false;
  uiState.imageEditor.mode = "cursor";
  uiState.imageEditor.lines = [];
  uiState.imageEditor.texts = [];
  uiState.imageEditor.drawingLine = null;
  uiState.imageEditor.history = [];
  uiState.imageEditor.future = [];
  uiState.imageEditor.selectedTextId = null;
  syncEditorControls();
  redrawEditCanvas();
}

function editorPointFromEvent(e) {
  const { canvas } = getImageEditorElements();
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  const imageRect = getBaseImageDrawRect(canvas);
  const imageLeft = rect.left + (imageRect.x / canvas.width) * rect.width;
  const imageTop = rect.top + (imageRect.y / canvas.height) * rect.height;
  const imageWidthPx = (imageRect.width / canvas.width) * rect.width;
  const imageHeightPx = (imageRect.height / canvas.height) * rect.height;
  if (
    e.clientX < imageLeft ||
    e.clientX > imageLeft + imageWidthPx ||
    e.clientY < imageTop ||
    e.clientY > imageTop + imageHeightPx
  ) {
    return null;
  }
  return {
    x: Math.min(1, Math.max(0, (e.clientX - imageLeft) / imageWidthPx)),
    y: Math.min(1, Math.max(0, (e.clientY - imageTop) / imageHeightPx)),
  };
}

function updateTextFromNode(box) {
  const id = box.dataset.textId;
  const txt = uiState.imageEditor.texts.find((item) => item.id === id);
  if (!txt) return;
  const { canvas } = getImageEditorElements();
  const imageRect = getBaseImageDrawRect(canvas);
  const area = box.querySelector("textarea");
  if (!canvas || !area) return;
  txt.text = area.value;
  txt.color = area.style.color || txt.color;
  txt.w = Math.max(80, box.offsetWidth) / imageRect.width;
  txt.h = Math.max(36, box.offsetHeight) / imageRect.height;
  persistActiveScreenshotEdits();
}

function undoEditor() {
  const editor = uiState.imageEditor;
  const prev = editor.history.pop();
  if (!prev) return;
  editor.future.push({ lines: structuredClone(editor.lines), texts: structuredClone(editor.texts) });
  editor.lines = prev.lines;
  editor.texts = prev.texts;
  persistActiveScreenshotEdits();
  redrawEditCanvas();
}

function redoEditor() {
  const editor = uiState.imageEditor;
  const next = editor.future.pop();
  if (!next) return;
  editor.history.push({ lines: structuredClone(editor.lines), texts: structuredClone(editor.texts) });
  editor.lines = next.lines;
  editor.texts = next.texts;
  persistActiveScreenshotEdits();
  redrawEditCanvas();
}

function openLinkModal(sessionId) {
  const session = state.sessions.find((s) => s.id === sessionId);
  if (!session) return;
  uiState.activeLinkSessionId = sessionId;
  document.getElementById("linkUrlInput").value = session.videoLink?.url || "";
  document.getElementById("linkTitleInput").value = session.videoLink?.title || "";
  document.getElementById("linkModal").hidden = false;
  document.body.style.overflow = "hidden";
}

function closeLinkModal() {
  document.getElementById("linkModal").hidden = true;
  uiState.activeLinkSessionId = null;
  if (document.getElementById("imageModal").hidden && document.getElementById("playbookDetailModal").hidden && document.getElementById("customSymbolModal").hidden && document.getElementById("ruleDetailModal").hidden) document.body.style.overflow = "";
}

function openCustomSymbolModal() {
  document.getElementById("customSymbolModal").hidden = false;
  setCustomSymbolStatus("");
  document.body.style.overflow = "hidden";
}

function closeCustomSymbolModal() {
  document.getElementById("customSymbolModal").hidden = true;
  if (document.getElementById("imageModal").hidden && document.getElementById("playbookDetailModal").hidden && document.getElementById("linkModal").hidden && document.getElementById("ruleDetailModal").hidden) {
    document.body.style.overflow = "";
  }
}

async function saveLinkFromModal() {
  if (!uiState.activeLinkSessionId) return;
  const session = state.sessions.find((s) => s.id === uiState.activeLinkSessionId);
  if (!session) return;
  const url = document.getElementById("linkUrlInput").value.trim();
  if (!url) {
    session.videoLink = { url: "", title: "", thumbnail: "" };
    closeLinkModal();
    rerender();
    return;
  }
  const manualTitle = document.getElementById("linkTitleInput").value.trim();
  const detectedTitle = manualTitle || (await getYoutubeTitle(url)) || "YouTube Video";
  session.videoLink = {
    url,
    title: detectedTitle,
    thumbnail: getYoutubeThumbnail(url),
  };
  closeLinkModal();
  rerender();
}

function applyScreenshotToTarget(target, file) {
  if (!target?.id || !file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const src = String(reader.result || "");
    if (target.type === "session") {
      const session = state.sessions.find((sessionItem) => sessionItem.id === target.id);
      if (!session) return;
      session.screenshot = src;
      session.screenshotEdits = { lines: [], texts: [], history: [], future: [] };
    } else if (target.type === "playbook") {
      const setup = state.playbook.find((item) => item.id === target.id);
      if (!setup) return;
      setup.perfectSetup = src;
      setup.perfectSetupEdits = { lines: [], texts: [], history: [], future: [] };
      if (uiState.activePlaybookSetupId === target.id) renderPlaybookModalShot(setup);
    }
    rerender();
    if (uiState.activeImageTarget?.id === target.id && uiState.activeImageTarget?.type === target.type) openImageModal(src, target);
  };
  reader.readAsDataURL(file);
}

function openImageModal(src, target) {
  const modal = document.getElementById("imageModal");
  const img = document.getElementById("imageModalImg");
  const stage = document.getElementById("imageStage");
  if (!modal || !img || !stage) return;
  const targetData = getImageTargetData(target);
  uiState.activeImageTarget = target;
  uiState.imageEditor.blockUntil = Date.now() + 250;

  const base = new Image();
  base.onload = () => {
    uiState.imageEditor.baseImage = base;
    resizeEditCanvas();
    redrawEditCanvas();
  };
  base.src = src;

  img.src = src;
  img.style.display = "none";

  modal.hidden = false;
  document.body.style.overflow = "hidden";
  resetImageEditorState();
  uiState.imageEditor.lines = structuredClone(targetData?.edits?.lines || []);
  uiState.imageEditor.texts = structuredClone(targetData?.edits?.texts || []);
  uiState.imageEditor.history = structuredClone(targetData?.edits?.history || []);
  uiState.imageEditor.future = structuredClone(targetData?.edits?.future || []);
  redrawEditCanvas();
}


function closeImageModal() {
  const modal = document.getElementById("imageModal");
  const img = document.getElementById("imageModalImg");
  if (!modal || !img) return;
  modal.hidden = true;
  uiState.activeImageTarget = null;
  img.removeAttribute("src");
  img.style.display = "none";
  const stage = document.getElementById("imageStage");
  if (stage) stage.style.backgroundImage = "none";
  uiState.imageEditor.blockUntil = 0;
  uiState.imageEditor.baseImage = null;
  resetImageEditorState();
  if (document.getElementById("linkModal").hidden && document.getElementById("playbookDetailModal").hidden && document.getElementById("customSymbolModal").hidden && document.getElementById("ruleDetailModal").hidden) document.body.style.overflow = "";
}

function rerender() {
  saveState();
  renderFilterSelects();
  renderOverview();
  renderJournal();
  renderRules();
  renderPlaybook();
  renderMistakes();
  renderAccounts();
}

function addSession() {
  state.sessions.unshift(
    normalizeSession({
      id: `s${Date.now()}`,
      date: new Date().toISOString().slice(0, 10),
      mistakes: "",
      correctDecisions: "",
      rules: {},
      accountId: state.accounts[0]?.id || "",
      collapsed: true,
      trades: [],
    })
  );
  rerender();
}

function addTradeToSession(sessionId) {
  const session = state.sessions.find((s) => s.id === sessionId);
  if (!session) return;
  session.trades.unshift({ id: `t${Date.now()}`, accountId: session.accountId || "", symbol: "MNQ", entryTime: "", exitTime: "", setup: "", type: "long", size: 0, entry: 0, exit: 0, stop: 1 });
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

function addSetup() {
  const id = `pb${Date.now()}`;
  state.playbook.push({ id, title: "New Setup", confluences: "", perfectSetup: "", perfectSetupEdits: { lines: [], texts: [], history: [], future: [] } });
  uiState.activePlaybookSetupId = id;
  rerender();
  const setup = state.playbook.find((item) => item.id === id);
  document.getElementById("playbookModalTitleInput").value = setup.title;
  document.getElementById("playbookModalConfluencesInput").value = "";
  renderPlaybookModalShot(setup);
  togglePlaybookRemoveButton();
  document.getElementById("playbookDetailModal").hidden = false;
  document.body.style.overflow = "hidden";
}


function buildAccountSelectionOptions(selectedIds = []) {
  return state.accounts
    .map((account) => `<option value="${account.id}" ${selectedIds.includes(account.id) ? "selected" : ""}>${escapeHtml(account.name)}</option>`)
    .join("");
}

function openAccountModal() {
  uiState.pendingAccountGroupId = "";
  uiState.groupPickerSelectedId = "";
  document.getElementById("accountModalNameInput").value = "";
  document.getElementById("accountModalBalanceInput").value = "";
  document.getElementById("accountModalDrawdownInput").value = "";
  document.getElementById("accountModalGroupPreview").textContent = "No group selected";
  document.getElementById("accountDetailModal").hidden = false;
  document.body.style.overflow = "hidden";
}

function closeAccountModal() {
  document.getElementById("accountDetailModal").hidden = true;
  if (document.getElementById("imageModal").hidden && document.getElementById("playbookDetailModal").hidden && document.getElementById("linkModal").hidden && document.getElementById("customSymbolModal").hidden && document.getElementById("accountGroupPickerModal").hidden && document.getElementById("groupBuilderModal").hidden && document.getElementById("ruleDetailModal").hidden) document.body.style.overflow = "";
}

function saveAccountFromModal() {
  const name = document.getElementById("accountModalNameInput").value.trim();
  const startingBalance = Number(document.getElementById("accountModalBalanceInput").value || DEFAULT_STARTING_BALANCE);
  const maxDrawdown = Number(document.getElementById("accountModalDrawdownInput").value || 0);
  if (!name || !Number.isFinite(startingBalance) || startingBalance < 0 || !Number.isFinite(maxDrawdown) || maxDrawdown < 0) return;

  state.accounts.push(normalizeAccount({ id: `acc${Date.now()}`, name, startingBalance, maxDrawdown, groupId: uiState.pendingAccountGroupId || "" }));
  closeAccountModal();
  rerender();
}

function addGroup() {
  openGroupBuilderModal();
}

function renderAccountGroupCards() {
  const container = document.getElementById("accountGroupCards");
  if (!container) return;
  container.innerHTML = state.groups.length
    ? state.groups
        .map((group) => {
          const members = state.accounts.filter((account) => account.groupId === group.id);
          const selected = uiState.groupPickerSelectedId === group.id;
          const expanded = uiState.groupPickerExpandedId === group.id;
          return `<article class="playbook-card ${selected ? "selected-card" : ""}" data-group-card="${group.id}"><div class="playbook-card-head"><h4>${escapeHtml(group.name)}</h4><span class="pill">${selected ? "✓ Selected" : `${members.length} acc`}</span></div><div class="muted small" data-group-members="${group.id}" ${expanded ? "" : "hidden"}>${members.length ? members.map((a) => `${escapeHtml(a.name)} — $${formatWithThousands(a.startingBalance, 0)}`).join("<br/>") : "No accounts yet."}</div></article>`;
        })
        .join("")
    : '<p class="muted">No groups yet.</p>';
}

function openAccountGroupPickerModal() {
  uiState.groupPickerSelectedId = uiState.pendingAccountGroupId || "";
  uiState.groupPickerExpandedId = "";
  renderAccountGroupCards();
  document.getElementById("accountGroupPickerModal").hidden = false;
  document.body.style.overflow = "hidden";
}

function closeAccountGroupPickerModal() {
  document.getElementById("accountGroupPickerModal").hidden = true;
  if (document.getElementById("imageModal").hidden && document.getElementById("playbookDetailModal").hidden && document.getElementById("linkModal").hidden && document.getElementById("customSymbolModal").hidden && document.getElementById("accountDetailModal").hidden && document.getElementById("groupBuilderModal").hidden && document.getElementById("ruleDetailModal").hidden) document.body.style.overflow = "";
}

function refreshGroupBuilderLists() {
  const available = document.getElementById("groupBuilderAvailable");
  const selected = document.getElementById("groupBuilderSelected");
  if (!available || !selected) return;
  const pool = state.accounts.filter((account) => {
    if (!account.groupId) return true;
    if (uiState.groupBuilderSelection.includes(account.id)) return true;
    if (uiState.editingGroupId && account.groupId === uiState.editingGroupId) return true;
    return false;
  });
  const availableIds = pool.map((a) => a.id).filter((id) => !uiState.groupBuilderSelection.includes(id));
  available.innerHTML = availableIds.map((id) => {
    const acc = state.accounts.find((a) => a.id === id);
    return `<option value="${id}">${escapeHtml(acc?.name || id)}</option>`;
  }).join("");
  selected.innerHTML = uiState.groupBuilderSelection.map((id) => {
    const acc = state.accounts.find((a) => a.id === id);
    return `<option value="${id}">${escapeHtml(acc?.name || id)}</option>`;
  }).join("");
  available.querySelectorAll("option").forEach((opt) => { opt.draggable = true; });
  selected.querySelectorAll("option").forEach((opt) => { opt.draggable = true; });
}

function moveGroupBuilderSelection(fromId, toSelected) {
  const select = document.getElementById(fromId);
  if (!select) return;
  const ids = Array.from(select.selectedOptions).map((opt) => opt.value);
  if (!ids.length) return;
  if (toSelected) uiState.groupBuilderSelection = [...new Set([...uiState.groupBuilderSelection, ...ids])];
  else uiState.groupBuilderSelection = uiState.groupBuilderSelection.filter((id) => !ids.includes(id));
  refreshGroupBuilderLists();
}

function wireGroupBuilderDnD(selectEl, toSelected) {
  if (!selectEl) return;
  selectEl.addEventListener("dragstart", (e) => {
    const option = e.target.closest("option");
    if (!option) return;
    e.dataTransfer?.setData("text/plain", option.value);
  });
  selectEl.addEventListener("dragover", (e) => e.preventDefault());
  selectEl.addEventListener("drop", (e) => {
    e.preventDefault();
    const id = e.dataTransfer?.getData("text/plain");
    if (!id) return;
    if (toSelected) uiState.groupBuilderSelection = [...new Set([...uiState.groupBuilderSelection, id])];
    else uiState.groupBuilderSelection = uiState.groupBuilderSelection.filter((item) => item !== id);
    refreshGroupBuilderLists();
  });
}

function openGroupBuilderModal(editGroupId = null) {
  uiState.editingGroupId = editGroupId;
  if (editGroupId) {
    const group = getGroupById(editGroupId);
    uiState.groupBuilderSelection = state.accounts.filter((a) => a.groupId === editGroupId).map((a) => a.id);
    document.getElementById("groupBuilderNameInput").value = group?.name || "";
  } else {
    uiState.groupBuilderSelection = [];
    document.getElementById("groupBuilderNameInput").value = "";
  }
  refreshGroupBuilderLists();
  document.getElementById("groupBuilderModal").hidden = false;
  document.body.style.overflow = "hidden";
}

function closeGroupBuilderModal() {
  document.getElementById("groupBuilderModal").hidden = true;
  if (document.getElementById("imageModal").hidden && document.getElementById("playbookDetailModal").hidden && document.getElementById("linkModal").hidden && document.getElementById("customSymbolModal").hidden && document.getElementById("accountDetailModal").hidden && document.getElementById("accountGroupPickerModal").hidden && document.getElementById("accountEntityModal").hidden && document.getElementById("ruleDetailModal").hidden) document.body.style.overflow = "";
}

function saveGroupFromBuilder() {
  const name = document.getElementById("groupBuilderNameInput").value.trim();
  if (!name) return;
  let group;
  if (uiState.editingGroupId) {
    group = state.groups.find((g) => g.id === uiState.editingGroupId);
    if (!group) return;
    group.name = name;
  } else {
    group = normalizeGroup({ id: `grp${Date.now()}`, name });
    state.groups.push(group);
  }
  state.accounts.forEach((account) => {
    if (account.groupId === group.id && !uiState.groupBuilderSelection.includes(account.id)) account.groupId = "";
  });
  state.accounts.forEach((account) => {
    if (uiState.groupBuilderSelection.includes(account.id)) account.groupId = group.id;
  });
  if (!document.getElementById("accountGroupPickerModal").hidden) {
    uiState.groupPickerSelectedId = group.id;
    renderAccountGroupCards();
  }
  closeGroupBuilderModal();
  rerender();
}

function openAccountEntityModal(type, id) {
  const title = document.getElementById("accountEntityTitle");
  const body = document.getElementById("accountEntityBody");
  const actions = document.getElementById("accountEntityActions");
  if (!title || !body || !actions) return;
  if (type === "account") {
    const account = state.accounts.find((a) => a.id === id);
    if (!account) return;
    title.textContent = account.name;
    body.innerHTML = `<label>Title<input id="entityAccountNameInput" value="${escapeHtml(account.name)}" /></label><label>Starting equity<input id="entityAccountStartInput" type="number" min="0" step="100" value="${account.startingBalance}" /></label><label>Max drawdown<input id="entityAccountMaxDdInput" type="number" min="0" step="100" value="${account.maxDrawdown || 0}" /></label><label>Group<select id="entityAccountGroupSelect"><option value="">No group</option>${state.groups.map((g) => `<option value="${g.id}" ${account.groupId === g.id ? "selected" : ""}>${escapeHtml(g.name)}</option>`).join("")}</select></label><p class="muted small">Current equity: $${formatWithThousands(getAccountCurrentEquity(account.id), 0)}</p>`;
    actions.innerHTML = `<button type="button" id="saveEntityAccountBtn">Save</button><button type="button" class="danger" id="removeEntityAccountBtn">Remove</button>`;
    document.getElementById("saveEntityAccountBtn").onclick = () => {
      account.name = document.getElementById("entityAccountNameInput").value.trim() || account.name;
      account.startingBalance = Math.max(0, Number(document.getElementById("entityAccountStartInput").value || account.startingBalance));
      account.maxDrawdown = Math.max(0, Number(document.getElementById("entityAccountMaxDdInput").value || account.maxDrawdown || 0));
      account.groupId = document.getElementById("entityAccountGroupSelect").value;
      rerender();
      closeAccountEntityModal();
    };
    document.getElementById("removeEntityAccountBtn").onclick = () => {
      const fallback = state.accounts.find((a) => a.id !== account.id)?.id;
      state.accounts = state.accounts.filter((a) => a.id !== account.id);
      state.sessions.forEach((s) => { if (s.accountId === account.id) s.accountId = fallback || ""; });
      rerender();
      closeAccountEntityModal();
    };
  } else {
    closeAccountEntityModal();
    openGroupBuilderModal(id);
    return;
  }
  document.getElementById("accountEntityModal").hidden = false;
  document.body.style.overflow = "hidden";
}

function closeAccountEntityModal() {
  document.getElementById("accountEntityModal").hidden = true;
  if (document.getElementById("imageModal").hidden && document.getElementById("playbookDetailModal").hidden && document.getElementById("linkModal").hidden && document.getElementById("customSymbolModal").hidden && document.getElementById("accountDetailModal").hidden && document.getElementById("accountGroupPickerModal").hidden && document.getElementById("groupBuilderModal").hidden && document.getElementById("ruleDetailModal").hidden && document.getElementById("deleteSessionModal").hidden) document.body.style.overflow = "";
}

function openDeleteSessionModal(sessionId) {
  const session = state.sessions.find((item) => item.id === sessionId);
  if (!session) return;
  uiState.activeDeleteSessionId = sessionId;
  const dateLabel = session.date || "(no date)";
  document.getElementById("deleteSessionPrompt").textContent = "Are you sure you want to delete this session?";
  document.getElementById("deleteSessionDate").textContent = `Session date: ${dateLabel}`;
  document.getElementById("deleteSessionModal").hidden = false;
  document.body.style.overflow = "hidden";
}

function closeDeleteSessionModal() {
  uiState.activeDeleteSessionId = null;
  document.getElementById("deleteSessionModal").hidden = true;
  if (document.getElementById("imageModal").hidden && document.getElementById("playbookDetailModal").hidden && document.getElementById("linkModal").hidden && document.getElementById("customSymbolModal").hidden && document.getElementById("accountDetailModal").hidden && document.getElementById("accountGroupPickerModal").hidden && document.getElementById("groupBuilderModal").hidden && document.getElementById("accountEntityModal").hidden && document.getElementById("ruleDetailModal").hidden) document.body.style.overflow = "";
}

function setCustomSymbolStatus(message) {
  const status = document.getElementById("customSymbolStatus");
  if (status) status.textContent = message;
}

function addCustomSymbol() {
  const tickerInput = document.getElementById("customSymbolTicker");
  const tickSizeInput = document.getElementById("customSymbolTickSize");
  const tickValueInput = document.getElementById("customSymbolTickValue");
  const candidate = normalizeCustomSymbol({
    ticker: tickerInput.value,
    tickSize: tickSizeInput.value,
    tickValue: tickValueInput.value,
  });
  if (!candidate) {
    setCustomSymbolStatus("Enter a valid ticker, tick size, and $/tick.");
    return;
  }
  if (SYMBOL_OPTIONS.includes(candidate.ticker) || state.customSymbols.some((item) => item.ticker === candidate.ticker)) {
    setCustomSymbolStatus("Ticker already exists.");
    return;
  }
  state.customSymbols.push(candidate);
  tickerInput.value = "";
  tickSizeInput.value = "";
  tickValueInput.value = "";
  setCustomSymbolStatus(`Added ${candidate.ticker}.`);
  rerender();
  closeCustomSymbolModal();
}

function exportBackup() {
  const payload = { version: 6, exportedAt: new Date().toISOString(), data: state };
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
      const legacyStart = Number(migrated.accountStart);
      state.accounts = (Array.isArray(migrated.accounts) ? migrated.accounts : [{ id: DEFAULT_ACCOUNT_ID, name: "Main Account", startingBalance: Number.isFinite(legacyStart) && legacyStart >= 0 ? legacyStart : DEFAULT_STARTING_BALANCE }]).map(normalizeAccount);
      state.groups = (Array.isArray(migrated.groups) ? migrated.groups : []).map(normalizeGroup);
      state.playbook = normalizePlaybook(migrated.playbook?.length ? migrated.playbook : []);
      if (!state.playbook.length) state.playbook = structuredClone(seed.playbook);
      state.rules = migrated.rules;
      state.sessions = migrated.sessions.map(normalizeSession);
      state.customSymbols = Array.isArray(migrated.customSymbols) ? migrated.customSymbols.map(normalizeCustomSymbol).filter(Boolean) : [];
      rerender();
    } catch (err) {
      alert(`Import failed: ${err.message}`);
    }
  };
  reader.readAsText(file);
}

function resetToDemo() {
  state.accounts = structuredClone(seed.accounts);
  state.groups = structuredClone(seed.groups);
  state.playbook = structuredClone(seed.playbook);
  state.rules = structuredClone(seed.rules);
  state.sessions = structuredClone(seed.sessions);
  state.customSymbols = [];
  rerender();
}

function updateSessionField(target) {
  const session = state.sessions.find((s) => s.id === target.dataset.sessionId);
  if (!session) return;

  if (target.dataset.sessionK) {
    const key = target.dataset.sessionK;
    session[key] = ["mistakes", "correctDecisions"].includes(key)
      ? String(target.value).slice(0, SESSION_TEXT_MAX)
      : target.value;
  }

  if (target.dataset.sessionRule) {
    const rid = target.dataset.sessionRule;
    if (target.tagName === "TEXTAREA") session.rules[rid] = String(target.value).slice(0, SESSION_TEXT_MAX);
    else session.rules[rid] = target.value;
  }
}

function updateTradeField(target, formatDisplay = false) {
  const session = state.sessions.find((s) => s.id === target.dataset.sessionId);
  if (!session) return null;
  const trade = session.trades.find((t) => t.id === target.dataset.tradeId);
  if (!trade) return null;

  const key = target.dataset.tradeK;
  if (!key) return null;

  if (["size", "stop"].includes(key)) trade[key] = toNum(target.value);
  else if (["entry", "exit"].includes(key)) {
    trade[key] = snapPriceToSymbol(target.value, trade.symbol);
    if (formatDisplay) target.value = formatTradePrice(trade[key], trade.symbol);
  } else if (["entryTime", "exitTime"].includes(key)) trade[key] = normalizeTradeTime(target.value);
  else if (key === "symbol") {
    trade[key] = String(target.value || "").trim().toUpperCase();
    trade.entry = snapPriceToSymbol(trade.entry, trade.symbol);
    trade.exit = snapPriceToSymbol(trade.exit, trade.symbol);
    if (formatDisplay) {
      const entryInput = document.querySelector(`[data-trade-k="entry"][data-trade-id="${trade.id}"]`);
      const exitInput = document.querySelector(`[data-trade-k="exit"][data-trade-id="${trade.id}"]`);
      if (entryInput) entryInput.value = formatTradePrice(trade.entry, trade.symbol);
      if (exitInput) exitInput.value = formatTradePrice(trade.exit, trade.symbol);
    }
  } else trade[key] = target.value;

  return { session, trade };
}

function updateAllCounters() {
  document.querySelectorAll("textarea[maxlength]").forEach((el) => {
    const counter = el.closest("label")?.querySelector(".char-counter");
    if (counter) counter.textContent = `${el.value.length}/${SESSION_TEXT_MAX}`;
  });
}

function updateTradeComputedUI(sessionId, tradeId) {
  const session = state.sessions.find((s) => s.id === sessionId);
  if (!session) return;
  const trade = session.trades.find((t) => t.id === tradeId);
  if (!trade) return;

  const pnl = calcTradePnl(trade);
  const r = calcR(trade);

  const pnlCell = document.querySelector(`[data-trade-pnl="${tradeId}"]`);
  if (pnlCell) {
    const multiplier = getTradeMultiplier(trade, session);
    const totalPnl = pnl * multiplier;
    const tradeTargetId = getTradeAccountTargetId(trade, session);
    pnlCell.innerHTML = `$${pnl.toFixed(2)}${multiplier > 1 ? `<div class="muted small">${escapeHtml(accountTargetLabel(tradeTargetId))}: $${totalPnl.toFixed(2)}</div>` : ""}`;
    pnlCell.classList.toggle("good", totalPnl >= 0);
    pnlCell.classList.toggle("bad", totalPnl < 0);
  }

  const durationCell = document.querySelector(`[data-trade-duration="${tradeId}"]`);
  if (durationCell) durationCell.textContent = calcTradeDuration(trade);

  const rCell = document.querySelector(`[data-trade-r="${tradeId}"]`);
  if (rCell) rCell.textContent = r.toFixed(1);

  const net = getSessionNet(session);
  const netEl = document.querySelector(`[data-session-net="${sessionId}"]`);
  if (netEl) {
    netEl.textContent = `$${net.toFixed(2)}`;
    netEl.classList.toggle("good", net >= 0);
    netEl.classList.toggle("bad", net < 0);
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
document.getElementById("addSetupBtn").addEventListener("click", addSetup);
document.getElementById("openCustomSymbolModalBtn").addEventListener("click", openCustomSymbolModal);
document.getElementById("addCustomSymbolBtn").addEventListener("click", addCustomSymbol);
document.getElementById("accountsList").addEventListener("click", (e) => {
  const removeId = e.target.closest("[data-remove-account]")?.dataset.removeAccount;
  if (removeId) {
    const fallback = state.accounts.find((account) => account.id !== removeId)?.id || "";
    state.accounts = state.accounts.filter((account) => account.id !== removeId);
    state.sessions.forEach((session) => {
      if (session.accountId === removeId) session.accountId = fallback;
    });
    if (uiState.filters.overviewAccountId === removeId) uiState.filters.overviewAccountId = "all";
    if (uiState.filters.journalAccountId === removeId) uiState.filters.journalAccountId = "all";
    rerender();
    return;
  }
  const accountId = e.target.closest("[data-open-account]")?.dataset.openAccount;
  if (!accountId) return;
  openAccountEntityModal("account", accountId);
});
document.getElementById("groupsList").addEventListener("click", (e) => {
  const removeId = e.target.closest("[data-remove-group]")?.dataset.removeGroup;
  if (removeId) {
    state.groups = state.groups.filter((group) => group.id !== removeId);
    state.accounts.forEach((account) => {
      if (account.groupId === removeId) account.groupId = "";
    });
    state.sessions.forEach((session) => {
      if (session.accountId === removeId) session.accountId = state.accounts[0]?.id || "";
    });
    if (uiState.filters.overviewAccountId === removeId) uiState.filters.overviewAccountId = "all";
    if (uiState.filters.journalAccountId === removeId) uiState.filters.journalAccountId = "all";
    rerender();
    return;
  }
  const groupId = e.target.closest("[data-open-group]")?.dataset.openGroup;
  if (!groupId) return;
  openGroupBuilderModal(groupId);
});

document.getElementById("customSymbolList").addEventListener("click", (e) => {
  const delSymbol = e.target.dataset.delSymbol;
  if (!delSymbol) return;
  state.customSymbols = state.customSymbols.filter((item) => item.ticker !== delSymbol);
  rerender();
});
document.getElementById("exportBtn").addEventListener("click", exportBackup);
document.getElementById("importBtn").addEventListener("click", () => document.getElementById("importInput").click());
document.getElementById("importInput").addEventListener("change", (e) => importBackupFile(e.target.files[0]));
document.getElementById("resetBtn").addEventListener("click", resetToDemo);
document.getElementById("addAccountBtn").addEventListener("click", openAccountModal);
document.getElementById("saveAccountBtn").addEventListener("click", saveAccountFromModal);
document.getElementById("accountDetailModal").addEventListener("click", (e) => {
  if (e.target.matches("[data-close-account-modal]")) closeAccountModal();
});
document.getElementById("addGroupBtn").addEventListener("click", addGroup);
document.getElementById("openAccountGroupPickerBtn").addEventListener("click", openAccountGroupPickerModal);
document.getElementById("accountGroupPickerModal").addEventListener("click", (e) => {
  if (e.target.matches("[data-close-account-group-picker-modal]")) {
    closeAccountGroupPickerModal();
    return;
  }
  const cardId = e.target.closest("[data-group-card]")?.dataset.groupCard;
  if (!cardId) return;
  uiState.groupPickerExpandedId = uiState.groupPickerExpandedId === cardId ? "" : cardId;
  if (uiState.groupPickerSelectedId === cardId) uiState.groupPickerSelectedId = "";
  else uiState.groupPickerSelectedId = cardId;
  renderAccountGroupCards();
});
document.getElementById("saveAccountGroupSelectionBtn").addEventListener("click", () => {
  uiState.pendingAccountGroupId = uiState.groupPickerSelectedId || "";
  const group = getGroupById(uiState.pendingAccountGroupId);
  document.getElementById("accountModalGroupPreview").textContent = group ? `Selected: ${group.name}` : "No group selected";
  closeAccountGroupPickerModal();
});
document.getElementById("openGroupBuilderFromPickerBtn").addEventListener("click", () => {
  closeAccountGroupPickerModal();
  openGroupBuilderModal();
});
document.getElementById("groupBuilderModal").addEventListener("click", (e) => {
  if (e.target.matches("[data-close-group-builder-modal]")) closeGroupBuilderModal();
});
document.getElementById("accountEntityModal").addEventListener("click", (e) => {
  if (e.target.matches("[data-close-account-entity-modal]")) closeAccountEntityModal();
});
document.getElementById("groupBuilderAddBtn").addEventListener("click", () => moveGroupBuilderSelection("groupBuilderAvailable", true));
document.getElementById("groupBuilderRemoveBtn").addEventListener("click", () => moveGroupBuilderSelection("groupBuilderSelected", false));
document.getElementById("saveGroupBuilderBtn").addEventListener("click", saveGroupFromBuilder);

wireGroupBuilderDnD(document.getElementById("groupBuilderAvailable"), false);
wireGroupBuilderDnD(document.getElementById("groupBuilderSelected"), true);

[["equityAccountFilter","overviewAccountId"],["equityDateFrom","overviewFrom"],["equityDateTo","overviewTo"],["journalAccountFilter","journalAccountId"],["journalDateFrom","journalFrom"],["journalDateTo","journalTo"]].forEach(([id,key]) => {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener("input", (e) => {
    uiState.filters[key] = e.target.value;
    if (key.startsWith("overview")) renderOverview();
    else renderJournal();
  });
});

document.getElementById("sessionList").addEventListener("input", (e) => {
  const t = e.target;
  if (t.dataset.sessionK || t.dataset.sessionRule) {
    updateSessionField(t);
    if (t.tagName === "TEXTAREA") updateAllCounters();
    refreshAnalyticsOnly();
  }

  if (t.dataset.tradeK) {
    const updated = updateTradeField(t, false);
    if (updated) updateTradeComputedUI(updated.session.id, updated.trade.id);
    refreshAnalyticsOnly();
  }
});


document.getElementById("deleteSessionModal").addEventListener("click", (e) => {
  if (!e.target.matches("[data-close-delete-session-modal]")) return;
  closeDeleteSessionModal();
});

document.getElementById("cancelDeleteSessionBtn").addEventListener("click", closeDeleteSessionModal);

document.getElementById("confirmDeleteSessionBtn").addEventListener("click", () => {
  if (!uiState.activeDeleteSessionId) return;
  state.sessions = state.sessions.filter((session) => session.id !== uiState.activeDeleteSessionId);
  closeDeleteSessionModal();
  rerender();
});


document.getElementById("modalShotInput").addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (!file || !uiState.activeImageTarget?.id) return;
  applyScreenshotToTarget(uiState.activeImageTarget, file);
  e.target.value = "";
});

document.getElementById("sessionList").addEventListener("change", (e) => {
  const t = e.target;
  if (t.dataset.sessionShotInput) {
    const file = t.files?.[0];
    if (!file) return;
    applyScreenshotToTarget({ type: "session", id: t.dataset.sessionShotInput }, file);
    t.value = "";
    return;
  }

  if (t.dataset.sessionK || t.dataset.sessionRule) {
    updateSessionField(t);
    if (t.tagName === "TEXTAREA") updateAllCounters();
    refreshAnalyticsOnly();
  }

  if (t.dataset.tradeK) {
    const updated = updateTradeField(t, true);
    if (updated) updateTradeComputedUI(updated.session.id, updated.trade.id);
    refreshAnalyticsOnly();
  }
});

document.getElementById("sessionList").addEventListener("click", (e) => {
  const playLinkId = e.target.closest("[data-play-link]")?.dataset.playLink;
  if (playLinkId) {
    const session = state.sessions.find((s) => s.id === playLinkId);
    const url = getSafeExternalUrl(session?.videoLink?.url);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
    return;
  }

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

  const ruleToggleId = e.target.dataset.ruleToggle;
  if (ruleToggleId) {
    const session = state.sessions.find((s) => s.id === e.target.dataset.sessionId);
    if (!session) return;
    session.rules[ruleToggleId] = !Boolean(session.rules[ruleToggleId]);
    rerender();
    return;
  }

  const openLinkId = e.target.closest("[data-open-link]")?.dataset.openLink;
  if (openLinkId) {
    openLinkModal(openLinkId);
    return;
  }

  const uploadShotId = e.target.closest("[data-upload-shot]")?.dataset.uploadShot;
  if (uploadShotId) {
    const fileInput = document.querySelector(`[data-session-shot-input="${uploadShotId}"]`);
    if (fileInput) fileInput.click();
    return;
  }

  const shotPreviewId = e.target.closest("[data-shot-preview]")?.dataset.shotPreview;
  if (shotPreviewId) {
    const session = state.sessions.find((s) => s.id === shotPreviewId);
    if (!session?.screenshot) return;
    openImageModal(session.screenshot, { type: "session", id: shotPreviewId });
    return;
  }

  const sessionId = e.target.dataset.delSession;
  if (sessionId) {
    openDeleteSessionModal(sessionId);
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


document.getElementById("saveLinkBtn").addEventListener("click", saveLinkFromModal);
document.getElementById("removeLinkBtn").addEventListener("click", () => {
  if (!uiState.activeLinkSessionId) return;
  const session = state.sessions.find((s) => s.id === uiState.activeLinkSessionId);
  if (!session) return;
  session.videoLink = { url: "", title: "", thumbnail: "" };
  closeLinkModal();
  rerender();
});

document.getElementById("linkModal").addEventListener("click", (e) => {
  if (e.target.matches("[data-close-link-modal]")) closeLinkModal();
});

document.getElementById("customSymbolModal").addEventListener("click", (e) => {
  if (e.target.matches("[data-close-symbol-modal]")) closeCustomSymbolModal();
});


document.getElementById("editModeSelect").addEventListener("change", (e) => {
  uiState.imageEditor.mode = e.target.value;
  syncEditorControls();
});
document.getElementById("lineColorInput").addEventListener("input", (e) => {
  uiState.imageEditor.lineColor = e.target.value;
});
document.getElementById("textColorInput").addEventListener("input", (e) => {
  uiState.imageEditor.textColor = e.target.value;
});

document.getElementById("undoEditBtn").addEventListener("click", undoEditor);
document.getElementById("redoEditBtn").addEventListener("click", redoEditor);
document.getElementById("clearLinesBtn").addEventListener("click", () => {
  pushEditorHistory();
  uiState.imageEditor.lines = [];
  persistActiveScreenshotEdits();
  redrawEditCanvas();
});
document.getElementById("clearTextBtn").addEventListener("click", () => {
  pushEditorHistory();
  uiState.imageEditor.texts = [];
  persistActiveScreenshotEdits();
  redrawEditCanvas();
});
document.getElementById("clearAllEditsBtn").addEventListener("click", () => {
  pushEditorHistory();
  uiState.imageEditor.lines = [];
  uiState.imageEditor.texts = [];
  persistActiveScreenshotEdits();
  redrawEditCanvas();
});

document.getElementById("imageStage").addEventListener("click", (e) => {
  const editor = uiState.imageEditor;
  if (Date.now() < editor.blockUntil) return;
  if (e.target.closest(".text-box")) return;
  if (editor.selectedTextId) {
    editor.selectedTextId = null;
    renderTextOverlay();
  }

  if (!editor.expanded) {
    setEditorExpanded(true);
    return;
  }

  if (editor.mode === "text") {
    const point = editorPointFromEvent(e);
    if (!point) return;
    pushEditorHistory();
    editor.texts.push({
      id: `txt${Date.now()}`,
      x: point.x,
      y: point.y,
      w: 0.22,
      h: 0.14,
      text: "",
      color: editor.textColor,
    });
    editor.selectedTextId = editor.texts[editor.texts.length - 1].id;
    persistActiveScreenshotEdits();
    redrawEditCanvas();
    const last = document.querySelector('.text-box:last-child textarea');
    if (last) last.focus();
    return;
  }

  if (editor.mode === "cursor") {
    setEditorExpanded(false);
  }
});

const editCanvas = document.getElementById("imageEditCanvas");
editCanvas.addEventListener("pointerdown", (e) => {
  const editor = uiState.imageEditor;
  if (!editor.visible || !editor.expanded || editor.mode !== "line") return;
  const point = editorPointFromEvent(e);
  if (!point) return;

  if (editor.mode === "line") {
    e.preventDefault();
    editCanvas.setPointerCapture(e.pointerId);
    pushEditorHistory();
    editor.drawingLine = { color: editor.lineColor, points: [point] };
    redrawEditCanvas();
    return;
  }

});

editCanvas.addEventListener("pointermove", (e) => {
  const editor = uiState.imageEditor;
  if (!editor.drawingLine) return;
  const point = editorPointFromEvent(e);
  if (!point) return;
  editor.drawingLine.points.push(point);
  redrawEditCanvas();
});

editCanvas.addEventListener("pointerup", (e) => {
  const editor = uiState.imageEditor;
  if (!editor.drawingLine) return;
  editCanvas.releasePointerCapture(e.pointerId);
  if (editor.drawingLine.points.length > 1) editor.lines.push(editor.drawingLine);
  editor.drawingLine = null;
  persistActiveScreenshotEdits();
  redrawEditCanvas();
});


const textOverlay = document.getElementById("textOverlay");
let draggingText = null;
textOverlay.addEventListener("pointerdown", (e) => {
  const editor = uiState.imageEditor;
  if (!editor.visible || !editor.expanded || editor.mode !== "cursor") return;
  if (e.target.closest(".text-box-delete")) return;
  const box = e.target.closest(".text-box");
  if (!box) {
    if (editor.selectedTextId) {
      editor.selectedTextId = null;
      renderTextOverlay();
    }
    return;
  }
  if (editor.selectedTextId !== box.dataset.textId) {
    editor.selectedTextId = box.dataset.textId;
    renderTextOverlay();
    return;
  }
  if (!e.target.closest(".text-box-handle") && e.target.tagName === "TEXTAREA") return;
  const rect = box.getBoundingClientRect();
  pushEditorHistory();
  draggingText = {
    id: box.dataset.textId,
    offsetX: e.clientX - rect.left,
    offsetY: e.clientY - rect.top,
  };
  box.classList.add("dragging");
  textOverlay.setPointerCapture(e.pointerId);
});

textOverlay.addEventListener("pointermove", (e) => {
  if (!draggingText) return;
  const { canvas } = getImageEditorElements();
  const imageRect = getBaseImageDrawRect(canvas);
  const txt = uiState.imageEditor.texts.find((item) => item.id === draggingText.id);
  if (!txt || !canvas) return;
  const rect = canvas.getBoundingClientRect();
  const imageLeft = rect.left + (imageRect.x / canvas.width) * rect.width;
  const imageTop = rect.top + (imageRect.y / canvas.height) * rect.height;
  const imageWidthPx = (imageRect.width / canvas.width) * rect.width;
  const imageHeightPx = (imageRect.height / canvas.height) * rect.height;
  const textW = Math.max(80, (txt.w || 0.2) * imageRect.width);
  const textH = Math.max(36, (txt.h || 0.12) * imageRect.height);
  const x = (e.clientX - imageLeft - draggingText.offsetX) / imageWidthPx;
  const y = (e.clientY - imageTop - draggingText.offsetY) / imageHeightPx;
  txt.x = Math.min(1 - textW / imageRect.width, Math.max(0, x));
  txt.y = Math.min(1 - textH / imageRect.height, Math.max(0, y));
  renderTextOverlay();
});

textOverlay.addEventListener("pointerup", (e) => {
  if (!draggingText) return;
  const box = textOverlay.querySelector(`[data-text-id="${draggingText.id}"]`);
  if (box) box.classList.remove("dragging");
  if (textOverlay.hasPointerCapture(e.pointerId)) textOverlay.releasePointerCapture(e.pointerId);
  draggingText = null;
  persistActiveScreenshotEdits();
});

textOverlay.addEventListener("input", (e) => {
  const box = e.target.closest(".text-box");
  if (!box) return;
  updateTextFromNode(box);
});
textOverlay.addEventListener("focusout", (e) => {
  const box = e.target.closest(".text-box");
  if (!box) return;
  updateTextFromNode(box);
});
textOverlay.addEventListener("mouseup", (e) => {
  const box = e.target.closest(".text-box");
  if (!box) return;
  updateTextFromNode(box);
});
textOverlay.addEventListener("click", (e) => {
  const removeButton = e.target.closest(".text-box-delete");
  if (!removeButton) return;
  const box = removeButton.closest(".text-box");
  if (!box) return;
  e.preventDefault();
  e.stopPropagation();
  removeEditorTextById(box.dataset.textId);
});

window.addEventListener("resize", () => {
  if (document.getElementById("imageModal").hidden) return;
  resizeEditCanvas();
  redrawEditCanvas();
});

document.getElementById("imageModal").addEventListener("click", (e) => {
  if (e.target.matches("[data-close-image-modal]")) {
    closeImageModal();
    return;
  }

  if (e.target.closest("[data-modal-change-shot]")) {
    const modalInput = document.getElementById("modalShotInput");
    if (modalInput) modalInput.click();
  }
});

window.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  closeImageModal();
  closeLinkModal();
  closeAccountModal();
  closeAccountGroupPickerModal();
  closeGroupBuilderModal();
  closeAccountEntityModal();
  closeRuleModal();
  closeDeleteSessionModal();
  const playbookModal = document.getElementById("playbookDetailModal");
  if (playbookModal && !playbookModal.hidden) playbookModal.hidden = true;
});

document.getElementById("ruleList").addEventListener("click", (e) => {
  const rid = e.target.dataset.removeRule;
  if (rid) {
    state.rules = state.rules.filter((r) => r.id !== rid);
    state.sessions.forEach((s) => {
      if (s.rules) delete s.rules[rid];
    });
    if (uiState.activeRuleId === rid) closeRuleModal();
    rerender();
    return;
  }

  const ruleId = e.target.closest("[data-open-rule]")?.dataset.openRule;
  if (!ruleId || e.target.closest("button")) return;
  openRuleModal(ruleId);
});

document.getElementById("ruleModalTypeInput").addEventListener("change", (e) => {
  document.getElementById("ruleModalOptionsWrap").hidden = e.target.value !== "select";
});

document.getElementById("saveRuleBtn").addEventListener("click", () => {
  if (!uiState.activeRuleId) return;
  const rule = state.rules.find((item) => item.id === uiState.activeRuleId);
  if (!rule) return;
  const name = document.getElementById("ruleModalNameInput").value.trim();
  const type = document.getElementById("ruleModalTypeInput").value;
  const optionsRaw = document.getElementById("ruleModalOptionsInput").value.trim();
  if (!name) return;
  rule.name = name;
  rule.type = type;
  rule.options = type === "select" ? optionsRaw.split(",").map((item) => item.trim()).filter(Boolean) : [];
  state.sessions.forEach((session) => {
    if (!session.rules || !(rule.id in session.rules)) return;
    if (type === "checkbox") session.rules[rule.id] = Boolean(session.rules[rule.id]);
    else session.rules[rule.id] = String(session.rules[rule.id] || "");
  });
  rerender();
  closeRuleModal();
});

document.getElementById("ruleDetailModal").addEventListener("click", (e) => {
  if (!e.target.matches("[data-close-rule-modal]")) return;
  closeRuleModal();
});

function removePlaybookSetup(setupId) {
  const setup = state.playbook.find((item) => item.id === setupId);
  if (!setup) return;
  const removedTitle = setup.title || "";
  state.playbook = state.playbook.filter((item) => item.id !== setupId);
  state.sessions.forEach((session) => {
    session.trades.forEach((trade) => {
      if (trade.setup === removedTitle) trade.setup = "";
    });
  });
  if (uiState.activePlaybookSetupId === setupId) {
    uiState.activePlaybookSetupId = null;
    togglePlaybookRemoveButton();
    const modal = document.getElementById("playbookDetailModal");
    if (modal) modal.hidden = true;
    if (document.getElementById("imageModal").hidden && document.getElementById("linkModal").hidden && document.getElementById("ruleDetailModal").hidden) document.body.style.overflow = "";
  }
  rerender();
}

document.getElementById("playbookList").addEventListener("click", (e) => {
  const removeId = e.target.dataset.removeSetup;
  if (removeId) {
    removePlaybookSetup(removeId);
    return;
  }

  const previewId = e.target.closest("[data-shot-preview-playbook]")?.dataset.shotPreviewPlaybook;
  if (previewId) {
    const setup = state.playbook.find((item) => item.id === previewId);
    if (setup?.perfectSetup) openImageModal(setup.perfectSetup, { type: "playbook", id: previewId });
    return;
  }

  const cardId = e.target.closest("[data-open-playbook]")?.dataset.openPlaybook;
  if (!cardId || e.target.closest("button")) return;
  const setup = state.playbook.find((item) => item.id === cardId);
  if (!setup) return;
  uiState.activePlaybookSetupId = cardId;
  document.getElementById("playbookModalTitleInput").value = setup.title;
  document.getElementById("playbookModalConfluencesInput").value = setup.confluences || "";
  renderPlaybookModalShot(setup);
  togglePlaybookRemoveButton();
  document.getElementById("playbookDetailModal").hidden = false;
  document.body.style.overflow = "hidden";
});

document.getElementById("playbookModalShotBtn").addEventListener("click", (e) => {
  if (!uiState.activePlaybookSetupId) return;
  const setup = state.playbook.find((item) => item.id === uiState.activePlaybookSetupId);
  if (e.target.closest("[data-upload-playbook-shot]") || !setup?.perfectSetup) {
    document.getElementById("playbookModalShotInput").click();
    return;
  }
  openImageModal(setup.perfectSetup, { type: "playbook", id: setup.id });
});

document.getElementById("playbookModalShotInput").addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (!file || !uiState.activePlaybookSetupId) return;
  applyScreenshotToTarget({ type: "playbook", id: uiState.activePlaybookSetupId }, file);
  e.target.value = "";
});

document.getElementById("savePlaybookSetupBtn").addEventListener("click", () => {
  if (!uiState.activePlaybookSetupId) return;
  const setup = state.playbook.find((item) => item.id === uiState.activePlaybookSetupId);
  if (!setup) return;
  setup.title = document.getElementById("playbookModalTitleInput").value.trim() || setup.title;
  setup.confluences = document.getElementById("playbookModalConfluencesInput").value;
  rerender();
});

document.getElementById("removePlaybookSetupBtn").addEventListener("click", () => {
  if (!uiState.activePlaybookSetupId) return;
  removePlaybookSetup(uiState.activePlaybookSetupId);
});

document.getElementById("playbookDetailModal").addEventListener("click", (e) => {
  if (e.target.matches("[data-close-playbook-modal]")) {
    document.getElementById("playbookDetailModal").hidden = true;
    uiState.activePlaybookSetupId = null;
    togglePlaybookRemoveButton();
    if (document.getElementById("imageModal").hidden && document.getElementById("linkModal").hidden && document.getElementById("ruleDetailModal").hidden) document.body.style.overflow = "";
  }
});

togglePlaybookRemoveButton();

rerender();
