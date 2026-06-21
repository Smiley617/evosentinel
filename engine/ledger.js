// Append-only paper-trade ledger. Persists every fill, exit and balance
// change to data/paper_trades.jsonl so a judge can audit the full track
// record. Snapshot of current state (book + balance) is mirrored to
// data/paper_state.json on every write for fast resume on restart.
//
// No real funds. Ever. This module touches no exchange APIs.

const fs   = require("fs");
const path = require("path");

const DATA_DIR    = path.join(__dirname, "..", "data");
const LEDGER_PATH = path.join(DATA_DIR, "paper_trades.jsonl");
const STATE_PATH  = path.join(DATA_DIR, "paper_state.json");

const STARTING_BANK = 5000;          // USD, fresh ledger
const RISK_PER_TRADE = 0.02;         // 2% account-risk sizing per fill

const state = {
  startedAt: null,
  bank: STARTING_BANK,
  high: STARTING_BANK,
  realizedPnl: 0,
  wins: 0,
  losses: 0,
  trades: 0,                         // closed
  book: [],                          // open positions
  history: [],                       // closed positions (in memory tail)
  nextId: 1,
};

function ensureFiles() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(LEDGER_PATH)) {
    fs.writeFileSync(LEDGER_PATH, "");
  }
}

function appendLine(obj) {
  ensureFiles();
  fs.appendFileSync(LEDGER_PATH, JSON.stringify(obj) + "\n");
}

function persistState() {
  ensureFiles();
  fs.writeFileSync(STATE_PATH, JSON.stringify({
    startedAt: state.startedAt,
    bank: state.bank,
    high: state.high,
    realizedPnl: state.realizedPnl,
    wins: state.wins,
    losses: state.losses,
    trades: state.trades,
    book: state.book,
    nextId: state.nextId,
    updatedAt: Date.now(),
  }, null, 2));
}

function load() {
  ensureFiles();
  try {
    if (fs.existsSync(STATE_PATH)) {
      const raw = JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
      Object.assign(state, raw);
      // history rebuild from JSONL tail (last 50 closes) for the dashboard
      const lines = fs.readFileSync(LEDGER_PATH, "utf8").trim().split("\n").filter(Boolean);
      state.history = lines.map(l => { try { return JSON.parse(l); } catch { return null; } })
        .filter(e => e && e.event === "close").slice(-50);
    } else {
      state.startedAt = Date.now();
      appendLine({ event: "boot", ts: state.startedAt, bank: state.bank, note: "EvoSentinel paper ledger initialised" });
      persistState();
    }
  } catch (e) {
    // first-run safety
    state.startedAt = Date.now();
    persistState();
  }
}

function sizePosition(entry, stop, bank) {
  // qty so a stop-out costs RISK_PER_TRADE of bank; cap notional at 10x bank
  if (!stop || !entry) return 0;
  const perUnitRisk = Math.abs(entry - stop);
  if (perUnitRisk <= 0) return 0;
  const dollarRisk = bank * RISK_PER_TRADE;
  let qty = dollarRisk / perUnitRisk;
  const notional = qty * entry;
  const cap = bank * 10;             // up to 10x notional via leverage proxy
  if (notional > cap) qty = cap / entry;
  return +qty.toFixed(6);
}

function openPosition(v, midAtOpen) {
  const entry = v.lastClose;
  const stop  = v.risk?.stop;
  const tp1   = v.risk?.tp1;
  const dir   = v.direction;          // LONG | SHORT
  const qty   = sizePosition(entry, stop, state.bank);
  if (!qty) return { ok: false, error: "size came out as zero (no stop)" };

  const notional = +(qty * entry).toFixed(2);
  const pos = {
    id: state.nextId++,
    symbol: v.symbol,
    dir,
    entry,
    stop,
    tp1,
    qty,
    leverage: v.leverage || 1,
    notional,
    score: v.score,
    confidence: v.confidence,
    bank_before: +state.bank.toFixed(2),
    bitget_mid_at_open: midAtOpen ?? entry,
    entry_ts: Date.now(),
    status: "OPEN",
    exit: null,
    exit_ts: null,
    exit_reason: null,
    pnl_usd: null,
    pnl_pct: null,
    r_multiple: null,
    blocks: v.blocks || [],
  };
  state.book.push(pos);
  appendLine({ event: "open", ts: pos.entry_ts, position: pos });
  persistState();
  return { ok: true, position: pos };
}

