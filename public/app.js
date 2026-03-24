const STORAGE_KEY = "trading_dashboard_state";
const LEGACY_STORAGE_KEYS = ["trading_dashboard_state_v3", "trading_dashboard_state_v2", "trading_dashboard_state_v1"];
const SESSION_TEXT_MAX = 300;
const DEFAULT_STARTING_BALANCE = 50000;
const DEFAULT_ACCOUNT_ID = "acc1";
const TPT_ACCOUNT_OPTIONS = [
  { equity: 25000, maxDrawdown: 1500 },
  { equity: 50000, maxDrawdown: 2000 },
  { equity: 75000, maxDrawdown: 2500 },
  { equity: 100000, maxDrawdown: 3000 },
  { equity: 150000, maxDrawdown: 4500 },
];

const SYMBOL_OPTIONS = ["NQ", "MNQ", "ES", "MES", "GC", "MGC"];
const MONTH_LABELS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const POINT_VALUE_BY_SYMBOL = {
  NQ: 20,
  MNQ: 2,
  ES: 50,
  MES: 5,
  GC: 100,
  MGC: 10,
};
const PAYOUT_TYPE_OPTIONS = ["profit withdrawal", "refund", "fee", "tax reserve", "profit split"];
const PAYOUT_STATUS_OPTIONS = ["planned", "pending", "processing", "completed", "canceled"];
const PAYOUT_DESTINATION_OPTIONS = ["Wallet", "Wise"];

function getDefaultPayoutTargetId() {
  return state?.accounts?.[0]?.id || state?.groups?.[0]?.id || state?.archivedAccounts?.[0]?.id || state?.archivedGroups?.[0]?.id || "";
}

function createPayoutDraft() {
  return {
    accountId: getDefaultPayoutTargetId(),
    date: todayIso(),
    amount: "",
    type: PAYOUT_TYPE_OPTIONS[0],
    destination: "",
    note: "",
  };
}

const seed = {
  accounts: [{ id: DEFAULT_ACCOUNT_ID, name: "Main Account", startingBalance: DEFAULT_STARTING_BALANCE, createdAt: new Date().toISOString().slice(0, 10), propFirm: "" }],
  archivedAccounts: [],
  groups: [],
  archivedGroups: [],
  walletBalance: 0,
  payouts: [],
  playbook: [{ id: "pb1", title: "ORB", confluences: "", perfectSetup: "", perfectSetupEdits: { lines: [], texts: [], history: [], future: [] } }, { id: "pb2", title: "Pullback", confluences: "", perfectSetup: "", perfectSetupEdits: { lines: [], texts: [], history: [], future: [] } }],
  rules: [
    { id: "r1", name: "Entry from plan", type: "checkbox", options: [] },
    { id: "r2", name: "Market condition", type: "select", options: ["Trending", "Choppy", "News-driven"] },
  ],
  sessions: [
    {
      id: "s1",
      date: "2026-02-24",
      day: "",
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

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeCustomSymbol(symbol) {
  const ticker = String(symbol?.ticker || "").trim().toUpperCase();
  const tickSize = Number(symbol?.tickSize);
  const tickValue = Number(symbol?.tickValue);
  if (!ticker || !Number.isFinite(tickSize) || tickSize <= 0 || !Number.isFinite(tickValue) || tickValue <= 0) return null;
  return { ticker, tickSize, tickValue };
}

function normalizeIsoDate(value, fallback = "") {
  const raw = String(value || "").trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : fallback;
}

function normalizeGroupMembership(period, fallback = {}) {
  const groupId = String(period?.groupId || fallback.groupId || "").trim();
  if (!groupId) return null;
  const joinedAt = normalizeIsoDate(period?.joinedAt, normalizeIsoDate(fallback.joinedAt, todayIso()));
  const leftAt = normalizeIsoDate(period?.leftAt);
  if (!joinedAt) return null;
  if (leftAt && leftAt < joinedAt) return null;
  return { groupId, joinedAt, leftAt };
}

function normalizeGroupMemberships(periods = [], fallback = {}) {
  return (Array.isArray(periods) ? periods : [])
    .map((period) => normalizeGroupMembership(period, fallback))
    .filter(Boolean)
    .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt) || a.groupId.localeCompare(b.groupId) || a.leftAt.localeCompare(b.leftAt));
}

function normalizePayoutStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return PAYOUT_STATUS_OPTIONS.includes(normalized) ? normalized : "planned";
}

function normalizePayoutType(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return PAYOUT_TYPE_OPTIONS.includes(normalized) ? normalized : PAYOUT_TYPE_OPTIONS[0];
}

function normalizePayoutDestination(value) {
  const normalized = String(value || "").trim();
  return PAYOUT_DESTINATION_OPTIONS.includes(normalized) ? normalized : "";
}

function normalizePayout(payout) {
  return {
    id: payout?.id || `po${Date.now()}${Math.random().toString(16).slice(2, 6)}`,
    accountId: String(payout?.accountId || DEFAULT_ACCOUNT_ID),
    date: normalizeIsoDate(payout?.date, todayIso()),
    amount: toNum(payout?.amount),
    type: normalizePayoutType(payout?.type),
    destination: normalizePayoutDestination(payout?.destination),
    reason: String(payout?.reason || "").trim(),
    profitPeriodStart: normalizeIsoDate(payout?.profitPeriodStart),
    profitPeriodEnd: normalizeIsoDate(payout?.profitPeriodEnd),
    bufferAfterPayout: toNum(payout?.bufferAfterPayout),
    percentageOfProfitWithdrawn: toNum(payout?.percentageOfProfitWithdrawn),
    percentageOfAccountWithdrawn: toNum(payout?.percentageOfAccountWithdrawn),
    isRecurring: Boolean(payout?.isRecurring),
    status: normalizePayoutStatus(payout?.status),
    referenceId: String(payout?.referenceId || "").trim(),
    note: String(payout?.note || "").trim(),
  };
}

function normalizeWalletBalance(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, parsed);
}

function getAllSymbolOptions() {
  const custom = (state?.customSymbols || []).map((item) => item.ticker);
  return [...new Set([...SYMBOL_OPTIONS, ...custom])];
}

