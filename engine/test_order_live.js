// One-time LIVE test order for Bitget v2 spot. Mirror of
// engine/test_order_shadow.js, except this one actually POSTs the signed
// payload to api.bitget.com. THIS WILL SPEND REAL MONEY when called.
//
// Reached only via GET /api/exec/test-order-live. No other code path in
// the project calls placeLiveTestOrder. No scheduled job triggers it.
// It must be hit manually, exactly once, by the operator.
//
// SIZE SEMANTICS (per Bitget v2 spot place-order docs):
//   For orderType="market" + side="buy", `size` is the QUOTE currency
//   amount (USDT) to spend — NOT the base coin (SOL) quantity.
//   $5 market buy of SOLUSDT => size:"5".

const crypto = require("crypto");

const REST       = "https://api.bitget.com";
const ORDER_PATH = "/api/v2/spot/trade/place-order";
const USD_TARGET = 5;

function signV2({ timestamp, method, requestPath, body, secret }) {
  const preHash = `${timestamp}${method.toUpperCase()}${requestPath}${body || ""}`;
  return crypto.createHmac("sha256", secret).update(preHash).digest("base64");
}

// Builds, signs, and POSTs ONE order to Bitget. Returns Bitget's raw
// response verbatim, plus the diagnostic envelope so the operator can
// verify exactly what was sent and what came back.
//
// CREDENTIALS — read from the LIVE_TEST_BITGET_* env vars, NOT the
// global BITGET_* set. These point at a dedicated Agent trading
// sub-account, isolated from /api/exec/test-auth, /api/exec/status,
// /api/exec/test-order-shadow, and engine/bitget_trade.js. A leaked
// or mis-scoped key on this one endpoint cannot reach the other
// account, and vice versa.
async function placeLiveTestOrder() {
  const apiKey     = process.env.LIVE_TEST_BITGET_API_KEY     || "";
  const secretKey  = process.env.LIVE_TEST_BITGET_SECRET_KEY  || "";
  const passphrase = process.env.LIVE_TEST_BITGET_PASSPHRASE  || "";

  const missing = [];
  if (!apiKey)     missing.push("LIVE_TEST_BITGET_API_KEY");
  if (!secretKey)  missing.push("LIVE_TEST_BITGET_SECRET_KEY");
  if (!passphrase) missing.push("LIVE_TEST_BITGET_PASSPHRASE");
  if (missing.length) {
    return {
      ok: false,
      stage: "preflight",
      missing_env: missing,
      note: "Cannot sign without all three LIVE_TEST_BITGET_* credentials.",
      sent_to_bitget: false,
    };
  }

  const bodyObj = {
    symbol:    "SOLUSDT",
    side:      "buy",
    orderType: "market",
    size:      String(USD_TARGET),   // "5" USDT — per Bitget v2 market-buy spec
    force:     "gtc",
  };
  const body = JSON.stringify(bodyObj);

  const timestamp   = Date.now().toString();
  const method      = "POST";
  const requestPath = ORDER_PATH;
  const signature   = signV2({ timestamp, method, requestPath, body, secret: secretKey });

  const headers = {
    "Content-Type":     "application/json",
    "ACCESS-KEY":       apiKey,
    "ACCESS-SIGN":      signature,
    "ACCESS-TIMESTAMP": timestamp,
    "ACCESS-PASSPHRASE": passphrase,
    "locale":           "en-US",
  };

  let httpStatus = null;
  let rawText    = null;
  let parsed     = null;
  let fetchError = null;
  try {
    const res = await fetch(REST + requestPath, { method, headers, body });
    httpStatus = res.status;
    rawText    = await res.text();
    try { parsed = JSON.parse(rawText); } catch { parsed = null; }
  } catch (e) {
    fetchError = e.message || String(e);
  }

  return {
    ok: parsed && parsed.code === "00000",
    stage: "live_order_sent",
    sent_to_bitget: fetchError ? false : true,
    intent: {
      action:        "spot market buy",
      symbol:        bodyObj.symbol,
      side:          bodyObj.side,
      order_type:    bodyObj.orderType,
      size_field:    bodyObj.size,
      size_meaning:  "quote currency (USDT) — per Bitget v2 market-buy spec",
      usd_target:    USD_TARGET,
    },
    request: {
      url:          REST + requestPath,
      method,
      request_path: requestPath,
      timestamp,
      body_json:    bodyObj,
      body_string:  body,
      headers: { ...headers, "ACCESS-PASSPHRASE": "<redacted>" },
    },
    signing: {
      scheme:            "HMAC-SHA256 -> base64",
      pre_hash_template: "timestamp + method + requestPath + body",
      pre_hash_used:     `${timestamp}${method}${requestPath}${body}`,
      api_key_tail:      apiKey.slice(-4),
      passphrase_set:    !!passphrase,
      signature_b64:     signature,
    },
    http_status:      httpStatus,
    fetch_error:      fetchError,
    bitget_raw_text:  rawText,
    bitget_raw_json:  parsed,
  };
}

module.exports = { placeLiveTestOrder };
