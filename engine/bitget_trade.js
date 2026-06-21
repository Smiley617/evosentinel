// Bitget authenticated trade client.
//
// This is the live-execution bridge for EvoSentinel. When EXEC_MODE=live
// AND BITGET_API_KEY / BITGET_SECRET_KEY / BITGET_PASSPHRASE are set,
// the chamber routes accepted verdicts through this module instead of
// the paper ledger. By default the module operates in a "shadow" mode:
// it signs and prepares the payload but does not POST. Set
// BITGET_TRADE_ARMED=1 to actually fire the order.
//
// Designed to compose with the official Bitget Agent Hub MCP server
// (npx bitget-mcp-server). When that server is also running, EvoSentinel
// can be invoked end-to-end from Claude/Cursor/Codex without leaving
// the editor. See BITGET_INTEGRATION.md.
//
// Sub-account is REQUIRED — never run with main-account keys.

const crypto = require("crypto");

const REST = "https://api.bitget.com";
const KEY     = () => process.env.BITGET_API_KEY     || "";
const SECRET  = () => process.env.BITGET_SECRET_KEY  || "";
const PASS    = () => process.env.BITGET_PASSPHRASE  || "";
const ARMED   = () => process.env.BITGET_TRADE_ARMED === "1";
const SUBACCT = () => process.env.BITGET_SUBACCOUNT  || "evosentinel-paper";

function hasKeys() { return !!(KEY() && SECRET() && PASS()); }

// Bitget v2 signing scheme: ts + method + requestPath + (queryString | body)
// HMAC-SHA256 with secret, base64-encoded.
function sign(ts, method, requestPath, body) {
  const preHash = ts + method.toUpperCase() + requestPath + (body || "");
  return crypto.createHmac("sha256", SECRET()).update(preHash).digest("base64");
}

async function signedRequest(method, path, body) {
  const ts = Date.now().toString();
  const bodyStr = body ? JSON.stringify(body) : "";
  const headers = {
    "Content-Type": "application/json",
    "ACCESS-KEY":        KEY(),
    "ACCESS-PASSPHRASE": PASS(),
    "ACCESS-TIMESTAMP":  ts,
    "ACCESS-SIGN":       sign(ts, method, path, bodyStr),
    "locale":            "en-US",
  };
  const res = await fetch(REST + path, { method, headers, body: bodyStr || undefined });
  const j = await res.json().catch(() => ({}));
  return { http: res.status, ...j };
}

// Public: shape an EvoSentinel verdict into a Bitget spot order payload.
// Returns the payload + the would-be REST receipt. When ARMED=0 the payload
// is signed but never sent.
function buildSpotOrder(v) {
  // Bitget spot: POST /api/v2/spot/trade/place-order
  // side: buy|sell, orderType: market|limit, force: gtc, size: in BASE qty
  const side = v.direction === "LONG" ? "buy" : "sell";
  const qty  = v.qty || (v.risk && v.lastClose ? estimateQty(v) : null);
  if (!qty) throw new Error("cannot build order: missing qty");
  return {
    symbol:    v.symbol,
    side,
    orderType: "market",
    force:     "gtc",
    size:      String(qty),
    clientOid: `evo-${v.symbol}-${Date.now()}`,
  };
}

function estimateQty(v) {
  // mirror ledger sizing: 2% account risk per unit-stop distance
  const entry = v.lastClose;
  const stop  = v.risk?.stop;
  if (!entry || !stop) return null;
  const perUnitRisk = Math.abs(entry - stop);
  if (perUnitRisk <= 0) return null;
  const bank = Number(process.env.LIVE_BANK_USD || 500); // small by default
  const dollarRisk = bank * 0.02;
  let qty = dollarRisk / perUnitRisk;
  const cap = bank * 10 / entry;
  if (qty > cap) qty = cap;
  return +qty.toFixed(6);
}

async function placeSpotOrder(v) {
  const payload = buildSpotOrder(v);
  if (!hasKeys()) {
    return { ok: false, stage: "preflight", error: "BITGET_API_KEY/SECRET_KEY/PASSPHRASE not set", payload };
  }
  if (!ARMED()) {
    return { ok: true, stage: "shadow", note: "BITGET_TRADE_ARMED=0 — order signed but not sent", payload };
  }
  const r = await signedRequest("POST", "/api/v2/spot/trade/place-order", payload);
  return { ok: r.code === "00000", stage: "armed", payload, receipt: r };
}

async function getAccount() {
  if (!hasKeys()) return { ok: false, error: "no keys" };
  return await signedRequest("GET", "/api/v2/spot/account/assets", null);
}

function status() {
  return {
    exec_mode:    process.env.EXEC_MODE === "live" ? "live" : "paper",
    has_keys:     hasKeys(),
    armed:        ARMED(),
    sub_account:  SUBACCT(),
    live_bank:    Number(process.env.LIVE_BANK_USD || 500),
    notes:        hasKeys() && !ARMED()
                    ? "Keys configured but BITGET_TRADE_ARMED=0 — orders will be signed and logged, never sent."
                    : (!hasKeys() ? "No Bitget API keys — paper-only." : "ARMED — orders will be sent to Bitget."),
  };
}

module.exports = { hasKeys, status, buildSpotOrder, placeSpotOrder, getAccount, estimateQty };