function getCustomSymbolUsage(ticker) {
  const normalized = String(ticker || "").trim().toUpperCase();
  if (!normalized) return { sessions: 0, trades: 0 };
  let sessions = 0;
  let trades = 0;
  state.sessions.forEach((session) => {
    const matchingTrades = (session.trades || []).filter((trade) => String(trade.symbol || "").trim().toUpperCase() === normalized);
    if (!matchingTrades.length) return;
    sessions += 1;
    trades += matchingTrades.length;
  });
  return { sessions, trades };
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

function getInitialCalendarState() {
  const latestSessionDate = state.sessions
    .map((session) => String(session.date || ""))
    .filter(Boolean)
    .sort()
    .at(-1);
  const baseDate = latestSessionDate ? new Date(`${latestSessionDate}T00:00:00`) : new Date();
  return {
    year: baseDate.getFullYear(),
    month: baseDate.getMonth(),
    selectedDay: baseDate.getDate(),
  };
}

const uiState = {
  activeImageTarget: null,
  activeLinkSessionId: null,
  activePlaybookSetupId: null,
  activeRuleId: null,
  activeDeleteEntity: null,
  deletionHistory: [],
  pendingAccountGroupId: "",
  accountsView: "active",
  groupPickerSelectedId: "",
  groupBuilderSelection: [],
  editingGroupId: null,
  payoutDraft: createPayoutDraft(),
  filters: {
    overviewAccountId: "all",
    overviewFrom: "",
    overviewTo: "",
    overviewShowBalanceAfterPayouts: true,
    payoutAccountId: "all",
    payoutFrom: "",
    payoutTo: "",
    payoutType: "all",
    payoutStatus: "all",
    journalAccountId: "all",
    journalFrom: "",
    journalTo: "",
    analysisPreset: "all",
    analysisFrom: "",
    analysisTo: "",
    analysisAccountId: "all",
    analysisSetups: [],
    analysisSymbols: [],
    analysisDirection: "all",
    analysisRuleMode: "all",
    analysisMinSampleSize: 3,
    analysisSortKey: "net",
    analysisSortDirection: "desc",
  },
  analysisDrilldownSetup: "",
  groupsView: "active",
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
  calendar: getInitialCalendarState(),
  daySessionsModalDate: "",
  symbolEditor: {
    editingTicker: "",
  },
};

const OVERLAY_MODAL_IDS = [
  "imageModal",
  "linkModal",
  "playbookDetailModal",
  "accountDetailModal",
  "accountGroupPickerModal",
  "accountEntityModal",
  "ruleDetailModal",
  "groupBuilderModal",
  "deleteEntityModal",
  "daySessionsModal",
  "analysisDrilldownModal",
];

function isModalOpen(id) {
  const modal = document.getElementById(id);
  return Boolean(modal && !modal.hidden);
}

function syncBodyScrollLock() {
  document.body.style.overflow = OVERLAY_MODAL_IDS.some(isModalOpen) ? "hidden" : "";
}

function pushDeletionHistory(entry) {
  uiState.deletionHistory.push(entry);
  if (uiState.deletionHistory.length > 50) uiState.deletionHistory.shift();
  renderUndoState();
}

function undoLastDeletion() {
  const entry = uiState.deletionHistory.pop();
  if (!entry) return;
  if (entry.type === "session") {
    state.sessions.splice(entry.index, 0, entry.session);
  } else if (entry.type === "setup") {
    state.playbook.splice(entry.index, 0, entry.setup);
  } else if (entry.type === "account") {
    state.accounts.splice(entry.index, 0, entry.account);
    state.sessions.forEach((session) => {
      if (entry.affectedSessionIds.includes(session.id)) session.accountId = entry.account.id;
    });
    if (entry.affectedPayoutIds?.length) {
      state.payouts.forEach((payout) => {
        if (entry.affectedPayoutIds.includes(payout.id)) payout.accountId = entry.account.id;
      });
    }
  } else if (entry.type === "group") {
    if (entry.archived) {
      state.archivedGroups.splice(entry.index, 0, entry.group);
    } else {
      state.groups.splice(entry.index, 0, entry.group);
      state.accounts.forEach((account) => {
        if (entry.memberAccountIds.includes(account.id)) updateAccountGroup(account, entry.group.id, todayIso());
      });
      state.sessions.forEach((session) => {
        if (entry.affectedSessionIds.includes(session.id)) session.accountId = entry.group.id;
      });
    }
    if (entry.affectedPayoutIds?.length) {
      state.payouts.forEach((payout) => {
        if (entry.affectedPayoutIds.includes(payout.id)) payout.accountId = entry.group.id;
      });
    }
  } else if (entry.type === "archive-account") {
    state.archivedAccounts = state.archivedAccounts.filter((account) => account.id !== entry.account.id);
    state.accounts.splice(entry.index, 0, normalizeAccount({ ...entry.account, archivedAt: "" }));
    if (entry.affectedPayoutIds?.length) {
      state.payouts.forEach((payout) => {
        if (entry.affectedPayoutIds.includes(payout.id)) payout.accountId = entry.account.id;
      });
    }
  } else if (entry.type === "trade") {
    const session = state.sessions.find((item) => item.id === entry.sessionId);
    if (session) session.trades.splice(entry.index, 0, entry.trade);
  } else if (entry.type === "payout") {
    state.payouts.splice(entry.index, 0, entry.payout);
  } else if (entry.type === "rule") {
    state.rules.splice(entry.index, 0, entry.rule);
    state.sessions.forEach((session) => {
      if (!session.rules) session.rules = {};
      if (Object.hasOwn(entry.sessionValues, session.id)) session.rules[entry.rule.id] = entry.sessionValues[session.id];
    });
  }
  rerender();
}

function renderUndoState() {
  const undoBtn = document.getElementById("undoDeleteBtn");
  if (!undoBtn) return;
  undoBtn.hidden = uiState.deletionHistory.length === 0;
}

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

function toInputNumericValue(value) {
  if (value == null) return "";
  if (typeof value === "string" && value.trim() === "") return "";
  return String(toNum(value));
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

function formatCompactCurrency(value) {
  const compact = new Intl.NumberFormat("en-US", {
    notation: "compact",
    compactDisplay: "short",
    minimumFractionDigits: Math.abs(value) >= 1000 ? 1 : 0,
    maximumFractionDigits: Math.abs(value) >= 1000 ? 1 : 0,
  }).format(Math.abs(value));
  return `${value >= 0 ? "+" : "-"}$${compact}`;
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
  const createdAt = String(account?.createdAt || "").slice(0, 10) || new Date().toISOString().slice(0, 10);
  const archivedAtRaw = String(account?.archivedAt || "").slice(0, 10);
  const currentGroupId = String(account?.groupId || "");
  const archivedReason = account?.archivedReason === "passed" ? "passed" : (archivedAtRaw ? "blown" : "");
  const groupMemberships = normalizeGroupMemberships(account?.groupMemberships, { joinedAt: createdAt });
  if (archivedAtRaw) {
    groupMemberships.forEach((period) => {
      if (!period.leftAt) period.leftAt = archivedAtRaw;
    });
  }
  const legacyGroupJoinedAt = normalizeIsoDate(account?.groupJoinedAt, createdAt);
  const hasCurrentMembership = currentGroupId && groupMemberships.some((period) => period.groupId === currentGroupId && !period.leftAt);
  if (currentGroupId && !hasCurrentMembership) {
    groupMemberships.push(normalizeGroupMembership({
      groupId: currentGroupId,
      joinedAt: legacyGroupJoinedAt,
      leftAt: archivedAtRaw || "",
    }, { joinedAt: createdAt }));
  }
  return {
    id: account?.id || `acc${Date.now()}${Math.random().toString(16).slice(2, 6)}`,
    name: name || "Account",
    startingBalance: Number.isFinite(startingBalance) && startingBalance >= 0 ? startingBalance : DEFAULT_STARTING_BALANCE,
    maxDrawdown: Number.isFinite(maxDrawdown) && maxDrawdown >= 0 ? maxDrawdown : 0,
    groupId: currentGroupId,
    propFirm: String(account?.propFirm || ""),
    createdAt,
    archivedAt: archivedAtRaw,
    archivedReason,
    groupAccountsAtArchive: Math.max(0, Math.floor(Number(account?.groupAccountsAtArchive) || 0)),
    groupMemberships: groupMemberships.filter(Boolean),
  };
}

function normalizeGroupMemberSnapshot(member) {
  const id = String(member?.id || "");
  if (!id) return null;
  return {
    id,
    name: String(member?.name || "Account").trim() || "Account",
    startingBalance: Math.max(0, Number(member?.startingBalance) || 0),
    maxDrawdown: Math.max(0, Number(member?.maxDrawdown) || 0),
    propFirm: String(member?.propFirm || ""),
    createdAt: String(member?.createdAt || "").slice(0, 10),
    archivedAt: String(member?.archivedAt || "").slice(0, 10),
  };
}

function snapshotFromAccount(account) {
  return normalizeGroupMemberSnapshot(account);
}

function mergeGroupMemberSnapshots(existing = [], additions = []) {
  const map = new Map();
  [...existing, ...additions].forEach((member) => {
    const normalized = normalizeGroupMemberSnapshot(member);
    if (!normalized) return;
    map.set(normalized.id, normalized);
  });
  return [...map.values()];
}


function getAccountSessionDateRange(accountId) {
  const dates = state.sessions
    .filter((session) => {
      if (session.accountId === accountId) return true;
      return session.trades.some((trade) => getTradeAccountTargetId(trade, session) === accountId);
    })
    .map((session) => String(session.date || ""))
    .filter(Boolean)
    .sort();
  if (!dates.length) return { first: "", last: "" };
  return { first: dates[0], last: dates[dates.length - 1] };
}

function formatAgeRange(account) {
  const { first, last } = getAccountSessionDateRange(account?.id);
  const formatDate = (value) => {
    if (!value) return "";
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
  };
  const firstDisplay = formatDate(first);
  const lastDisplay = formatDate(last);
  if (firstDisplay && lastDisplay) return `${firstDisplay} - ${lastDisplay}`;
  if (firstDisplay) return `${firstDisplay} - active`;
  const created = formatDate(String(account?.createdAt || "").slice(0, 10));
  if (created) return `${created} - active`;
  return "—";
}

function archiveAccount(accountId, reason = "blown") {
  const index = state.accounts.findIndex((account) => account.id === accountId);
  const account = state.accounts[index];
  if (index < 0 || !account) return;
  const archivedAt = todayIso();
  const groupAccountsAtArchive = account.groupId ? getGroupDisplayAccountCount(account.groupId) : 0;
  const archivedAccount = normalizeAccount({ ...account, archivedAt, archivedReason: reason === "passed" ? "passed" : "blown", groupAccountsAtArchive });
  const fallback = state.accounts.find((item) => item.id !== accountId)?.id || "";
  const affectedSessionIds = state.sessions.filter((session) => session.accountId === accountId).map((session) => session.id);
  const affectedPayoutIds = state.payouts.filter((payout) => payout.accountId === accountId).map((payout) => payout.id);
  state.accounts.splice(index, 1);
  state.archivedAccounts.unshift(archivedAccount);
  state.sessions.forEach((session) => {
    if (session.accountId === accountId) session.accountId = fallback;
    session.trades.forEach((trade) => {
      if (getTradeAccountTargetId(trade, session) === accountId) trade.accountId = session.accountId;
    });
  });
  state.payouts.forEach((payout) => {
    if (payout.accountId === accountId) payout.accountId = fallback;
  });
  if (uiState.filters.overviewAccountId === accountId) uiState.filters.overviewAccountId = "all";
  if (uiState.filters.payoutAccountId === accountId) uiState.filters.payoutAccountId = "all";
  if (uiState.filters.journalAccountId === accountId) uiState.filters.journalAccountId = "all";
  pushDeletionHistory({ type: "archive-account", account: structuredClone(archivedAccount), index, affectedSessionIds, affectedPayoutIds });
}

function passAccount(accountId) {
  const account = state.accounts.find((item) => item.id === accountId);
  if (!account) return;
  const accountSnapshot = snapshotFromAccount(account);
  const groupId = account.groupId;
  archiveAccount(accountId, "passed");
  if (!groupId) return;
  const group = getActiveGroupById(groupId);
  if (!group) return;
  const activeMembers = state.accounts.filter((item) => item.groupId === groupId).map(snapshotFromAccount);
  group.memberSnapshots = mergeGroupMemberSnapshots(group.memberSnapshots || [], [...activeMembers, accountSnapshot]);
  state.accounts.forEach((item) => {
    if (item.groupId === groupId) updateAccountGroup(item, "", todayIso());
  });
  archiveGroup(groupId);
}

function restoreArchivedAccount(accountId) {
  const index = state.archivedAccounts.findIndex((account) => account.id === accountId);
  const account = state.archivedAccounts[index];
  if (index < 0 || !account) return;
  state.archivedAccounts.splice(index, 1);
  state.accounts.push(normalizeAccount({ ...account, archivedAt: "", archivedReason: "" }));
}

function archiveGroup(groupId) {
  const index = state.groups.findIndex((group) => group.id === groupId);
  const group = state.groups[index];
  if (index < 0 || !group) return;
  const archivedAt = todayIso();
  const archived = normalizeGroup({ ...group, archivedAt, maxAccounts: Math.max(group.maxAccounts || 0, 1) });
  state.groups.splice(index, 1);
  state.archivedGroups.unshift(archived);
}

function refreshGroupMaxAccounts() {
  state.groups.forEach((group) => {
    const activeCount = state.accounts.filter((account) => account.groupId === group.id).length;
    group.maxAccounts = Math.max(group.maxAccounts || 0, activeCount);
  });
}

function normalizeGroup(group) {
  const name = String(group?.name || "").trim();
  const maxAccountsRaw = Number(group?.maxAccounts);
  return {
    id: group?.id || `grp${Date.now()}${Math.random().toString(16).slice(2, 6)}`,
    name: name || "Group",
    createdAt: String(group?.createdAt || "").slice(0, 10) || todayIso(),
    archivedAt: String(group?.archivedAt || "").slice(0, 10),
    maxAccounts: Number.isFinite(maxAccountsRaw) && maxAccountsRaw > 0 ? Math.floor(maxAccountsRaw) : 0,
    memberSnapshots: mergeGroupMemberSnapshots(group?.memberSnapshots || []),
  };
}

function normalizeSession(session) {
  const normalizedDay = String(session.day ?? "").replace(/\D/g, "").slice(0, 3);
  return {
    id: session.id || `s${Date.now()}`,
    date: session.date || new Date().toISOString().slice(0, 10),
    day: normalizedDay,
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
      day: s.day || "",
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
  const payouts = Array.isArray(parsed.payouts) ? parsed.payouts.map(normalizePayout) : [];
  const inferredSetups = sessions.flatMap((session) => session.trades.map((trade) => String(trade.setup || "").trim())).filter(Boolean);
  const playbook = normalizePlaybook(parsed.playbook?.length ? parsed.playbook : inferredSetups);
  const customSymbols = Array.isArray(parsed.customSymbols) ? parsed.customSymbols.map(normalizeCustomSymbol).filter(Boolean) : [];
  const legacyStart = Number(parsed.accountStart);
  const legacyAccount = { id: DEFAULT_ACCOUNT_ID, name: "Main Account", startingBalance: Number.isFinite(legacyStart) && legacyStart >= 0 ? legacyStart : DEFAULT_STARTING_BALANCE };
  const accounts = (Array.isArray(parsed.accounts) ? parsed.accounts : [legacyAccount]).map(normalizeAccount);
  const archivedAccounts = (Array.isArray(parsed.archivedAccounts) ? parsed.archivedAccounts : []).map(normalizeAccount);
  const groups = (Array.isArray(parsed.groups) ? parsed.groups : []).map(normalizeGroup);
  const archivedGroups = (Array.isArray(parsed.archivedGroups) ? parsed.archivedGroups : []).map(normalizeGroup);
  const accountIds = new Set(accounts.map((a) => a.id));
  const groupIds = new Set([...groups, ...archivedGroups].map((g) => g.id));
  sessions.forEach((session) => {
    if (!accountIds.has(session.accountId) && !groupIds.has(session.accountId)) session.accountId = accounts[0]?.id || "";
    session.trades.forEach((trade) => {
      const targetId = getTradeAccountTargetId(trade, session);
      if (!accountIds.has(targetId) && !groupIds.has(targetId)) trade.accountId = session.accountId;
      else trade.accountId = targetId;
    });
  });
  payouts.forEach((payout) => {
    if (!accountIds.has(payout.accountId) && !groupIds.has(payout.accountId)) payout.accountId = accounts[0]?.id || "";
  });
  return {
    accounts,
    archivedAccounts,
    groups,
    archivedGroups,
    walletBalance: normalizeWalletBalance(parsed.walletBalance),
    payouts,
    playbook: playbook.length ? playbook : structuredClone(seed.playbook),
    rules,
    sessions: (sessions.length ? sessions : structuredClone(seed.sessions)).sort(compareSessionDatesDesc),
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
  if (name === "analysis") renderAnalysis();
  if (name === "payouts") renderPayouts();
}


function getAccountById(accountId) {
  return state.accounts.find((account) => account.id === accountId)
    || state.archivedAccounts.find((account) => account.id === accountId)
    || null;
}

function getGroupById(groupId) {
  return state.groups.find((group) => group.id === groupId)
    || state.archivedGroups.find((group) => group.id === groupId)
    || null;
}

function getAllTrackedAccounts() {
  return [...state.accounts, ...state.archivedAccounts];
}

function isMembershipActiveOnDate(period, isoDate) {
  if (!period?.joinedAt || !isoDate) return false;
  if (period.joinedAt > isoDate) return false;
  return !period.leftAt || period.leftAt >= isoDate;
}

function getGroupMemberCountForDate(groupId, isoDate = todayIso()) {
  if (!groupId) return 1;
  const memberIds = new Set();
  getAllTrackedAccounts().forEach((account) => {
    if ((account.groupMemberships || []).some((period) => period.groupId === groupId && isMembershipActiveOnDate(period, isoDate))) {
      memberIds.add(account.id);
    }
  });
  return Math.max(1, memberIds.size);
}

function updateAccountGroup(account, nextGroupId = "", effectiveDate = todayIso()) {
  if (!account) return;
  const previousGroupId = String(account.groupId || "");
  const normalizedNextGroupId = String(nextGroupId || "");
  const normalizedDate = normalizeIsoDate(effectiveDate, todayIso());
  if (previousGroupId === normalizedNextGroupId) return;
  const memberships = normalizeGroupMemberships(account.groupMemberships, { joinedAt: account.createdAt || normalizedDate });

  if (previousGroupId) {
    const openMembership = memberships.find((period) => period.groupId === previousGroupId && !period.leftAt);
    if (openMembership) openMembership.leftAt = normalizedDate;
  }
  if (normalizedNextGroupId) {
    memberships.push(normalizeGroupMembership({
      groupId: normalizedNextGroupId,
      joinedAt: normalizedDate,
      leftAt: "",
    }, { joinedAt: normalizedDate }));
  }
  account.groupId = normalizedNextGroupId;
  account.groupMemberships = normalizeGroupMemberships(memberships, { joinedAt: normalizedDate });
}

function getActiveGroupById(groupId) {
  return state.groups.find((group) => group.id === groupId) || null;
}

function getGroupAccountCount(groupId) {
  const activeCount = state.accounts.filter((account) => account.groupId === groupId).length;
  const group = getGroupById(groupId);
  return Math.max(activeCount, group?.maxAccounts || 0);
}

function getGroupDisplayAccountCount(groupId) {
  return Math.max(1, getGroupAccountCount(groupId));
}

function getSessionMultiplier(session) {
  const group = getGroupById(session.accountId);
  return group ? getGroupDisplayAccountCount(group.id) : 1;
}

function getTradeAccountTargetId(trade, session) {
  return String(trade?.accountId || session?.accountId || "");
}

function getActiveTargetIds() {
  return new Set([...state.accounts.map((account) => account.id), ...state.groups.map((group) => group.id)]);
}

function isActiveTargetId(targetId) {
  return getActiveTargetIds().has(String(targetId || ""));
}

function sessionMatchesTarget(session, accountId) {
  if (accountId === "all") {
    const activeTargetIds = getActiveTargetIds();
    if (activeTargetIds.has(session.accountId)) return true;
    return session.trades.some((trade) => activeTargetIds.has(getTradeAccountTargetId(trade, session)));
  }
  if (session.accountId === accountId) return true;
  return session.trades.some((trade) => getTradeAccountTargetId(trade, session) === accountId);
}

function getTradeMultiplier(trade, session) {
  const targetId = getTradeAccountTargetId(trade, session);
  const group = getGroupById(targetId);
  if (!group) return 1;
  return getGroupMemberCountForDate(group.id, session?.date);
}

function calcTradeNet(trade, session) {
  return calcTradePnl(trade) * getTradeMultiplier(trade, session);
}

function accountTargetLabel(id) {
  const group = getGroupById(id);
  if (group) return `${group.name} (Group • ${getGroupDisplayAccountCount(group.id)} accounts${group.archivedAt ? " • inactive" : ""})`;
  const account = state.accounts.find((item) => item.id === id) || state.archivedAccounts.find((item) => item.id === id);
  if (account) return account.name;
  return "—";
}

function compareSessionDatesDesc(a, b) {
  return String(b?.date || "").localeCompare(String(a?.date || ""));
}

function getFilteredSessions({ accountId = "all", from = "", to = "" } = {}) {
  return state.sessions
    .filter((session) => {
      if (!sessionMatchesTarget(session, accountId)) return false;
      if (from && session.date < from) return false;
      if (to && session.date > to) return false;
      return true;
    })
    .sort(compareSessionDatesDesc);
}

function getDateRangeForPreset(preset) {
  const now = new Date();
  const end = now.toISOString().slice(0, 10);
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  if (preset === "last7") {
    const start = new Date(now);
    start.setUTCDate(start.getUTCDate() - 6);
    return { from: start.toISOString().slice(0, 10), to: end };
  }
  if (preset === "last30") {
    const start = new Date(now);
    start.setUTCDate(start.getUTCDate() - 29);
    return { from: start.toISOString().slice(0, 10), to: end };
  }
  if (preset === "thisMonth") {
    return { from: startOfMonth.toISOString().slice(0, 10), to: end };
  }
  if (preset === "lastMonth") {
    const lastMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const lastMonthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
    return {
      from: lastMonthStart.toISOString().slice(0, 10),
      to: lastMonthEnd.toISOString().slice(0, 10),
    };
  }
  if (preset === "ytd") {
    return {
      from: `${now.getUTCFullYear()}-01-01`,
      to: end,
    };
  }
  return { from: "", to: "" };
}

function syncAnalysisDateRangeFromPreset() {
  if (uiState.filters.analysisPreset === "custom") return;
  const { from, to } = getDateRangeForPreset(uiState.filters.analysisPreset);
  uiState.filters.analysisFrom = from;
  uiState.filters.analysisTo = to;
}

function getAnalysisRuleMatch(session) {
  const checkboxRules = state.rules.filter((rule) => rule.type === "checkbox");
  if (!checkboxRules.length) return uiState.filters.analysisRuleMode === "all";
  const allPassed = checkboxRules.every((rule) => Boolean(session.rules?.[rule.id]));
  if (uiState.filters.analysisRuleMode === "allPassed") return allPassed;
  if (uiState.filters.analysisRuleMode === "anyFailed") return !allPassed;
  return true;
}

function getAnalysisFilteredTrades({ ignoreRuleMode = false } = {}) {
  syncAnalysisDateRangeFromPreset();
  const sessions = getFilteredSessions({
    accountId: uiState.filters.analysisAccountId,
    from: uiState.filters.analysisFrom,
    to: uiState.filters.analysisTo,
  }).filter((session) => ignoreRuleMode || getAnalysisRuleMatch(session));
  const setupFilter = new Set((uiState.filters.analysisSetups || []).map((item) => String(item || "").trim()).filter(Boolean));
  const symbolFilter = new Set((uiState.filters.analysisSymbols || []).map((item) => String(item || "").trim().toUpperCase()).filter(Boolean));

  const trades = sessions.flatMap((session) => session.trades
    .filter((trade) => {
      const targetId = getTradeAccountTargetId(trade, session);
      if (uiState.filters.analysisAccountId === "all" && !isActiveTargetId(targetId)) return false;
      if (uiState.filters.analysisAccountId !== "all" && targetId !== uiState.filters.analysisAccountId) return false;
      if (uiState.filters.analysisDirection !== "all" && trade.type !== uiState.filters.analysisDirection) return false;
      const setup = String(trade.setup || "").trim();
      const symbol = String(trade.symbol || "").trim().toUpperCase();
      if (setupFilter.size && !setupFilter.has(setup)) return false;
      if (symbolFilter.size && !symbolFilter.has(symbol)) return false;
      return true;
    })
    .map((trade) => ({ session, trade })));

  return { sessions, trades };
}

function calcSignedR(trade) {
  const baseR = calcR(trade);
  if (!baseR) return 0;
  const pnl = calcTradePnl(trade);
  if (!pnl) return 0;
  return pnl > 0 ? baseR : -baseR;
}

function formatCurrency(value) {
  const amount = Number(value || 0);
  return `${amount < 0 ? "-" : ""}$${Math.abs(amount).toFixed(2)}`;
}

function getAnalysisSetupRows(trades) {
  const grouped = new Map();
  trades.forEach(({ session, trade }) => {
    const setup = String(trade.setup || "").trim() || "Unlabeled";
    const current = grouped.get(setup) || {
      setup,
      trades: 0,
      wins: 0,
      signedRTotal: 0,
      net: 0,
      grossProfit: 0,
      grossLoss: 0,
      sessions: new Map(),
      entries: [],
    };
    const tradeNet = calcTradeNet(trade, session);
    current.trades += 1;
    current.wins += tradeNet > 0 ? 1 : 0;
    current.signedRTotal += calcSignedR(trade);
    current.net += tradeNet;
    if (tradeNet > 0) current.grossProfit += tradeNet;
    if (tradeNet < 0) current.grossLoss += Math.abs(tradeNet);
    if (!current.sessions.has(session.id)) current.sessions.set(session.id, session);
    current.entries.push({ session, trade, net: tradeNet, signedR: calcSignedR(trade) });
    grouped.set(setup, current);
  });
  return [...grouped.values()].map((item) => {
    const avgR = item.trades ? item.signedRTotal / item.trades : 0;
    const expectancy = item.trades ? item.net / item.trades : 0;
    const profitFactor = !item.grossLoss ? (item.grossProfit > 0 ? Number.POSITIVE_INFINITY : 0) : item.grossProfit / item.grossLoss;
    return {
      setup: item.setup,
      trades: item.trades,
      sessions: item.sessions.size,
      winRate: item.trades ? (item.wins / item.trades) * 100 : 0,
      avgR,
      net: item.net,
      expectancy,
      profitFactor,
      entries: item.entries,
    };
  });
}

function sortAnalysisSetupRows(rows) {
  const key = uiState.filters.analysisSortKey || "net";
  const direction = uiState.filters.analysisSortDirection === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const aValue = a[key];
    const bValue = b[key];
    let comparison = 0;
    if (key === "setup") comparison = a.setup.localeCompare(b.setup);
    else if (Number.isFinite(aValue) && Number.isFinite(bValue)) comparison = aValue - bValue;
    else if (aValue === bValue) comparison = 0;
    else comparison = Number.isFinite(aValue) ? -1 : 1;
    if (comparison === 0) comparison = b.net - a.net || b.trades - a.trades || a.setup.localeCompare(b.setup);
    return comparison * direction;
  });
}

function getRuleImpactStats() {
  const checkboxRules = state.rules.filter((rule) => rule.type === "checkbox");
  if (!checkboxRules.length) return null;
  const comparison = getAnalysisFilteredTrades({ ignoreRuleMode: true }).trades;
  const buckets = {
    followed: { trades: 0, wins: 0, net: 0 },
    notFollowed: { trades: 0, wins: 0, net: 0 },
  };
  comparison.forEach(({ session, trade }) => {
    const allPassed = checkboxRules.every((rule) => Boolean(session.rules?.[rule.id]));
    const bucket = allPassed ? buckets.followed : buckets.notFollowed;
    const tradeNet = calcTradeNet(trade, session);
    bucket.trades += 1;
    bucket.wins += tradeNet > 0 ? 1 : 0;
    bucket.net += tradeNet;
  });
  return buckets;
}

function calcProfitFactor(trades) {
  const grossProfit = trades.reduce((sum, { trade, session }) => {
    const pnl = calcTradeNet(trade, session);
    return pnl > 0 ? sum + pnl : sum;
  }, 0);
  const grossLoss = Math.abs(trades.reduce((sum, { trade, session }) => {
    const pnl = calcTradeNet(trade, session);
    return pnl < 0 ? sum + pnl : sum;
  }, 0));
  if (!grossLoss) return grossProfit > 0 ? Number.POSITIVE_INFINITY : 0;
  return grossProfit / grossLoss;
}

function formatRatio(value, digits = 2) {
  if (!Number.isFinite(value)) return "∞";
  return value.toFixed(digits);
}

function getSessionNetForFilter(session, accountId = "all") {
  return session.trades.reduce((acc, trade) => {
    const targetId = getTradeAccountTargetId(trade, session);
    if (accountId === "all" && !isActiveTargetId(targetId)) return acc;
    if (accountId !== "all" && targetId !== accountId) return acc;
    return acc + calcTradeNet(trade, session);
  }, 0);
}

function isPayoutRefundLike(payout) {
  return payout?.type === "refund";
}

function isCompletedPayout(payout) {
  return payout?.status === "completed";
}

function getStartingBalanceForTarget(targetId = "all") {
  if (targetId === "all") return state.accounts.reduce((sum, account) => sum + account.startingBalance, 0);
  const group = getGroupById(targetId);
  if (group) {
    const activeMembers = state.accounts.filter((account) => account.groupId === group.id);
    if (activeMembers.length) return activeMembers.reduce((sum, account) => sum + account.startingBalance, 0);
    return getGroupMemberCards(group).reduce((sum, member) => sum + toNum(member.startingBalance), 0);
  }
  const account = getAccountById(targetId);
  return account ? account.startingBalance : 0;
}

function getPayoutSummaryForTarget(targetId = "all", { from = "", to = "", completedOnly = true } = {}) {
  return state.payouts.reduce((summary, payout) => {
    const payoutTargetId = String(payout.accountId || "");
    if (targetId === "all") {
      if (!isActiveTargetId(payoutTargetId)) return summary;
    } else if (payoutTargetId !== targetId) return summary;
    if (from && payout.date < from) return summary;
    if (to && payout.date > to) return summary;
    if (completedOnly && !isCompletedPayout(payout)) return summary;

    const amount = Math.abs(toNum(payout.amount));
    summary.records += 1;
    if (isPayoutRefundLike(payout)) {
      summary.totalRefunds += amount;
      summary.balanceAdjustment += amount;
    } else {
      summary.totalPayouts += amount;
      summary.balanceAdjustment -= amount;
    }
    return summary;
  }, {
    records: 0,
    totalPayouts: 0,
    totalRefunds: 0,
    balanceAdjustment: 0,
  });
}

function getCompletedPayoutOutflowsForTarget(targetId = "all", { from = "", to = "" } = {}) {
  return state.payouts
    .filter((payout) => {
      const payoutTargetId = String(payout.accountId || "");
      if (targetId === "all") {
        if (!isActiveTargetId(payoutTargetId)) return false;
      } else if (payoutTargetId !== targetId) return false;
      if (from && payout.date < from) return false;
      if (to && payout.date > to) return false;
      return isCompletedPayout(payout) && !isPayoutRefundLike(payout);
    })
    .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")) || String(a.id || "").localeCompare(String(b.id || "")));
}

function getTradingPerformanceSummary(targetId = "all", { from = "", to = "" } = {}) {
  const filteredSessions = getFilteredSessions({ accountId: targetId, from, to });
  const startingBalance = getStartingBalanceForTarget(targetId);
  const grossProfitBeforePayouts = filteredSessions.reduce((sum, session) => sum + getSessionNetForFilter(session, targetId), 0);
  const grossTradingEquity = startingBalance + grossProfitBeforePayouts;
  const payoutSummary = getPayoutSummaryForTarget(targetId, { from, to, completedOnly: true });
  const completedPayoutOutflows = getCompletedPayoutOutflowsForTarget(targetId, { from, to });
  const payoutDates = completedPayoutOutflows.map((payout) => payout.date).filter(Boolean);
  const effectiveFrom = from || payoutDates[0] || "";
  const effectiveTo = to || payoutDates.at(-1) || effectiveFrom;
  const spanDaysRaw = daysBetweenIso(effectiveFrom, effectiveTo);
  const spanDays = completedPayoutOutflows.length ? (spanDaysRaw === null ? 1 : Math.max(spanDaysRaw + 1, 1)) : 0;
  const netAccountBalance = grossTradingEquity + payoutSummary.balanceAdjustment;
  const payoutsAsPctOfProfits = grossProfitBeforePayouts > 0 ? (payoutSummary.totalPayouts / grossProfitBeforePayouts) * 100 : null;
  const payoutsAsPctOfBalance = netAccountBalance > 0 ? (payoutSummary.totalPayouts / netAccountBalance) * 100 : null;
  const largestPayout = completedPayoutOutflows.reduce((largest, payout) => {
    if (!largest) return payout;
    const amount = getPayoutAbsoluteAmount(payout);
    const largestAmount = getPayoutAbsoluteAmount(largest);
    if (amount !== largestAmount) return amount > largestAmount ? payout : largest;
    return String(payout.date || "") > String(largest.date || "") ? payout : largest;
  }, null);
  const averageMonthlyPayout = spanDays ? payoutSummary.totalPayouts / Math.max(spanDays / 30.4375, 1 / 30.4375) : null;
  return {
    filteredSessions,
    startingBalance,
    grossProfitBeforePayouts,
    grossTradingEquity,
    netAccountBalance,
    totalPayouts: payoutSummary.totalPayouts,
    totalRefunds: payoutSummary.totalRefunds,
    payoutBalanceAdjustment: payoutSummary.balanceAdjustment,
    payoutsAsPctOfProfits,
    payoutsAsPctOfBalance,
    completedPayoutCount: completedPayoutOutflows.length,
    largestPayout,
    averageMonthlyPayout,
  };
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
  return session.trades.reduce((acc, trade) => acc + calcTradeNet(trade, session), 0);
}

function getSessionTotalNet(session) {
  return getSessionNet(session);
}

function getAccountFinancialSummary(accountId) {
  return getTradingPerformanceSummary(accountId);
}

function getAccountCurrentEquity(accountId) {
  return getAccountFinancialSummary(accountId).grossTradingEquity;
}

function getSessionRuleAdherence(session) {
  const checks = state.rules.filter((r) => r.type === "checkbox");
  if (!checks.length) return null;
  const passed = checks.filter((r) => Boolean(session.rules?.[r.id])).length;
  return (passed / checks.length) * 100;
}

function metrics() {
  const summary = getTradingPerformanceSummary(uiState.filters.overviewAccountId, {
    from: uiState.filters.overviewFrom,
    to: uiState.filters.overviewTo,
  });
  const filteredSessions = summary.filteredSessions;
  const selectedTargetId = uiState.filters.overviewAccountId;
  const allTradeEntries = filteredSessions.flatMap((session) => session.trades
    .filter((trade) => {
      const targetId = getTradeAccountTargetId(trade, session);
      if (selectedTargetId === "all") return isActiveTargetId(targetId);
      return targetId === selectedTargetId;
    })
    .map((trade) => ({ session, trade })));
  const wins = allTradeEntries.filter(({ session, trade }) => calcTradeNet(trade, session) > 0).length;
  const winRate = allTradeEntries.length ? (wins / allTradeEntries.length) * 100 : 0;

  const sessionAdherences = filteredSessions
    .map((session) => getSessionRuleAdherence(session))
    .filter((value) => value !== null);
  const ruleScore = sessionAdherences.length
    ? sessionAdherences.reduce((acc, value) => acc + value, 0) / sessionAdherences.length
    : 0;

  return {
    ...summary,
    net: summary.grossProfitBeforePayouts,
    trades: allTradeEntries.length,
    sessions: filteredSessions.length,
    winRate,
    ruleScore,
  };
}

function getCalendarYearOptions() {
  const years = state.sessions
    .map((session) => Number.parseInt(String(session.date || "").slice(0, 4), 10))
    .filter((year) => Number.isFinite(year));
  const currentYear = new Date().getFullYear();
  years.push(currentYear);
  const minYear = Math.min(...years);
  const maxYear = Math.max(...years);
  return Array.from({ length: maxYear - minYear + 1 }, (_, index) => minYear + index);
}

function buildCalendarDaySlots(year, month) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const leadingBlanks = firstDay.getDay();
  const trailingBlanks = (7 - ((leadingBlanks + lastDay.getDate()) % 7 || 7)) % 7;
  const slots = [];

  for (let index = 0; index < leadingBlanks; index += 1) {
    slots.push({ type: "blank", id: `blank-start-${index}` });
  }
  for (let day = 1; day <= lastDay.getDate(); day += 1) {
    slots.push({
      type: "day",
      id: `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      day,
      isoDate: `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    });
  }
  for (let index = 0; index < trailingBlanks; index += 1) {
    slots.push({ type: "blank", id: `blank-end-${index}` });
  }
  return slots;
}

function getCalendarDaySummaries() {
  const selectedTargetId = uiState.filters.overviewAccountId;
  const summaries = new Map();
  getFilteredSessions({ accountId: selectedTargetId }).forEach((session) => {
    if (!session.date) return;
    const net = getSessionNetForFilter(session, selectedTargetId);
    const current = summaries.get(session.date) || { net: 0, sessions: 0 };
    current.net += net;
    current.sessions += 1;
    summaries.set(session.date, current);
  });
  return summaries;
}

function syncCalendarState() {
  const yearOptions = getCalendarYearOptions();
  if (!yearOptions.length) return;
  if (!yearOptions.includes(uiState.calendar.year)) {
    const [fallbackYear] = yearOptions.slice(-1);
    uiState.calendar.year = fallbackYear;
  }
  uiState.calendar.month = Math.min(11, Math.max(0, Number(uiState.calendar.month) || 0));
  const daysInMonth = new Date(uiState.calendar.year, uiState.calendar.month + 1, 0).getDate();
  const selectedDay = Number(uiState.calendar.selectedDay) || 1;
  uiState.calendar.selectedDay = Math.min(daysInMonth, Math.max(1, selectedDay));
}

function shiftCalendarMonth(offset) {
  const nextDate = new Date(uiState.calendar.year, uiState.calendar.month + offset, 1);
  uiState.calendar.year = nextDate.getFullYear();
  uiState.calendar.month = nextDate.getMonth();
  syncCalendarState();
  renderOverviewCalendar();
}

function renderOverviewCalendar() {
  syncCalendarState();
  const monthSelect = document.getElementById("calendarMonthSelect");
  const yearSelect = document.getElementById("calendarYearSelect");
  const grid = document.getElementById("overviewCalendarGrid");
  if (!monthSelect || !yearSelect || !grid) return;

  monthSelect.innerHTML = MONTH_LABELS
    .map((label, index) => `<option value="${index}" ${index === uiState.calendar.month ? "selected" : ""}>${label}</option>`)
    .join("");

  yearSelect.innerHTML = getCalendarYearOptions()
    .map((year) => `<option value="${year}" ${year === uiState.calendar.year ? "selected" : ""}>${year}</option>`)
    .join("");

  const summaries = getCalendarDaySummaries();
  const slots = buildCalendarDaySlots(uiState.calendar.year, uiState.calendar.month);
  grid.innerHTML = slots.map((slot) => {
    if (slot.type === "blank") return '<div class="calendar-day blank" aria-hidden="true"></div>';
    const summary = summaries.get(slot.isoDate);
    const stateClass = !summary ? "empty" : summary.net > 0 ? "win" : summary.net < 0 ? "loss" : "empty";
    const isSelected = uiState.calendar.selectedDay === slot.day;
    return `<button
      type="button"
      class="calendar-day ${stateClass}${isSelected ? " selected" : ""}"
      data-calendar-day="${slot.day}"
      data-calendar-date="${slot.isoDate}"
      role="gridcell"
      aria-selected="${isSelected ? "true" : "false"}"
    >
      <span class="calendar-day-header">
        <span class="calendar-day-number">${slot.day}</span>
      </span>
      ${summary ? `<span class="calendar-day-pnl ${summary.net >= 0 ? "good" : "bad"}">${formatCompactCurrency(summary.net)}</span>` : '<span class="calendar-day-meta">No sessions</span>'}
    </button>`;
  }).join("");
}

function drawEquity() {
  const root = document.getElementById("equityChart");
  const meta = document.getElementById("equityChartMeta");
  const payoutEvents = document.getElementById("equityPayoutEvents");
  if (!root) return;
  const selectedId = uiState.filters.overviewAccountId;
  const from = uiState.filters.overviewFrom;
  const to = uiState.filters.overviewTo;
  const showBalanceAfterPayouts = uiState.filters.overviewShowBalanceAfterPayouts !== false;
  const sessions = getFilteredSessions({
    accountId: selectedId,
    from,
    to,
  }).sort((a, b) => a.date.localeCompare(b.date));
  const payouts = state.payouts
    .filter((payout) => {
      const payoutTargetId = String(payout.accountId || "");
      if (selectedId === "all") {
        if (!isActiveTargetId(payoutTargetId)) return false;
      } else if (payoutTargetId !== selectedId) return false;
      if (from && payout.date < from) return false;
      if (to && payout.date > to) return false;
      return isCompletedPayout(payout);
    })
    .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")) || String(a.id || "").localeCompare(String(b.id || "")));

  const sessionNetByDate = new Map();
  sessions.forEach((session) => {
    if (!session.date) return;
    sessionNetByDate.set(session.date, (sessionNetByDate.get(session.date) || 0) + getSessionNetForFilter(session, selectedId));
  });
  const payoutDeltaByDate = new Map();
  payouts.forEach((payout) => {
    const delta = isPayoutRefundLike(payout) ? Math.abs(toNum(payout.amount)) : -Math.abs(toNum(payout.amount));
    payoutDeltaByDate.set(payout.date, (payoutDeltaByDate.get(payout.date) || 0) + delta);
  });

  const eventDates = [...new Set([...sessionNetByDate.keys(), ...payoutDeltaByDate.keys()])].sort((a, b) => a.localeCompare(b));
  const startingBalance = getStartingBalanceForTarget(selectedId);
  const labels = ["Start", ...eventDates];
  const grossPoints = [startingBalance];
  const balancePoints = [startingBalance];
  const balanceAfterDate = new Map();
  let runningGross = startingBalance;
  let runningBalance = startingBalance;
  eventDates.forEach((date) => {
    runningGross += sessionNetByDate.get(date) || 0;
    runningBalance += (sessionNetByDate.get(date) || 0) + (payoutDeltaByDate.get(date) || 0);
    grossPoints.push(runningGross);
    balancePoints.push(runningBalance);
    balanceAfterDate.set(date, runningBalance);
  });

  if (!eventDates.length) {
    root.innerHTML = '<div class="payout-chart-empty">Add trades or completed payouts in the selected range to draw the equity curve.</div>';
    if (meta) meta.innerHTML = '<p class="muted small">Trading Equity reflects session performance before withdrawals, while Balance After Payouts applies completed payout activity on top.</p>';
    if (payoutEvents) payoutEvents.innerHTML = '<p class="muted small">No completed payout events match the current Overview filters.</p>';
    return;
  }

  const values = showBalanceAfterPayouts ? [...grossPoints, ...balancePoints] : [...grossPoints];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);

  const left = 64;
  const right = 18;
  const top = 16;
  const bottom = 42;
  const w = 1000;
  const h = 260;
  const chartW = w - left - right;
  const chartH = h - top - bottom;

  const toPointRows = (series) => series.map((value, index) => {
    const x = left + (index * chartW) / Math.max(series.length - 1, 1);
    const y = top + ((max - value) / range) * chartH;
    return { x, y, value, label: labels[index] };
  });
  const grossRows = toPointRows(grossPoints);
  const balanceRows = toPointRows(balancePoints);
  const rowByDate = new Map(balanceRows.filter((point) => point.label !== "Start").map((point) => [point.label, point]));
  const toSvgPath = (rows) => rows.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");

  const yGrid = Array.from({ length: 4 }, (_, i) => {
    const y = top + i * (chartH / 3);
    const val = max - (i * range) / 3;
    return `<line x1="${left}" y1="${y}" x2="${w - right}" y2="${y}" stroke="rgba(217,221,228,0.22)"/><text x="${left - 8}" y="${y + 4}" text-anchor="end" fill="#b6bbc6" font-size="11">$${Math.round(val).toLocaleString()}</text>`;
  }).join("");

  const tickIndexes = [...new Set(Array.from({ length: Math.min(labels.length, 6) }, (_, index) => Math.round((index * Math.max(labels.length - 1, 0)) / Math.max(Math.min(labels.length, 6) - 1, 1))))];
  const xTicks = tickIndexes.map((index) => {
    const point = grossRows[index];
    if (!point) return "";
    return `<text x="${point.x}" y="${h - 12}" text-anchor="middle" fill="#b6bbc6" font-size="10">${labels[index] === "Start" ? "Start" : labels[index].slice(5)}</text>`;
  }).join("");
  const grossDots = grossRows.map((point) => `<circle cx="${point.x}" cy="${point.y}" r="3" fill="#d9dde4"/>`).join("");
  const balanceDots = showBalanceAfterPayouts ? balanceRows.map((point) => `<circle cx="${point.x}" cy="${point.y}" r="3" fill="#7be0ad"/>`).join("") : "";

  const legendItems = [
    { color: "#d9dde4", label: "Trading Equity", note: "Trade PnL before payouts" },
    ...(showBalanceAfterPayouts ? [{ color: "#7be0ad", label: "Balance After Payouts", note: "Completed payout activity applied" }] : []),
    ...(payouts.length ? [{ color: "#8d7dff", label: "Payout Events", note: `${payouts.length} completed marker${payouts.length === 1 ? "" : "s"}` }] : []),
  ];
  const legend = legendItems.map((item, index) => `<g><rect x="${left + index * 220}" y="8" width="12" height="3" rx="1.5" fill="${item.color}"/><text x="${left + 18 + index * 220}" y="12" fill="#b6bbc6" font-size="11">${escapeHtml(item.label)}</text><text x="${left + 18 + index * 220}" y="24" fill="rgba(182,187,198,0.78)" font-size="9">${escapeHtml(item.note)}</text></g>`).join("");

  const payoutMarkers = payouts.map((payout, payoutIndex) => {
    const point = rowByDate.get(payout.date);
    if (!point) return "";
    const sameDateIndex = payouts.slice(0, payoutIndex).filter((item) => item.date === payout.date).length;
    const markerY = Math.max(top + 18, point.y - 16 - sameDateIndex * 16);
    const diamond = `${point.x},${markerY - 6} ${point.x + 6},${markerY} ${point.x},${markerY + 6} ${point.x - 6},${markerY}`;
    const tooltip = [
      formatDateDisplay(payout.date),
      `${isPayoutRefundLike(payout) ? "Refund" : "Payout"}: ${formatCurrency(Math.abs(toNum(payout.amount)))}`,
      `Account / Group: ${accountTargetLabel(payout.accountId)}`,
      `Type: ${payout.type}`,
    ].join(" • ");
    return `<g class="equity-payout-marker"><line x1="${point.x}" y1="${top + 26}" x2="${point.x}" y2="${point.y}" stroke="rgba(141,125,255,0.38)" stroke-dasharray="4 4"/><circle cx="${point.x}" cy="${point.y}" r="5" fill="#151922" stroke="#8d7dff" stroke-width="2"/><polygon points="${diamond}" fill="#8d7dff" stroke="#efeaff" stroke-width="1"/><title>${escapeHtml(tooltip)}</title></g>`;
  }).join("");

  root.innerHTML = `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Trading equity, balance after payouts, and payout event markers chart"><rect x="0" y="0" width="${w}" height="${h}" fill="transparent"/>${legend}${yGrid}<path d="${toSvgPath(grossRows)}" fill="none" stroke="#d9dde4" stroke-width="2.5"/>${showBalanceAfterPayouts ? `<path d="${toSvgPath(balanceRows)}" fill="none" stroke="#7be0ad" stroke-width="2.5" stroke-dasharray="7 5"/>` : ""}${payoutMarkers}${grossDots}${balanceDots}${xTicks}</svg>`;

  if (meta) {
    const summary = getTradingPerformanceSummary(selectedId, { from, to });
    meta.innerHTML = [
      '<span><strong>Trading Equity</strong><em>Session PnL before withdrawals, refunds, and fees.</em></span>',
      `<span><strong>Balance After Payouts</strong><em>${showBalanceAfterPayouts ? "Visible as the green dashed line with completed payout flow applied." : "Hidden via toggle, but still reflected in payout event cards below."}</em></span>`,
      `<span><strong>Total Payouts</strong><em>${escapeHtml(formatCurrency(summary.totalPayouts))} across ${summary.completedPayoutCount} completed withdrawal${summary.completedPayoutCount === 1 ? "" : "s"}.</em></span>`,
      `<span><strong>Payout Snapshot</strong><em>${escapeHtml(summary.largestPayout ? `${formatCurrency(getPayoutAbsoluteAmount(summary.largestPayout))} largest • ${summary.averageMonthlyPayout === null ? "—" : `${formatCurrency(summary.averageMonthlyPayout)}/mo`} • ${summary.payoutsAsPctOfProfits === null ? "—" : `${summary.payoutsAsPctOfProfits.toFixed(1)}% of profits`}` : "No completed payouts in the current range yet.")}</em></span>`,
    ].join("");
  }

  if (payoutEvents) {
    payoutEvents.innerHTML = payouts.length
      ? payouts.map((payout) => {
        const signedDelta = isPayoutRefundLike(payout) ? getPayoutAbsoluteAmount(payout) : -getPayoutAbsoluteAmount(payout);
        const balanceAfter = balanceAfterDate.get(payout.date);
        return `<article class="equity-payout-event-card"><div class="equity-payout-event-top"><span class="pill payout-pill payout-pill--soft">${escapeHtml(formatDateDisplay(payout.date))}</span><span class="equity-payout-amount ${signedDelta >= 0 ? "good" : "bad"}">${signedDelta >= 0 ? "+" : "-"}${escapeHtml(formatCurrency(Math.abs(signedDelta)).replace(/^-/, ""))}</span></div><strong>${escapeHtml(accountTargetLabel(payout.accountId))}</strong><p class="muted small">${escapeHtml(payout.type)} · ${escapeHtml(isPayoutRefundLike(payout) ? "Refund / credit" : "Withdrawal / deduction")}</p><p class="muted small">Balance after event: ${escapeHtml(balanceAfter === undefined ? "—" : formatCurrency(balanceAfter))}</p></article>`;
      }).join("")
      : '<p class="muted small">No completed payout events match the current Overview filters.</p>';
  }
}

