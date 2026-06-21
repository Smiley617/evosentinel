// Bitget public-API client. Polls spot tickers + 1m candles for the
// configured symbols every POLL_MS. No auth, no keys. Cached in memory.
//
// Symbols are crypto-only by design (Bitget does not list AAPL/TSLA/etc).
// Stocks remain synthetic and are clearly labeled in the UI.

const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
const POLL_MS = 5000;
const KLINE_LIMIT = 120;          // 120 × 1m bars = 2h window for indicators
const BASE = "https://api.bitget.com/api/v2/spot/market";

const state = {
  startedAt: null,
  lastPoll: null,
  lastError: null,
  tickers: {},                    // sym -> { last, bid, ask, ts, change24h, volQuote, source }
  klines:  {},                    // sym -> [ {ts,o,h,l,c,v}, ... ] newest last
};

async function fetchTickers() {
  // single batched call: omit ?symbol to get all, then filter
  const r = await fetch(`${BASE}/tickers`);
  if (!r.ok) throw new Error(`tickers HTTP ${r.status}`);
  const j = await r.json();
  if (j.code !== "00000") throw new Error(`tickers ${j.code} ${j.msg}`);
  const map = {};
  for (const t of j.data) if (SYMBOLS.includes(t.symbol)) map[t.symbol] = t;
  for (const sym of SYMBOLS) {
    const t = map[sym];
    if (!t) continue;
    state.tickers[sym] = {
      symbol: sym,
      last:     parseFloat(t.lastPr),
      bid:      parseFloat(t.bidPr),
      ask:      parseFloat(t.askPr),
      high24h:  parseFloat(t.high24h),
      low24h:   parseFloat(t.low24h),
      open24h:  parseFloat(t.openUtc),
      change24h: parseFloat(t.change24h),
      volQuote: parseFloat(t.quoteVolume),
      ts: parseInt(t.ts, 10),
      source: "live:bitget",
    };
  }
}

async function fetchKlines(sym) {
  const r = await fetch(`${BASE}/candles?symbol=${sym}&granularity=1min&limit=${KLINE_LIMIT}`);
  if (!r.ok) throw new Error(`candles HTTP ${r.status}`);
  const j = await r.json();
  if (j.code !== "00000") throw new Error(`candles ${j.code} ${j.msg}`);
  // Bitget format: [ts, o, h, l, c, baseVol, quoteVol, usdtVol]
  state.klines[sym] = j.data.map(row => ({
    ts: parseInt(row[0], 10),
    o:  parseFloat(row[1]),
    h:  parseFloat(row[2]),
    l:  parseFloat(row[3]),
    c:  parseFloat(row[4]),
    v:  parseFloat(row[5]),
  })).sort((a, b) => a.ts - b.ts);   // ensure oldest first
}

let tickPolling = false, klinePolling = {};
async function pollTickers() {
  if (tickPolling) return;
  tickPolling = true;
  try { await fetchTickers(); state.lastPoll = Date.now(); state.lastError = null; }
  catch (e) { state.lastError = "tickers: " + e.message; }
  finally { tickPolling = false; }
}
async function pollKlines(sym) {
  if (klinePolling[sym]) return;
  klinePolling[sym] = true;
  try { await fetchKlines(sym); }
  catch (e) { state.lastError = `klines ${sym}: ${e.message}`; }
  finally { klinePolling[sym] = false; }
}

function start() {
  if (state.startedAt) return;
  state.startedAt = Date.now();
  // Tickers every 5s, klines every 30s per symbol (staggered to spread load).
  pollTickers();
  for (const s of SYMBOLS) pollKlines(s);
  setInterval(pollTickers, POLL_MS);
  SYMBOLS.forEach((s, i) => setTimeout(() => setInterval(() => pollKlines(s), 30_000), i * 1500));
}

function snapshot() {
  return {
    source: "bitget public",
    symbols: SYMBOLS,
    startedAt: state.startedAt,
    lastPoll: state.lastPoll,
    lastError: state.lastError,
    ageMs: state.lastPoll ? Date.now() - state.lastPoll : null,
    tickers: state.tickers,
  };
}

function bars(sym) { return state.klines[sym] || []; }

module.exports = { start, snapshot, bars, SYMBOLS };
