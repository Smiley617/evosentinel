// Standalone Bitget signed-request diagnostic.
// Single purpose: confirm BITGET_API_KEY / BITGET_SECRET_KEY /
// BITGET_PASSPHRASE + our HMAC-SHA256 signing produce a successful
// authenticated read of the sub-account spot balance.
//
// This file is intentionally independent of engine/bitget_trade.js
// so the signing is implemented from scratch and the diagnostic
// cannot be polluted by any other module's state. Read-only. No
// trade endpoints are ever called from here.

const crypto = require("crypto");

const REST = "https://api.bitget.com";
const ACCOUNT_PATH = "/api/v2/spot/account/assets";   // read-only spot balance

// Bitget v2 signing scheme (per official docs):
//   preHash = timestamp + method.toUpperCase() + requestPath + (body || queryString || "")
//   signature = base64( HMAC_SHA256(secret, preHash) )
// Headers required:
//   ACCESS-KEY, ACCESS-SIGN, ACCESS-TIMESTAMP, ACCESS-PASSPHRASE, Content-Type
function signV2({ timestamp, method, requestPath, body, secret }) {
  const preHash = `${timestamp}${method.toUpperCase()}${requestPath}${body || ""}`;
  return crypto.createHmac("sha256", secret).update(preHash).digest("base64");
}

// Returns the FULL raw response from Bitget, unmodified, plus diagnostic
// metadata (timestamp used, the exact preHash string we signed, http
// status). Never throws on Bitget errors — surfaces them verbatim so the
// caller can read exactly what Bitget sent back.
async function testAuth() {
  const apiKey     = process.env.BITGET_API_KEY     || "";
  const secretKey  = process.env.BITGET_SECRET_KEY  || "";
  const passphrase = process.env.BITGET_PASSPHRASE  || "";

  // Up-front guard so the diagnostic gives a clear answer even if the
  // env is empty — not a Bitget call in that case, just a config report.
  const missing = [];
  if (!apiKey)     missing.push("BITGET_API_KEY");
  if (!secretKey)  missing.push("BITGET_SECRET_KEY");
  if (!passphrase) missing.push("BITGET_PASSPHRASE");
  if (missing.length) {
    return {
      ok: false,
      stage: "preflight",
      missing_env: missing,
      note: "Cannot call Bitget without all three credentials set on the server process.",
    };
  }

  const timestamp = Date.now().toString();
  const method    = "GET";
  const requestPath = ACCOUNT_PATH;
  const body      = "";                                 // GET has no body
  const signature = signV2({ timestamp, method, requestPath, body, secret: secretKey });

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
    const res = await fetch(REST + requestPath, { method, headers });
    httpStatus = res.status;
    rawText    = await res.text();
    try { parsed = JSON.parse(rawText); } catch { parsed = null; }
  } catch (e) {
    fetchError = e.message || String(e);
  }

  return {
    ok: parsed && parsed.code === "00000",
    stage: "bitget_response",
    request: {
      url:         REST + requestPath,
      method,
      request_path: requestPath,
      timestamp,
      pre_hash_template: "timestamp + method + requestPath + body",
      pre_hash_used:     `${timestamp}${method}${requestPath}${body}`,
      api_key_tail:      apiKey.slice(-4),         // last 4 chars so you can verify which key is loaded
      passphrase_set:    !!passphrase,
      signature_b64:     signature,
    },
    http_status: httpStatus,
    fetch_error: fetchError,
    bitget_raw_text: rawText,
    bitget_raw_json: parsed,
  };
}

module.exports = { testAuth };