function renderOverview() {
  const m = metrics();
  const cards = [
    ["Gross profit before payouts", formatCurrency(m.grossProfitBeforePayouts), m.grossProfitBeforePayouts >= 0],
    ["Gross trading equity", formatCurrency(m.grossTradingEquity), m.grossTradingEquity >= m.startingBalance],
    ["Current balance after payouts", formatCurrency(m.netAccountBalance), m.netAccountBalance >= m.startingBalance],
    ["Total payouts", formatCurrency(m.totalPayouts), m.totalPayouts === 0 || m.totalPayouts <= Math.max(m.grossTradingEquity, 0)],
    ["Largest payout", m.largestPayout ? formatCurrency(getPayoutAbsoluteAmount(m.largestPayout)) : "—", !m.largestPayout || getPayoutAbsoluteAmount(m.largestPayout) >= 0],
    ["Avg monthly payout", m.averageMonthlyPayout === null ? "—" : formatCurrency(m.averageMonthlyPayout), m.averageMonthlyPayout === null || m.averageMonthlyPayout >= 0],
    ["Payouts vs profits", m.payoutsAsPctOfProfits === null ? "—" : `${m.payoutsAsPctOfProfits.toFixed(1)}%`, m.payoutsAsPctOfProfits === null || m.payoutsAsPctOfProfits <= 100],
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
      const vals = state.sessions.map((session) => {
        const value = session.rules?.[rule.id];
        return typeof value === "boolean" ? value : false;
      });
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

  renderOverviewCalendar();
  drawEquity();
}



function accountOptions(selected = "") {
  const options = [];
  const seen = new Set();
  const addOption = (id, label) => {
    const key = String(id || "");
    if (!key || seen.has(key)) return;
    seen.add(key);
    options.push(`<option value="${key}" ${selected === key ? "selected" : ""}>${escapeHtml(label)}</option>`);
  };
  state.accounts.forEach((account) => addOption(account.id, account.name));
  state.groups.forEach((group) => addOption(group.id, `${group.name} (${getGroupDisplayAccountCount(group.id)} acc)`));
  state.archivedAccounts.forEach((account) => addOption(account.id, `${account.name} (inactive)`));
  state.archivedGroups.forEach((group) => addOption(group.id, `${group.name} (${getGroupDisplayAccountCount(group.id)} acc • inactive)`));
  return options.join("");
}

function targetOptionsWithLegacy(selected = "") {
  const options = accountOptions(selected);
  if (!selected) return options;
  if (getAccountById(selected) || getGroupById(selected)) return options;
  return `${options}<option value="${escapeHtml(selected)}" selected>${escapeHtml(selected)} (legacy)</option>`;
}

function syncPayoutDraftTarget() {
  const nextTargetId = uiState.payoutDraft.accountId;
  if (nextTargetId && (getAccountById(nextTargetId) || getGroupById(nextTargetId) || state.archivedAccounts.some((account) => account.id === nextTargetId) || state.archivedGroups.some((group) => group.id === nextTargetId))) return;
  uiState.payoutDraft.accountId = getDefaultPayoutTargetId();
}

function payoutTypeOptions(selected = "all", includeAll = false) {
  const options = PAYOUT_TYPE_OPTIONS.map((type) => `<option value="${escapeHtml(type)}" ${selected === type ? "selected" : ""}>${escapeHtml(type)}</option>`);
  return `${includeAll ? `<option value="all" ${selected === "all" ? "selected" : ""}>All types</option>` : ""}${options.join("")}`;
}

function payoutStatusOptions(selected = "all", includeAll = false) {
  const options = PAYOUT_STATUS_OPTIONS.map((status) => `<option value="${escapeHtml(status)}" ${selected === status ? "selected" : ""}>${escapeHtml(status)}</option>`);
  return `${includeAll ? `<option value="all" ${selected === "all" ? "selected" : ""}>All statuses</option>` : ""}${options.join("")}`;
}

function payoutDestinationOptions(selected = "") {
  const placeholder = `<option value="" ${selected ? "" : "selected"}>Select destination</option>`;
  const options = PAYOUT_DESTINATION_OPTIONS.map((destination) => `<option value="${escapeHtml(destination)}" ${selected === destination ? "selected" : ""}>${escapeHtml(destination)}</option>`);
  return `${placeholder}${options.join("")}`;
}

function getAnalysisSetupOptions() {
  return [...new Set(state.sessions
    .flatMap((session) => session.trades.map((trade) => String(trade.setup || "").trim()))
    .filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}

function getAnalysisSymbolOptions() {
  return [...new Set(state.sessions
    .flatMap((session) => session.trades.map((trade) => String(trade.symbol || "").trim().toUpperCase()))
    .filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}

function renderAnalysisMultiSelect(containerId, options, selectedValues, filterKey) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const selected = new Set((selectedValues || []).map((item) => String(item)));
  const cleanSelected = [...selected].filter((item) => options.includes(item));
  if (cleanSelected.length !== selected.size) uiState.filters[filterKey] = cleanSelected;
  container.classList.toggle("empty", options.length === 0);
  container.innerHTML = options
    .map((option) => `<label class="multi-select-option"><input type="checkbox" data-analysis-multi="${filterKey}" value="${escapeHtml(option)}" ${selected.has(option) ? "checked" : ""} />${escapeHtml(option)}</label>`)
    .join("");
}

function renderFilterSelects() {
  const equity = document.getElementById("equityAccountFilter");
  const payout = document.getElementById("payoutAccountFilter");
  const payoutType = document.getElementById("payoutTypeFilter");
  const payoutStatus = document.getElementById("payoutStatusFilter");
  const equityToggle = document.getElementById("equityBalanceToggle");
  const journal = document.getElementById("journalAccountFilter");
  const analysis = document.getElementById("analysisAccountFilter");
  if (equity) { equity.innerHTML = `<option value="all">All accounts</option>${accountOptions(uiState.filters.overviewAccountId)}`; equity.value = uiState.filters.overviewAccountId; }
  if (equityToggle) equityToggle.checked = uiState.filters.overviewShowBalanceAfterPayouts !== false;
  if (payout) { payout.innerHTML = `<option value="all">All accounts</option>${accountOptions(uiState.filters.payoutAccountId)}`; payout.value = uiState.filters.payoutAccountId; }
  if (payoutType) payoutType.innerHTML = payoutTypeOptions(uiState.filters.payoutType, true);
  if (payoutStatus) payoutStatus.innerHTML = payoutStatusOptions(uiState.filters.payoutStatus, true);
  if (journal) { journal.innerHTML = `<option value="all">All accounts</option>${accountOptions(uiState.filters.journalAccountId)}`; journal.value = uiState.filters.journalAccountId; }
  if (analysis) { analysis.innerHTML = `<option value="all">All accounts</option>${accountOptions(uiState.filters.analysisAccountId)}`; analysis.value = uiState.filters.analysisAccountId; }
  const map = [["equityDateFrom","overviewFrom"],["equityDateTo","overviewTo"],["payoutDateFrom","payoutFrom"],["payoutDateTo","payoutTo"],["journalDateFrom","journalFrom"],["journalDateTo","journalTo"]];
  map.forEach(([id,key]) => { const input = document.getElementById(id); if (input && document.activeElement !== input) input.value = uiState.filters[key]; });

  syncAnalysisDateRangeFromPreset();
  const preset = document.getElementById("analysisDatePreset");
  const from = document.getElementById("analysisDateFrom");
  const to = document.getElementById("analysisDateTo");
  const direction = document.getElementById("analysisDirectionFilter");
  const ruleMode = document.getElementById("analysisRuleFilterMode");
  const fromWrap = document.getElementById("analysisDateFromWrap");
  const toWrap = document.getElementById("analysisDateToWrap");
  if (preset) preset.value = uiState.filters.analysisPreset;
  if (from && document.activeElement !== from) from.value = uiState.filters.analysisFrom;
  if (to && document.activeElement !== to) to.value = uiState.filters.analysisTo;
  if (direction) direction.value = uiState.filters.analysisDirection;
  if (ruleMode) ruleMode.value = uiState.filters.analysisRuleMode;
  if (fromWrap) fromWrap.hidden = uiState.filters.analysisPreset !== "custom";
  if (toWrap) toWrap.hidden = uiState.filters.analysisPreset !== "custom";
  renderAnalysisMultiSelect("analysisSetupFilter", getAnalysisSetupOptions(), uiState.filters.analysisSetups, "analysisSetups");
  renderAnalysisMultiSelect("analysisSymbolFilter", getAnalysisSymbolOptions(), uiState.filters.analysisSymbols, "analysisSymbols");
}

function renderAccounts() {
  const list = document.getElementById("accountsList");
  const groupsList = document.getElementById("groupsList");
  const groupsActiveTabBtn = document.getElementById("groupsViewActiveBtn");
  const groupsPastTabBtn = document.getElementById("groupsViewPastBtn");
  const activeTabBtn = document.getElementById("accountsViewActiveBtn");
  const pastTabBtn = document.getElementById("accountsViewPastBtn");
  if (activeTabBtn) activeTabBtn.classList.toggle("active", uiState.accountsView !== "past");
  if (pastTabBtn) pastTabBtn.classList.toggle("active", uiState.accountsView === "past");
  if (groupsActiveTabBtn) groupsActiveTabBtn.classList.toggle("active", uiState.groupsView !== "past");
  if (groupsPastTabBtn) groupsPastTabBtn.classList.toggle("active", uiState.groupsView === "past");

  if (list) {
    if (uiState.accountsView === "past") {
      const passedAccounts = state.archivedAccounts.filter((account) => account.archivedReason === "passed");
      const blownAccounts = state.archivedAccounts.filter((account) => account.archivedReason !== "passed");
      const renderPastRows = (accounts) => (accounts.length
        ? accounts
            .map((account) => `<article class="account-thin-card" data-open-archived-account="${account.id}"><span class="account-line"><strong>${escapeHtml(account.name)}</strong> · $${formatWithThousands(account.startingBalance, 0)} · ${escapeHtml(account.groupId ? `${accountTargetLabel(account.groupId).replace(/ \(Group.+/, "")} (Group • ${Math.max(1, account.groupAccountsAtArchive || getGroupDisplayAccountCount(account.groupId))} accounts)` : "No group")} · ${escapeHtml(formatAgeRange(account))}</span><button type="button" data-restore-account="${account.id}">Restore</button></article>`)
            .join("")
        : '<div class="muted small">None yet.</div>');
      list.innerHTML = `<div class="past-account-section"><h4>Passed Accounts</h4>${renderPastRows(passedAccounts)}</div><div class="past-account-section"><h4>Blown Accounts</h4>${renderPastRows(blownAccounts)}</div>`;
    } else {
      list.innerHTML = state.accounts.length
        ? state.accounts
            .map((account) => {
              const summary = getTradingPerformanceSummary(account.id);
              return `<article class="playbook-card" data-open-account="${account.id}"><div class="playbook-card-head"><h4>${escapeHtml(account.name)}</h4><div><span class="pill">$${formatWithThousands(account.startingBalance, 0)}</span> <button type="button" class="success" data-pass-account="${account.id}">Pass</button> <button type="button" class="danger" data-blowup-account="${account.id}">Blow Up</button> <button type="button" class="danger" data-remove-account="${account.id}">Remove</button></div></div><p class="muted small">Firm: ${escapeHtml(account.propFirm || "—")}</p><p class="muted small">Max DD: $${formatWithThousands(account.maxDrawdown || 0, 0)}</p><p class="muted small">Group: ${escapeHtml(account.groupId ? accountTargetLabel(account.groupId) : "—")}</p><p class="muted small">Gross trading equity: ${formatCurrency(summary.grossTradingEquity)} · Balance after payouts: ${formatCurrency(summary.netAccountBalance)}</p><p class="muted small">Gross profit: ${formatCurrency(summary.grossProfitBeforePayouts)} · Payouts: ${formatCurrency(summary.totalPayouts)}</p><p class="muted small">Largest payout: ${summary.largestPayout ? formatCurrency(getPayoutAbsoluteAmount(summary.largestPayout)) : "—"} · Avg monthly payout: ${summary.averageMonthlyPayout === null ? "—" : formatCurrency(summary.averageMonthlyPayout)} · Payout rate: ${summary.payoutsAsPctOfProfits === null ? "—" : `${summary.payoutsAsPctOfProfits.toFixed(1)}%`}</p></article>`;
            })
            .join("")
        : '<div class="muted small">No active accounts yet.</div>';
    }
  }
  if (groupsList) {
    groupsList.innerHTML = uiState.groupsView === "past"
      ? (state.archivedGroups.length
          ? state.archivedGroups
              .map((group) => `<article class="playbook-card" data-open-group-entity="${group.id}"><div class="playbook-card-head"><h4>${escapeHtml(group.name)}</h4><div><span class="pill">${getGroupDisplayAccountCount(group.id)} acc</span> <button type="button" class="danger" data-remove-group="${group.id}">Remove</button></div></div><p class="muted small">Inactive group • click to view details.</p></article>`)
              .join("")
          : '<div class="muted small">No past groups yet.</div>')
      : (state.groups.length
          ? state.groups
              .map((group) => {
                const summary = getTradingPerformanceSummary(group.id);
                return `<article class="playbook-card" data-open-group="${group.id}"><div class="playbook-card-head"><h4>${escapeHtml(group.name)}</h4><div><span class="pill">${getGroupDisplayAccountCount(group.id)} acc</span> <button type="button" class="danger" data-blowup-group="${group.id}">Blow Up</button> <button type="button" class="danger" data-remove-group="${group.id}">Remove</button></div></div><p class="muted small">Gross trading equity: ${formatCurrency(summary.grossTradingEquity)} · Balance after payouts: ${formatCurrency(summary.netAccountBalance)}</p><p class="muted small">Gross profit: ${formatCurrency(summary.grossProfitBeforePayouts)} · Payouts: ${formatCurrency(summary.totalPayouts)}</p><p class="muted small">Largest payout: ${summary.largestPayout ? formatCurrency(getPayoutAbsoluteAmount(summary.largestPayout)) : "—"} · Avg monthly payout: ${summary.averageMonthlyPayout === null ? "—" : formatCurrency(summary.averageMonthlyPayout)} · Payout rate: ${summary.payoutsAsPctOfProfits === null ? "—" : `${summary.payoutsAsPctOfProfits.toFixed(1)}%`}</p></article>`;
              })
              .join("")
          : '<div class="muted small">No current groups yet.</div>');
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
        <td><input data-trade-k="size" data-session-id="${session.id}" data-trade-id="${t.id}" type="number" step="1" value="${toInputNumericValue(t.size)}"/></td>
        <td><input data-trade-k="entry" data-session-id="${session.id}" data-trade-id="${t.id}" value="${formatTradePrice(t.entry, t.symbol)}"/></td>
        <td><input data-trade-k="entryTime" data-session-id="${session.id}" data-trade-id="${t.id}" type="time" value="${normalizeTradeTime(t.entryTime)}"/></td>
        <td><input data-trade-k="exit" data-session-id="${session.id}" data-trade-id="${t.id}" value="${formatTradePrice(t.exit, t.symbol)}"/></td>
        <td><input data-trade-k="exitTime" data-session-id="${session.id}" data-trade-id="${t.id}" type="time" value="${normalizeTradeTime(t.exitTime)}"/></td>
        <td><input data-trade-k="stop" data-session-id="${session.id}" data-trade-id="${t.id}" type="number" step="0.01" value="${toInputNumericValue(t.stop)}"/></td>
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

function renderSessionCards(sessions, emptyMessage = "No sessions yet.") {
  return sessions
    .map((s) => {
      const net = getSessionNet(s);
      const adherence = getSessionRuleAdherence(s);
      return `
      <article class="session-card">
        <div class="session-top">
          <button class="collapse-arrow" title="Toggle session" data-toggle-session="${s.id}" aria-label="Toggle session">${s.collapsed ? "▶" : "▼"}</button>
          <div class="session-date-fields">
            <label>Date
              <input class="date-input" type="date" required data-session-k="date" data-session-id="${s.id}" value="${s.date || ""}"/>
            </label>
            <label>Day
              <input class="day-input" type="number" min="1" step="1" inputmode="numeric" data-session-k="day" data-session-id="${s.id}" value="${s.day || ""}" placeholder="e.g. 12"/>
            </label>
          </div>
          <div class="session-link-wrap">
            ${s.videoLink?.url ? `<button type="button" class="session-shot session-link-card" data-open-link="${s.id}" title="Edit video link"><span class="session-link-play" data-play-link="${s.id}" title="Open video" aria-label="Open YouTube video">▶</span><span class="link-title">${escapeHtml(s.videoLink.title || "YouTube Video")}</span>${s.videoLink.thumbnail ? `<img src="${escapeHtml(s.videoLink.thumbnail)}" alt="Linked video thumbnail"/>` : `<span class="link-thumb-fallback">No thumbnail</span>`}</button>` : `<button type="button" class="session-shot session-shot-empty session-link-card" data-open-link="${s.id}">Add Link</button>`}
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
               <div class="table-wrap"><table><thead><tr><th>Account</th><th>Symbol</th><th>Setup</th><th>Type</th><th>Size</th><th>Entry</th><th>Entry Time</th><th>Exit</th><th>Exit Time</th><th>Stop</th><th>Duration</th><th>R</th><th>PnL</th><th>Actions</th></tr></thead><tbody>${renderSessionTrades(s)}</tbody></table></div>`
        }
      </article>`;
    })
    .join("") || `<p class="muted">${escapeHtml(emptyMessage)}</p>`;
}

const SESSION_VIEW_CONFIG = {
  journal: {
    listId: "sessionList",
    emptyMessage: "No sessions yet.",
    getSessions: () => getFilteredSessions({
      accountId: uiState.filters.journalAccountId,
      from: uiState.filters.journalFrom,
      to: uiState.filters.journalTo,
    }),
  },
  "day-modal": {
    listId: "daySessionsModalList",
    emptyMessage: "No sessions match this day.",
    getSessions: () => getDaySessionsModalSessions(uiState.daySessionsModalDate),
  },
};

function getSessionViewConfig(mode) {
  return SESSION_VIEW_CONFIG[mode] || SESSION_VIEW_CONFIG.journal;
}

function renderCustomSymbolForm() {
  const tickerInput = document.getElementById("customSymbolTicker");
  const tickSizeInput = document.getElementById("customSymbolTickSize");
  const tickValueInput = document.getElementById("customSymbolTickValue");
  const primaryButton = document.getElementById("addCustomSymbolBtn");
  const cancelButton = document.getElementById("cancelCustomSymbolBtn");
  if (!tickerInput || !tickSizeInput || !tickValueInput || !primaryButton || !cancelButton) return;
  const editingTicker = uiState.symbolEditor.editingTicker;
  const symbol = state.customSymbols.find((item) => item.ticker === editingTicker);
  if (symbol) {
    tickerInput.value = symbol.ticker;
    tickSizeInput.value = String(symbol.tickSize);
    tickValueInput.value = String(symbol.tickValue);
    primaryButton.textContent = "Save Symbol";
    cancelButton.hidden = false;
    return;
  }
  uiState.symbolEditor.editingTicker = "";
  tickerInput.value = "";
  tickSizeInput.value = "";
  tickValueInput.value = "";
  primaryButton.textContent = "+ Add Symbol";
  cancelButton.hidden = true;
}

function startEditingCustomSymbol(ticker) {
  const normalized = String(ticker || "").trim().toUpperCase();
  if (!normalized || !state.customSymbols.some((item) => item.ticker === normalized)) return;
  uiState.symbolEditor.editingTicker = normalized;
  renderCustomSymbolForm();
  document.getElementById("customSymbolTicker")?.focus();
}

function clearCustomSymbolEditor({ preserveStatus = false } = {}) {
  uiState.symbolEditor.editingTicker = "";
  renderCustomSymbolForm();
  if (!preserveStatus) setCustomSymbolStatus("");
}

function renderSymbols() {
  renderCustomSymbolForm();
  const catalog = document.getElementById("symbolCatalog");
  if (!catalog) return;
  const rows = getAllSymbolOptions().map((ticker) => {
    const customSymbol = state.customSymbols.find((item) => item.ticker === ticker);
    const config = getSymbolConfig(ticker);
    const usage = getCustomSymbolUsage(ticker);
    const tickValue = customSymbol?.tickValue ?? config.tickSize * config.pointValue;
    const pointValue = Number.isFinite(config.pointValue) ? config.pointValue : 0;
    return `
      <article class="symbol-row${customSymbol ? ' is-custom' : ''}">
        <div class="symbol-row-primary">
          <strong>${escapeHtml(ticker)}</strong>
          <span class="pill">${customSymbol ? 'Custom' : 'Core'}</span>
        </div>
        <div class="symbol-row-metrics">
          <span><span class="muted">Tick</span> ${formatWithThousands(config.tickSize, 4)}</span>
          <span><span class="muted">$/tick</span> $${formatWithThousands(tickValue, 2)}</span>
          ${pointValue ? `<span><span class="muted">Point value</span> $${formatWithThousands(pointValue, 2)}</span>` : ''}
          ${usage.trades ? `<span><span class="muted">Journal usage</span> ${usage.trades} trade${usage.trades === 1 ? "" : "s"} in ${usage.sessions} session${usage.sessions === 1 ? "" : "s"}</span>` : '<span><span class="muted">Journal usage</span> Not used yet</span>'}
        </div>
        <div class="symbol-row-actions">
          ${customSymbol
            ? `<button type="button" data-edit-symbol="${ticker}">Edit</button><button type="button" data-del-symbol="${ticker}" ${usage.trades ? "disabled" : ""}>${usage.trades ? "In use" : "Remove"}</button>`
            : `<span class="muted small">Built-in</span>`}
        </div>
      </article>`;
  });
  catalog.innerHTML = rows.join("") || '<p class="muted">No symbols available.</p>';
}

function renderSessionView(mode) {
  const config = getSessionViewConfig(mode);
  const list = document.getElementById(config.listId);
  if (!list) return;
  list.innerHTML = renderSessionCards(config.getSessions(), config.emptyMessage);
  updateAllCounters();
}

function renderSessionViews(modes = ["journal", "day-modal"]) {
  const requestedModes = Array.isArray(modes) && modes.length ? modes : ["journal", "day-modal"];
  const uniqueModes = [...new Set(requestedModes)];
  uniqueModes.forEach((mode) => renderSessionView(mode));
}

function getSessionModeFromContainer(container) {
  if (!container?.id) return null;
  if (container.id === "sessionList") return "journal";
  if (container.id === "daySessionsModalList") return "day-modal";
  return null;
}

function getCompanionSessionModes(sourceMode) {
  if (sourceMode === "journal") return ["day-modal"];
  if (sourceMode === "day-modal") return ["journal"];
  return ["journal", "day-modal"];
}

function getDaySessionsModalSessions(date) {
  return getFilteredSessions({ accountId: uiState.filters.overviewAccountId }).filter((session) => session.date === date);
}

function getFilteredPayouts({ accountId = "all", from = "", to = "", type = "all", status = "all" } = {}) {
  return state.payouts
    .filter((payout) => {
      const targetId = String(payout.accountId || "");
      if (accountId === "all") {
        if (!isActiveTargetId(targetId)) return false;
      } else if (targetId !== accountId) return false;
      if (from && payout.date < from) return false;
      if (to && payout.date > to) return false;
      if (type !== "all" && payout.type !== type) return false;
      if (status !== "all" && payout.status !== status) return false;
      return true;
    })
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || String(b.id || "").localeCompare(String(a.id || "")));
}

function getCurrentPayoutFilters({ ignoreDate = false } = {}) {
  return {
    accountId: uiState.filters.payoutAccountId,
    from: ignoreDate ? "" : uiState.filters.payoutFrom,
    to: ignoreDate ? "" : uiState.filters.payoutTo,
    type: uiState.filters.payoutType,
    status: uiState.filters.payoutStatus,
  };
}

function getPayoutAbsoluteAmount(payout) {
  return Math.abs(toNum(payout?.amount));
}

function getPayoutSignedBalanceDelta(payout) {
  const amount = getPayoutAbsoluteAmount(payout);
  return isPayoutRefundLike(payout) ? amount : -amount;
}

function getWalletBalanceFromPayouts() {
  return state.payouts.reduce((sum, payout) => {
    if (!isCompletedPayout(payout)) return sum;
    if (payout.destination !== "Wallet") return sum;
    return sum + getPayoutAbsoluteAmount(payout);
  }, 0);
}

function getWalletBalance() {
  return Math.max(0, normalizeWalletBalance(state.walletBalance) + getWalletBalanceFromPayouts());
}

function average(values) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatDateDisplay(value) {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function daysBetweenIso(start, end) {
  if (!start || !end) return null;
  const startDate = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return null;
  return Math.max(0, Math.round((endDate - startDate) / 86400000));
}

function getWeeklyBucketStart(isoDate) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - (day - 1));
  return date.toISOString().slice(0, 10);
}

function getTradeEntriesForTarget({ targetId = "all", from = "", to = "" } = {}) {
  return getFilteredSessions({ accountId: targetId, from, to }).flatMap((session) => session.trades
    .filter((trade) => {
      const tradeTargetId = getTradeAccountTargetId(trade, session);
      if (targetId === "all") return isActiveTargetId(tradeTargetId);
      return tradeTargetId === targetId;
    })
    .map((trade) => ({ session, trade, net: calcTradeNet(trade, session) })));
}

function getGrossTradingProfit(entries) {
  return entries.reduce((sum, entry) => sum + Math.max(0, entry.net), 0);
}

function getFirstTradeDateForTarget(targetId = "all") {
  const dates = getTradeEntriesForTarget({ targetId })
    .map(({ session }) => String(session.date || ""))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
  return dates[0] || "";
}

function getPayoutChartRangeLabel({ from = "", to = "" }, fallbackPayouts = []) {
  const sortedDates = fallbackPayouts.map((payout) => payout.date).filter(Boolean).sort((a, b) => a.localeCompare(b));
  const start = from || sortedDates[0] || "";
  const end = to || sortedDates.at(-1) || start;
  if (!start && !end) return "All available dates";
  if (start && end) return `${formatDateDisplay(start)} → ${formatDateDisplay(end)}`;
  return formatDateDisplay(start || end);
}

function formatBucketLabel(bucketKey, bucketType = "month") {
  if (!bucketKey) return "—";
  if (bucketType === "month") {
    const [year, month] = String(bucketKey).split("-");
    const monthIndex = Number(month) - 1;
    if (!year || monthIndex < 0 || monthIndex > 11) return bucketKey;
    return `${MONTH_LABELS[monthIndex].slice(0, 3)} ${year}`;
  }
  if (bucketType === "week") {
    return `Week of ${formatDateDisplay(bucketKey)}`;
  }
  return bucketKey;
}

function summarizePayoutBreakdown(payouts, getLabel, { emptyLabel = "Unspecified" } = {}) {
  const map = new Map();
  payouts.forEach((payout) => {
    const label = String(getLabel(payout) || "").trim() || emptyLabel;
    const current = map.get(label) || {
      label,
      records: 0,
      completedRecords: 0,
      totalAmount: 0,
      outflowAmount: 0,
      inflowAmount: 0,
    };
    const amount = getPayoutAbsoluteAmount(payout);
    current.records += 1;
    if (isCompletedPayout(payout)) current.completedRecords += 1;
    current.totalAmount += amount;
    if (isPayoutRefundLike(payout)) current.inflowAmount += amount;
    else current.outflowAmount += amount;
    map.set(label, current);
  });
  return [...map.values()].sort((a, b) => b.totalAmount - a.totalAmount || b.records - a.records || a.label.localeCompare(b.label));
}

function summarizeAveragePayoutSizeByBucket(payouts, bucketType = "month") {
  const map = new Map();
  payouts.forEach((payout) => {
    const key = bucketType === "week" ? getWeeklyBucketStart(payout.date) : String(payout.date || "").slice(0, 7);
    if (!key) return;
    const current = map.get(key) || { key, label: formatBucketLabel(key, bucketType), records: 0, totalAmount: 0 };
    current.records += 1;
    current.totalAmount += getPayoutAbsoluteAmount(payout);
    map.set(key, current);
  });
  return [...map.values()]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((entry) => ({
      ...entry,
      averageAmount: entry.records ? entry.totalAmount / entry.records : 0,
    }));
}

function summarizeProfitablePeriodPayoutCoverage(sessions, payouts, bucketType = "week", targetId = "all") {
  const profitByBucket = new Map();
  sessions.forEach((session) => {
    const bucketKey = bucketType === "week" ? getWeeklyBucketStart(session.date) : String(session.date || "").slice(0, 7);
    if (!bucketKey) return;
    profitByBucket.set(bucketKey, (profitByBucket.get(bucketKey) || 0) + getSessionNetForFilter(session, targetId));
  });
  const payoutCountByBucket = new Map();
  payouts.forEach((payout) => {
    const bucketKey = bucketType === "week" ? getWeeklyBucketStart(payout.date) : String(payout.date || "").slice(0, 7);
    if (!bucketKey) return;
    payoutCountByBucket.set(bucketKey, (payoutCountByBucket.get(bucketKey) || 0) + 1);
  });
  const profitableBuckets = [...profitByBucket.entries()]
    .filter(([, net]) => net > 0)
    .map(([key, net]) => ({
      key,
      label: formatBucketLabel(key, bucketType),
      net,
      payoutCount: payoutCountByBucket.get(key) || 0,
    }));
  const profitableWithPayout = profitableBuckets.filter((entry) => entry.payoutCount > 0);
  return {
    profitableCount: profitableBuckets.length,
    withPayoutCount: profitableWithPayout.length,
    percentage: profitableBuckets.length ? (profitableWithPayout.length / profitableBuckets.length) * 100 : null,
    rows: profitableBuckets,
  };
}

function summarizePayoutPerformanceWindows(payouts, sessions, targetId = "all", windowSize = 5) {
  const sessionRows = sessions
    .map((session) => ({ session, net: getSessionNetForFilter(session, targetId) }))
    .sort((a, b) => String(a.session.date || "").localeCompare(String(b.session.date || "")));
  const windows = payouts.map((payout) => {
    const before = sessionRows.filter((row) => row.session.date < payout.date).slice(-windowSize);
    const after = sessionRows.filter((row) => row.session.date > payout.date).slice(0, windowSize);
    if (!before.length && !after.length) return null;
    const beforeNet = before.reduce((sum, row) => sum + row.net, 0);
    const afterNet = after.reduce((sum, row) => sum + row.net, 0);
    return {
      payout,
      beforeCount: before.length,
      afterCount: after.length,
      beforeNet,
      afterNet,
      beforeAverage: before.length ? beforeNet / before.length : null,
      afterAverage: after.length ? afterNet / after.length : null,
      beforeWins: before.filter((row) => row.net > 0).length,
      afterWins: after.filter((row) => row.net > 0).length,
    };
  }).filter(Boolean);

  const comparable = windows.filter((window) => window.beforeCount && window.afterCount);
  const beforeSessionCount = comparable.reduce((sum, window) => sum + window.beforeCount, 0);
  const afterSessionCount = comparable.reduce((sum, window) => sum + window.afterCount, 0);
  const beforeNet = comparable.reduce((sum, window) => sum + window.beforeNet, 0);
  const afterNet = comparable.reduce((sum, window) => sum + window.afterNet, 0);
  const beforeWins = comparable.reduce((sum, window) => sum + window.beforeWins, 0);
  const afterWins = comparable.reduce((sum, window) => sum + window.afterWins, 0);
  return {
    windowSize,
    windows,
    comparableCount: comparable.length,
    beforeAverageNet: beforeSessionCount ? beforeNet / beforeSessionCount : null,
    afterAverageNet: afterSessionCount ? afterNet / afterSessionCount : null,
    beforeWinRate: beforeSessionCount ? (beforeWins / beforeSessionCount) * 100 : null,
    afterWinRate: afterSessionCount ? (afterWins / afterSessionCount) * 100 : null,
    improvedCount: comparable.filter((window) => (window.afterAverage || 0) > (window.beforeAverage || 0)).length,
    worsenedCount: comparable.filter((window) => (window.afterAverage || 0) < (window.beforeAverage || 0)).length,
  };
}

function getPayoutAnalytics() {
  const selectedFilters = getCurrentPayoutFilters();
  const lifetimeFilters = getCurrentPayoutFilters({ ignoreDate: true });
  const selectedPayouts = getFilteredPayouts(selectedFilters);
  const lifetimePayouts = getFilteredPayouts(lifetimeFilters);
  const selectedCompletedPayouts = selectedPayouts.filter(isCompletedPayout);
  const lifetimeCompletedPayouts = lifetimePayouts.filter(isCompletedPayout);
  const targetId = uiState.filters.payoutAccountId;
  const selectedSessions = getFilteredSessions({
    accountId: targetId,
    from: selectedFilters.from,
    to: selectedFilters.to,
  });
  const comparisonSessions = getFilteredSessions({ accountId: targetId });
  const selectedTradeEntries = getTradeEntriesForTarget({
    targetId,
    from: selectedFilters.from,
    to: selectedFilters.to,
  });
  const selectedGrossTradingProfit = getGrossTradingProfit(selectedTradeEntries);
  const selectedPayoutOutflows = selectedCompletedPayouts.reduce((sum, payout) => sum + (isPayoutRefundLike(payout) ? 0 : getPayoutAbsoluteAmount(payout)), 0);
  const selectedTotalAmount = selectedPayouts.reduce((sum, payout) => sum + getPayoutAbsoluteAmount(payout), 0);
  const lifetimeTotalAmount = lifetimePayouts.reduce((sum, payout) => sum + getPayoutAbsoluteAmount(payout), 0);
  const rangeDates = selectedPayouts.map((payout) => payout.date).filter(Boolean).sort((a, b) => a.localeCompare(b));
  const effectiveFrom = selectedFilters.from || rangeDates[0] || "";
  const effectiveTo = selectedFilters.to || rangeDates.at(-1) || effectiveFrom;
  const spanDaysRaw = daysBetweenIso(effectiveFrom, effectiveTo);
  const spanDays = spanDaysRaw === null ? (selectedPayouts.length ? 1 : 0) : Math.max(spanDaysRaw + 1, 1);
  const averagePerWeek = spanDays ? selectedTotalAmount / Math.max(spanDays / 7, 1 / 7) : null;
  const averagePerMonth = spanDays ? selectedTotalAmount / Math.max(spanDays / 30.4375, 1 / 30.4375) : null;
  const largestPayout = [...selectedPayouts].sort((a, b) => getPayoutAbsoluteAmount(b) - getPayoutAbsoluteAmount(a) || String(b.date || "").localeCompare(String(a.date || "")))[0] || null;
  const completedDatesAsc = selectedCompletedPayouts.map((payout) => payout.date).filter(Boolean).sort((a, b) => a.localeCompare(b));
  const payoutGaps = completedDatesAsc.slice(1).map((date, index) => daysBetweenIso(completedDatesAsc[index], date)).filter((value) => value !== null);
  const averageGapDays = average(payoutGaps);
  const firstTradeDate = getFirstTradeDateForTarget(targetId);
  const firstLifetimePayoutDate = lifetimeCompletedPayouts.map((payout) => payout.date).filter(Boolean).sort((a, b) => a.localeCompare(b))[0] || "";
  const daysFromFirstTradeToFirstPayout = firstTradeDate && firstLifetimePayoutDate ? daysBetweenIso(firstTradeDate, firstLifetimePayoutDate) : null;
  const averageBufferLeft = average(selectedPayouts.map((payout) => toNum(payout.bufferAfterPayout)));
  const latestLifetimePayout = lifetimePayouts[0] || null;
  const daysSinceLatestPayout = latestLifetimePayout?.date ? daysBetweenIso(latestLifetimePayout.date, todayIso()) : null;

  return {
    selectedFilters,
    lifetimeFilters,
    selectedPayouts,
    lifetimePayouts,
    selectedCompletedPayouts,
    lifetimeCompletedPayouts,
    selectedSessions,
    comparisonSessions,
    selectedTotalAmount,
    lifetimeTotalAmount,
    selectedTradeEntries,
    selectedGrossTradingProfit,
    selectedPayoutOutflows,
    averagePerWeek,
    averagePerMonth,
    largestPayout,
    averageGapDays,
    firstTradeDate,
    firstLifetimePayoutDate,
    daysFromFirstTradeToFirstPayout,
    payoutRate: selectedGrossTradingProfit > 0 ? (selectedPayoutOutflows / selectedGrossTradingProfit) * 100 : null,
    averageBufferLeft,
    latestLifetimePayout,
    daysSinceLatestPayout,
    rangeLabel: getPayoutChartRangeLabel(selectedFilters, selectedPayouts),
    byReason: summarizePayoutBreakdown(selectedPayouts, (payout) => payout.note || payout.reason),
    byDestination: summarizePayoutBreakdown(selectedPayouts, (payout) => payout.destination),
    byAccountGroup: summarizePayoutBreakdown(selectedPayouts, (payout) => accountTargetLabel(payout.accountId), { emptyLabel: "Unknown target" }),
    byRecurrence: summarizePayoutBreakdown(selectedPayouts, (payout) => (payout.isRecurring ? "Recurring" : "Non-recurring")),
    profitableWeeksWithPayout: summarizeProfitablePeriodPayoutCoverage(selectedSessions, selectedCompletedPayouts, "week", targetId),
    profitableMonthsWithPayout: summarizeProfitablePeriodPayoutCoverage(selectedSessions, selectedCompletedPayouts, "month", targetId),
    performanceAroundPayouts: summarizePayoutPerformanceWindows(selectedCompletedPayouts, comparisonSessions, targetId, 5),
    averageSizeByMonth: summarizeAveragePayoutSizeByBucket(selectedCompletedPayouts, "month"),
    averageSizeByWeek: summarizeAveragePayoutSizeByBucket(selectedCompletedPayouts, "week"),
  };
}

function renderChartEmptyState(containerId, message) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = `<div class="payout-chart-empty">${escapeHtml(message)}</div>`;
}

function renderLineChart(containerId, series, { ariaLabel, yFormatter = formatCurrency, caption = "" } = {}) {
  const container = document.getElementById(containerId);
  const normalizedSeries = (series || []).filter((item) => Array.isArray(item?.data) && item.data.length);
  if (!container) return;
  if (!normalizedSeries.length) {
    renderChartEmptyState(containerId, "No data available for this chart yet.");
    return;
  }
  const labels = normalizedSeries[0].data.map((point) => point.label);
  const values = normalizedSeries.flatMap((item) => item.data.map((point) => point.value));
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  const range = Math.max(1, max - min);
  const left = 60;
  const right = 18;
  const top = 18;
  const bottom = 42;
  const width = 1000;
  const height = 260;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;
  const tickIndexes = [...new Set(Array.from({ length: Math.min(labels.length, 6) }, (_, index) => Math.round((index * Math.max(labels.length - 1, 0)) / Math.max(Math.min(labels.length, 6) - 1, 1))))];
  const toRows = (points) => points.map((point, index) => ({
    ...point,
    x: left + (index * chartWidth) / Math.max(points.length - 1, 1),
    y: top + ((max - point.value) / range) * chartHeight,
  }));
  const yGrid = Array.from({ length: 4 }, (_, index) => {
    const y = top + index * (chartHeight / 3);
    const value = max - (index * range) / 3;
    return `<line x1="${left}" y1="${y}" x2="${width - right}" y2="${y}" stroke="rgba(217,221,228,0.2)"/><text x="${left - 8}" y="${y + 4}" text-anchor="end" fill="#b6bbc6" font-size="11">${escapeHtml(yFormatter(value))}</text>`;
  }).join("");
  const zeroY = top + ((max - 0) / range) * chartHeight;
  const zeroLine = min < 0 && max > 0 ? `<line x1="${left}" y1="${zeroY}" x2="${width - right}" y2="${zeroY}" stroke="rgba(255,255,255,0.28)" stroke-dasharray="4 4"/>` : "";
  const xTicks = tickIndexes.map((index) => {
    const x = left + (index * chartWidth) / Math.max(labels.length - 1, 1);
    return `<text x="${x}" y="${height - 12}" text-anchor="middle" fill="#b6bbc6" font-size="10">${escapeHtml(labels[index])}</text>`;
  }).join("");
  const legend = normalizedSeries.map((item, index) => `<g><rect x="${left + index * 190}" y="8" width="12" height="3" rx="1.5" fill="${item.color}"/><text x="${left + 18 + index * 190}" y="12" fill="#b6bbc6" font-size="11">${escapeHtml(item.name)}</text></g>`).join("");
  const lines = normalizedSeries.map((item) => {
    const rows = toRows(item.data);
    const path = rows.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");
    const dots = rows.map((point) => `<circle cx="${point.x}" cy="${point.y}" r="3" fill="${item.color}"/>`).join("");
    return `<path d="${path}" fill="none" stroke="${item.color}" stroke-width="2.5" ${item.dash ? `stroke-dasharray="${item.dash}"` : ""}/>${dots}`;
  }).join("");
  container.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(ariaLabel || 'Line chart')}"><rect x="0" y="0" width="${width}" height="${height}" fill="transparent"/>${legend}${yGrid}${zeroLine}${lines}${xTicks}</svg>${caption ? `<p class="payout-chart-caption">${escapeHtml(caption)}</p>` : ""}`;
}

function renderBarChart(containerId, categories, seriesConfig, { ariaLabel, yFormatter = formatCurrency, caption = "" } = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (!categories.length || !seriesConfig.length) {
    renderChartEmptyState(containerId, "No data available for this chart yet.");
    return;
  }
  const values = categories.flatMap((category) => seriesConfig.map((series) => Number(category[series.key] || 0)));
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  const range = Math.max(1, max - min);
  const left = 60;
  const right = 18;
  const top = 18;
  const bottom = 48;
  const width = 1000;
  const height = 260;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;
  const bandWidth = chartWidth / Math.max(categories.length, 1);
  const zeroY = top + ((max - 0) / range) * chartHeight;
  const yGrid = Array.from({ length: 4 }, (_, index) => {
    const y = top + index * (chartHeight / 3);
    const value = max - (index * range) / 3;
    return `<line x1="${left}" y1="${y}" x2="${width - right}" y2="${y}" stroke="rgba(217,221,228,0.2)"/><text x="${left - 8}" y="${y + 4}" text-anchor="end" fill="#b6bbc6" font-size="11">${escapeHtml(yFormatter(value))}</text>`;
  }).join("");
  const groupWidth = bandWidth * 0.72;
  const barWidth = groupWidth / Math.max(seriesConfig.length, 1);
  const bars = categories.map((category, categoryIndex) => seriesConfig.map((series, seriesIndex) => {
    const value = Number(category[series.key] || 0);
    const x = left + categoryIndex * bandWidth + (bandWidth - groupWidth) / 2 + seriesIndex * barWidth;
    const y = top + ((max - Math.max(value, 0)) / range) * chartHeight;
    const barHeight = Math.abs(value / range) * chartHeight;
    const rectY = value >= 0 ? y : zeroY;
    return `<rect x="${x.toFixed(2)}" y="${rectY.toFixed(2)}" width="${Math.max(barWidth - 6, 8).toFixed(2)}" height="${Math.max(barHeight, 0).toFixed(2)}" rx="6" fill="${series.color}" opacity="0.95"/>`;
  }).join("")).join("");
  const xTicks = categories.map((category, index) => {
    const x = left + index * bandWidth + bandWidth / 2;
    return `<text x="${x.toFixed(2)}" y="${height - 14}" text-anchor="middle" fill="#b6bbc6" font-size="10">${escapeHtml(category.label)}</text>`;
  }).join("");
  const legend = seriesConfig.map((series, index) => `<g><rect x="${left + index * 170}" y="8" width="12" height="3" rx="1.5" fill="${series.color}"/><text x="${left + 18 + index * 170}" y="12" fill="#b6bbc6" font-size="11">${escapeHtml(series.name)}</text></g>`).join("");
  container.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(ariaLabel || 'Bar chart')}"><rect x="0" y="0" width="${width}" height="${height}" fill="transparent"/>${legend}${yGrid}<line x1="${left}" y1="${zeroY}" x2="${width - right}" y2="${zeroY}" stroke="rgba(255,255,255,0.24)"/>${bars}${xTicks}</svg>${caption ? `<p class="payout-chart-caption">${escapeHtml(caption)}</p>` : ""}`;
}

function renderPayoutMilestones(analytics) {
  const container = document.getElementById("payoutMilestones");
  if (!container) return;
  const firstPayout = analytics.lifetimePayouts.map((payout) => payout.date).filter(Boolean).sort((a, b) => a.localeCompare(b))[0] || "";
  container.innerHTML = [
    {
      label: "First payout",
      value: formatDateDisplay(firstPayout),
      note: firstPayout ? `First qualifying payout landed ${formatDateDisplay(firstPayout)}.` : "No payouts logged for this filter yet.",
    },
    {
      label: "Largest payout",
      value: analytics.largestPayout ? formatCurrency(getPayoutAbsoluteAmount(analytics.largestPayout)) : "—",
      note: analytics.largestPayout ? `${accountTargetLabel(analytics.largestPayout.accountId)} on ${formatDateDisplay(analytics.largestPayout.date)}.` : "Expand the range or log payouts to surface the largest record.",
    },
    {
      label: "Total lifetime payouts",
      value: formatCurrency(analytics.lifetimeTotalAmount),
      note: `Same target/type/status filters, without the date range.`,
    },
    {
      label: "Current time since last payout",
      value: analytics.daysSinceLatestPayout === null ? "—" : `${Math.round(analytics.daysSinceLatestPayout)} day${Math.round(analytics.daysSinceLatestPayout) === 1 ? "" : "s"}`,
      note: analytics.latestLifetimePayout ? `Last payout was ${formatDateDisplay(analytics.latestLifetimePayout.date)}.` : "No payout cadence yet for this scope.",
    },
  ].map((card) => `<article class="card payout-card payout-milestone-card"><p class="eyebrow">${escapeHtml(card.label)}</p><div class="value">${escapeHtml(card.value)}</div><p class="muted small">${escapeHtml(card.note)}</p></article>`).join("");
}

function renderPayoutTimeline(analytics) {
  const container = document.getElementById("payoutTimeline");
  if (!container) return;
  const items = [];
  if (analytics.selectedPayouts.length) {
    items.push({
      title: "Selected range total",
      value: formatCurrency(analytics.selectedTotalAmount),
      note: `${analytics.selectedPayouts.length} payout record${analytics.selectedPayouts.length === 1 ? "" : "s"} across ${analytics.rangeLabel}.`,
    });
  }
  if (analytics.averageGapDays !== null) {
    items.push({
      title: "Average days between payouts",
      value: `${analytics.averageGapDays.toFixed(1)} days`,
      note: `Based on ${analytics.selectedCompletedPayouts.length} completed payout${analytics.selectedCompletedPayouts.length === 1 ? "" : "s"} in the selected range.`,
    });
  }
  if (analytics.daysFromFirstTradeToFirstPayout !== null) {
    items.push({
      title: "First trade to first payout",
      value: `${analytics.daysFromFirstTradeToFirstPayout} days`,
      note: `From ${formatDateDisplay(analytics.firstTradeDate)} to ${formatDateDisplay(analytics.firstLifetimePayoutDate)}.`,
    });
  }
  if (analytics.payoutRate !== null) {
    items.push({
      title: "Payout rate vs gross profits",
      value: `${analytics.payoutRate.toFixed(1)}%`,
      note: `${formatCurrency(analytics.selectedPayoutOutflows)} paid out against ${formatCurrency(analytics.selectedGrossTradingProfit)} of gross trading profits.`,
    });
  }
  if (analytics.averageBufferLeft !== null) {
    items.push({
      title: "Average buffer left",
      value: formatCurrency(analytics.averageBufferLeft),
      note: `Average bufferAfterPayout value across the current payout selection.`,
    });
  }
  if (!items.length) {
    container.innerHTML = '<p class="payout-timeline-empty">No payout milestones match the current filters yet.</p>';
    return;
  }
  container.innerHTML = items.map((item) => `<article class="payout-timeline-item"><div class="payout-timeline-marker"><span class="payout-timeline-dot"></span></div><div class="payout-timeline-content"><div class="payout-timeline-row"><strong>${escapeHtml(item.title)}</strong><span class="pill payout-pill">${escapeHtml(item.value)}</span></div><p>${escapeHtml(item.note)}</p></div></article>`).join("");
}

function renderBreakdownPanel({ title, note, rows, emptyMessage, valueFormatter = formatCurrency, metaFormatter } = {}) {
  const limitedRows = (rows || []).slice(0, 6);
  const content = limitedRows.length
    ? `<div class="payout-breakdown-list">${limitedRows.map((row) => `<div class="payout-breakdown-item"><div class="payout-breakdown-row"><strong>${escapeHtml(row.label)}</strong><span class="payout-breakdown-value">${escapeHtml(valueFormatter(row.value))}</span></div><div class="payout-breakdown-meta">${escapeHtml(metaFormatter ? metaFormatter(row) : `${row.records || 0} record${row.records === 1 ? "" : "s"}`)}</div></div>`).join("")}</div>`
    : `<p class="payout-breakdown-empty">${escapeHtml(emptyMessage || "No payout records match this view yet.")}</p>`;
  return `<section class="payout-breakdown-panel"><div><p class="eyebrow">Breakdown</p><div class="payout-breakdown-row"><strong>${escapeHtml(title || "—")}</strong></div><p class="muted small">${escapeHtml(note || "")}</p></div>${content}</section>`;
}

function renderPayoutReviewSummary(analytics) {
  const container = document.getElementById("payoutReviewSummary");
  if (!container) return;
  const weeklyCoverage = analytics.profitableWeeksWithPayout;
  const monthlyCoverage = analytics.profitableMonthsWithPayout;
  const performance = analytics.performanceAroundPayouts;
  const completedOutflowCount = analytics.selectedCompletedPayouts.filter((payout) => !isPayoutRefundLike(payout)).length;
  const metrics = [
    {
      label: "Profitable weeks ending with payout",
      value: weeklyCoverage.percentage === null ? "—" : `${weeklyCoverage.percentage.toFixed(1)}%`,
      note: weeklyCoverage.profitableCount ? `${weeklyCoverage.withPayoutCount} of ${weeklyCoverage.profitableCount} profitable weeks in the selected range had a completed payout.` : "No profitable weeks matched the current payout filters.",
    },
    {
      label: "Profitable months ending with payout",
      value: monthlyCoverage.percentage === null ? "—" : `${monthlyCoverage.percentage.toFixed(1)}%`,
      note: monthlyCoverage.profitableCount ? `${monthlyCoverage.withPayoutCount} of ${monthlyCoverage.profitableCount} profitable months in the selected range had a completed payout.` : "No profitable months matched the current payout filters.",
    },
    {
      label: "Average time between payouts",
      value: analytics.averageGapDays === null ? "—" : `${analytics.averageGapDays.toFixed(1)} days`,
      note: analytics.selectedCompletedPayouts.length > 1 ? `Calculated from ${analytics.selectedCompletedPayouts.length} completed payout dates.` : "Need at least two completed payouts in range to measure cadence.",
    },
    {
      label: "Average completed payout size",
      value: completedOutflowCount ? formatCurrency(analytics.selectedPayoutOutflows / completedOutflowCount) : "—",
      note: completedOutflowCount ? `Based on ${completedOutflowCount} completed outflow payout record${completedOutflowCount === 1 ? "" : "s"}, using stored payout amounts.` : "No completed withdrawal outflows in the filtered selection yet.",
    },
  ];
  const comparisonNote = performance.comparableCount
    ? `Using the ${performance.windowSize} trading sessions before and after each completed payout date, ${performance.improvedCount} payout window${performance.improvedCount === 1 ? "" : "s"} improved after the withdrawal while ${performance.worsenedCount} worsened.`
    : "Need completed payouts plus trading sessions on both sides of the payout date to compare before vs after performance.";
  const comparisonMetrics = [
    {
      label: "Before payout avg/session",
      value: performance.beforeAverageNet === null ? "—" : formatCurrency(performance.beforeAverageNet),
      note: performance.beforeWinRate === null ? "No comparable pre-payout sessions yet." : `${performance.beforeWinRate.toFixed(1)}% win rate across sampled sessions.`,
    },
    {
      label: "After payout avg/session",
      value: performance.afterAverageNet === null ? "—" : formatCurrency(performance.afterAverageNet),
      note: performance.afterWinRate === null ? "No comparable post-payout sessions yet." : `${performance.afterWinRate.toFixed(1)}% win rate across sampled sessions.`,
    },
    {
      label: "Net shift after payouts",
      value: performance.beforeAverageNet === null || performance.afterAverageNet === null ? "—" : formatCurrency(performance.afterAverageNet - performance.beforeAverageNet),
      note: comparisonNote,
    },
  ];
  container.innerHTML = `<div class="payout-review-metrics">${metrics.map((item) => `<article class="payout-review-metric"><p class="eyebrow">${escapeHtml(item.label)}</p><div class="value">${escapeHtml(item.value)}</div><p class="payout-review-note">${escapeHtml(item.note)}</p></article>`).join("")}</div><div class="payout-review-metrics">${comparisonMetrics.map((item) => `<article class="payout-review-metric"><p class="eyebrow">${escapeHtml(item.label)}</p><div class="value">${escapeHtml(item.value)}</div><p class="payout-review-note">${escapeHtml(item.note)}</p></article>`).join("")}</div>`;
}

function renderPayoutMetadataBreakdowns(analytics) {
  const container = document.getElementById("payoutMetadataBreakdowns");
  if (!container) return;
  container.innerHTML = [
    renderBreakdownPanel({
      title: "Payouts by reason",
      note: "Uses each payout record’s note field (fallback: legacy reason).",
      rows: analytics.byReason.map((row) => ({ ...row, value: row.totalAmount })),
      emptyMessage: "Add notes to break down payout intent.",
      metaFormatter: (row) => `${row.records} record${row.records === 1 ? "" : "s"} · ${row.completedRecords} completed`,
    }),
    renderBreakdownPanel({
      title: "Payouts by destination",
      note: "Based on saved destination metadata such as bank, wallet, or reserve.",
      rows: analytics.byDestination.map((row) => ({ ...row, value: row.totalAmount })),
      emptyMessage: "Add payout destinations to see where funds are flowing.",
      metaFormatter: (row) => `${row.records} record${row.records === 1 ? "" : "s"} · outflows ${formatCurrency(row.outflowAmount)}`,
    }),
    renderBreakdownPanel({
      title: "Payouts by account / group",
      note: "Rolls up totals from the payout record’s stored accountId target.",
      rows: analytics.byAccountGroup.map((row) => ({ ...row, value: row.totalAmount })),
      emptyMessage: "No payout targets match the current filters.",
      metaFormatter: (row) => `${row.records} record${row.records === 1 ? "" : "s"} · completed ${row.completedRecords}`,
    }),
    renderBreakdownPanel({
      title: "Recurring vs non-recurring",
      note: "Reads the saved isRecurring flag instead of inferring cadence.",
      rows: analytics.byRecurrence.map((row) => ({ ...row, value: row.totalAmount })),
      emptyMessage: "No payout recurrence metadata is available yet.",
      metaFormatter: (row) => `${row.records} record${row.records === 1 ? "" : "s"} · avg ${formatCurrency(row.records ? row.totalAmount / row.records : 0)}`,
    }),
    renderBreakdownPanel({
      title: "Average payout size by month",
      note: "Completed payouts grouped by calendar month.",
      rows: analytics.averageSizeByMonth.map((row) => ({ ...row, value: row.averageAmount })),
      emptyMessage: "Complete payouts in at least one month to measure monthly average size.",
      metaFormatter: (row) => `${row.records} payout${row.records === 1 ? "" : "s"} · total ${formatCurrency(row.totalAmount)}`,
    }),
    renderBreakdownPanel({
      title: "Average payout size by week",
      note: "Completed payouts grouped by actual payout week.",
      rows: analytics.averageSizeByWeek.map((row) => ({ ...row, value: row.averageAmount })),
      emptyMessage: "Complete payouts in at least one week to measure weekly average size.",
      metaFormatter: (row) => `${row.records} payout${row.records === 1 ? "" : "s"} · total ${formatCurrency(row.totalAmount)}`,
    }),
  ].join("");
}

function renderPayoutCharts(analytics) {
  const cumulativePoints = analytics.selectedPayouts
    .slice()
    .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")) || String(a.id || "").localeCompare(String(b.id || "")))
    .reduce((points, payout) => {
      const previous = points.at(-1)?.value || 0;
      points.push({ label: payout.date.slice(5), value: previous + getPayoutAbsoluteAmount(payout) });
      return points;
    }, []);
  if (cumulativePoints.length) {
    renderLineChart("payoutCumulativeChart", [{ name: "Cumulative payouts", color: "#8d7dff", data: cumulativePoints }], {
      ariaLabel: "Cumulative payouts over time",
      caption: analytics.rangeLabel,
    });
  } else {
    renderChartEmptyState("payoutCumulativeChart", "Add payouts in the selected range to build a cumulative view.");
  }

  const monthlyTotals = [...analytics.selectedPayouts.reduce((map, payout) => {
    const key = String(payout.date || "").slice(0, 7);
    if (!key) return map;
    map.set(key, (map.get(key) || 0) + getPayoutAbsoluteAmount(payout));
    return map;
  }, new Map()).entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([key, value]) => ({
    label: key.slice(5),
    payouts: value,
  }));
  renderBarChart("payoutMonthlyChart", monthlyTotals, [{ key: "payouts", name: "Payouts", color: "#5fd5ff" }], {
    ariaLabel: "Monthly payout totals",
    caption: monthlyTotals.length ? `${monthlyTotals.length} month bucket${monthlyTotals.length === 1 ? "" : "s"} in range.` : "",
  });

  const weeklyTotals = [...analytics.selectedPayouts.reduce((map, payout) => {
    const key = getWeeklyBucketStart(payout.date);
    if (!key) return map;
    map.set(key, (map.get(key) || 0) + getPayoutAbsoluteAmount(payout));
    return map;
  }, new Map()).entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([key, value]) => ({
    label: key.slice(5),
    payouts: value,
  }));
  renderBarChart("payoutWeeklyChart", weeklyTotals, [{ key: "payouts", name: "Payouts", color: "#7be0ad" }], {
    ariaLabel: "Weekly payout totals",
    caption: weeklyTotals.length ? `${weeklyTotals.length} weekly bucket${weeklyTotals.length === 1 ? "" : "s"} in range.` : "",
  });

  const comparisonByMonth = new Map();
  analytics.selectedTradeEntries.forEach((entry) => {
    const key = String(entry.session.date || "").slice(0, 7);
    if (!key) return;
    const current = comparisonByMonth.get(key) || { grossProfit: 0, payouts: 0 };
    current.grossProfit += Math.max(0, entry.net);
    comparisonByMonth.set(key, current);
  });
  analytics.selectedCompletedPayouts.forEach((payout) => {
    const key = String(payout.date || "").slice(0, 7);
    if (!key) return;
    const current = comparisonByMonth.get(key) || { grossProfit: 0, payouts: 0 };
    current.payouts += isPayoutRefundLike(payout) ? 0 : getPayoutAbsoluteAmount(payout);
    comparisonByMonth.set(key, current);
  });
  const comparisonCategories = [...comparisonByMonth.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([key, value]) => ({ label: key.slice(5), ...value }));
  renderBarChart("payoutComparisonChart", comparisonCategories, [
    { key: "grossProfit", name: "Gross profit", color: "#d9dde4" },
    { key: "payouts", name: "Payouts", color: "#8d7dff" },
  ], {
    ariaLabel: "Gross profit versus payouts comparison",
    caption: comparisonCategories.length ? "Positive trade PnL versus completed payout outflows by month." : analytics.selectedTradeEntries.length || analytics.selectedCompletedPayouts.length ? analytics.rangeLabel : "",
  });

  const sessionNetByDate = new Map();
  getFilteredSessions({ accountId: uiState.filters.payoutAccountId, from: analytics.selectedFilters.from, to: analytics.selectedFilters.to })
    .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")))
    .forEach((session) => {
      if (!session.date) return;
      sessionNetByDate.set(session.date, (sessionNetByDate.get(session.date) || 0) + getSessionNetForFilter(session, uiState.filters.payoutAccountId));
    });
  const payoutDeltaByDate = new Map();
  analytics.selectedCompletedPayouts.forEach((payout) => {
    payoutDeltaByDate.set(payout.date, (payoutDeltaByDate.get(payout.date) || 0) + getPayoutSignedBalanceDelta(payout));
  });
  const eventDates = [...new Set([...sessionNetByDate.keys(), ...payoutDeltaByDate.keys()])].sort((a, b) => a.localeCompare(b));
  const balanceData = [];
  let runningBalance = getStartingBalanceForTarget(uiState.filters.payoutAccountId);
  if (eventDates.length) {
    eventDates.forEach((date) => {
      runningBalance += (sessionNetByDate.get(date) || 0) + (payoutDeltaByDate.get(date) || 0);
      balanceData.push({ label: date.slice(5), value: runningBalance });
    });
  }
  if (balanceData.length) {
    renderLineChart("payoutBalanceChart", [{ name: "Balance after payouts", color: "#7be0ad", data: balanceData }], {
      ariaLabel: "Account balance after payouts over time",
      caption: `Starting balance ${formatCurrency(getStartingBalanceForTarget(uiState.filters.payoutAccountId))}.`,
    });
  } else {
    renderChartEmptyState("payoutBalanceChart", "Add trades or completed payouts in the selected range to chart balance after payouts.");
  }
}

function renderPayoutRows(payouts) {
  return payouts.map((payout) => `
    <tr>
      <td><input type="date" data-payout-k="date" data-payout-id="${payout.id}" value="${escapeHtml(payout.date || "")}" /></td>
      <td><select data-payout-k="accountId" data-payout-id="${payout.id}">${targetOptionsWithLegacy(payout.accountId)}</select></td>
      <td><input type="number" step="0.01" data-payout-k="amount" data-payout-id="${payout.id}" value="${toInputNumericValue(payout.amount)}" /></td>
      <td><select data-payout-k="type" data-payout-id="${payout.id}">${payoutTypeOptions(payout.type)}</select></td>
      <td><select data-payout-k="destination" data-payout-id="${payout.id}">${payoutDestinationOptions(payout.destination)}</select></td>
      <td><select data-payout-k="status" data-payout-id="${payout.id}">${payoutStatusOptions(payout.status)}</select></td>
      <td><textarea rows="2" data-payout-k="note" data-payout-id="${payout.id}" placeholder="Notes">${escapeHtml(payout.note || "")}</textarea></td>
      <td><button type="button" data-del-payout="${payout.id}">Delete</button></td>
    </tr>
  `).join("");
}

function renderPayoutDraft() {
  syncPayoutDraftTarget();
  const accountInput = document.getElementById("payoutDraftAccountId");
  const dateInput = document.getElementById("payoutDraftDate");
  const amountInput = document.getElementById("payoutDraftAmount");
  const typeInput = document.getElementById("payoutDraftType");
  const destinationInput = document.getElementById("payoutDraftDestination");
  const noteInput = document.getElementById("payoutDraftNote");
  const walletHint = document.getElementById("payoutDraftWalletHint");
  if (accountInput) accountInput.innerHTML = targetOptionsWithLegacy(uiState.payoutDraft.accountId);
  if (dateInput && document.activeElement !== dateInput) dateInput.value = uiState.payoutDraft.date;
  if (amountInput && document.activeElement !== amountInput) amountInput.value = uiState.payoutDraft.amount;
  if (typeInput) typeInput.innerHTML = payoutTypeOptions(uiState.payoutDraft.type);
  if (destinationInput) destinationInput.innerHTML = payoutDestinationOptions(uiState.payoutDraft.destination);
  if (noteInput && document.activeElement !== noteInput) noteInput.value = uiState.payoutDraft.note;
  if (walletHint) {
    walletHint.textContent = uiState.payoutDraft.destination === "Wallet"
      ? `Wallet balance after this payout (if completed): ${formatCurrency(getWalletBalance() + getPayoutAbsoluteAmount(uiState.payoutDraft))}`
      : `Current wallet balance: ${formatCurrency(getWalletBalance())}`;
  }
}

function renderPayouts() {
  renderPayoutDraft();
  const scorecards = document.getElementById("payoutScorecards");
  const reviewSummary = document.getElementById("payoutReviewSummary");
  const metadataBreakdowns = document.getElementById("payoutMetadataBreakdowns");
  const list = document.getElementById("payoutList");
  if (!scorecards || !reviewSummary || !metadataBreakdowns || !list) return;
  renderFilterSelects();
  const analytics = getPayoutAnalytics();
  const payouts = analytics.selectedPayouts;
  const completedTotal = payouts.filter((payout) => payout.status === "completed").reduce((sum, payout) => sum + getPayoutAbsoluteAmount(payout), 0);
  const pendingTotal = payouts.filter((payout) => ["planned", "pending", "processing"].includes(payout.status)).reduce((sum, payout) => sum + getPayoutAbsoluteAmount(payout), 0);
  const recurringCount = payouts.filter((payout) => payout.isRecurring).length;
  scorecards.innerHTML = [
    ["Wallet balance", formatCurrency(getWalletBalance()), getWalletBalance() >= 0],
    ["Selected range payouts", formatCurrency(analytics.selectedTotalAmount), analytics.selectedTotalAmount >= 0],
    ["Lifetime payouts", formatCurrency(analytics.lifetimeTotalAmount), analytics.lifetimeTotalAmount >= 0],
    ["Number of payouts", String(payouts.length), true],
    ["Avg / week", analytics.averagePerWeek === null ? "—" : formatCurrency(analytics.averagePerWeek), analytics.averagePerWeek === null || analytics.averagePerWeek >= 0],
    ["Avg / month", analytics.averagePerMonth === null ? "—" : formatCurrency(analytics.averagePerMonth), analytics.averagePerMonth === null || analytics.averagePerMonth >= 0],
    ["Largest payout", analytics.largestPayout ? formatCurrency(getPayoutAbsoluteAmount(analytics.largestPayout)) : "—", !analytics.largestPayout || getPayoutAbsoluteAmount(analytics.largestPayout) >= 0],
    ["Avg days between", analytics.averageGapDays === null ? "—" : `${analytics.averageGapDays.toFixed(1)}d`, analytics.averageGapDays === null || analytics.averageGapDays >= 0],
    ["Trade → first payout", analytics.daysFromFirstTradeToFirstPayout === null ? "—" : `${analytics.daysFromFirstTradeToFirstPayout}d`, analytics.daysFromFirstTradeToFirstPayout === null || analytics.daysFromFirstTradeToFirstPayout >= 0],
    ["Payout rate", analytics.payoutRate === null ? "—" : `${analytics.payoutRate.toFixed(1)}%`, analytics.payoutRate === null || analytics.payoutRate <= 100],
    ["Avg buffer left", analytics.averageBufferLeft === null ? "—" : formatCurrency(analytics.averageBufferLeft), analytics.averageBufferLeft === null || analytics.averageBufferLeft >= 0],
    ["Completed", formatCurrency(completedTotal), true],
    ["Open pipeline", formatCurrency(pendingTotal), true],
    ["Recurring", String(recurringCount), recurringCount > 0],
  ].map(([label, value, good]) => `<div class="card"><div class="muted">${label}</div><div class="value ${good ? "good" : "bad"}">${value}</div></div>`).join("");

  renderPayoutMilestones(analytics);
  renderPayoutReviewSummary(analytics);
  renderPayoutMetadataBreakdowns(analytics);
  renderPayoutTimeline(analytics);
  renderPayoutCharts(analytics);

  if (!payouts.length) {
    list.innerHTML = '<p class="muted">No payouts match the current filters.</p>';
    return;
  }
  list.innerHTML = `<table><thead><tr><th>Date</th><th>Account / Group</th><th>Amount</th><th>Type</th><th>Destination</th><th>Status</th><th>Note</th><th>Actions</th></tr></thead><tbody>${renderPayoutRows(payouts)}</tbody></table>`;
}

function renderDaySessionsModal() {
  const modal = document.getElementById("daySessionsModal");
  const title = document.getElementById("daySessionsModalTitle");
  const list = document.getElementById("daySessionsModalList");
  const addButton = document.getElementById("daySessionsModalAddBtn");
  const date = uiState.daySessionsModalDate;
  if (!modal || !title || !list || !addButton) return;
  if (!date) {
    modal.hidden = true;
    addButton.hidden = true;
    syncBodyScrollLock();
    return;
  }
  title.textContent = `Sessions for ${date}`;
  addButton.hidden = false;
  renderSessionView("day-modal");
  modal.hidden = false;
  syncBodyScrollLock();
}

function openDaySessionsModal(date) {
  if (!date) return;
  uiState.daySessionsModalDate = date;
  renderDaySessionsModal();
}

function closeDaySessionsModal() {
  uiState.daySessionsModalDate = "";
  renderDaySessionsModal();
}

function renderJournal() {
  renderSessionViews(["journal"]);
}

function renderAnalysisInsightCard(containerId, rows, emptyMessage, formatter) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (!rows.length) {
    container.innerHTML = `<p class="analysis-empty-state">${emptyMessage}</p>`;
    return;
  }
  container.innerHTML = `<ul>${rows.map(formatter).join("")}</ul>`;
}

function buildAnalysisTotalsRow(trades, sessions) {
  const totalNet = trades.reduce((sum, { trade, session }) => sum + calcTradeNet(trade, session), 0);
  const winningTrades = trades.filter(({ trade, session }) => calcTradeNet(trade, session) > 0).length;
  const winRate = trades.length ? (winningTrades / trades.length) * 100 : 0;
  const avgR = trades.length ? trades.reduce((sum, { trade }) => sum + calcSignedR(trade), 0) / trades.length : 0;
  const expectancy = trades.length ? totalNet / trades.length : 0;
  const profitFactor = calcProfitFactor(trades);
  return `
    <tr class="analysis-table-summary-row">
      <td><strong>All filtered trades</strong><div class="muted small">${sessions.length} session${sessions.length === 1 ? "" : "s"}</div></td>
      <td>${trades.length}</td>
      <td class="${winRate >= 50 ? "good" : "bad"}">${winRate.toFixed(1)}%</td>
      <td class="${avgR >= 0 ? "good" : "bad"}">${avgR.toFixed(2)}R</td>
      <td class="${totalNet >= 0 ? "good" : "bad"}">${formatCurrency(totalNet)}</td>
      <td class="${expectancy >= 0 ? "good" : "bad"}">${formatCurrency(expectancy)}</td>
      <td class="${profitFactor >= 1 || !Number.isFinite(profitFactor) ? "good" : "bad"}">${formatRatio(profitFactor)}</td>
    </tr>`;
}

function renderAnalysisGroupedTable(rows, totalRows, totals) {
  const container = document.getElementById("analysisGroupedTable");
  if (!container) return;
  const columns = [
    ["setup", "Setup"],
    ["trades", "Trades"],
    ["winRate", "Win Rate"],
    ["avgR", "Avg R"],
    ["net", "Net PnL"],
    ["expectancy", "Expectancy"],
    ["profitFactor", "Profit Factor"],
  ];
  if (!totalRows.length) {
    container.innerHTML = '<p class="analysis-empty-state">No setup data matches the current filters yet.</p>';
    return;
  }
  if (!rows.length) {
    container.innerHTML = `<p class="analysis-empty-state">No setups meet the ${uiState.filters.analysisMinSampleSize}-trade minimum sample size. Lower the threshold to inspect smaller samples.</p><table><tfoot>${buildAnalysisTotalsRow(totals.trades, totals.sessions)}</tfoot></table>`;
    return;
  }
  const hiddenSetupCount = Math.max(0, totalRows.length - rows.length);
  container.innerHTML = `${hiddenSetupCount ? `<p class="analysis-empty-state analysis-table-note">Showing ${rows.length} setup${rows.length === 1 ? "" : "s"} after the ${uiState.filters.analysisMinSampleSize}-trade minimum. Totals below still reflect all filtered trades.</p>` : ""}<table><thead><tr>${columns.map(([key, label]) => {
    const active = uiState.filters.analysisSortKey === key;
    const direction = active ? uiState.filters.analysisSortDirection : "desc";
    const glyph = !active ? "↕" : (direction === "asc" ? "↑" : "↓");
    return `<th><button type="button" class="analysis-sort-btn" data-analysis-sort="${key}"><span>${label}</span><span aria-hidden="true">${glyph}</span></button></th>`;
  }).join("")}</tr></thead><tbody>${rows.map((row) => {
    const selected = uiState.analysisDrilldownSetup === row.setup;
    return `<tr class="analysis-table-row ${selected ? "is-selected" : ""}" tabindex="0" role="button" data-analysis-setup-row="${escapeHtml(row.setup)}">
      <td><strong>${escapeHtml(row.setup)}</strong><div class="muted small">${row.sessions} session${row.sessions === 1 ? "" : "s"}</div></td>
      <td>${row.trades}</td>
      <td class="${row.winRate >= 50 ? "good" : "bad"}">${row.winRate.toFixed(1)}%</td>
      <td class="${row.avgR >= 0 ? "good" : "bad"}">${row.avgR.toFixed(2)}R</td>
      <td class="${row.net >= 0 ? "good" : "bad"}">${formatCurrency(row.net)}</td>
      <td class="${row.expectancy >= 0 ? "good" : "bad"}">${formatCurrency(row.expectancy)}</td>
      <td class="${row.profitFactor >= 1 || !Number.isFinite(row.profitFactor) ? "good" : "bad"}">${formatRatio(row.profitFactor)}</td>
    </tr>`;
  }).join("")}</tbody><tfoot>${buildAnalysisTotalsRow(totals.trades, totals.sessions)}</tfoot></table>`;
}

function renderAnalysisDrilldownModal(row) {
  const modal = document.getElementById("analysisDrilldownModal");
  const title = document.getElementById("analysisDrilldownTitle");
  const meta = document.getElementById("analysisDrilldownMeta");
  const sessionsEl = document.getElementById("analysisDrilldownSessions");
  const tradesEl = document.getElementById("analysisDrilldownTrades");
  if (!modal || !title || !meta || !sessionsEl || !tradesEl) return;
  if (!row) {
    modal.hidden = true;
    syncBodyScrollLock();
    return;
  }
  title.textContent = row.setup;
  meta.innerHTML = [
    `<span class="pill">${row.trades} trade${row.trades === 1 ? "" : "s"}</span>`,
    `<span class="pill">${row.sessions} session${row.sessions === 1 ? "" : "s"}</span>`,
    `<span class="pill ${row.avgR >= 0 ? "good" : "bad"}">${row.avgR.toFixed(2)}R avg</span>`,
    `<span class="pill ${row.net >= 0 ? "good" : "bad"}">${formatCurrency(row.net)}</span>`,
  ].join("");
  const sessions = [...new Map(row.entries.map(({ session }) => [session.id, session])).values()]
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  sessionsEl.innerHTML = sessions.length
    ? sessions.map((session) => {
      const sessionTrades = row.entries.filter((entry) => entry.session.id === session.id);
      const net = sessionTrades.reduce((sum, entry) => sum + entry.net, 0);
      return `<article class="analysis-drilldown-session"><p><strong>${escapeHtml(session.date || "—")}</strong> · ${escapeHtml(accountTargetLabel(session.accountId) || "—")}</p><p class="muted small">${sessionTrades.length} trade${sessionTrades.length === 1 ? "" : "s"} · ${formatCurrency(net)} · Rule adherence ${getSessionRuleAdherence(session) === null ? "N/A" : `${getSessionRuleAdherence(session).toFixed(0)}%`}</p></article>`;
    }).join("")
    : '<p class="analysis-empty-state">No sessions available.</p>';
  tradesEl.innerHTML = row.entries.length
    ? `<table><thead><tr><th>Date</th><th>Account</th><th>Symbol</th><th>Direction</th><th>R</th><th>PnL</th></tr></thead><tbody>${row.entries
      .slice()
      .sort((a, b) => String(b.session.date || "").localeCompare(String(a.session.date || "")) || String(a.trade.entryTime || "").localeCompare(String(b.trade.entryTime || "")))
      .map((entry) => `<tr><td>${escapeHtml(entry.session.date || "—")}</td><td>${escapeHtml(accountTargetLabel(getTradeAccountTargetId(entry.trade, entry.session)) || "—")}</td><td>${escapeHtml(String(entry.trade.symbol || "—").toUpperCase())}</td><td>${escapeHtml(entry.trade.type === "short" ? "Short" : "Long")}</td><td class="${entry.signedR >= 0 ? "good" : "bad"}">${entry.signedR.toFixed(2)}R</td><td class="${entry.net >= 0 ? "good" : "bad"}">${formatCurrency(entry.net)}</td></tr>`).join("")}</tbody></table>`
    : '<p class="analysis-empty-state">No trades available.</p>';
  modal.hidden = false;
  syncBodyScrollLock();
}

function openAnalysisDrilldown(setup) {
  uiState.analysisDrilldownSetup = setup || "";
  renderAnalysis();
}

function closeAnalysisDrilldown() {
  uiState.analysisDrilldownSetup = "";
  renderAnalysisDrilldownModal(null);
  renderAnalysis();
}

function renderAnalysis() {
  const scorecards = document.getElementById("analysisScorecards");
  const symbolList = document.getElementById("analysisSymbolList");
  const dayList = document.getElementById("analysisDayList");
  const thresholdInput = document.getElementById("analysisMinSampleSize");
  if (!scorecards || !symbolList || !dayList || !thresholdInput) return;

  renderFilterSelects();
  if (document.activeElement !== thresholdInput) thresholdInput.value = String(uiState.filters.analysisMinSampleSize || 1);
  const { sessions, trades } = getAnalysisFilteredTrades();
  const totalNet = trades.reduce((sum, { trade, session }) => sum + calcTradeNet(trade, session), 0);
  const winningTrades = trades.filter(({ trade, session }) => calcTradeNet(trade, session) > 0).length;
  const avgTradeR = trades.length ? trades.reduce((sum, { trade }) => sum + calcSignedR(trade), 0) / trades.length : 0;
  const winRate = trades.length ? (winningTrades / trades.length) * 100 : 0;
  const profitFactor = calcProfitFactor(trades);
  const expectancy = trades.length ? totalNet / trades.length : 0;

  scorecards.innerHTML = [
    ["Trades", `${trades.length}`, true],
    ["Win Rate", `${winRate.toFixed(1)}%`, winRate >= 50],
    ["Avg R", `${avgTradeR.toFixed(2)}R`, avgTradeR >= 0],
    ["Net PnL", formatCurrency(totalNet), totalNet >= 0],
    ["Profit Factor", formatRatio(profitFactor), profitFactor >= 1 || !Number.isFinite(profitFactor)],
    ["Expectancy", formatCurrency(expectancy), expectancy >= 0],
  ]
    .map(([label, value, good]) => `<div class="card"><div class="muted">${label}</div><div class="value ${good ? "good" : "bad"}">${value}</div></div>`)
    .join("");

  const setupRows = getAnalysisSetupRows(trades);
  const minSample = Math.max(1, Number(uiState.filters.analysisMinSampleSize) || 1);
  const eligibleRows = setupRows.filter((row) => row.trades >= minSample);
  const sortedRows = sortAnalysisSetupRows(eligibleRows);
  if (uiState.analysisDrilldownSetup && !setupRows.some((row) => row.setup === uiState.analysisDrilldownSetup)) uiState.analysisDrilldownSetup = "";

  renderAnalysisInsightCard(
    "analysisBestSetupCard",
    [...eligibleRows].sort((a, b) => b.avgR - a.avgR || b.net - a.net || b.trades - a.trades).slice(0, 3),
    "No setups meet the current sample-size threshold.",
    (row) => `<li><strong>${escapeHtml(row.setup)}</strong> <span class="pill ${row.avgR >= 0 ? "good" : "bad"}">${row.avgR.toFixed(2)}R</span><span class="muted"> · ${row.trades} trades · ${formatCurrency(row.net)}</span></li>`,
  );
  renderAnalysisInsightCard(
    "analysisWorstSetupCard",
    [...eligibleRows].sort((a, b) => a.avgR - b.avgR || a.net - b.net || b.trades - a.trades).slice(0, 3),
    "No setups meet the current sample-size threshold.",
    (row) => `<li><strong>${escapeHtml(row.setup)}</strong> <span class="pill ${row.avgR >= 0 ? "good" : "bad"}">${row.avgR.toFixed(2)}R</span><span class="muted"> · ${row.trades} trades · ${formatCurrency(row.net)}</span></li>`,
  );

  const ruleImpact = getRuleImpactStats();
  const ruleImpactCard = document.getElementById("analysisRuleImpactCard");
  if (ruleImpactCard) {
    if (!ruleImpact) {
      ruleImpactCard.innerHTML = '<p class="analysis-empty-state">Add at least one checkbox rule to compare followed vs not followed sessions.</p>';
    } else {
      const followedExpectancy = ruleImpact.followed.trades ? ruleImpact.followed.net / ruleImpact.followed.trades : 0;
      const failedExpectancy = ruleImpact.notFollowed.trades ? ruleImpact.notFollowed.net / ruleImpact.notFollowed.trades : 0;
      const delta = followedExpectancy - failedExpectancy;
      const followedWinRate = ruleImpact.followed.trades ? (ruleImpact.followed.wins / ruleImpact.followed.trades) * 100 : 0;
      const failedWinRate = ruleImpact.notFollowed.trades ? (ruleImpact.notFollowed.wins / ruleImpact.notFollowed.trades) * 100 : 0;
      ruleImpactCard.innerHTML = `
        <div class="analysis-rule-impact">
          <article class="analysis-rule-impact-block">
            <div class="analysis-rule-impact-head">
              <strong>Followed</strong>
              <span class="pill ${followedExpectancy >= 0 ? "good" : "bad"}">${formatCurrency(followedExpectancy)} / trade</span>
            </div>
            <p class="muted small">${ruleImpact.followed.trades} trades · ${followedWinRate.toFixed(1)}% win rate · ${formatCurrency(ruleImpact.followed.net)} net</p>
          </article>
          <article class="analysis-rule-impact-block">
            <div class="analysis-rule-impact-head">
              <strong>Not followed</strong>
              <span class="pill ${failedExpectancy >= 0 ? "good" : "bad"}">${formatCurrency(failedExpectancy)} / trade</span>
            </div>
            <p class="muted small">${ruleImpact.notFollowed.trades} trades · ${failedWinRate.toFixed(1)}% win rate · ${formatCurrency(ruleImpact.notFollowed.net)} net</p>
          </article>
          <article class="analysis-rule-impact-summary">
            <span class="muted small">Expectancy delta</span>
            <strong class="${delta >= 0 ? "good" : "bad"}">${delta >= 0 ? "+" : ""}${formatCurrency(delta).replace(/^\+?/, "")}</strong>
          </article>
        </div>
      `;
    }
  }

  renderAnalysisGroupedTable(sortedRows, setupRows, { trades, sessions });
  const selectedRow = setupRows.find((row) => row.setup === uiState.analysisDrilldownSetup) || null;
  renderAnalysisDrilldownModal(selectedRow);

  const symbolStats = new Map();
  trades.forEach(({ trade, session }) => {
    const symbol = String(trade.symbol || "").trim().toUpperCase();
    if (!symbol) return;
    const current = symbolStats.get(symbol) || { net: 0, trades: 0 };
    current.net += calcTradeNet(trade, session);
    current.trades += 1;
    symbolStats.set(symbol, current);
  });
  const topSymbols = [...symbolStats.entries()]
    .map(([symbol, stats]) => ({ symbol, ...stats }))
    .sort((a, b) => b.net - a.net || b.trades - a.trades || a.symbol.localeCompare(b.symbol))
    .slice(0, 5);
  symbolList.innerHTML = topSymbols.length
    ? topSymbols.map((symbol) => `<li><span class="pill">${escapeHtml(symbol.symbol)}</span> ${formatCurrency(symbol.net)} <span class="muted">· ${symbol.trades} trade${symbol.trades === 1 ? "" : "s"}</span></li>`).join("")
    : "<li>No symbol data yet.</li>";

  const dayTotals = new Map();
  trades.forEach(({ session, trade }) => {
    const date = session.date || "—";
    const current = dayTotals.get(date) || { date, net: 0, trades: 0 };
    current.net += calcTradeNet(trade, session);
    current.trades += 1;
    dayTotals.set(date, current);
  });
  const dayStats = [...dayTotals.values()]
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 10);
  dayList.innerHTML = dayStats.length
    ? dayStats.map((day) => `<li><strong>${escapeHtml(day.date)}</strong> <span class="${day.net >= 0 ? "good" : "bad"}">${formatCurrency(day.net)}</span> <span class="muted">· ${day.trades} trade${day.trades === 1 ? "" : "s"}</span></li>`).join("")
    : `<li>No results match the current filters.${sessions.length ? "" : " Add sessions to see analysis."}</li>`;
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
  document.getElementById("ruleDetailTitle").textContent = "Edit Rule";
  document.getElementById("saveRuleBtn").textContent = "Save Rule";
  document.getElementById("ruleDetailModal").hidden = false;
  syncBodyScrollLock();
}

function closeRuleModal() {
  document.getElementById("ruleDetailModal").hidden = true;
  uiState.activeRuleId = null;
  if (document.getElementById("imageModal").hidden && document.getElementById("playbookDetailModal").hidden && document.getElementById("linkModal").hidden && document.getElementById("accountDetailModal").hidden && document.getElementById("accountGroupPickerModal").hidden && document.getElementById("groupBuilderModal").hidden && document.getElementById("accountEntityModal").hidden) {
    syncBodyScrollLock();
  }
}

function renderPlaybook() {
  document.getElementById("playbookList").innerHTML =
    state.playbook
      .map((setup) => `
        <article class="playbook-card" data-open-playbook="${setup.id}">
          <div class="playbook-card-head">
            <h4>${escapeHtml(setup.title)}</h4>
            <div><span class="pill">Setup</span> <button type="button" class="danger" data-remove-setup="${setup.id}">Remove</button></div>
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
      .split(/(?:\r?\n|,)+/)
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
  syncBodyScrollLock();
}

function closeLinkModal() {
  document.getElementById("linkModal").hidden = true;
  uiState.activeLinkSessionId = null;
  if (document.getElementById("imageModal").hidden && document.getElementById("playbookDetailModal").hidden && document.getElementById("ruleDetailModal").hidden) syncBodyScrollLock();
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
  syncBodyScrollLock();
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
  if (document.getElementById("linkModal").hidden && document.getElementById("playbookDetailModal").hidden && document.getElementById("ruleDetailModal").hidden) syncBodyScrollLock();
}

function rerender() {
  refreshGroupMaxAccounts();
  saveState();
  renderFilterSelects();
  renderOverview();
  renderPayouts();
  renderJournal();
  renderAnalysis();
  renderSymbols();
  renderDaySessionsModal();
  renderRules();
  renderPlaybook();
  renderMistakes();
  renderAccounts();
  renderUndoState();
}

function createPayoutWithDefaults(date = todayIso()) {
  return normalizePayout({
    id: `po${Date.now()}`,
    accountId: getDefaultPayoutTargetId(),
    date,
    amount: 0,
    type: PAYOUT_TYPE_OPTIONS[0],
    destination: "",
    reason: "",
    profitPeriodStart: "",
    profitPeriodEnd: "",
    bufferAfterPayout: 0,
    percentageOfProfitWithdrawn: 0,
    percentageOfAccountWithdrawn: 0,
    isRecurring: false,
    status: "planned",
    referenceId: "",
    note: "",
  });
}

function getDefaultSessionTargetId(preferredTargetId = "") {
  const normalizedPreferredTargetId = String(preferredTargetId || "").trim();
  if (normalizedPreferredTargetId && isActiveTargetId(normalizedPreferredTargetId)) return normalizedPreferredTargetId;
  return state.accounts[0]?.id || state.groups[0]?.id || "";
}

function createSessionWithDefaults(date = todayIso(), preferredTargetId = "") {
  return normalizeSession({
    id: `s${Date.now()}`,
    date: normalizeIsoDate(date, todayIso()),
    day: "",
    mistakes: "",
    correctDecisions: "",
    rules: {},
    accountId: getDefaultSessionTargetId(preferredTargetId),
    collapsed: true,
    trades: [],
  });
}

function addSession(date = todayIso(), preferredTargetId = "") {
  state.sessions.unshift(createSessionWithDefaults(date, preferredTargetId));
  state.sessions.sort(compareSessionDatesDesc);
  rerender();
}

function resetPayoutDraft() {
  uiState.payoutDraft = createPayoutDraft();
}

function addPayoutFromDraft() {
  syncPayoutDraftTarget();
  state.payouts.unshift(normalizePayout({
    id: `po${Date.now()}`,
    accountId: uiState.payoutDraft.accountId,
    date: normalizeIsoDate(uiState.payoutDraft.date, todayIso()),
    amount: toNum(uiState.payoutDraft.amount),
    type: normalizePayoutType(uiState.payoutDraft.type),
    destination: normalizePayoutDestination(uiState.payoutDraft.destination),
    note: String(uiState.payoutDraft.note || "").trim(),
    status: "planned",
  }));
  resetPayoutDraft();
  rerender();
}

function addPayout(date = todayIso()) {
  state.payouts.unshift(createPayoutWithDefaults(date));
  rerender();
}

function addTradeToSession(sessionId) {
  const session = state.sessions.find((s) => s.id === sessionId);
  if (!session) return;
  session.trades.unshift({ id: `t${Date.now()}`, accountId: session.accountId || "", symbol: "MNQ", entryTime: "", exitTime: "", setup: "", type: "long", size: 0, entry: 0, exit: 0, stop: 1 });
  rerender();
}

function addRule() {
  const name = document.getElementById("ruleModalNameInput").value.trim();
  const type = document.getElementById("ruleModalTypeInput").value;
  const optionsRaw = document.getElementById("ruleModalOptionsInput").value.trim();
  if (!name) return;

  const options = type === "select" ? optionsRaw.split(",").map((x) => x.trim()).filter(Boolean) : [];
  state.rules.push({ id: `r${Date.now()}`, name, type, options });
  closeRuleModal();
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
  syncBodyScrollLock();
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
  document.getElementById("accountModalFundingSourceInput").value = "bank";
  document.getElementById("accountModalWalletAmountInput").value = "";
  document.getElementById("accountModalWalletAmountWrap").hidden = true;
  document.getElementById("accountModalWalletBalanceHint").textContent = `Current wallet balance: ${formatCurrency(getWalletBalance())}`;
  document.getElementById("accountModalDrawdownInput").value = "";
  document.getElementById("accountModalFirmInput").value = "";
  document.getElementById("accountModalTptSizeInput").value = "";
  document.getElementById("accountModalTptWrap").hidden = true;
  document.getElementById("accountModalGroupPreview").textContent = "No group selected";
  document.getElementById("accountDetailModal").hidden = false;
  syncBodyScrollLock();
}

function closeAccountModal() {
  document.getElementById("accountDetailModal").hidden = true;
  if (document.getElementById("imageModal").hidden && document.getElementById("playbookDetailModal").hidden && document.getElementById("linkModal").hidden && document.getElementById("accountGroupPickerModal").hidden && document.getElementById("groupBuilderModal").hidden && document.getElementById("ruleDetailModal").hidden) syncBodyScrollLock();
}

function saveAccountFromModal() {
  const name = document.getElementById("accountModalNameInput").value.trim();
  const propFirm = document.getElementById("accountModalFirmInput").value;
  const tptSize = Number(document.getElementById("accountModalTptSizeInput").value || 0);
  let startingBalance = Number(document.getElementById("accountModalBalanceInput").value || DEFAULT_STARTING_BALANCE);
  const fundingSource = document.getElementById("accountModalFundingSourceInput").value === "wallet" ? "wallet" : "bank";
  const walletContribution = Math.max(0, toNum(document.getElementById("accountModalWalletAmountInput").value));
  let maxDrawdown = Number(document.getElementById("accountModalDrawdownInput").value || 0);
  const selectedTpt = TPT_ACCOUNT_OPTIONS.find((item) => item.equity === tptSize);
  if (propFirm === "TPT" && selectedTpt) {
    startingBalance = selectedTpt.equity;
    maxDrawdown = selectedTpt.maxDrawdown;
  }
  if (!name || !Number.isFinite(startingBalance) || startingBalance < 0 || !Number.isFinite(maxDrawdown) || maxDrawdown < 0) return;
  if (fundingSource === "wallet") {
    if (!walletContribution) {
      alert("Enter a wallet contribution amount.");
      return;
    }
    if (walletContribution > getWalletBalance()) {
      alert("Wallet contribution cannot exceed current wallet balance.");
      return;
    }
    state.walletBalance = normalizeWalletBalance(state.walletBalance) - walletContribution;
  }

  const newAccount = normalizeAccount({ id: `acc${Date.now()}`, name, startingBalance, maxDrawdown, groupId: uiState.pendingAccountGroupId || "", propFirm, createdAt: todayIso() });
  state.accounts.push(newAccount);
  if (newAccount.groupId) {
    const group = getActiveGroupById(newAccount.groupId);
    if (group) group.memberSnapshots = mergeGroupMemberSnapshots(group.memberSnapshots || [], [snapshotFromAccount(newAccount)]);
  }
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
  syncBodyScrollLock();
}

function closeAccountGroupPickerModal() {
  document.getElementById("accountGroupPickerModal").hidden = true;
  if (document.getElementById("imageModal").hidden && document.getElementById("playbookDetailModal").hidden && document.getElementById("linkModal").hidden && document.getElementById("accountDetailModal").hidden && document.getElementById("groupBuilderModal").hidden && document.getElementById("ruleDetailModal").hidden) syncBodyScrollLock();
}

function refreshGroupBuilderLists() {
  const available = document.getElementById("groupBuilderAvailable");
  const selected = document.getElementById("groupBuilderSelected");
  if (!available || !selected) return;
  const pool = state.accounts.filter((account) => {
    if (!account.groupId || !getActiveGroupById(account.groupId)) return true;
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
    const group = getActiveGroupById(editGroupId);
    uiState.groupBuilderSelection = state.accounts.filter((a) => a.groupId === editGroupId).map((a) => a.id);
    document.getElementById("groupBuilderNameInput").value = group?.name || "";
  } else {
    uiState.groupBuilderSelection = [];
    document.getElementById("groupBuilderNameInput").value = "";
  }
  refreshGroupBuilderLists();
  document.getElementById("groupBuilderModal").hidden = false;
  syncBodyScrollLock();
}

function closeGroupBuilderModal() {
  document.getElementById("groupBuilderModal").hidden = true;
  if (document.getElementById("imageModal").hidden && document.getElementById("playbookDetailModal").hidden && document.getElementById("linkModal").hidden && document.getElementById("accountDetailModal").hidden && document.getElementById("accountGroupPickerModal").hidden && document.getElementById("accountEntityModal").hidden && document.getElementById("ruleDetailModal").hidden) syncBodyScrollLock();
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
    group = normalizeGroup({ id: `grp${Date.now()}`, name, createdAt: todayIso(), maxAccounts: uiState.groupBuilderSelection.length });
    state.groups.push(group);
  }
  state.accounts.forEach((account) => {
    const shouldBelongToGroup = uiState.groupBuilderSelection.includes(account.id);
    if (account.groupId === group.id && !shouldBelongToGroup) updateAccountGroup(account, "", todayIso());
    else if (shouldBelongToGroup && account.groupId !== group.id) updateAccountGroup(account, group.id, todayIso());
  });
  const snapshotMembers = uiState.groupBuilderSelection
    .map((id) => state.accounts.find((account) => account.id === id))
    .filter(Boolean)
    .map(snapshotFromAccount);
  group.memberSnapshots = mergeGroupMemberSnapshots(group.memberSnapshots || [], snapshotMembers);
  group.maxAccounts = Math.max(group.maxAccounts || 0, uiState.groupBuilderSelection.length);
  if (!document.getElementById("accountGroupPickerModal").hidden) {
    uiState.groupPickerSelectedId = group.id;
    renderAccountGroupCards();
  }
  closeGroupBuilderModal();
  rerender();
}

function formatLifeRange(start, end) {
  const formatDate = (value) => {
    if (!value) return "";
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
  };
  const startLabel = formatDate(start);
  const endLabel = formatDate(end);
  if (startLabel && endLabel) return `${startLabel} - ${endLabel}`;
  if (startLabel) return `${startLabel} - active`;
  return "—";
}

function getGroupMemberCards(group) {
  const activeMembers = state.accounts
    .filter((account) => account.groupId === group.id)
    .map((account) => ({ ...snapshotFromAccount(account), isActive: true }));
  const archivedMembers = (group.memberSnapshots || [])
    .filter((member) => !activeMembers.some((active) => active.id === member.id))
    .map((member) => ({ ...member, isActive: false }));
  return [...activeMembers, ...archivedMembers];
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
    const summary = getAccountFinancialSummary(account.id);
    body.innerHTML = `<label>Title<input id="entityAccountNameInput" value="${escapeHtml(account.name)}" /></label><label>Starting equity<input id="entityAccountStartInput" type="number" min="0" step="100" value="${account.startingBalance}" /></label><label>Max drawdown<input id="entityAccountMaxDdInput" type="number" min="0" step="100" value="${account.maxDrawdown || 0}" /></label><label>Group<select id="entityAccountGroupSelect"><option value="">No group</option>${state.groups.map((g) => `<option value="${g.id}" ${account.groupId === g.id ? "selected" : ""}>${escapeHtml(g.name)}</option>`).join("")}</select></label><p class="muted small">Gross trading equity: ${formatCurrency(summary.grossTradingEquity)}</p><p class="muted small">Current balance after payouts: ${formatCurrency(summary.netAccountBalance)}</p><p class="muted small">Gross profit before payouts: ${formatCurrency(summary.grossProfitBeforePayouts)} · Total payouts: ${formatCurrency(summary.totalPayouts)}</p>`;
    actions.innerHTML = `<button type="button" id="saveEntityAccountBtn">Save</button><button type="button" class="danger" id="removeEntityAccountBtn">Remove</button>`;
    document.getElementById("saveEntityAccountBtn").onclick = () => {
      const previousGroupId = account.groupId;
      const nextGroupId = document.getElementById("entityAccountGroupSelect").value;
      account.name = document.getElementById("entityAccountNameInput").value.trim() || account.name;
      account.startingBalance = Math.max(0, Number(document.getElementById("entityAccountStartInput").value || account.startingBalance));
      account.maxDrawdown = Math.max(0, Number(document.getElementById("entityAccountMaxDdInput").value || account.maxDrawdown || 0));
      updateAccountGroup(account, nextGroupId, todayIso());
      if (previousGroupId) {
        const prevGroup = getActiveGroupById(previousGroupId);
        if (prevGroup) prevGroup.memberSnapshots = mergeGroupMemberSnapshots(prevGroup.memberSnapshots || [], [snapshotFromAccount(account)]);
      }
      if (account.groupId) {
        const group = getActiveGroupById(account.groupId);
        if (group) group.memberSnapshots = mergeGroupMemberSnapshots(group.memberSnapshots || [], [snapshotFromAccount(account)]);
      }
      rerender();
      closeAccountEntityModal();
    };
    document.getElementById("removeEntityAccountBtn").onclick = () => { closeAccountEntityModal(); openDeleteEntityModal("account", account.id); };
  } else if (type === "group") {
    const group = getGroupById(id);
    if (!group) return;
    const isArchived = Boolean(group.archivedAt);
    const members = getGroupMemberCards(group);
    const summary = getTradingPerformanceSummary(group.id);
    title.textContent = group.name;
    body.innerHTML = `<p><strong>Status:</strong> ${isArchived ? "Inactive" : "Active"}</p><p><strong>Accounts:</strong> ${getGroupDisplayAccountCount(group.id)}</p><p><strong>Age range:</strong> ${escapeHtml(formatLifeRange(group.createdAt, group.archivedAt))}</p><p><strong>Gross trading equity:</strong> ${formatCurrency(summary.grossTradingEquity)}</p><p><strong>Current balance after payouts:</strong> ${formatCurrency(summary.netAccountBalance)}</p><p><strong>Gross profit before payouts:</strong> ${formatCurrency(summary.grossProfitBeforePayouts)}</p><p><strong>Total payouts:</strong> ${formatCurrency(summary.totalPayouts)}</p><div class="group-member-cards">${members.length
      ? members.map((member) => `<article class="account-thin-card"><span class="account-line"><strong>${escapeHtml(member.name)}</strong> · $${formatWithThousands(member.startingBalance, 0)} · Max DD $${formatWithThousands(member.maxDrawdown || 0, 0)} · ${escapeHtml(member.propFirm || "Custom")} ${member.isActive ? "· active" : "· inactive"}</span></article>`).join("")
      : '<p class="muted small">No account snapshots found.</p>'}</div>`;
    actions.innerHTML = `${isArchived ? "" : `<button type="button" id="editEntityGroupBtn">Edit Members</button>`}<button type="button" class="danger" id="removeEntityGroupBtn">Remove</button>`;
    const editBtn = document.getElementById("editEntityGroupBtn");
    if (editBtn) {
      editBtn.onclick = () => {
        closeAccountEntityModal();
        openGroupBuilderModal(group.id);
      };
    }
    const removeBtn = document.getElementById("removeEntityGroupBtn");
    if (removeBtn) removeBtn.onclick = () => { closeAccountEntityModal(); openDeleteEntityModal("group", group.id); };
  } else {
    return;
  }
  document.getElementById("accountEntityModal").hidden = false;
  syncBodyScrollLock();
}

function closeAccountEntityModal() {
  document.getElementById("accountEntityModal").hidden = true;
  if (document.getElementById("imageModal").hidden && document.getElementById("playbookDetailModal").hidden && document.getElementById("linkModal").hidden && document.getElementById("accountDetailModal").hidden && document.getElementById("accountGroupPickerModal").hidden && document.getElementById("groupBuilderModal").hidden && document.getElementById("ruleDetailModal").hidden && document.getElementById("deleteEntityModal").hidden) syncBodyScrollLock();
}

function openDeleteEntityModal(type, id) {
  const body = document.getElementById("deleteEntityBody");
  if (!body) return;
  let title = "Delete Item";
  let infoHtml = "";
  if (type === "setup") {
    const setup = state.playbook.find((item) => item.id === id);
    if (!setup) return;
    title = "Delete Setup";
    infoHtml = `<p><strong>Name:</strong> ${escapeHtml(setup.title)}</p><p><strong>Confluences:</strong> ${setup.confluences ? escapeHtml(setup.confluences) : "—"}</p>`;
  }
  if (type === "account") {
    const account = state.accounts.find((item) => item.id === id);
    if (!account) return;
    title = "Delete Account";
    infoHtml = `<p><strong>Name:</strong> ${escapeHtml(account.name)}</p><p><strong>Starting equity:</strong> $${formatWithThousands(account.startingBalance, 0)}</p><p><strong>Max drawdown:</strong> $${formatWithThousands(account.maxDrawdown || 0, 0)}</p><p><strong>Group:</strong> ${escapeHtml(account.groupId ? accountTargetLabel(account.groupId) : "—")}</p>`;
  }
  if (type === "group") {
    const group = getGroupById(id);
    if (!group) return;
    const members = getGroupMemberCards(group);
    title = "Delete Group";
    infoHtml = `<p><strong>Name:</strong> ${escapeHtml(group.name)}</p><p><strong>Status:</strong> ${group.archivedAt ? "Inactive" : "Active"}</p><p><strong>Age range:</strong> ${escapeHtml(formatLifeRange(group.createdAt, group.archivedAt))}</p><p><strong>Accounts:</strong></p><ul>${members.length ? members.map((account) => `<li>${escapeHtml(account.name)}</li>`).join("") : "<li>No accounts</li>"}</ul>`;
  }
  if (type === "session") {
    const session = state.sessions.find((item) => item.id === id);
    if (!session) return;
    title = "Delete Session";
    infoHtml = `<p><strong>Date:</strong> ${escapeHtml(session.date || "(no date)")}</p><p><strong>Trades:</strong> ${session.trades.length}</p>`;
  }
  if (type === "trade") {
    const session = state.sessions.find((item) => item.id === id.sessionId);
    const trade = session?.trades.find((item) => item.id === id.tradeId);
    if (!session || !trade) return;
    title = "Delete Trade";
    infoHtml = `<p><strong>Session:</strong> ${escapeHtml(session.date || "(no date)")}</p><p><strong>Symbol:</strong> ${escapeHtml(trade.symbol)}</p><p><strong>Setup:</strong> ${escapeHtml(trade.setup || "—")}</p><p><strong>PnL:</strong> $${calcTradePnl(trade).toFixed(2)}</p>`;
  }
  if (type === "payout") {
    const payout = state.payouts.find((item) => item.id === id);
    if (!payout) return;
    title = "Delete Payout";
    infoHtml = `<p><strong>Date:</strong> ${escapeHtml(payout.date || "—")}</p><p><strong>Target:</strong> ${escapeHtml(accountTargetLabel(payout.accountId) || "—")}</p><p><strong>Type:</strong> ${escapeHtml(payout.type)}</p><p><strong>Amount:</strong> ${formatCurrency(payout.amount)}</p>`;
  }
  if (type === "rule") {
    const rule = state.rules.find((item) => item.id === id);
    if (!rule) return;
    title = "Delete Rule";
    infoHtml = `<p><strong>Name:</strong> ${escapeHtml(rule.name)}</p><p><strong>Type:</strong> ${escapeHtml(rule.type)}</p><p><strong>Options:</strong> ${rule.options?.length ? rule.options.map(escapeHtml).join(", ") : "—"}</p>`;
  }
  uiState.activeDeleteEntity = { type, id };
  document.getElementById("deleteEntityTitle").textContent = title;
  body.innerHTML = infoHtml;
  document.getElementById("deleteEntityModal").hidden = false;
  syncBodyScrollLock();
}

function closeDeleteEntityModal() {
  uiState.activeDeleteEntity = null;
  document.getElementById("deleteEntityModal").hidden = true;
  if (document.getElementById("imageModal").hidden && document.getElementById("playbookDetailModal").hidden && document.getElementById("linkModal").hidden && document.getElementById("accountDetailModal").hidden && document.getElementById("accountGroupPickerModal").hidden && document.getElementById("groupBuilderModal").hidden && document.getElementById("accountEntityModal").hidden && document.getElementById("ruleDetailModal").hidden && document.getElementById("deleteEntityModal").hidden) syncBodyScrollLock();
}

function confirmDeleteEntity() {
  const target = uiState.activeDeleteEntity;
  if (!target) return;
  if (target.type === "session") {
    const index = state.sessions.findIndex((session) => session.id === target.id);
    if (index >= 0) {
      pushDeletionHistory({ type: "session", session: structuredClone(state.sessions[index]), index });
      state.sessions.splice(index, 1);
    }
  } else if (target.type === "setup") {
    const index = state.playbook.findIndex((item) => item.id === target.id);
    const setup = state.playbook[index];
    if (index >= 0 && setup) {
      const removedTitle = setup.title || "";
      pushDeletionHistory({ type: "setup", setup: structuredClone(setup), index });
      state.playbook.splice(index, 1);
      state.sessions.forEach((session) => {
        session.trades.forEach((trade) => {
          if (trade.setup === removedTitle) trade.setup = "";
        });
      });
      if (uiState.activePlaybookSetupId === target.id) {
        uiState.activePlaybookSetupId = null;
        document.getElementById("playbookDetailModal").hidden = true;
      }
    }
  } else if (target.type === "account") {
    const index = state.accounts.findIndex((account) => account.id === target.id);
    const account = state.accounts[index];
    if (index >= 0 && account) {
      const fallback = state.accounts.find((item) => item.id !== target.id)?.id || "";
      const affectedSessionIds = state.sessions.filter((session) => session.accountId === target.id).map((session) => session.id);
      const affectedPayoutIds = state.payouts.filter((payout) => payout.accountId === target.id).map((payout) => payout.id);
      pushDeletionHistory({ type: "account", account: structuredClone(account), index, affectedSessionIds, affectedPayoutIds });
      state.accounts.splice(index, 1);
      state.sessions.forEach((session) => {
        if (session.accountId === target.id) session.accountId = fallback;
      });
      state.payouts.forEach((payout) => {
        if (payout.accountId === target.id) payout.accountId = fallback;
      });
      if (uiState.filters.overviewAccountId === target.id) uiState.filters.overviewAccountId = "all";
      if (uiState.filters.payoutAccountId === target.id) uiState.filters.payoutAccountId = "all";
      if (uiState.filters.journalAccountId === target.id) uiState.filters.journalAccountId = "all";
    }
  } else if (target.type === "group") {
    const index = state.groups.findIndex((group) => group.id === target.id);
    const archivedIndex = state.archivedGroups.findIndex((group) => group.id === target.id);
    const group = state.groups[index] || state.archivedGroups[archivedIndex];
    if (index >= 0 && group) {
      const memberAccountIds = state.accounts.filter((account) => account.groupId === target.id).map((account) => account.id);
      const fallback = state.accounts[0]?.id || "";
      const affectedSessionIds = state.sessions.filter((session) => session.accountId === target.id).map((session) => session.id);
      const affectedPayoutIds = state.payouts.filter((payout) => payout.accountId === target.id).map((payout) => payout.id);
      pushDeletionHistory({ type: "group", group: structuredClone(group), index, memberAccountIds, affectedSessionIds, affectedPayoutIds, archived: false });
      state.groups.splice(index, 1);
      state.accounts.forEach((account) => {
        if (account.groupId === target.id) updateAccountGroup(account, "", todayIso());
      });
      state.sessions.forEach((session) => {
        if (session.accountId === target.id) session.accountId = fallback;
      });
      state.payouts.forEach((payout) => {
        if (payout.accountId === target.id) payout.accountId = fallback;
      });
      if (uiState.filters.overviewAccountId === target.id) uiState.filters.overviewAccountId = "all";
      if (uiState.filters.payoutAccountId === target.id) uiState.filters.payoutAccountId = "all";
      if (uiState.filters.journalAccountId === target.id) uiState.filters.journalAccountId = "all";
    } else if (archivedIndex >= 0 && group) {
      pushDeletionHistory({ type: "group", group: structuredClone(group), index: archivedIndex, archived: true });
      state.archivedGroups.splice(archivedIndex, 1);
      if (uiState.filters.overviewAccountId === target.id) uiState.filters.overviewAccountId = "all";
      if (uiState.filters.payoutAccountId === target.id) uiState.filters.payoutAccountId = "all";
      if (uiState.filters.journalAccountId === target.id) uiState.filters.journalAccountId = "all";
    }
  } else if (target.type === "trade") {
    const session = state.sessions.find((item) => item.id === target.id.sessionId);
    if (session) {
      const index = session.trades.findIndex((trade) => trade.id === target.id.tradeId);
      if (index >= 0) {
        pushDeletionHistory({ type: "trade", sessionId: session.id, trade: structuredClone(session.trades[index]), index });
        session.trades.splice(index, 1);
      }
    }
  } else if (target.type === "payout") {
    const index = state.payouts.findIndex((payout) => payout.id === target.id);
    if (index >= 0) {
      pushDeletionHistory({ type: "payout", payout: structuredClone(state.payouts[index]), index });
      state.payouts.splice(index, 1);
    }
  } else if (target.type === "rule") {
    const index = state.rules.findIndex((rule) => rule.id === target.id);
    const rule = state.rules[index];
    if (index >= 0 && rule) {
      const sessionValues = {};
      state.sessions.forEach((session) => {
        if (session.rules && Object.hasOwn(session.rules, rule.id)) {
          sessionValues[session.id] = structuredClone(session.rules[rule.id]);
          delete session.rules[rule.id];
        }
      });
      pushDeletionHistory({ type: "rule", rule: structuredClone(rule), index, sessionValues });
      state.rules.splice(index, 1);
      if (uiState.activeRuleId === rule.id) closeRuleModal();
    }
  }
  closeDeleteEntityModal();
  rerender();
}

function openDeleteSessionModal(sessionId) {
  openDeleteEntityModal("session", sessionId);
}

function closeDeleteSessionModal() {
  closeDeleteEntityModal();
}

function setCustomSymbolStatus(message) {
  const status = document.getElementById("customSymbolStatus");
  if (status) status.textContent = message;
}

function saveCustomSymbol() {
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
  const editingTicker = uiState.symbolEditor.editingTicker;
  const duplicateExists = state.customSymbols.some((item) => item.ticker === candidate.ticker && item.ticker !== editingTicker);
  if (SYMBOL_OPTIONS.includes(candidate.ticker) || duplicateExists) {
    setCustomSymbolStatus("Ticker already exists.");
    return;
  }
  if (editingTicker) {
    const symbol = state.customSymbols.find((item) => item.ticker === editingTicker);
    if (!symbol) {
      clearCustomSymbolEditor();
      setCustomSymbolStatus("That symbol is no longer available to edit.");
      return;
    }
    const previousTicker = symbol.ticker;
    symbol.ticker = candidate.ticker;
    symbol.tickSize = candidate.tickSize;
    symbol.tickValue = candidate.tickValue;
    if (previousTicker !== candidate.ticker) {
      state.sessions.forEach((session) => {
        session.trades.forEach((trade) => {
          if (String(trade.symbol || "").trim().toUpperCase() === previousTicker) {
            trade.symbol = candidate.ticker;
            trade.entry = snapPriceToSymbol(trade.entry, trade.symbol);
            trade.exit = snapPriceToSymbol(trade.exit, trade.symbol);
          }
        });
      });
      uiState.filters.analysisSymbols = (uiState.filters.analysisSymbols || []).map((item) => item === previousTicker ? candidate.ticker : item);
    }
    setCustomSymbolStatus(`Updated ${candidate.ticker}.`);
  } else {
    state.customSymbols.push(candidate);
    setCustomSymbolStatus(`Added ${candidate.ticker}.`);
  }
  clearCustomSymbolEditor({ preserveStatus: true });
  rerender();
  tickerInput.focus();
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
      state.archivedGroups = (Array.isArray(migrated.archivedGroups) ? migrated.archivedGroups : []).map(normalizeGroup);
      state.walletBalance = normalizeWalletBalance(migrated.walletBalance);
      state.payouts = (Array.isArray(migrated.payouts) ? migrated.payouts : []).map(normalizePayout);
      state.playbook = normalizePlaybook(migrated.playbook?.length ? migrated.playbook : []);
      if (!state.playbook.length) state.playbook = structuredClone(seed.playbook);
      state.rules = migrated.rules;
      state.sessions = migrated.sessions.map(normalizeSession).sort(compareSessionDatesDesc);
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
  state.archivedGroups = structuredClone(seed.archivedGroups || []);
  state.walletBalance = normalizeWalletBalance(seed.walletBalance);
  state.payouts = structuredClone(seed.payouts || []);
  state.playbook = structuredClone(seed.playbook);
  state.rules = structuredClone(seed.rules);
  state.sessions = structuredClone(seed.sessions).sort(compareSessionDatesDesc);
  state.customSymbols = [];
  clearCustomSymbolEditor({ preserveStatus: true });
  rerender();
}

function resetJournalFilters() {
  uiState.filters.journalAccountId = "all";
  uiState.filters.journalFrom = "";
  uiState.filters.journalTo = "";
  renderFilterSelects();
  renderJournal();
}

function resetPayoutFilters() {
  uiState.filters.payoutAccountId = "all";
  uiState.filters.payoutFrom = "";
  uiState.filters.payoutTo = "";
  uiState.filters.payoutType = "all";
  uiState.filters.payoutStatus = "all";
  renderFilterSelects();
  renderPayouts();
}

function updateSessionField(target) {
  const session = state.sessions.find((s) => s.id === target.dataset.sessionId);
  if (!session) return;

  if (target.dataset.sessionK) {
    const key = target.dataset.sessionK;
    if (["mistakes", "correctDecisions"].includes(key)) session[key] = String(target.value).slice(0, SESSION_TEXT_MAX);
    else if (key === "day") session.day = String(target.value || "").replace(/\D/g, "").slice(0, 3);
    else if (key === "date") {
      const previousDate = normalizeIsoDate(session.date, todayIso());
      // Keep the existing date if a date input is cleared so sessions never become undated.
      // If prior data was invalid, fall back to today's ISO date.
      session.date = normalizeIsoDate(target.value, previousDate);
      target.value = session.date;
    } else session[key] = target.value;
  }

  if (target.dataset.sessionRule) {
    const rid = target.dataset.sessionRule;
    if (target.tagName === "TEXTAREA") session.rules[rid] = String(target.value).slice(0, SESSION_TEXT_MAX);
    else session.rules[rid] = target.value;
  }

  state.sessions.sort(compareSessionDatesDesc);
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
      document.querySelectorAll(`[data-trade-k="entry"][data-trade-id="${trade.id}"]`).forEach((entryInput) => {
        entryInput.value = formatTradePrice(trade.entry, trade.symbol);
      });
      document.querySelectorAll(`[data-trade-k="exit"][data-trade-id="${trade.id}"]`).forEach((exitInput) => {
        exitInput.value = formatTradePrice(trade.exit, trade.symbol);
      });
    }
  } else trade[key] = target.value;

  return { session, trade };
}

function updatePayoutField(target) {
  const payout = state.payouts.find((item) => item.id === target.dataset.payoutId);
  if (!payout) return null;
  const key = target.dataset.payoutK;
  if (!key) return null;
  if (key === "isRecurring") payout[key] = Boolean(target.checked);
  else if (["amount", "bufferAfterPayout", "percentageOfProfitWithdrawn", "percentageOfAccountWithdrawn"].includes(key)) payout[key] = toNum(target.value);
  else if (["date", "profitPeriodStart", "profitPeriodEnd"].includes(key)) payout[key] = normalizeIsoDate(target.value);
  else if (key === "type") payout[key] = normalizePayoutType(target.value);
  else if (key === "status") payout[key] = normalizePayoutStatus(target.value);
  else if (key === "destination") payout[key] = normalizePayoutDestination(target.value);
  else payout[key] = String(target.value || "").trim();
  return payout;
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

  const multiplier = getTradeMultiplier(trade, session);
  const totalPnl = pnl * multiplier;
  const tradeTargetId = getTradeAccountTargetId(trade, session);

  document.querySelectorAll(`[data-trade-pnl="${tradeId}"]`).forEach((pnlCell) => {
    pnlCell.innerHTML = `$${pnl.toFixed(2)}${multiplier > 1 ? `<div class="muted small">${escapeHtml(accountTargetLabel(tradeTargetId))}: $${totalPnl.toFixed(2)}</div>` : ""}`;
    pnlCell.classList.toggle("good", totalPnl >= 0);
    pnlCell.classList.toggle("bad", totalPnl < 0);
  });

  document.querySelectorAll(`[data-trade-duration="${tradeId}"]`).forEach((durationCell) => {
    durationCell.textContent = calcTradeDuration(trade);
  });

  document.querySelectorAll(`[data-trade-r="${tradeId}"]`).forEach((rCell) => {
    rCell.textContent = r.toFixed(1);
  });

  const net = getSessionNet(session);
  document.querySelectorAll(`[data-session-net="${sessionId}"]`).forEach((netEl) => {
    netEl.textContent = `$${net.toFixed(2)}`;
    netEl.classList.toggle("good", net >= 0);
    netEl.classList.toggle("bad", net < 0);
  });
}

function syncSessionViewsFromState(sourceContainer, { includeOverview = true, includeMistakes = true, rerenderSource = false } = {}) {
  saveState();
  if (includeOverview) renderOverview();
  renderAnalysis();
  const sourceMode = getSessionModeFromContainer(sourceContainer);
  renderSessionViews(rerenderSource ? [sourceMode] : getCompanionSessionModes(sourceMode));
  if (includeMistakes) renderMistakes();
}

document.getElementById("navTabs").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-tab]");
  if (!btn) return;
  switchTab(btn.dataset.tab);
});

document.getElementById("addSessionBtn").addEventListener("click", () => addSession());
document.getElementById("addPayoutBtn")?.addEventListener("click", addPayoutFromDraft);
document.getElementById("daySessionsModalAddBtn")?.addEventListener("click", () => {
  if (!uiState.daySessionsModalDate) return;
  addSession(uiState.daySessionsModalDate, uiState.filters.overviewAccountId);
});
document.getElementById("resetPayoutFiltersBtn")?.addEventListener("click", resetPayoutFilters);
document.getElementById("resetJournalFiltersBtn")?.addEventListener("click", resetJournalFilters);
document.getElementById("addRuleBtn").addEventListener("click", () => {
  uiState.activeRuleId = null;
  document.getElementById("ruleModalNameInput").value = "";
  document.getElementById("ruleModalTypeInput").value = "checkbox";
  document.getElementById("ruleModalOptionsInput").value = "";
  document.getElementById("ruleModalOptionsWrap").hidden = true;
  document.getElementById("ruleDetailTitle").textContent = "Add Rule";
  document.getElementById("saveRuleBtn").textContent = "+ Add Rule";
  document.getElementById("ruleDetailModal").hidden = false;
  syncBodyScrollLock();
});
document.getElementById("addSetupBtn").addEventListener("click", addSetup);
document.getElementById("addCustomSymbolBtn").addEventListener("click", saveCustomSymbol);
document.getElementById("cancelCustomSymbolBtn")?.addEventListener("click", () => clearCustomSymbolEditor());
document.getElementById("accountsList").addEventListener("click", (e) => {
  const restoreId = e.target.closest("[data-restore-account]")?.dataset.restoreAccount;
  if (restoreId) {
    restoreArchivedAccount(restoreId);
    rerender();
    return;
  }
  const blowupId = e.target.closest("[data-blowup-account]")?.dataset.blowupAccount;
  if (blowupId) {
    archiveAccount(blowupId);
    rerender();
    return;
  }
  const passId = e.target.closest("[data-pass-account]")?.dataset.passAccount;
  if (passId) {
    passAccount(passId);
    rerender();
    return;
  }
  const removeId = e.target.closest("[data-remove-account]")?.dataset.removeAccount;
  if (removeId) {
    openDeleteEntityModal("account", removeId);
    return;
  }
  const accountId = e.target.closest("[data-open-account]")?.dataset.openAccount;
  if (!accountId) return;
  openAccountEntityModal("account", accountId);
});
document.getElementById("groupsList").addEventListener("click", (e) => {
  const blowupId = e.target.closest("[data-blowup-group]")?.dataset.blowupGroup;
  if (blowupId) {
    archiveGroup(blowupId);
    rerender();
    return;
  }
  const removeId = e.target.closest("[data-remove-group]")?.dataset.removeGroup;
  if (removeId) {
    openDeleteEntityModal("group", removeId);
    return;
  }
  const pastGroupId = e.target.closest("[data-open-group-entity]")?.dataset.openGroupEntity;
  if (pastGroupId) {
    openAccountEntityModal("group", pastGroupId);
    return;
  }
  const groupId = e.target.closest("[data-open-group]")?.dataset.openGroup;
  if (!groupId) return;
  openGroupBuilderModal(groupId);
});

document.getElementById("symbolCatalog").addEventListener("click", (e) => {
  const editSymbol = e.target.closest("[data-edit-symbol]")?.dataset.editSymbol;
  if (editSymbol) {
    startEditingCustomSymbol(editSymbol);
    return;
  }
  const delSymbol = e.target.closest("[data-del-symbol]")?.dataset.delSymbol;
  if (!delSymbol) return;
  const usage = getCustomSymbolUsage(delSymbol);
  if (usage.trades) {
    setCustomSymbolStatus(`Can't remove ${delSymbol} while Journal still uses it in ${usage.trades} trade${usage.trades === 1 ? "" : "s"}.`);
    return;
  }
  state.customSymbols = state.customSymbols.filter((item) => item.ticker !== delSymbol);
  if (uiState.symbolEditor.editingTicker === delSymbol) clearCustomSymbolEditor({ preserveStatus: true });
  setCustomSymbolStatus(`Removed ${delSymbol}.`);
  rerender();
});
document.getElementById("exportBtn").addEventListener("click", exportBackup);
document.getElementById("importBtn").addEventListener("click", () => document.getElementById("importInput").click());
document.getElementById("importInput").addEventListener("change", (e) => importBackupFile(e.target.files[0]));
document.getElementById("resetBtn").addEventListener("click", resetToDemo);
document.getElementById("addAccountBtn").addEventListener("click", openAccountModal);
document.getElementById("accountsViewActiveBtn").addEventListener("click", () => { uiState.accountsView = "active"; renderAccounts(); });
document.getElementById("accountsViewPastBtn").addEventListener("click", () => { uiState.accountsView = "past"; renderAccounts(); });
document.getElementById("groupsViewActiveBtn").addEventListener("click", () => { uiState.groupsView = "active"; renderAccounts(); });
document.getElementById("groupsViewPastBtn").addEventListener("click", () => { uiState.groupsView = "past"; renderAccounts(); });
document.getElementById("saveAccountBtn").addEventListener("click", saveAccountFromModal);
document.getElementById("accountModalFirmInput").addEventListener("change", (e) => {
  const wrap = document.getElementById("accountModalTptWrap");
  if (wrap) wrap.hidden = e.target.value !== "TPT";
});
document.getElementById("accountModalFundingSourceInput").addEventListener("change", (e) => {
  const walletWrap = document.getElementById("accountModalWalletAmountWrap");
  const walletHint = document.getElementById("accountModalWalletBalanceHint");
  const isWallet = e.target.value === "wallet";
  if (walletWrap) walletWrap.hidden = !isWallet;
  if (walletHint) walletHint.textContent = `Current wallet balance: ${formatCurrency(getWalletBalance())}`;
});
document.getElementById("accountModalTptSizeInput").addEventListener("change", (e) => {
  const selected = TPT_ACCOUNT_OPTIONS.find((item) => item.equity === Number(e.target.value || 0));
  if (!selected) return;
  document.getElementById("accountModalBalanceInput").value = selected.equity;
  document.getElementById("accountModalDrawdownInput").value = selected.maxDrawdown;
});
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

[["equityAccountFilter","overviewAccountId"],["equityDateFrom","overviewFrom"],["equityDateTo","overviewTo"],["payoutAccountFilter","payoutAccountId"],["payoutDateFrom","payoutFrom"],["payoutDateTo","payoutTo"],["payoutTypeFilter","payoutType"],["payoutStatusFilter","payoutStatus"],["journalAccountFilter","journalAccountId"],["journalDateFrom","journalFrom"],["journalDateTo","journalTo"]].forEach(([id,key]) => {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener("input", (e) => {
    uiState.filters[key] = e.target.value;
    if (key.startsWith("overview")) {
      renderOverview();
      renderDaySessionsModal();
    } else if (key.startsWith("payout")) {
      renderPayouts();
    } else renderJournal();
  });
});

[
  ["analysisDatePreset", "analysisPreset"],
  ["analysisDateFrom", "analysisFrom"],
  ["analysisDateTo", "analysisTo"],
  ["analysisAccountFilter", "analysisAccountId"],
  ["analysisDirectionFilter", "analysisDirection"],
  ["analysisRuleFilterMode", "analysisRuleMode"],
  ["analysisMinSampleSize", "analysisMinSampleSize"],
].forEach(([id, key]) => {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener("input", (e) => {
    uiState.filters[key] = key === "analysisMinSampleSize" ? Math.max(1, Number(e.target.value || 1)) : e.target.value;
    if (key === "analysisPreset" && e.target.value !== "custom") syncAnalysisDateRangeFromPreset();
    renderAnalysis();
  });
});

document.getElementById("equityBalanceToggle")?.addEventListener("change", (e) => {
  uiState.filters.overviewShowBalanceAfterPayouts = Boolean(e.target.checked);
  drawEquity();
});

document.getElementById("analysisResetFiltersBtn")?.addEventListener("click", () => {
  uiState.filters.analysisPreset = "all";
  uiState.filters.analysisFrom = "";
  uiState.filters.analysisTo = "";
  uiState.filters.analysisAccountId = "all";
  uiState.filters.analysisSetups = [];
  uiState.filters.analysisSymbols = [];
  uiState.filters.analysisDirection = "all";
  uiState.filters.analysisRuleMode = "all";
  uiState.filters.analysisMinSampleSize = 3;
  uiState.filters.analysisSortKey = "net";
  uiState.filters.analysisSortDirection = "desc";
  uiState.analysisDrilldownSetup = "";
  renderAnalysis();
});

document.addEventListener("change", (e) => {
  const checkbox = e.target.closest("[data-analysis-multi]");
  if (!checkbox) return;
  const key = checkbox.dataset.analysisMulti;
  const values = new Set(uiState.filters[key] || []);
  if (checkbox.checked) values.add(checkbox.value);
  else values.delete(checkbox.value);
  uiState.filters[key] = [...values];
  renderAnalysis();
});

document.getElementById("analysisGroupedTable")?.addEventListener("click", (e) => {
  const sortButton = e.target.closest("[data-analysis-sort]");
  if (sortButton) {
    const key = sortButton.dataset.analysisSort;
    if (uiState.filters.analysisSortKey === key) uiState.filters.analysisSortDirection = uiState.filters.analysisSortDirection === "asc" ? "desc" : "asc";
    else {
      uiState.filters.analysisSortKey = key;
      uiState.filters.analysisSortDirection = key === "setup" ? "asc" : "desc";
    }
    renderAnalysis();
    return;
  }
  const row = e.target.closest("[data-analysis-setup-row]");
  if (!row) return;
  openAnalysisDrilldown(row.dataset.analysisSetupRow);
});

document.getElementById("analysisGroupedTable")?.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" && e.key !== " ") return;
  const row = e.target.closest("[data-analysis-setup-row]");
  if (!row) return;
  e.preventDefault();
  openAnalysisDrilldown(row.dataset.analysisSetupRow);
});

document.getElementById("analysisDrilldownModal")?.addEventListener("click", (e) => {
  if (e.target.matches("[data-close-analysis-drilldown-modal]")) closeAnalysisDrilldown();
});

document.getElementById("calendarPrevBtn")?.addEventListener("click", () => shiftCalendarMonth(-1));
document.getElementById("calendarNextBtn")?.addEventListener("click", () => shiftCalendarMonth(1));
document.getElementById("calendarMonthSelect")?.addEventListener("input", (e) => {
  uiState.calendar.month = Number(e.target.value || 0);
  syncCalendarState();
  renderOverviewCalendar();
});
document.getElementById("calendarYearSelect")?.addEventListener("input", (e) => {
  uiState.calendar.year = Number(e.target.value || new Date().getFullYear());
  syncCalendarState();
  renderOverviewCalendar();
});
document.getElementById("overviewCalendarGrid")?.addEventListener("click", (e) => {
  const dayButton = e.target.closest("[data-calendar-day]");
  if (!dayButton) return;
  uiState.calendar.selectedDay = Number(dayButton.dataset.calendarDay || 1);
  renderOverviewCalendar();
  openDaySessionsModal(dayButton.dataset.calendarDate || "");
});

document.addEventListener("input", (e) => {
  const payoutTarget = e.target.closest("#payoutList [data-payout-k]");
  if (payoutTarget) {
    updatePayoutField(payoutTarget);
    saveState();
    return;
  }
  const container = e.target.closest("#sessionList, #daySessionsModalList");
  if (!container) return;
  const t = e.target;
  if (t.dataset.sessionK || t.dataset.sessionRule) {
    updateSessionField(t);
    if (t.dataset.sessionK === "date") {
      syncSessionViewsFromState(container, { includeMistakes: true, rerenderSource: true });
      return;
    }
    if (t.tagName === "TEXTAREA") updateAllCounters();
    syncSessionViewsFromState(container, { includeMistakes: true, rerenderSource: false });
  }

  if (t.dataset.tradeK) {
    const updated = updateTradeField(t, false);
    if (updated) updateTradeComputedUI(updated.session.id, updated.trade.id);
    syncSessionViewsFromState(container, { includeMistakes: true, rerenderSource: false });
  }
});


document.getElementById("deleteEntityModal").addEventListener("click", (e) => {
  if (!e.target.matches("[data-close-delete-entity-modal]")) return;
  closeDeleteEntityModal();
});

document.getElementById("cancelDeleteEntityBtn").addEventListener("click", closeDeleteEntityModal);
document.getElementById("confirmDeleteEntityBtn").addEventListener("click", confirmDeleteEntity);
document.getElementById("undoDeleteBtn").addEventListener("click", undoLastDeletion);


document.getElementById("modalShotInput").addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (!file || !uiState.activeImageTarget?.id) return;
  applyScreenshotToTarget(uiState.activeImageTarget, file);
  e.target.value = "";
});

