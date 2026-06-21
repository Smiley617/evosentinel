# EvoSentinel · Bitget Base Camp Hackathon S1

A multi-agent AI parliament for crypto.
**The product is the refusal.** Built for the Bitget Base Camp Hackathon S1.

**Track:** **Trading Agent** (primary) · **Trading Infra** (secondary — the MCP server + paper-trading sandbox + Skill-Hub-compatible HTTP endpoints qualify here too)

**Built on MuleRun.** EvoSentinel was authored end-to-end inside a MuleRun session — every commit, every backtest, every deploy. The thesis ("a trading agent that refuses well outperforms a trading agent that predicts well") was developed and shipped inside the agentic environment it's competing in.

> Paper simulation by default. Live execution available behind `EXEC_MODE=live` + `BITGET_TRADE_ARMED=1`. Public market data only on the demo URL. No real funds at the demo endpoint.

**Live demo:** https://nxdyhdet.mule.page/
**Repo:** https://github.com/Smiley617/evosentinel
**Thesis:** [THESIS.md](./THESIS.md)

---

## What it is

EvoSentinel watches live Bitget tape (BTC, ETH, SOL) and convenes a **Parliament of Five** AI agents whenever you click *Activate Sentinel*. Each agent reads the same snapshot and votes independently:

| Agent | Domain | What it reads |
|-------|--------|---------------|
| Macro | Regime | EMA20 / EMA60 spread |
| Sentiment | Crowd reflex | RSI(14), 24h change |
| News | Event risk | Live Bitget announcements feed |
| OnChain | Flow | Live order-book imbalance, BTC mempool pressure |
| Technical | Setup | Trend + momentum gate |

Votes are aggregated into a weighted score, then run through a **Habit-Blocker** that vetoes FOMO-tops, capitulation-chases, and stop-too-tight entries. Every accepted entry opens a paper position sized at 2% account risk, is marked-to-market against live ticks every 5 seconds, and auto-closes on stop / TP1 (2R) / 6-hour time-stop.

The whole ledger is append-only at `data/paper_trades.jsonl` — every fill, every exit, with pre/post balances. Judges can audit the full track record.

## Why it matters

Most trading agents try to predict better. Retail loses to the **trades it shouldn't have taken**, not the ones it missed. EvoSentinel optimizes for refusal quality. See [THESIS.md](./THESIS.md) for the full argument.

## Run it

```bash
git clone <repo>
cd evosentinel
make install                              # npm i + python deps

# Live chamber (port 3000) — Bitget polling + Parliament + paper book
export TG_BOT_TOKEN=... TG_CHAT_ID=...    # optional, for Telegram brief
make server

# Reproducible backtest — regenerates data/metrics.json + equity curve
make backtest
```

Visit http://localhost:3000/dashboard.html. Click **Activate Sentinel**. Watch the five voices, see the verdict, open a paper trade. The book auto-closes on stops/TPs against the live tape.

## Bitget Agent Hub integration

EvoSentinel composes with the official **Bitget Agent Hub** (the 58-tool trading arsenal + 5 Skill-Hub analyst modules + MCP server) on three layers:

### 1. Skill Hub parity (`engine/bitget_skills.js`)
The 5 voices in our Parliament map 1:1 to Bitget's published Skill Hub modules and are exposed under the same names:

| Bitget Skill Hub | EvoSentinel voice | HTTP endpoint |
|---|---|---|
| `macro` | Macro | `GET /api/skill/macro/:symbol` |
| `market-intel` | OnChain (order-book + mempool) | `GET /api/skill/market-intel/:symbol` |
| `news-briefing` | News | `GET /api/skill/news-briefing/:symbol` |
| `sentiment-analyst` | Sentiment | `GET /api/skill/sentiment-analyst/:symbol` |
| `technical-analysis` | Technical | `GET /api/skill/technical-analysis/:symbol` |

When `bitget-hub` ships the upstream modules GA, swapping is a one-line `require()` change in `engine/bitget_skills.js`. See `BITGET_INTEGRATION.md` for the swap matrix.

