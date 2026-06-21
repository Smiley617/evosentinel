# EvoSentinel ↔ Bitget Agent Hub — integration map

This document spells out, line-by-line, how EvoSentinel composes with the
**Bitget Agent Hub** (https://github.com/BitgetLimited/agent_hub) — the
58-tool Trading Arsenal, the 5 Skill-Hub modules, and the `bitget-mcp-server`
MCP layer published for Hackathon S1.

## TL;DR

EvoSentinel is **not** a re-implementation of the Agent Hub. It's a
**refusal-first decision layer** that sits between the Skill Hub
(perception) and the Tools layer (execution). When the upstream Agent Hub
modules are present, EvoSentinel will compose with them rather than
duplicate them.

```
            ┌────────────────────────────────────────────┐
            │  Bitget Skill Hub  (perception, 5 modules) │
            │  macro · market-intel · news-briefing      │
            │  sentiment-analyst · technical-analysis    │
            └──────────────────┬─────────────────────────┘
                               ▼
            ┌────────────────────────────────────────────┐
            │  EvoSentinel Parliament + Habit-Blocker    │  ← THIS REPO
            │  (refusal-first decision layer)            │
            └──────────────────┬─────────────────────────┘
                               ▼
            ┌────────────────────────────────────────────┐
            │  Bitget Agent Hub Tools (58 trading APIs)  │
            │  spot · futures · account · sub-accounts   │
            └────────────────────────────────────────────┘
```

## Skill Hub swap matrix

| Upstream Skill Hub module | EvoSentinel implementation today          | Swap path |
|---|---|---|
| `macro`              | `parliament_live.js::macroAgent` (EMA20/EMA60 spread) | Replace ctx-builder in `bitget_skills.js::macro` with `await bitgetHub.macro(symbol)` |
| `market-intel`       | `parliament_live.js::onchainAgent` (order-book imbalance + mempool) | Same — swap one `require()` |
| `news-briefing`      | `parliament_live.js::newsAgent` (Bitget announcements feed) | Same |
| `sentiment-analyst`  | `parliament_live.js::sentimentAgent` (RSI + 24h flow) | Same |
| `technical-analysis` | `parliament_live.js::technicalAgent` (trend + momentum gate) | Same |

Each upstream swap is a 1-line change in `engine/bitget_skills.js`.
The Parliament aggregation logic, weights, and Habit-Blocker are unchanged.

## Tools — execution layer

| Bitget v2 endpoint                       | EvoSentinel wrapper                       | Triggered by |
|---|---|---|
| `POST /api/v2/spot/trade/place-order`    | `engine/bitget_trade.js::placeSpotOrder`  | `POST /api/exec/place` when `EXEC_MODE=live` and `BITGET_TRADE_ARMED=1` |
| `GET  /api/v2/spot/account/assets`       | `engine/bitget_trade.js::getAccount`      | Read-only health probe |

Signing: HMAC-SHA256 of `ts + METHOD + path + body`, base64. Headers:
`ACCESS-KEY`, `ACCESS-PASSPHRASE`, `ACCESS-TIMESTAMP`, `ACCESS-SIGN`.
Sub-account only — guard documented in `bitget_trade.js`.

## MCP — composition with `bitget-mcp-server`

EvoSentinel publishes its own MCP server (`mcp-server.js`) and is designed
to **co-run** with `bitget-mcp-server`. Recommended config (Claude Desktop,
Cursor, Continue):

```json
{
  "mcpServers": {
    "evosentinel": {
      "command": "node",
      "args": ["/path/to/evosentinel/mcp-server.js"],
      "env": { "EVOSENTINEL_BASE": "http://localhost:3000" }
    },
    "bitget": {
      "command": "npx",
      "args": ["-y", "bitget-mcp-server"],
      "env": {
        "BITGET_API_KEY":     "...",
        "BITGET_SECRET_KEY":  "...",
        "BITGET_PASSPHRASE":  "..."
      }
    }
  }
}
```

With both servers loaded, an LLM agent can:

1. Call `evosentinel.activate(symbol)` — get the 5-voice verdict + blocks
2. If `final` is `LONG`/`SHORT`, optionally call `bitget.placeOrder(...)`
3. Either way, call `evosentinel.open(...)` to mirror to the paper ledger

The Parliament *cannot* place an order on its own — execution must go
through either the paper ledger or the explicit Bitget Tools call. This
separation is intentional and is enforced by `EXEC_MODE` + `BITGET_TRADE_ARMED`.

## Install the Bitget Agent Hub locally

```bash
# Upgrades Claude / Cursor / Codex with the official Bitget Agent Hub
npx bitget-hub upgrade-all --target claude

# Add API keys (sub-account ONLY — never main)
export BITGET_API_KEY="<sub-account key>"
export BITGET_SECRET_KEY="<sub-account secret>"
export BITGET_PASSPHRASE="<sub-account passphrase>"

# Then run EvoSentinel — it will detect the keys and unlock /api/exec/place
make server
```

## Rubric mapping (Hackathon S1)

| Judging criterion           | Where EvoSentinel earns it |
|---|---|
| Depth of thesis             | `THESIS.md` — 4-part argument for refusal-first design |
| Runnability                 | Live demo URL (paper) + `EXEC_MODE=live` flag for the live tier |
| Completeness                | End-to-end loop: feeds → debate → blocker → ledger → auto-exit → Telegram brief |
| Novelty & Agent-only        | Habit-Blocker (vetoes FOMO-top, capitulation-chase, stop-too-tight) is a primitive no human trader would build for themselves |
| Bitget Agent Hub usage      | This document + `engine/bitget_skills.js` + `engine/bitget_trade.js` + co-MCP config |