document.addEventListener("change", (e) => {
  const payoutTarget = e.target.closest("#payoutList [data-payout-k]");
  if (payoutTarget) {
    updatePayoutField(payoutTarget);
    saveState();
    renderPayouts();
    return;
  }
  const container = e.target.closest("#sessionList, #daySessionsModalList");
  if (!container) return;
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
    if (t.dataset.sessionK === "date") {
      syncSessionViewsFromState(container, { includeMistakes: true, rerenderSource: true });
      return;
    }
    if (t.tagName === "TEXTAREA") updateAllCounters();
    syncSessionViewsFromState(container, { includeMistakes: true, rerenderSource: false });
  }

  if (t.dataset.tradeK) {
    const updated = updateTradeField(t, true);
    if (updated) updateTradeComputedUI(updated.session.id, updated.trade.id);
    syncSessionViewsFromState(container, { includeMistakes: true, rerenderSource: false });
  }
});

document.addEventListener("click", (e) => {
  const payoutId = e.target.closest("[data-del-payout]")?.dataset.delPayout;
  if (payoutId) {
    openDeleteEntityModal("payout", payoutId);
    return;
  }
  const sessionContainer = e.target.closest("#sessionList, #daySessionsModalList");
  if (!sessionContainer) return;
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
    const sessionCard = e.target.closest(".session-card");
    const fileInput = sessionCard?.querySelector(`[data-session-shot-input="${uploadShotId}"]`) || document.querySelector(`[data-session-shot-input="${uploadShotId}"]`);
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
    openDeleteEntityModal("trade", { sessionId: parentSessionId, tradeId });
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
document.getElementById("daySessionsModal")?.addEventListener("click", (e) => {
  if (e.target.matches("[data-close-day-sessions-modal]")) closeDaySessionsModal();
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
  closeAnalysisDrilldown();
  const playbookModal = document.getElementById("playbookDetailModal");
  if (playbookModal && !playbookModal.hidden) playbookModal.hidden = true;
});

document.getElementById("ruleList").addEventListener("click", (e) => {
  const rid = e.target.dataset.removeRule;
  if (rid) {
    openDeleteEntityModal("rule", rid);
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
  if (!uiState.activeRuleId) {
    addRule();
    return;
  }
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
  openDeleteEntityModal("setup", setupId);
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
  syncBodyScrollLock();
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
    if (document.getElementById("imageModal").hidden && document.getElementById("linkModal").hidden && document.getElementById("ruleDetailModal").hidden) syncBodyScrollLock();
  }
});

document.addEventListener("keydown", (e) => {
  const isUndo = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z";
  if (!isUndo || e.shiftKey || e.altKey) return;
  const tag = String(document.activeElement?.tagName || "").toLowerCase();
  const typing = ["input", "textarea"].includes(tag) || document.activeElement?.isContentEditable;
  if (typing) return;
  if (!uiState.deletionHistory.length) return;
  e.preventDefault();
  undoLastDeletion();
});

togglePlaybookRemoveButton();

rerender();

["accountId", "date", "amount", "type", "destination", "note"].forEach((key) => {
  const input = document.getElementById(`payoutDraft${key.charAt(0).toUpperCase()}${key.slice(1)}`);
  input?.addEventListener("input", (event) => {
    const value = event.target.value;
    uiState.payoutDraft[key] = key === "destination"
      ? normalizePayoutDestination(value)
      : key === "type"
        ? normalizePayoutType(value)
        : key === "date"
          ? normalizeIsoDate(value, todayIso())
          : value;
  });
  input?.addEventListener("change", (event) => {
    const value = event.target.value;
    uiState.payoutDraft[key] = key === "accountId"
      ? value
      : key === "destination"
        ? normalizePayoutDestination(value)
        : key === "type"
          ? normalizePayoutType(value)
          : key === "date"
            ? normalizeIsoDate(value, todayIso())
            : value;
    if (key === "accountId") renderPayoutDraft();
  });
});
