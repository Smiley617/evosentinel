// Live Parliament: five agents vote on the current Bitget snapshot.
// Each agent returns {dir, conf, line}. The Blocker checks behavioural
// vetoes before a verdict is issued. All output is paper-trade only.

let feeds = null;
try { feeds = require("./feeds"); } catch { /* feeds optional */ }

// ── Tiny indicator kit (no deps) ───────────────────────────────
function ema(arr, n) {
  if (arr.length < n) return null;
  const k = 2 / (n + 1);
  let e = arr.slice(0, n).reduce((a, b) => a + b, 0) / n;
  for (let i = n; i < arr.length; i++) e = arr[i] * k + e * (1 - k);
  return e;
}
function sma(arr, n) {
  if (arr.length < n) return null;
  const s = arr.slice(-n).reduce((a, b) => a + b, 0);
  return s / n;
}
function stdev(arr, n) {
  if (arr.length < n) return null;
  const s = arr.slice(-n);
  const m = s.reduce((a, b) => a + b, 0) / n;
  const v = s.reduce((a, b) => a + (b - m) ** 2, 0) / n;
  return Math.sqrt(v);
}
function rsi(closes, n = 14) {
  if (closes.length < n + 1) return null;
  let gains = 0, losses = 0;
  for (let i = closes.length - n; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gains += d; else losses -= d;
  }
  const ag = gains / n, al = losses / n;
  if (al === 0) return 100;
  const rs = ag / al;
  return 100 - 100 / (1 + rs);
}
function atr(bars, n = 14) {
  if (bars.length < n + 1) return null;
  const trs = [];
  for (let i = 1; i < bars.length; i++) {
    const b = bars[i], p = bars[i - 1];
    trs.push(Math.max(b.h - b.l, Math.abs(b.h - p.c), Math.abs(b.l - p.c)));
  }
  return trs.slice(-n).reduce((a, b) => a + b, 0) / n;
}

