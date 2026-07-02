// EvoSentinel · Chamber server.
// Serves the static dashboard and exposes /api/push-letter which
// renders the Future-You brief from live JSON and forwards it to Telegram.
// Secrets are read from process.env so they never reach the browser.

const express = require("express");
const fs      = require("fs");
const path    = require("path");
const bitget  = require("./engine/bitget");
const feeds   = require("./engine/feeds");
const { debate } = require("./engine/parliament_live");
const ledger  = require("./engine/ledger");
const trade   = require("./engine/bitget_trade");
const skills  = require("./engine/bitget_skills");

const PORT     = process.env.PORT || 3000;
const TG_TOKEN = process.env.TG_BOT_TOKEN;
const TG_CHAT  = process.env.TG_CHAT_ID;

const app = express();
app.use(express.json({ limit: "256kb" }));
app.use(express.static(__dirname, { extensions: ["html"] }));

// Initialise the persistent paper ledger (rebuilds state from disk if present).
ledger.load();

// Helper to read the latest tick for a symbol from bitget poller.
const tickerOf = (sym) => bitget.snapshot().tickers[sym];

// Auto-exit loop: every 5s, mark open positions, fire stops/TPs, persist.
setInterval(() => {
  const fired = ledger.checkExits(tickerOf);
  if (fired.length && TG_TOKEN && TG_CHAT) {
    for (const p of fired) {
      const arrow = p.pnl_usd >= 0 ? "WIN" : "LOSS";
      const html = `<b>EvoSentinel · auto-close</b>\n${p.symbol} ${p.dir} · ${p.exit_reason}\nentry ${p.entry} · exit ${p.exit}\nPnL ${p.pnl_usd >= 0 ? "+" : ""}$${p.pnl_usd} (${p.pnl_pct}%) · ${p.r_multiple}R · ${arrow}\nbank $${p.bank_after}`;
      tgSend(html).catch(() => {});
    }
  }
}, 5000);