### 2. Tools — authenticated execution (`engine/bitget_trade.js`)
Live spot orders are routed through Bitget v2 REST with HMAC-SHA256 signing exactly per the docs. The verdict → order pipeline is:

```
Parliament verdict → trade.buildSpotOrder(v) → trade.placeSpotOrder(v)
                                                    │
                                          ┌─────────┴──────────┐
                            EXEC_MODE=paper            EXEC_MODE=live
                            ledger.openPosition()      signed POST /api/v2/spot/trade/place-order
                            (default, demo URL)        (opt-in, BITGET_TRADE_ARMED=1)
```

Even in `live` mode, every fill is mirrored to `data/paper_trades.jsonl` so the audit trail stays append-only.

**Setup (sub-account required, never main):**

```bash
# 1. Install Bitget Agent Hub + MCP into Claude/Cursor/Codex
npx bitget-hub upgrade-all --target claude

# 2. Configure sub-account keys (NEVER main account)
export BITGET_API_KEY="<sub-account key>"
export BITGET_SECRET_KEY="<sub-account secret>"
export BITGET_PASSPHRASE="<sub-account passphrase>"
export BITGET_SUBACCOUNT="evosentinel-paper"

# 3. Choose execution mode
export EXEC_MODE=paper            # default — no exchange call
# export EXEC_MODE=live           # signs orders
# export BITGET_TRADE_ARMED=1     # ALSO required to actually send
# export LIVE_BANK_USD=500        # tiny live bank for the demo run

make server
```

Check the wiring without firing anything:
```bash
curl http://localhost:3000/api/exec/status
# { "exec_mode": "paper", "has_keys": true, "armed": false, "sub_account": "evosentinel-paper", ... }
```

### 3. MCP — composable with `bitget-mcp-server`
EvoSentinel ships its own MCP server (`mcp-server.js`) that exposes Parliament + ledger + refusals. Run it alongside Bitget's `bitget-mcp-server` to get one LLM agent that can both *propose* trades (Parliament) and *execute* them (Bitget tools) without leaving Claude/Cursor:

```json
{
  "mcpServers": {
    "evosentinel": { "command": "node", "args": ["/path/to/evosentinel/mcp-server.js"] },
    "bitget":      { "command": "npx",  "args": ["-y", "bitget-mcp-server"],
                      "env": { "BITGET_API_KEY": "...", "BITGET_SECRET_KEY": "...", "BITGET_PASSPHRASE": "..." } }
  }
}
```

## Architecture

```
┌────────────┐   5s     ┌──────────────┐
│ Bitget API ├─────────►│  bitget.js   │  tickers, klines
└────────────┘          └──────┬───────┘
┌────────────┐  60s            │
│ Bitget Ann ├─────────►┌──────┴───────┐
└────────────┘          │  feeds.js    │  news, orderbook, mempool
┌────────────┐  15s     │              │
│ mempool.sp ├─────────►└──────┬───────┘
└────────────┘                 │
                               ▼
                        ┌──────────────────────┐
                        │ parliament_live.js   │  Macro · Sentiment · News
                        │ (5 agents + Blocker) │  OnChain · Technical
                        └──────┬───────────────┘
                               │ verdict
                               ▼
                        ┌──────────────┐  open  ┌──────────────────┐
                        │  server.js   ├───────►│  ledger.js       │
                        │  Express API │  exit  │  paper_trades    │
                        │              │◄───────┤  .jsonl          │
                        └──────┬───────┘ 5s     └──────────────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
        dashboard.html    Telegram         mcp-server.js
        (live UI)         (brief)          (MCP tools)
```

## API