// ── Per-agent voices ───────────────────────────────────────────
function macroAgent(ctx) {
  // Regime: trend (EMA20>EMA60 or vice versa) vs chop
  const c = ctx.closes, e20 = ema(c, 20), e60 = ema(c, 60);
  if (!e20 || !e60) return { dir: 0, conf: 0.3, line: "Not enough bars to read the regime." };
  const slope = (e20 - e60) / e60;
  if (Math.abs(slope) < 0.0008) return { dir: 0, conf: 0.45, line: "The regime is choppy. I'd want another datapoint or two." };
  const dir = slope > 0 ? 1 : -1;
  return { dir, conf: Math.min(0.75, 0.45 + Math.abs(slope) * 30),
           line: `Trend tape: EMA20 vs EMA60 spread ${(slope * 100).toFixed(2)}%. I lean ${dir > 0 ? "long" : "short"}, mildly.` };
}
function sentimentAgent(ctx) {
  // Fade the crowd: large 24h move with stretched RSI → fade
  const r = ctx.rsi14, ch = ctx.change24h;
  if (r == null) return { dir: 0, conf: 0.4, line: "I'm flinching at the tape. Pass." };
  if (r > 72 && ch > 0.04)  return { dir: -1, conf: 0.62, line: `Everyone's long, RSI ${r.toFixed(0)}, 24h +${(ch*100).toFixed(1)}%. I want to fade.` };
  if (r < 28 && ch < -0.04) return { dir:  1, conf: 0.62, line: `Capitulation tape, RSI ${r.toFixed(0)}, 24h ${(ch*100).toFixed(1)}%. I want to fade the fade.` };
  return { dir: 0, conf: 0.5, line: `Crowd is undecided. RSI ${r ? r.toFixed(0) : '–'}. Pass, anxiously.` };
}
function newsAgent(ctx) {
  // Prefer real CryptoPanic headlines; fall back to ATR proxy.
  const n = ctx.news;
  if (n && n.count > 0) {
    const tilt = n.pos - n.neg;
    if (n.neg >= 3 && tilt < -1) {
      return { dir: -1, conf: Math.min(0.78, 0.5 + n.neg * 0.06),
               line: `Tape headlines: ${n.neg} negative vs ${n.pos} positive in 6h. Lean short, or stand down.` };
    }
    if (n.pos >= 3 && tilt > 1) {
      return { dir: 1, conf: Math.min(0.75, 0.5 + n.pos * 0.05),
               line: `Tape headlines: ${n.pos} positive vs ${n.neg} negative in 6h. Tape supports a long.` };
    }
    return { dir: 0, conf: 0.55,
             line: `${n.count} live headlines, ${n.pos} pos / ${n.neg} neg. Mixed. I yield to the room.` };
  }
  // Volatility fallback
  const a = ctx.atr14, c = ctx.lastClose;
  if (a == null) return { dir: 0, conf: 0.4, line: "Calendar is quiet, no live news adapter. Pass." };
  const atrPct = a / c;
  if (atrPct > 0.004) return { dir: 0, conf: 0.85, line: `Tape volatility ${(atrPct*100).toFixed(2)}%/bar, something is hitting wires. STAND DOWN until it cools.` };
  return { dir: 0, conf: 0.5, line: "Calendar clean, vol normal. I yield to the room." };
}
function onchainAgent(ctx) {
  // Prefer real order-book imbalance + BTC mempool pressure; fall back to volume ratio.
  const ob = ctx.book, mp = ctx.mempool;
  if (ob && Math.abs(ob.imbalance) > 0.15) {
    const dir = ob.imbalance > 0 ? 1 : -1;
    const note = mp && ctx.symbol === "BTCUSDT" && mp.feeFast > 60
      ? ` (BTC mempool hot, ${mp.feeFast} sat/vB fast lane)` : "";
    return { dir, conf: Math.min(0.82, 0.55 + Math.abs(ob.imbalance) * 0.6),
             line: `Order book ${(ob.imbalance * 100).toFixed(0)}% ${dir > 0 ? "bid-heavy" : "ask-heavy"}${note}. ${dir > 0 ? "Long" : "Short"}.` };
  }
  // Volume fallback
  const v = ctx.vols, vNow = v[v.length - 1], vAvg = sma(v, 20);
  if (!vAvg) return { dir: 0, conf: 0.4, line: "Volume window incomplete. No signal." };
  const ratio = vNow / vAvg;
  const lastBar = ctx.bars[ctx.bars.length - 1];
  const lastDir = lastBar.c >= lastBar.o ? 1 : -1;
  if (ratio < 0.6) return { dir: 0, conf: 0.35, line: `Volume ${(ratio*100).toFixed(0)}% of average, book balanced. No signal.` };
  if (ratio > 1.6) return { dir: lastDir, conf: Math.min(0.82, 0.55 + ratio / 10),
                            line: `Last bar: ${lastDir > 0 ? "net buying" : "net selling"}. Volume ${(ratio*100).toFixed(0)}% of average. ${lastDir > 0 ? "Long" : "Short"}.` };
  return { dir: lastDir, conf: 0.55, line: `Volume ${(ratio*100).toFixed(0)}% of average. Mild ${lastDir > 0 ? "accumulation" : "distribution"}.` };
}
function technicalAgent(ctx) {
  // Trend + momentum gate
  const e20 = ema(ctx.closes, 20), e60 = ema(ctx.closes, 60);
  const r = ctx.rsi14, c = ctx.lastClose;
  if (!e20 || !e60 || r == null) return { dir: 0, conf: 0.4, line: "Setup not formed. Pass." };
  const trendUp = e20 > e60 && c > e20;
  const trendDn = e20 < e60 && c < e20;
  if (trendUp && r > 50 && r < 75) return { dir: 1, conf: 0.82, line: `Trend up, RSI ${r.toFixed(0)} in the live zone, MACD-proxy positive. Long. Risk-defined, manage at 2R.` };
  if (trendDn && r < 50 && r > 25) return { dir: -1, conf: 0.82, line: `Trend down, RSI ${r.toFixed(0)} in the live zone, momentum negative. Short. Risk-defined, manage at 2R.` };
  if (r > 75) return { dir: 0, conf: 0.7, line: `RSI ${r.toFixed(0)} overbought. No clean setup. Pass.` };
  if (r < 25) return { dir: 0, conf: 0.7, line: `RSI ${r.toFixed(0)} oversold. No clean setup. Pass.` };
  return { dir: 0, conf: 0.5, line: "Chart fine, edge thin. Pass." };
}