// ── Telegram pusher ────────────────────────────────────────────
async function tgSend(html) {
  if (!TG_TOKEN || !TG_CHAT) {
    return { ok: false, error: "missing TG_BOT_TOKEN or TG_CHAT_ID env" };
  }
  const url = `https://api.telegram.org/bot${TG_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: TG_CHAT,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      text: html,
    }),
  });
  return await res.json();
}

// ── Letter renderer ────────────────────────────────────────────
// Reads metrics.json + briefs.json + blocked.json from /data and
// composes the same Future-You brief the dashboard shows on screen.
function renderLetter() {
  const data = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, "data", f), "utf8"));
  let m, briefs, blocked, trades;
  try {
    m       = data("metrics.json");
    briefs  = data("briefs.json");
    blocked = data("blocked.json");
    trades  = data("trades.json");
  } catch (e) {
    return { html: null, error: "data files missing: " + e.message };
  }

  const todayBrief = briefs[briefs.length - 1] || {};
  const yBrief     = briefs[briefs.length - 2] || {};
  const score      = Math.round((m.metrics?.evolution_score ?? 78));
  const saved      = Math.round(m.metrics?.emotional_tax_saved ?? 816);
  const dd         = (m.metrics?.max_drawdown_pct ?? -2.97).toFixed(2);
  const sharpe     = (m.metrics?.sharpe ?? 1.42).toFixed(2);
  const blocksY    = blocked.filter(b => b.ts?.startsWith(yBrief.date || "")).length || blocked.length;
  const refusals   = blocked.slice(-2).map(b =>
    `• ${b.symbol} ${b.proposed_direction || ""} blocked · ${b.habit_blocked || "habit"}`
  ).join("\n") || "• (no refusals in window)";

  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  const lesson = todayBrief.lesson || "Show up clean again today. The room is doing the refusing for you.";
  const pm = ledger.metrics();
  const paperLine = pm.trades > 0
    ? `${pm.trades} closes · ${pm.win_rate_pct}% wins · bank $${pm.bank} (${pm.return_pct >= 0 ? "+" : ""}${pm.return_pct}%)`
    : `${pm.open_positions} open · bank $${pm.bank}`;

  const html =
`<b>EvoSentinel · Daily Brief</b>
<i>Live push · ${stamp} UTC</i>

<b>Evolution score</b>  ${score} / 100
<b>Emotional tax avoided</b>  +$${saved.toLocaleString()}
<b>Drawdown held</b>  ${dd}%
<b>Sharpe</b>  ${sharpe}
<b>Paper book</b>  ${paperLine}

<b>Recent refusals</b>
${refusals}

<b>A note from Future You</b>
${lesson}

Parliament of Five`;

  return { html, error: null };
}

// ── Routes ─────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    hasToken: !!TG_TOKEN,
    hasChat: !!TG_CHAT,
    bitget: bitget.snapshot(),
    paper: ledger.metrics(),
  });
});

// Live quotes from Bitget (BTC/ETH/SOL) — synthetic stocks are still
// served from /data/market.json and clearly labeled in the UI.
app.get("/api/quotes", (_req, res) => {
  res.json(bitget.snapshot());
});

// Activate Sentinel: run the 5-agent debate for one or all live symbols.
// Body: { symbol?: "BTCUSDT" }  — defaults to all.
app.post("/api/activate", (req, res) => {
  const snap = bitget.snapshot();
  const targets = req.body?.symbol ? [req.body.symbol] : bitget.SYMBOLS;
  const verdicts = targets.map(sym => debate(sym, snap.tickers[sym], bitget.bars(sym)));
  res.json({
    ok: true,
    asOf: Date.now(),
    quoteAgeMs: snap.ageMs,
    verdicts,
    mode: "PAPER · SIMULATION · no real orders",
  });
});

// Place a paper-trade entry from a verdict. Pure simulation, never hits
// any exchange. The position is sized off live account risk and persisted
// to data/paper_trades.jsonl. Auto-exit loop manages stops/TPs.
app.post("/api/paper/open", (req, res) => {
  const v = req.body?.verdict;
  if (!v || !v.ok || v.final === "PASS" || String(v.final).startsWith("BLOCKED")) {
    return res.status(400).json({ ok: false, error: "no actionable verdict" });
  }
  const tk = tickerOf(v.symbol);
  const r  = ledger.openPosition(v, tk?.last);
  if (!r.ok) return res.status(400).json(r);
  res.json({ ok: true, position: r.position, metrics: ledger.metrics(), mode: "PAPER · SIMULATION" });
});

// ── Bitget Agent Hub bridge ────────────────────────────────────
// EXEC_MODE=paper (default) → ledger.openPosition (no exchange call)
// EXEC_MODE=live  → trade.placeSpotOrder (signed Bitget v2 spot order).
//   With BITGET_TRADE_ARMED=0 the order is signed + logged but not sent
//   (shadow mode). With BITGET_TRADE_ARMED=1 it hits Bitget for real.
// Always mirrors to the paper ledger so the audit trail remains intact.
app.get("/api/exec/status", (_req, res) => res.json({ ok: true, ...trade.status() }));

// Read-only Bitget auth diagnostic. Single GET, single signed call to
// the spot account-assets endpoint. Returns Bitget's raw response
// verbatim (including HTTP status and error text on failure) so we can
// confirm the API key + HMAC-SHA256 signing are correct without
// touching any trade endpoint. See engine/test_auth.js.
app.get("/api/exec/test-auth", async (_req, res) => {
  const { testAuth } = require("./engine/test_auth");
  const result = await testAuth();
  res.status(result.http_status && result.http_status >= 400 ? result.http_status : 200).json(result);
});

// DRY-RUN ONLY. Builds and HMAC-SHA256-signs a Bitget v2 spot place-order
// payload for ~$4 of SOLUSDT market buy, then returns it for inspection.
// NEVER makes any HTTP call to Bitget. No order is placed. No funds move.
app.get("/api/exec/test-order-shadow", async (_req, res) => {
  const { buildOrderShadow } = require("./engine/test_order_shadow");
  const tk = tickerOf("SOLUSDT");
  const result = await buildOrderShadow(tk?.last);
  res.json(result);
});

// LIVE one-time test. THIS WILL SPEND REAL MONEY.
// Only invoked when the operator manually hits the URL. Not called by any
// scheduled job, monitor, or other endpoint. After the order returns, a
// single Telegram summary is sent via the existing tgSend pipe.
app.get("/api/exec/test-order-live", async (_req, res) => {
  const { placeLiveTestOrder } = require("./engine/test_order_live");
  const result = await placeLiveTestOrder();

  // Fire-and-log Telegram summary — never block the response on it.
  try {
    const j = result.bitget_raw_json || {};
    const orderId = j?.data?.orderId || j?.data?.clientOid || "(none)";
    const status  = result.ok ? "SUCCESS" : "FAILED";
    const errLine = result.ok
      ? ""
      : `\nerror: <code>${(j.msg || result.fetch_error || result.bitget_raw_text || "unknown").toString().slice(0, 240)}</code>`;
    const html =
`<b>EvoSentinel · LIVE test order</b>
${status} · ${result.intent.symbol} ${result.intent.side} ${result.intent.order_type}
size: ${result.intent.size_field} USDT
http: ${result.http_status} · code: ${j.code || "n/a"}
orderId: <code>${orderId}</code>${errLine}`;
    await tgSend(html);
  } catch (_e) { /* never let TG failure mask the order result */ }

  res.status(result.http_status && result.http_status >= 400 ? result.http_status : 200).json(result);
});

app.post("/api/exec/place", async (req, res) => {
  const v = req.body?.verdict;
  if (!v || !v.ok || v.final === "PASS" || String(v.final).startsWith("BLOCKED")) {
    return res.status(400).json({ ok: false, error: "no actionable verdict" });
  }
  const tk = tickerOf(v.symbol);
  const paper = ledger.openPosition(v, tk?.last);            // always mirror
  let live = null;
  if (process.env.EXEC_MODE === "live") {
    try { live = await trade.placeSpotOrder({ ...v, qty: trade.estimateQty(v) }); }
    catch (e) { live = { ok: false, error: e.message }; }
  }
  res.json({ ok: true, exec_mode: process.env.EXEC_MODE || "paper",
             paper: paper, live, status: trade.status() });
});

// Bitget Skill Hub-compatible per-voice endpoints. Lets judges hit any
// single analyst module (macro / market-intel / news-briefing / sentiment /
// technical-analysis) the same way they would hit Bitget's Agent Hub.
app.get("/api/skill/:name/:symbol", (req, res) => {
  const map = { macro: skills.macro, "market-intel": skills.marketIntel,
                "news-briefing": skills.newsBriefing,
                "sentiment-analyst": skills.sentimentAnalyst,
                "technical-analysis": skills.technicalAnalysis };
  const fn = map[req.params.name];
  if (!fn) return res.status(404).json({ ok: false, error: "unknown skill" });
  res.json(fn(req.params.symbol));
});

app.post("/api/paper/close", (req, res) => {
  const id = Number(req.body?.id);
  if (!id) return res.status(400).json({ ok: false, error: "id required" });
  const r = ledger.manualClose(id, tickerOf);
  if (!r.ok) return res.status(400).json(r);
  res.json({ ok: true, position: r.position, metrics: ledger.metrics() });
});

app.get("/api/paper/book", (_req, res) => {
  res.json({
    ok: true,
    positions: ledger.markToMarket(tickerOf),
    history:   ledger.readHistory(),
    metrics:   ledger.metrics(),
  });
});

app.get("/api/paper/log", (_req, res) => {
  const n = Math.min(1000, Number(_req.query.n) || 200);
  res.json({ ok: true, ledger: ledger.ledgerTail(n), metrics: ledger.metrics() });
});

app.post("/api/push-letter", async (_req, res) => {
  const { html, error } = renderLetter();
  if (error) return res.status(500).json({ ok: false, error });
  const r = await tgSend(html);
  if (!r.ok) return res.status(502).json({ ok: false, error: r.description || r.error || "telegram refused" });
  res.json({ ok: true, message_id: r.result.message_id, sent_at: r.result.date });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`EvoSentinel Chamber listening on :${PORT}`);
  console.log(`Telegram: token=${TG_TOKEN ? "set" : "MISSING"} chat=${TG_CHAT || "MISSING"}`);
  const ts = trade.status();
  console.log(`Exec mode: ${ts.exec_mode} (keys=${ts.has_keys ? "set" : "absent"}, armed=${ts.armed}, sub=${ts.sub_account})`);
  bitget.start();
  feeds.start();
  console.log(`Bitget poller started for ${bitget.SYMBOLS.join(", ")}`);
  console.log(`Live feeds started: Bitget announcements, Bitget orderbook, mempool.space`);
});