function closePosition(pos, exitPx, reason, midAtClose) {
  const sign = pos.dir === "LONG" ? 1 : -1;
  const grossPerUnit = (exitPx - pos.entry) * sign;
  const pnlUsd = +(grossPerUnit * pos.qty).toFixed(2);
  const pnlPct = +((grossPerUnit / pos.entry) * 100 * pos.leverage).toFixed(3);
  const perUnitRisk = Math.abs(pos.entry - (pos.stop || pos.entry));
  const rMult = perUnitRisk > 0 ? +(grossPerUnit / perUnitRisk).toFixed(2) : 0;

  pos.status   = "CLOSED";
  pos.exit     = exitPx;
  pos.exit_ts  = Date.now();
  pos.exit_reason = reason;
  pos.pnl_usd  = pnlUsd;
  pos.pnl_pct  = pnlPct;
  pos.r_multiple = rMult;
  pos.bitget_mid_at_close = midAtClose ?? exitPx;
  pos.bank_after = +(state.bank + pnlUsd).toFixed(2);

  state.bank = pos.bank_after;
  state.high = Math.max(state.high, state.bank);
  state.realizedPnl = +(state.realizedPnl + pnlUsd).toFixed(2);
  state.trades += 1;
  if (pnlUsd >= 0) state.wins += 1; else state.losses += 1;

  // move from book to history
  state.book = state.book.filter(p => p.id !== pos.id);
  state.history.push(pos);
  if (state.history.length > 50) state.history = state.history.slice(-50);

  appendLine({ event: "close", ts: pos.exit_ts, position: pos });
  persistState();
  return pos;
}

// Walk open positions, mark-to-market against latest tick, close on stop/TP.
// `tickerOf(sym)` -> {last, bid, ask} | undefined
function checkExits(tickerOf) {
  const fired = [];
  for (const pos of [...state.book]) {
    const tk = tickerOf(pos.symbol);
    if (!tk) continue;
    const px = tk.last;
    if (pos.dir === "LONG") {
      if (pos.stop && px <= pos.stop) { fired.push(closePosition(pos, pos.stop, "STOP", px)); continue; }
      if (pos.tp1  && px >= pos.tp1)  { fired.push(closePosition(pos, pos.tp1,  "TP1",  px)); continue; }
    } else if (pos.dir === "SHORT") {
      if (pos.stop && px >= pos.stop) { fired.push(closePosition(pos, pos.stop, "STOP", px)); continue; }
      if (pos.tp1  && px <= pos.tp1)  { fired.push(closePosition(pos, pos.tp1,  "TP1",  px)); continue; }
    }
    // 6-hour time-stop safety
    if (Date.now() - pos.entry_ts > 6 * 3600 * 1000) {
      fired.push(closePosition(pos, px, "TIME", px));
    }
  }
  return fired;
}

function manualClose(id, tickerOf) {
  const pos = state.book.find(p => p.id === id);
  if (!pos) return { ok: false, error: "position not found" };
  const tk  = tickerOf(pos.symbol);
  if (!tk)  return { ok: false, error: "no live tick to close at" };
  return { ok: true, position: closePosition(pos, tk.last, "MANUAL", tk.last) };
}

function markToMarket(tickerOf) {
  return state.book.map(p => {
    const tk = tickerOf(p.symbol);
    if (!tk) return p;
    const sign = p.dir === "LONG" ? 1 : -1;
    const mtmUsd = +(((tk.last - p.entry) * sign) * p.qty).toFixed(2);
    const mtmPct = +(((tk.last - p.entry) * sign / p.entry) * 100 * p.leverage).toFixed(3);
    return { ...p, mark: tk.last, mtm_usd: mtmUsd, mtm_pct: mtmPct };
  });
}

function metrics() {
  const winRate = state.trades ? +((state.wins / state.trades) * 100).toFixed(1) : 0;
  const ret = +(((state.bank - STARTING_BANK) / STARTING_BANK) * 100).toFixed(2);
  const dd = state.high > 0 ? +(((state.bank - state.high) / state.high) * 100).toFixed(2) : 0;
  return {
    starting_bank: STARTING_BANK,
    bank: +state.bank.toFixed(2),
    high_water: +state.high.toFixed(2),
    realized_pnl: state.realizedPnl,
    trades: state.trades,
    wins: state.wins,
    losses: state.losses,
    win_rate_pct: winRate,
    return_pct: ret,
    drawdown_pct: dd,
    open_positions: state.book.length,
    started_at: state.startedAt,
  };
}

function readHistory() {
  return state.history.slice().reverse();   // newest first
}

function ledgerTail(n = 200) {
  ensureFiles();
  const lines = fs.readFileSync(LEDGER_PATH, "utf8").trim().split("\n").filter(Boolean);
  return lines.slice(-n).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

module.exports = {
  load, openPosition, closePosition, checkExits, manualClose,
  markToMarket, metrics, readHistory, ledgerTail,
  STARTING_BANK, RISK_PER_TRADE,
  get book() { return state.book; },
};