// ── Habit blocker ──────────────────────────────────────────────
function checkBlocker(verdict, ctx) {
  const reasons = [];
  // FOMO-top: long-vote + RSI > 75 + price > 2σ above 20-MA
  if (verdict.dir === 1 && ctx.rsi14 != null && ctx.rsi14 > 75) {
    const m = sma(ctx.closes, 20), sd = stdev(ctx.closes, 20);
    if (m && sd && ctx.lastClose > m + 2 * sd) reasons.push({ code: "FOMO-top", text: `RSI ${ctx.rsi14.toFixed(0)} > 75 and price ${((ctx.lastClose - m) / sd).toFixed(1)}σ above the 20-MA.` });
  }
  // FOMO-bottom: short-vote + RSI < 25
  if (verdict.dir === -1 && ctx.rsi14 != null && ctx.rsi14 < 25) {
    reasons.push({ code: "Capitulation-chase", text: `RSI ${ctx.rsi14.toFixed(0)} < 25 — chasing a flush is the same trap, inverted.` });
  }
  // No-stop: ATR too thin to risk-define (proxy for illiquid window)
  if (ctx.atr14 && ctx.atr14 / ctx.lastClose < 0.0005) {
    reasons.push({ code: "Stop-too-tight", text: "ATR < 5 bps of price. The stop would be inside the spread. Refuse." });
  }
  return reasons;
}

// ── Public: run debate against a live snapshot for one symbol ──
function debate(sym, snap, bars, weights = {}) {
  if (!bars || bars.length < 30) {
    return { ok: false, error: `not enough bars for ${sym} (${bars ? bars.length : 0})` };
  }
  const closes = bars.map(b => b.c);
  const vols   = bars.map(b => b.v);
  const ctx = {
    symbol: sym,
    bars, closes, vols,
    lastClose: closes[closes.length - 1],
    rsi14: rsi(closes, 14),
    atr14: atr(bars, 14),
    change24h: snap?.change24h ?? 0,
    news:    feeds ? feeds.newsFor(sym)  : null,
    book:    feeds ? feeds.bookFor(sym)  : null,
    mempool: feeds ? feeds.mempool()     : null,
  };
  const W = { Macro: 0.20, Sentiment: 0.15, News: 0.25, OnChain: 0.20, Technical: 0.20, ...weights };
  const votes = {
    Macro:     macroAgent(ctx),
    Sentiment: sentimentAgent(ctx),
    News:      newsAgent(ctx),
    OnChain:   onchainAgent(ctx),
    Technical: technicalAgent(ctx),
  };
  // Weighted score in [-1, +1]
  let score = 0, conf = 0;
  for (const [k, v] of Object.entries(votes)) {
    score += W[k] * v.dir * v.conf;
    conf  += W[k] * v.conf;
  }
  // Direction + leverage
  let direction = "PASS";
  if (score >  0.18) direction = "LONG";
  if (score < -0.18) direction = "SHORT";
  let leverage = 1.0;
  if (Math.abs(score) > 0.35) leverage = 2.0;
  if (Math.abs(score) > 0.55) leverage = 3.0;

  // Blocker overrides
  const blocks = checkBlocker({ dir: score > 0 ? 1 : score < 0 ? -1 : 0 }, ctx);

  // Risk plan
  const stopAtr = 1.4 * (ctx.atr14 || 0);
  const stop = direction === "LONG"  ? ctx.lastClose - stopAtr
             : direction === "SHORT" ? ctx.lastClose + stopAtr : null;
  const tp1  = direction === "LONG"  ? ctx.lastClose + 2 * stopAtr
             : direction === "SHORT" ? ctx.lastClose - 2 * stopAtr : null;

  return {
    ok: true,
    symbol: sym,
    asOf: Date.now(),
    lastClose: ctx.lastClose,
    indicators: {
      rsi14: ctx.rsi14 != null ? +ctx.rsi14.toFixed(2) : null,
      atr14: ctx.atr14 != null ? +ctx.atr14.toFixed(4) : null,
      change24h: +(ctx.change24h * 100).toFixed(2),
    },
    votes,
    weights: W,
    score: +score.toFixed(3),
    confidence: +conf.toFixed(3),
    direction,
    leverage,
    risk: stop && tp1 ? { stop: +stop.toFixed(4), tp1: +tp1.toFixed(4), stop_atr: 1.4, tp_R: 2 } : null,
    blocks,
    final: blocks.length ? "BLOCKED · HABIT" : direction,
    mode: "PAPER · SIMULATION",
  };
}

module.exports = { debate };
