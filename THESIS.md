# EvoSentinel — Thesis

> **A multi-agent AI parliament for crypto, designed not to win more trades but to refuse the trades you would regret. Submitted to the Bitget Base Camp Hackathon S1 — Agentic Trading track.**

---

## 1. Problem

Retail crypto traders do not lose money because they cannot read charts.
They lose money because they **override their own plan** at the worst possible moment.

The empirical pattern is consistent across exchanges:

- **FOMO-tops:** longs entered after a vertical move, when RSI > 75 and price is more than 2σ above its 20-bar mean. The position is opened on the bar of maximum euphoria; the stop is the wick that prints two bars later.
- **Capitulation-chases:** shorts entered into a flush, after RSI < 25 and a 4%+ 24-hour drawdown. The position is opened on the bar of maximum despair; the squeeze prints inside the next hour.
- **No-stop or stop-too-tight:** entries taken when ATR is < 5 bps of price (illiquid session), with the stop inside the spread. The first market order chops the position out for a guaranteed loss.

Every existing trading bot, copilot or LLM-driven agent is built around the question
*“Should I take this trade?”*

That is the wrong question. The question that matters is
**“Will this trade survive the version of me that will be holding it 30 minutes from now?”**

## 2. Insight

The behavioural literature (Kahneman–Tversky prospect theory; Lo’s adaptive-markets; Thaler on mental accounting) converges on a single mechanism:

> **A human under live PnL pressure is a structurally different decision-maker from the same human at the moment they wrote their plan.**

You do not need a smarter trader. You need a **second human** — calmer, slower, and structurally insulated from the screen — whose only job is to **refuse**.

A panel of distinct expert agents, voting independently and weighted by domain relevance, is a computational proxy for that second human. The vote is not for direction; it is for *permission*. A single high-conviction veto from a domain expert outweighs three weak agreements from the others, because that is how a real risk committee operates.

This reframes the problem from **alpha generation** to **alpha protection**.

## 3. Mechanism

EvoSentinel runs a **Parliament of Five** against every live Bitget snapshot for BTC, ETH and SOL. Each agent is deterministic, auditable, and reads only public market data — no closed signals, no LLM hallucinations in the trading path.

| Agent | Domain | Reads | Casts |
|-------|--------|-------|-------|
| **Macro** | Regime | EMA20 / EMA60 spread, slope sign | Long/Short/Pass + confidence |
| **Sentiment** | Crowd reflex | RSI(14), 24h change, fade thresholds (>72/<28) | Fade vote |
| **News** | Event risk | ATR(14)/price as volatility proxy (live news adapter in roadmap) | Stand-down vote when vol > 40 bps/bar |
| **OnChain** | Flow | Volume vs 20-bar SMA, last-bar direction | Accumulation / distribution vote |
| **Technical** | Setup | Trend (EMA20 vs EMA60 + close) + RSI live zone (50–75 long, 25–50 short) | Risk-defined entry vote |

Votes are aggregated into a weighted score in [-1, +1]. Direction triggers at \|score\| > 0.18; leverage steps at 0.35 and 0.55.

Then — and this is the part the rest of the field skips — the verdict passes through the **Habit-Blocker**:

```
if vote == LONG  and RSI > 75 and price > μ + 2σ        → FOMO-top              (BLOCK)
if vote == SHORT and RSI < 25                           → Capitulation-chase    (BLOCK)
if ATR / price < 0.0005                                 → Stop-too-tight        (BLOCK)
```

A blocked verdict is **logged with reasoning, surfaced in the dashboard, and never sized**. The blocker fires on the inputs the *Parliament itself* just used, so its judgement is internally consistent.

Every accepted entry is:
1. Sized at **2% account risk per stop distance** (capped at 10× notional)
2. Persisted to `data/paper_trades.jsonl` (append-only, one JSON object per fill)
3. Marked-to-market against live Bitget ticks every 5 seconds
4. Auto-closed on stop, TP1 (2R), or a 6-hour time-stop — whichever fires first
5. Reported to Telegram with PnL, R-multiple, and updated bank

The dashboard shows live bank, return %, win rate, drawdown, open positions and the last 20 closed trades. The raw JSONL ledger is exposed at `/api/paper/log` so judges can audit every fill.

## 4. Edge

EvoSentinel is **not** competing on signal quality. The five agents are intentionally simple and re-implementable in 200 lines. The edge is structural:

1. **The product is the refusal.** Every other entry in the hackathon will be measured on PnL. Ours is measured on **PnL + refusals × emotional-tax-saved**. The Bitget brief explicitly rewards *novelty of approach* — “the version of an AI trader you would let manage your sister’s money” is a different product category, not a tuning parameter.

2. **Determinism in the trading path.** Indicator math is pure NumPy-equivalent JavaScript with no model calls. The same snapshot in produces the same verdict out — auditable by judges, reproducible in the backtest, defensible in a post-mortem.

3. **Persistent, verifiable ledger.** `data/paper_trades.jsonl` is the same artefact a prop desk would demand from a junior trader: every open, every close, every reason, with timestamps and pre/post balances. No screenshot deck, no cherry-picked equity curve.

4. **Composable via MCP.** The Parliament is exposed as Model-Context-Protocol tools (`evosentinel.activate`, `evosentinel.book`, `evosentinel.metrics`), so any compatible LLM agent can convene the room — entering us into the Trading Infrastructure track simultaneously.

5. **The Telegram pulse.** A live brief is pushed on demand to the user’s phone with bank, recent refusals, and a one-line lesson from “Future You.” The bot is the user’s second human, not their alarm clock.

The thesis in one line:

> **A trading agent that refuses well outperforms a trading agent that predicts well, because the distribution of retail losses is dominated by avoidable trades, not missed ones.**

---

*Submitted to Bitget Base Camp Hackathon S1 · Agentic Trading · EvoSentinel · paper simulation, no real funds, public-data only.*
