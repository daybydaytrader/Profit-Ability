const STORAGE_KEY = "trading_dashboard_state_v2";
const SESSION_TEXT_MAX = 300;
const DEFAULT_STARTING_BALANCE = 50000;

const seed = {
  accountStart: DEFAULT_STARTING_BALANCE,
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
        { id: "t1", symbol: "TSLA", setup: "ORB", type: "long", size: 10, entry: 240.1, exit: 245.6, stop: 2.5 },
        { id: "t2", symbol: "NVDA", setup: "Pullback", type: "short", size: 4, entry: 801.2, exit: 799.0, stop: 1.2 },
      ],
    },
  ],
};

const state = loadState();
const uiState = {
  activeImageSessionId: null,
  activeLinkSessionId: null,
  imageEditor: {
    visible: false,
    expanded: false,
    mode: "line",
    lineColor: "#ff5f7a",
    textColor: "#67d98d",
    lines: [],
    texts: [],
    drawingLine: null,
    history: [],
    future: [],
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

function normalizeTrade(t) {
  return {
    id: t.id || `t${Date.now()}`,
    symbol: t.symbol || "",
    setup: t.setup || "",
    type: t.type === "short" ? "short" : "long",
    size: Number(t.size || 0),
    entry: toNum(t.entry),
    exit: toNum(t.exit),
    stop: toNum(t.stop),
  };
}

function normalizeSession(session) {
  return {
    id: session.id || `s${Date.now()}`,
    date: session.date || new Date().toISOString().slice(0, 10),
    mistakes: String(session.mistakes || "").slice(0, SESSION_TEXT_MAX),
    correctDecisions: String(session.correctDecisions || "").slice(0, SESSION_TEXT_MAX),
    rules: session.rules || {},
    screenshot: typeof session.screenshot === "string" ? session.screenshot : "",
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
  const accountStart = Number(parsed.accountStart);
  return {
    accountStart: Number.isFinite(accountStart) && accountStart >= 0 ? accountStart : DEFAULT_STARTING_BALANCE,
    rules,
    sessions: sessions.length ? sessions : structuredClone(seed.sessions),
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  document.getElementById("saveStatus").textContent = `Saved locally • ${new Date().toLocaleString()}`;
}

function switchTab(name) {
  document.querySelectorAll(".nav-tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.id === `tab-${name}`));
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
  const multiplier = Number(trade.size || 0) * 2;
  return multiplier * (exit - entry);
}

function getAllTrades() {
  return state.sessions.flatMap((s) => s.trades || []);
}

function getSessionNet(session) {
  return session.trades.reduce((acc, t) => acc + calcTradePnl(t), 0);
}

function getSessionRuleAdherence(session) {
  const checks = state.rules.filter((r) => r.type === "checkbox");
  if (!checks.length) return null;
  const passed = checks.filter((r) => Boolean(session.rules?.[r.id])).length;
  return (passed / checks.length) * 100;
}

function metrics() {
  const allTrades = getAllTrades();
  const net = allTrades.reduce((a, t) => a + calcTradePnl(t), 0);
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
  const canvas = document.getElementById("equityChart");
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const sortedSessions = [...state.sessions].sort((a, b) => {
    const da = new Date(a.date || 0).getTime();
    const db = new Date(b.date || 0).getTime();
    return da - db;
  });

  const labels = ["Start", ...sortedSessions.map((s) => s.date || "-")];
  const points = [toNum(state.accountStart) || DEFAULT_STARTING_BALANCE];
  sortedSessions.forEach((session) => points.push(points.at(-1) + getSessionNet(session)));

  const left = 58;
  const right = 16;
  const top = 16;
  const bottom = 38;
  const chartW = w - left - right;
  const chartH = h - top - bottom;

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;

  ctx.strokeStyle = "rgba(217, 221, 228, 0.24)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i += 1) {
    const y = top + i * (chartH / 3);
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(w - right, y);
    ctx.stroke();

    const val = max - (i * range) / 3;
    ctx.fillStyle = "#b6bbc6";
    ctx.font = "12px Inter, system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(`$${Math.round(val).toLocaleString()}`, left - 6, y + 4);
  }

  ctx.strokeStyle = "#d9dde4";
  ctx.lineWidth = 2;
  ctx.beginPath();
  points.forEach((v, i) => {
    const x = left + (i * chartW) / Math.max(points.length - 1, 1);
    const y = top + ((max - v) / range) * chartH;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  const xTickIndexes = points.length <= 6 ? [...points.keys()] : [0, ...Array.from({ length: 4 }, (_, idx) => Math.round(((idx + 1) * (points.length - 1)) / 5)), points.length - 1];
  const uniqueIndexes = [...new Set(xTickIndexes)];

  ctx.fillStyle = "#b6bbc6";
  ctx.textAlign = "center";
  uniqueIndexes.forEach((idx) => {
    const x = left + (idx * chartW) / Math.max(points.length - 1, 1);
    const label = labels[idx] === "Start" ? "Start" : labels[idx].slice(5);
    ctx.beginPath();
    ctx.moveTo(x, h - bottom + 2);
    ctx.lineTo(x, h - bottom - 6);
    ctx.strokeStyle = "rgba(217, 221, 228, 0.35)";
    ctx.stroke();
    ctx.fillText(label, x, h - 10);
  });
}

function renderOverview() {
  const m = metrics();
  const startInput = document.getElementById("startingBalanceInput");
  if (startInput && document.activeElement !== startInput) startInput.value = String(Math.round(state.accountStart));
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

  drawEquity();
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
  const rows = session.trades
    .map((t) => {
      const pnl = calcTradePnl(t);
      const r = calcR(t);
      return `
      <tr>
        <td><input data-trade-k="symbol" data-session-id="${session.id}" data-trade-id="${t.id}" value="${escapeHtml(t.symbol || "")}"/></td>
        <td><input data-trade-k="setup" data-session-id="${session.id}" data-trade-id="${t.id}" value="${escapeHtml(t.setup || "")}"/></td>
        <td><select data-trade-k="type" data-session-id="${session.id}" data-trade-id="${t.id}"><option value="long" ${t.type === "long" ? "selected" : ""}>long</option><option value="short" ${t.type === "short" ? "selected" : ""}>short</option></select></td>
        <td><input data-trade-k="size" data-session-id="${session.id}" data-trade-id="${t.id}" type="number" step="1" value="${t.size ?? 0}"/></td>
        <td><input data-trade-k="entry" data-session-id="${session.id}" data-trade-id="${t.id}" value="${toNum(t.entry)}"/></td>
        <td><input data-trade-k="exit" data-session-id="${session.id}" data-trade-id="${t.id}" value="${toNum(t.exit)}"/></td>
        <td><input data-trade-k="stop" data-session-id="${session.id}" data-trade-id="${t.id}" type="number" step="0.01" value="${toNum(t.stop)}"/></td>
        <td data-trade-r="${t.id}">${r.toFixed(1)}</td>
        <td data-trade-pnl="${t.id}" class="${pnl >= 0 ? "good" : "bad"}">$${pnl.toFixed(2)}</td>
        <td><button data-del-trade="${t.id}" data-session-id="${session.id}">Delete</button></td>
      </tr>`;
    })
    .join("");

  return rows || `<tr><td colspan="10" class="muted">No trades yet.</td></tr>`;
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
  const html = state.sessions
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
          <div class="session-link-wrap">
            ${s.videoLink?.url ? `<button type="button" class="session-shot session-link-card" data-open-link="${s.id}" title="Edit video link"><span class="link-title">${escapeHtml(s.videoLink.title || "YouTube Video")}</span>${s.videoLink.thumbnail ? `<img src="${escapeHtml(s.videoLink.thumbnail)}" alt="Linked video thumbnail"/>` : `<span class="link-thumb-fallback">No thumbnail</span>`}</button>` : `<button type="button" class="session-shot session-shot-empty" data-open-link="${s.id}">Add Link</button>`}
          </div>
          <label class="field-with-counter">Mistakes
            <textarea class="session-input session-expandable" data-expandable data-session-k="mistakes" data-session-id="${s.id}" maxlength="${SESSION_TEXT_MAX}" rows="1">${escapeHtml(s.mistakes || "")}</textarea>
            <span class="char-counter">0/${SESSION_TEXT_MAX}</span>
          </label>
          <div class="session-shot-wrap">
            ${s.screenshot ? `<button type="button" class="session-shot" data-shot-preview="${s.id}" title="Open screenshot"><img src="${escapeHtml(s.screenshot)}" alt="Session screenshot"/><span class="shot-corner-arrow" data-upload-shot="${s.id}" title="Change screenshot">↗</span></button>` : `<button type="button" class="session-shot session-shot-empty" data-upload-shot="${s.id}">Add screenshot</button>`}
          </div>
          <div class="net-result-wrap">
            <div class="muted">Net</div>
            <div data-session-net="${s.id}" class="net-result ${net >= 0 ? "good" : "bad"}">$${net.toFixed(2)}</div>
            <div class="adherence-badge ${adherence !== null && adherence >= 75 ? "good" : "bad"}">Rule Adherence: ${adherence === null ? "N/A" : `${adherence.toFixed(0)}%`}</div>
          </div>
          <label class="field-with-counter">Good Decisions
            <textarea class="session-input session-expandable" data-expandable data-session-k="correctDecisions" data-session-id="${s.id}" maxlength="${SESSION_TEXT_MAX}" rows="1">${escapeHtml(s.correctDecisions || "")}</textarea>
            <span class="char-counter">0/${SESSION_TEXT_MAX}</span>
          </label>
          <div class="session-top-actions">
            <button data-del-session="${s.id}">Delete Session</button>
            <input type="file" accept="image/*" hidden data-session-shot-input="${s.id}" />
          </div>
        </div>

        <div class="session-rules">${renderSessionRules(s) || '<span class="muted">No rules yet.</span>'}</div>

        ${
          s.collapsed
            ? ""
            : `<div class="session-actions"><span class="pill">${s.trades.length} trades</span><button data-add-trade="${s.id}">+ Add Trade</button></div>
               <div class="table-wrap"><table><thead><tr><th>Symbol</th><th>Setup</th><th>Type</th><th>Size</th><th>Entry</th><th>Exit</th><th>Stop</th><th>R</th><th>PnL</th><th>Actions</th></tr></thead><tbody>${renderSessionTrades(s)}</tbody></table></div>`
        }
      </article>`;
    })
    .join("");

  document.getElementById("sessionList").innerHTML = html;
  updateAllCounters();
}

function renderRules() {
  document.getElementById("ruleList").innerHTML =
    state.rules
      .map((r) => `<li><strong>${escapeHtml(r.name)}</strong> <span class="pill">${r.type}</span> ${r.options?.length ? `• ${r.options.map(escapeHtml).join(", ")}` : ""} <button data-remove-rule="${r.id}">Remove</button></li>`)
      .join("") || "<li>No rules yet.</li>";
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
}

function syncEditorControls() {
  const editor = uiState.imageEditor;
  const menu = document.getElementById("imageEditMenu");
  const stage = document.getElementById("imageStage");
  const canvas = document.getElementById("imageEditCanvas");
  const modeSelect = document.getElementById("editModeSelect");
  const lineColor = document.getElementById("lineColorInput");
  const textColor = document.getElementById("textColorInput");
  if (!menu || !stage || !canvas || !modeSelect || !lineColor || !textColor) return;
  menu.hidden = !editor.visible;
  stage.classList.toggle("expanded", editor.expanded);
  canvas.classList.toggle("editable", editor.visible && editor.expanded);
  modeSelect.value = editor.mode;
  lineColor.value = editor.lineColor;
  textColor.value = editor.textColor;
}

function resizeEditCanvas() {
  const { canvas, img } = getImageEditorElements();
  if (!canvas || !img) return;
  const w = Math.max(1, Math.round(img.clientWidth));
  const h = Math.max(1, Math.round(img.clientHeight));
  canvas.width = w;
  canvas.height = h;
}

function redrawEditCanvas() {
  const { canvas } = getImageEditorElements();
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  uiState.imageEditor.lines.forEach((line) => {
    if (!line.points?.length) return;
    ctx.strokeStyle = line.color || "#ff5f7a";
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    line.points.forEach((pt, index) => {
      const x = pt.x * canvas.width;
      const y = pt.y * canvas.height;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  });

  uiState.imageEditor.texts.forEach((txt) => {
    ctx.fillStyle = txt.color || "#67d98d";
    ctx.font = "16px Inter, system-ui, sans-serif";
    ctx.fillText(txt.text || "", txt.x * canvas.width, txt.y * canvas.height);
  });

  const current = uiState.imageEditor.drawingLine;
  if (current?.points?.length) {
    ctx.strokeStyle = current.color || "#ff5f7a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    current.points.forEach((pt, index) => {
      const x = pt.x * canvas.width;
      const y = pt.y * canvas.height;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }
}

function resetImageEditorState() {
  uiState.imageEditor.visible = false;
  uiState.imageEditor.expanded = false;
  uiState.imageEditor.lines = [];
  uiState.imageEditor.texts = [];
  uiState.imageEditor.drawingLine = null;
  uiState.imageEditor.history = [];
  uiState.imageEditor.future = [];
  syncEditorControls();
  redrawEditCanvas();
}

function editorPointFromEvent(e) {
  const { canvas } = getImageEditorElements();
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  return {
    x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
    y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
  };
}

function undoEditor() {
  const editor = uiState.imageEditor;
  const prev = editor.history.pop();
  if (!prev) return;
  editor.future.push({ lines: structuredClone(editor.lines), texts: structuredClone(editor.texts) });
  editor.lines = prev.lines;
  editor.texts = prev.texts;
  redrawEditCanvas();
}

function redoEditor() {
  const editor = uiState.imageEditor;
  const next = editor.future.pop();
  if (!next) return;
  editor.history.push({ lines: structuredClone(editor.lines), texts: structuredClone(editor.texts) });
  editor.lines = next.lines;
  editor.texts = next.texts;
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
  if (document.getElementById("imageModal").hidden) document.body.style.overflow = "";
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

function applyScreenshotToSession(sessionId, file) {
  const session = state.sessions.find((sessionItem) => sessionItem.id === sessionId);
  if (!session || !file) return;
  const reader = new FileReader();
  reader.onload = () => {
    session.screenshot = String(reader.result || "");
    rerender();
    if (uiState.activeImageSessionId === sessionId) openImageModal(session.screenshot, sessionId);
  };
  reader.readAsDataURL(file);
}

function openImageModal(src, sessionId) {
  const modal = document.getElementById("imageModal");
  const img = document.getElementById("imageModalImg");
  if (!modal || !img) return;
  uiState.activeImageSessionId = sessionId;
  img.src = src;
  modal.hidden = false;
  document.body.style.overflow = "hidden";
  img.onload = () => {
    resizeEditCanvas();
    redrawEditCanvas();
  };
  resetImageEditorState();
}

function closeImageModal() {
  const modal = document.getElementById("imageModal");
  const img = document.getElementById("imageModalImg");
  if (!modal || !img) return;
  modal.hidden = true;
  uiState.activeImageSessionId = null;
  img.removeAttribute("src");
  resetImageEditorState();
  if (document.getElementById("linkModal").hidden) document.body.style.overflow = "";
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
  session.trades.unshift({ id: `t${Date.now()}`, symbol: "", setup: "", type: "long", size: 0, entry: 0, exit: 0, stop: 1 });
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
      state.accountStart = Number.isFinite(Number(migrated.accountStart)) && Number(migrated.accountStart) >= 0 ? Number(migrated.accountStart) : DEFAULT_STARTING_BALANCE;
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
  state.accountStart = seed.accountStart;
  state.rules = structuredClone(seed.rules);
  state.sessions = structuredClone(seed.sessions);
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

function updateTradeField(target) {
  const session = state.sessions.find((s) => s.id === target.dataset.sessionId);
  if (!session) return null;
  const trade = session.trades.find((t) => t.id === target.dataset.tradeId);
  if (!trade) return null;

  const key = target.dataset.tradeK;
  if (!key) return null;

  if (["size", "entry", "exit", "stop"].includes(key)) trade[key] = toNum(target.value);
  else trade[key] = target.value;

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
    pnlCell.textContent = `$${pnl.toFixed(2)}`;
    pnlCell.classList.toggle("good", pnl >= 0);
    pnlCell.classList.toggle("bad", pnl < 0);
  }

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
document.getElementById("exportBtn").addEventListener("click", exportBackup);
document.getElementById("importBtn").addEventListener("click", () => document.getElementById("importInput").click());
document.getElementById("importInput").addEventListener("change", (e) => importBackupFile(e.target.files[0]));
document.getElementById("resetBtn").addEventListener("click", resetToDemo);

document.getElementById("startingBalanceInput").addEventListener("input", (e) => {
  const next = Number(e.target.value);
  state.accountStart = Number.isFinite(next) && next >= 0 ? next : 0;
  refreshAnalyticsOnly();
});

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


document.getElementById("modalShotInput").addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (!file || !uiState.activeImageSessionId) return;
  applyScreenshotToSession(uiState.activeImageSessionId, file);
  e.target.value = "";
});

document.getElementById("sessionList").addEventListener("change", (e) => {
  const t = e.target;
  if (t.dataset.sessionShotInput) {
    const file = t.files?.[0];
    if (!file) return;
    applyScreenshotToSession(t.dataset.sessionShotInput, file);
    t.value = "";
    return;
  }

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
    openImageModal(session.screenshot, shotPreviewId);
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


document.getElementById("editModeSelect").addEventListener("change", (e) => {
  uiState.imageEditor.mode = e.target.value;
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
  redrawEditCanvas();
});
document.getElementById("clearTextBtn").addEventListener("click", () => {
  pushEditorHistory();
  uiState.imageEditor.texts = [];
  redrawEditCanvas();
});
document.getElementById("clearAllEditsBtn").addEventListener("click", () => {
  pushEditorHistory();
  uiState.imageEditor.lines = [];
  uiState.imageEditor.texts = [];
  redrawEditCanvas();
});

document.getElementById("imageStage").addEventListener("click", (e) => {
  if (e.target.id === "imageEditCanvas") return;
  const editor = uiState.imageEditor;
  editor.expanded = !editor.expanded;
  editor.visible = editor.expanded;
  syncEditorControls();
});

const editCanvas = document.getElementById("imageEditCanvas");
editCanvas.addEventListener("pointerdown", (e) => {
  const editor = uiState.imageEditor;
  if (!editor.visible || !editor.expanded) return;
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

  if (editor.mode === "text") {
    const text = window.prompt("Text label:");
    if (!text) return;
    pushEditorHistory();
    editor.texts.push({ x: point.x, y: point.y, text, color: editor.textColor });
    redrawEditCanvas();
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
  redrawEditCanvas();
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