| Method | Path | Returns |
|--------|------|---------|
| GET  | `/api/health`     | Server health, Bitget snapshot age, paper metrics |
| GET  | `/api/quotes`     | Live ticker snapshot (BTC, ETH, SOL) |
| POST | `/api/activate`   | Run Parliament debate on `{symbol?}` (defaults to all) |
| POST | `/api/paper/open` | Open paper position from `{verdict}` |
| POST | `/api/paper/close`| Manually close `{id}` |
| GET  | `/api/paper/book` | Open positions + closed history + metrics |
| GET  | `/api/paper/log`  | Raw JSONL ledger (last `n` events) |
| GET  | `/api/exec/status`| Bitget exec wiring: mode, keys-set?, armed? |
| POST | `/api/exec/place` | Route verdict through paper-or-live based on `EXEC_MODE` |
| GET  | `/api/skill/:name/:symbol` | Single Skill-Hub voice (macro / market-intel / news-briefing / sentiment-analyst / technical-analysis) |
| POST | `/api/push-letter`| Send daily brief to Telegram |

## MCP Server

`mcp-server.js` exposes the Parliament over the Model Context Protocol so any MCP-compatible LLM (Claude Desktop, Cursor, Continue) can drive it:

```json
{
  "mcpServers": {
    "evosentinel": {
      "command": "node",
      "args": ["/path/to/evosentinel/mcp-server.js"],
      "env": { "EVOSENTINEL_BASE": "http://localhost:3000" }
    }
  }
}
```

Tools: `evosentinel.quote`, `evosentinel.activate`, `evosentinel.book`, `evosentinel.open`, `evosentinel.close`, `evosentinel.metrics`, `evosentinel.refusals`.

## File layout

```
.
├── server.js              # Express chamber, /api/* routes, auto-exit loop
├── mcp-server.js          # MCP wrapper for LLM agents
├── dashboard.html         # Live cockpit (Activate, verdicts, paper book)
├── index.html             # Landing
├── app.js                 # Front-end logic (live tiles, verdict cards, book)
├── engine/
│   ├── bitget.js          # Public-API client, 5s tick / 30s kline poller
│   ├── feeds.js           # Bitget announcements, orderbook, mempool
│   ├── parliament_live.js # 5-agent debate + Habit-Blocker + risk plan
│   ├── ledger.js          # Append-only paper trade ledger + auto-exit
│   ├── parliament.py      # Python twin (for the backtest)
│   ├── backtest.py        # 90-day Parliament backtest
│   └── run.py             # CLI entrypoint: python -m engine.run
├── data/                  # JSON artefacts (metrics, briefs, equity, ledger)
├── THESIS.md              # The 4-part argument
├── Makefile               # install / backtest / server / smoke
└── package.json
```

## Reproducibility checklist (for judges)

- [x] **One-command boot** — `make install && make server`
- [x] **Reproducible backtest** — `make backtest` regenerates every JSON in `data/`
- [x] **Verifiable trade log** — `data/paper_trades.jsonl`, append-only, one event per line
- [x] **Public data only** — Bitget public REST + mempool.space, no keys required for read paths
- [x] **No real-fund path** — every trade carries `mode: "PAPER · SIMULATION"`
- [x] **MCP-compatible** — `mcp-server.js` exposes the Parliament as tools for any LLM
- [x] **Live public URL** — https://nxdyhdet.mule.page/ (cold start ~10s)

## What runs in the trading path vs. the cosmetic path

- **Trading path** (deterministic, auditable, no LLM): indicator math → 5-agent vote → Habit-Blocker → ledger.
- **Cosmetic path** (LLM-style prose): the one-line "lesson from Future You" in the daily Telegram brief is a static rotation, not a model call. The agent voices in the dashboard are templated by their numeric verdict — they cannot hallucinate a direction.

## Limits & honest disclosures

- The cloud-deployed instance is ephemeral; the paper ledger resets on each cold start. Run locally for a persistent track record.
- The Sentiment and News agents use simple bag-of-words + threshold logic, not LLM analysis, by design — every decision must be reproducible byte-for-byte.
- Backtest uses a 90-day synthetic-but-realistic market generator with embedded events; numbers are demonstrative, not a forward forecast.

## License

MIT.

---

*Built for the Bitget Base Camp Hackathon S1 · Agentic Trading track.*
*A trading agent that refuses well outperforms a trading agent that predicts well.*
