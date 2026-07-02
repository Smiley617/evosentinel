// Standalone Bitget place-order dry-run diagnostic.
//
// PURPOSE: Build the exact HMAC-SHA256-signed POST that a live spot
// market buy of $5 of SOLUSDT would require, then STOP. Nothing is sent.
// No fetch, no http call, no order. The endpoint exists so the operator
// can visually inspect symbol / side / orderType / size / signature
// before ever flipping EXEC_MODE=live + BITGET_TRADE_ARMED=1.
//
// This file is intentionally independent of engine/bitget_trade.js so
// the signing is implemented from scratch and cannot be polluted by
// any other module's state. Read-only. Inert. No exchange contact.
//
// SIZE SEMANTICS (per Bitget v2 spot place-order docs):
//   For orderType="market" + side="buy", the `size` field is the QUOTE
//   currency amount (USDT) to spend — NOT the base coin (SOL) quantity.
//   So a $5 market buy of SOLUSDT is literally size:"5". No price
//   lookup, no division, no conversion.

const crypto = require("crypto");

const REST        = "https://api.bitget.com";
const ORDER_PATH  = "/api/v2/spot/trade/place-order";  // dry-run only — never called
const USD_TARGET  = 5;                                  // USDT to spend (quote currency)

// Bitget v2 signing scheme (per official docs):
//   preHash   = timestamp + method.toUpperCase() + requestPath + (body || "")
//   signature = base64( HMAC_SHA256(secret, preHash) )
function signV2({ timestamp, method, requestPath, body, secret }) {
  const preHash = `${timestamp}${method.toUpperCase()}${requestPath}${body || ""}`;
  return crypto.createHmac("sha256", secret).update(preHash).digest("base64");
}

// Returns the fully-constructed, fully-signed Bitget place-order request
// WITHOUT sending it. Async signature is preserved so the existing route
// handler in server.js (which awaits this) does not need to change.
async function buildOrderShadow(/* unused */ _solPriceIgnored) {
  const apiKey     = process.env.BITGET_API_KEY     || "";
  const secretKey  = process.env.BITGET_SECRET_KEY  || "";
  const passphrase = process.env.BITGET_PASSPHRASE  || "";

  const missing = [];
  if (!apiKey)     missing.push("BITGET_API_KEY");
  if (!secretKey)  missing.push("BITGET_SECRET_KEY");
  if (!passphrase) missing.push("BITGET_PASSPHRASE");
  if (missing.length) {
    return {
      ok: false,
      stage: "preflight",
      missing_env: missing,
      note: "Cannot sign without all three credentials.",
      sent_to_bitget: false,
    };
  }

  // Per Bitget v2 docs: market-buy `size` = quote currency amount (USDT).
  // $5 buy => size:"5". No SOL conversion, no price lookup needed.
  const sizeUsdt = String(USD_TARGET);

  // The exact JSON body that would be POSTed. Keys are stringified
  // exactly the way Bitget expects them in the v2 spot API.
  const bodyObj = {
    symbol:    "SOLUSDT",
    side:      "buy",
    orderType: "market",
    size:      sizeUsdt,
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
    "ACCESS-PASSPHRASE": "<redacted>",   // never echo passphrase in the diagnostic
    "locale":           "en-US",
  };

  return {
    ok: true,
    stage: "dry_run_built",
    sent_to_bitget: false,
    warning: "This payload was BUILT AND SIGNED ONLY. No HTTP request was made to Bitget. No order was placed. No funds moved.",
    intent: {
      action:        "spot market buy",
      symbol:        bodyObj.symbol,
      side:          bodyObj.side,
      order_type:    bodyObj.orderType,
      size_field:    bodyObj.size,
      size_meaning:  "quote currency (USDT) to spend — per Bitget v2 market-buy spec",
      usd_target:    USD_TARGET,
    },
    request: {
      url:          REST + requestPath,
      method,
      request_path: requestPath,
      timestamp,
      body_json:    bodyObj,
      body_string:  body,
      headers,
    },
    signing: {
      scheme:            "HMAC-SHA256 -> base64",
      pre_hash_template: "timestamp + method + requestPath + body",
      pre_hash_used:     `${timestamp}${method}${requestPath}${body}`,
      api_key_tail:      apiKey.slice(-4),
      passphrase_set:    !!passphrase,
      signature_b64:     signature,
    },
  };
}

module.exports = { buildOrderShadow };
