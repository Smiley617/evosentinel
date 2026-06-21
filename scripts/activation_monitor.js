// 20-minute live monitor.
// Every 30 s, POST /api/activate (single call returns all 3 symbol verdicts).
// Per verdict, also reads /api/paper/book BEFORE and AFTER an /api/paper/open
// attempt (only when verdict is actionable) to confirm a ledger row was written.
// Appends one entry per (cycle, symbol) to data/activation_log.json.

const fs   = require("fs");
const path = require("path");

const BASE       = process.env.EVOSENTINEL_BASE || "http://localhost:3000";
const TOTAL_MIN  = Number(process.env.MONITOR_MIN  || 20);
const STEP_MS    = Number(process.env.MONITOR_STEP || 30_000);
const CYCLES     = Math.round((TOTAL_MIN * 60_000) / STEP_MS);
const LOG_PATH   = path.join(__dirname, "..", "data", "activation_log.json");
const TRADES_LEGACY = path.join(__dirname, "..", "data", "trades.json");
const LEDGER_JSONL  = path.join(__dirname, "..", "data", "paper_trades.jsonl");

function ensureLog() {
  if (!fs.existsSync(LOG_PATH)) fs.writeFileSync(LOG_PATH, "[]");
}
function readLog() {
  try { return JSON.parse(fs.readFileSync(LOG_PATH, "utf8")); }
  catch { return []; }
}
function writeLog(arr) {
  fs.writeFileSync(LOG_PATH, JSON.stringify(arr, null, 2));
}
function jsonlCount(p) {
  try { return fs.readFileSync(p, "utf8").trim().split("\n").filter(Boolean).length; }
  catch { return 0; }
}
function trades_json_rows() {
  try {
    const j = JSON.parse(fs.readFileSync(TRADES_LEGACY, "utf8"));
    return Array.isArray(j) ? j.length : (Array.isArray(j.trades) ? j.trades.length : 0);
  } catch { return 0; }
}

async function post(p, body) {
  const r = await fetch(BASE + p, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  return await r.json();
}
async function get(p) {
  const r = await fetch(BASE + p);
  return await r.json();
}

function shape(v) {
  // Per-agent vote+conf
  const ag = {};
  for (const [k, x] of Object.entries(v.votes || {})) {
    ag[k] = { dir: x.dir, conf: x.conf, line: x.line };
  }
  return {
    indicators: v.indicators,
    agents: ag,
    weights: v.weights,
    score: v.score,
    confidence: v.confidence,
    direction: v.direction,         // pre-blocker
    leverage:  v.leverage,
    blocks:    v.blocks,
    final:     v.final,             // post-blocker
    risk:      v.risk,
    lastClose: v.lastClose,
  };
}

(async () => {
  ensureLog();
  const t0 = Date.now();
  console.log(`[monitor] CYCLES=${CYCLES} STEP_MS=${STEP_MS} BASE=${BASE}`);
  console.log(`[monitor] log=${LOG_PATH}`);

  for (let cycle = 1; cycle <= CYCLES; cycle++) {
    const cycleAt = new Date().toISOString();
    let resp;
    try {
      resp = await post("/api/activate", {});      // all symbols
    } catch (e) {
      console.log(`[c${cycle}] activate failed: ${e.message}`);
      const log = readLog();
      log.push({ ts: cycleAt, cycle, error: "activate failed: " + e.message });
      writeLog(log);
    }

    if (resp && resp.ok && Array.isArray(resp.verdicts)) {
      for (const v of resp.verdicts) {
        const entry = {
          ts:        cycleAt,
          cycle,
          symbol:    v.symbol || "UNKNOWN",
          ok:        !!v.ok,
        };
        if (!v.ok) {
          entry.error = v.error;
          entry.final = "ERROR";
        } else {
          Object.assign(entry, shape(v));

          // For actionable verdicts (LONG/SHORT not blocked), attempt to open
          // a paper position via the real /api/paper/open endpoint.
          // Then record whether ledger rows grew.
          if (entry.final === "LONG" || entry.final === "SHORT") {
            const ledger_before = jsonlCount(LEDGER_JSONL);
            const trades_before = trades_json_rows();
            let openResp = null;
            try { openResp = await post("/api/paper/open", { verdict: v }); }
            catch (e) { openResp = { ok: false, error: e.message }; }
            const ledger_after = jsonlCount(LEDGER_JSONL);
            const trades_after = trades_json_rows();
            entry.execution = {
              attempted: true,
              api_ok: !!(openResp && openResp.ok),
              api_error: openResp && !openResp.ok ? (openResp.error || JSON.stringify(openResp)) : null,
              position_id: openResp && openResp.position ? openResp.position.id : null,
              ledger_jsonl_before: ledger_before,
              ledger_jsonl_after:  ledger_after,
              ledger_jsonl_grew:   ledger_after > ledger_before,
              trades_json_before:  trades_before,
              trades_json_after:   trades_after,
              trades_json_grew:    trades_after > trades_before,
            };
          }
        }
        const log = readLog();
        log.push(entry);
        writeLog(log);
        const tag = entry.final + (entry.execution ? (entry.execution.ledger_jsonl_grew ? " · LEDGER+1" : " · LEDGER-no-change") : "");
        console.log(`[c${cycle}] ${entry.symbol} score=${entry.score ?? '-'} ${tag}`);
      }
    } else if (resp) {
      const log = readLog();
      log.push({ ts: cycleAt, cycle, error: "bad activate response", resp });
      writeLog(log);
      console.log(`[c${cycle}] bad response: ${JSON.stringify(resp).slice(0,200)}`);
    }

    if (cycle < CYCLES) {
      await new Promise(r => setTimeout(r, STEP_MS));
    }
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`[monitor] DONE cycles=${CYCLES} elapsed=${elapsed}s`);
})().catch(e => {
  console.error("[monitor] fatal:", e);
  process.exit(1);
});
