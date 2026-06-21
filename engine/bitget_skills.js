// Skill Hub shim — exposes the same five analyst-grade perception modules
// that the official Bitget Agent Hub publishes (macro, market-intel,
// news-briefing, sentiment-analyst, technical-analysis).
//
// EvoSentinel already implements the same five voices in
// engine/parliament_live.js. This file re-exports them under the Skill
// Hub naming convention so the agent stack is drop-in replaceable by
// `npx bitget-hub upgrade-all --target claude` once the upstream Skill
// Hub modules are GA. See BITGET_INTEGRATION.md for the swap matrix.

const bitget = require("./bitget");
const feeds  = require("./feeds");
const parl   = require("./parliament_live");

function buildCtx(symbol) {
  const snap = bitget.snapshot();
  const bars = bitget.bars(symbol);
  return { snap, bars, ticker: snap.tickers[symbol], news: feeds.newsFor(symbol),
           book: feeds.bookFor(symbol), mempool: feeds.mempool() };
}

// ── Skill Hub-compatible names ────────────────────────────────
function macro(symbol)               { return runOne(symbol, "Macro"); }
function marketIntel(symbol)         { return runOne(symbol, "OnChain"); }   // order-book + mempool
function newsBriefing(symbol)        { return runOne(symbol, "News"); }
function sentimentAnalyst(symbol)    { return runOne(symbol, "Sentiment"); }
function technicalAnalysis(symbol)   { return runOne(symbol, "Technical"); }

function runOne(symbol, voice) {
  const c = buildCtx(symbol);
  const v = parl.debate(symbol, c.ticker, c.bars);
  if (!v.ok) return { ok: false, skill: voice, error: v.error };
  const x = v.votes[voice];
  return {
    ok: true, skill: voice, symbol,
    asOf: v.asOf, lastClose: v.lastClose,
    dir: x.dir, confidence: x.conf, line: x.line,
    indicators: v.indicators,
    source: "evosentinel/parliament_live.js · drop-in replaceable by bitget-hub Skill Hub",
  };
}

// Composite: run all five at once (the full Parliament).
function parliament(symbol) {
  const c = buildCtx(symbol);
  return parl.debate(symbol, c.ticker, c.bars);
}

module.exports = {
  macro, marketIntel, newsBriefing, sentimentAnalyst, technicalAnalysis,
  parliament,
};
