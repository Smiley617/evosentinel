"""The five specialist agents of the Parliament.

Each agent receives a Context (price history slice, event calendar, regime
proxies) and returns a Vote: direction in {LONG, SHORT, PASS}, confidence
in [0,1], one-line rationale, and the raw key data it used.
"""
from __future__ import annotations
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Dict, List, Optional

from .data import Bar, MarketEvent, SYMBOLS_CRYPTO, SYMBOLS_STOCK
from .indicators import (rsi, macd, adx, atr, bb_width, realised_vol,
                          ema_series, closes, sma)


@dataclass
class Context:
    now: datetime
    symbol: str
    bars: List[Bar]                # all bars up to and including `now`
    market: Dict[str, List[Bar]]   # other symbols (for cross-asset signals)
    events: List[MarketEvent]


@dataclass
class Vote:
    agent: str
    direction: str                 # LONG / SHORT / PASS
    confidence: float              # 0..1
    rationale: str
    data: Dict[str, float] = field(default_factory=dict)


def _sigmoid(x: float, k: float = 1.0) -> float:
    import math
    return 1 / (1 + math.exp(-k * x))


# ---------- 1. Macro Agent — "The Economist" ----------

def macro_agent(ctx: Context) -> Vote:
    """Risk-on / risk-off regime from QQQ trend + recent macro surprises."""
    qqq = ctx.market.get("QQQ", [])
    qqq_close = [b.close for b in qqq if b.ts <= ctx.now]
    if len(qqq_close) < 24 * 20 + 5:
        return Vote("Macro", "PASS", 0.4, "Insufficient macro history.", {})
    trend = qqq_close[-1] / qqq_close[-24 * 5] - 1  # 5-day QQQ return
    long_trend = qqq_close[-1] / qqq_close[-24 * 20] - 1
    # recent macro surprise
    recent_macro = [e for e in ctx.events
                    if e.kind in ("fomc", "cpi", "jobs")
                    and 0 <= (ctx.now - e.ts).total_seconds() / 3600 <= 72]
    macro_score = sum(e.surprise for e in recent_macro) * 0.5
    composite = trend * 4 + long_trend * 2 + macro_score
    conf = min(0.95, abs(composite) * 1.4 + 0.3)
    if composite > 0.015:
        direction = "LONG"
    elif composite < -0.015:
        direction = "SHORT"
    else:
        direction = "PASS"
        conf = 0.45
    # Crypto skew: in clear risk-on, give crypto +10% conf
    if ctx.symbol in SYMBOLS_CRYPTO and direction == "LONG":
        conf = min(0.95, conf * 1.1)
    why = (f"QQQ 5d {trend*100:+.2f}%, 20d {long_trend*100:+.2f}%, "
           f"macro surprise score {macro_score:+.2f}")
    return Vote("Macro", direction, round(conf, 3), why,
                {"qqq_5d": trend, "qqq_20d": long_trend,
                 "macro_surprise": macro_score})


# ---------- 2. Sentiment Agent — "The Crowd Reader" ----------

def sentiment_agent(ctx: Context) -> Vote:
    """Fear/greed proxy: short-term RV spike + recent rally extension."""
    cl = closes(ctx.bars)
    if len(cl) < 50:
        return Vote("Sentiment", "PASS", 0.4, "Not enough bars.", {})
    rv = realised_vol(cl, 24)
    rv_long = realised_vol(cl, 96)
    extension = cl[-1] / sma(cl, 50) - 1
    # Greed if extension high & RV expanding → fade
    fear_greed = extension * 5 - (rv - rv_long) * 80
    if fear_greed > 0.6:        # over-greedy → contrarian short bias
        direction = "SHORT"
        conf = min(0.85, 0.4 + abs(fear_greed) * 0.4)
        why = f"Extension {extension*100:+.2f}% over 50MA, crowd-greedy → fade."
    elif fear_greed < -0.6:     # over-fearful → contrarian long
        direction = "LONG"
        conf = min(0.85, 0.4 + abs(fear_greed) * 0.4)
        why = f"Extension {extension*100:+.2f}%, panic conditions → mean-revert long."
    else:
        direction = "PASS"
        conf = 0.4
        why = "Sentiment balanced; no edge."
    return Vote("Sentiment", direction, round(conf, 3), why,
                {"extension": extension, "rv24": rv, "rv96": rv_long,
                 "fear_greed": fear_greed})


# ---------- 3. News Agent — "The Reporter" ----------

def news_agent(ctx: Context) -> Vote:
    """Event-driven: trade with earnings surprise drift, AVOID right before event."""
    relevant = [e for e in ctx.events
                if (e.symbol == ctx.symbol or
                    (not e.symbol and ctx.symbol in SYMBOLS_STOCK and e.kind in ("fomc", "cpi", "jobs")) or
                    (not e.symbol and ctx.symbol in SYMBOLS_CRYPTO and e.kind in ("fomc", "cpi")))]
    # Just-passed event (last 18h) → drift trade
    just_passed = [e for e in relevant
                   if 0 < (ctx.now - e.ts).total_seconds() / 3600 <= 18]
    upcoming = [e for e in relevant
                if 0 < (e.ts - ctx.now).total_seconds() / 3600 <= 6]
    if upcoming:
        e = upcoming[0]
        return Vote("News", "PASS", 0.9,
                    f"Event '{e.label}' in {int((e.ts-ctx.now).total_seconds()/3600)}h — stand down.",
                    {"event_h": (e.ts - ctx.now).total_seconds() / 3600,
                     "surprise": e.surprise})
    if just_passed:
        e = max(just_passed, key=lambda x: abs(x.surprise))
        if abs(e.surprise) < 0.1:
            return Vote("News", "PASS", 0.45, f"Recent '{e.label}' was a non-event.",
                        {"surprise": e.surprise})
        direction = "LONG" if e.surprise > 0 else "SHORT"
        conf = min(0.92, 0.5 + abs(e.surprise) * 0.5)
        why = f"'{e.label}' surprise {e.surprise:+.2f} → ride drift {direction.lower()}."
        return Vote("News", direction, round(conf, 3), why,
                    {"surprise": e.surprise})
    return Vote("News", "PASS", 0.4, "No active catalyst.", {})


# ---------- 4. On-chain / Flow Agent — "The Whale Watcher" ----------

def onchain_agent(ctx: Context) -> Vote:
    """Volume-weighted flow proxy. For crypto: whale push detection.
    For stocks: unusual-volume vs trend."""
    if len(ctx.bars) < 50:
        return Vote("OnChain", "PASS", 0.4, "Insufficient flow data.", {})
    vols = [b.volume for b in ctx.bars[-50:]]
    avg_v = sum(vols) / len(vols)
    last_v = sum(b.volume for b in ctx.bars[-3:]) / 3
    push = last_v / avg_v - 1
    last_ret = ctx.bars[-1].close / ctx.bars[-3].close - 1
    # If volume surge aligns with directional push → confirm
    if push > 0.6 and abs(last_ret) > 0.005:
        direction = "LONG" if last_ret > 0 else "SHORT"
        conf = min(0.9, 0.45 + push * 0.25 + abs(last_ret) * 10)
        label = "Whale accumulation" if ctx.symbol in SYMBOLS_CRYPTO else "Unusual block flow"
        why = f"{label}: volume +{push*100:.0f}% vs avg, 3h move {last_ret*100:+.2f}%."
        return Vote("OnChain", direction, round(conf, 3), why,
                    {"vol_push": push, "last_ret_3h": last_ret})
    # Volume drying up → low conviction PASS
    if push < -0.4:
        return Vote("OnChain", "PASS", 0.55,
                    f"Volume drying up ({push*100:.0f}% vs avg) — no flow signal.",
                    {"vol_push": push})
    return Vote("OnChain", "PASS", 0.4, "Flow neutral.",
                {"vol_push": push, "last_ret_3h": last_ret})


# ---------- 5. Technical Agent — "The Chartist" ----------

def technical_agent(ctx: Context) -> Vote:
    cl = closes(ctx.bars)
    if len(cl) < 60:
        return Vote("Technical", "PASS", 0.4, "Not enough bars for TA.", {})
    r = rsi(cl, 14)
    m_line, m_sig, m_hist = macd(cl)
    adx_v = adx(ctx.bars, 14)
    ema50 = ema_series(cl, 50)[-1]
    ema200 = ema_series(cl, 200)[-1] if len(cl) >= 200 else ema_series(cl, len(cl) // 2)[-1]
    price = cl[-1]
    score = 0.0
    # Trend
    if price > ema50 > ema200:
        score += 1.0
    elif price < ema50 < ema200:
        score -= 1.0
    # Momentum
    score += (m_hist / max(abs(m_line), 1e-9)) * 0.6
    # Mean-rev extremes
    if r > 75:
        score -= 0.7
    elif r < 25:
        score += 0.7
    # Only act if trend strength is decent
    if adx_v < 18:
        return Vote("Technical", "PASS", 0.5,
                    f"ADX {adx_v:.0f} <18 — chop; no clean setup.",
                    {"rsi": r, "adx": adx_v, "macd_hist": m_hist})
    if score > 0.4:
        direction, mag = "LONG", score
    elif score < -0.4:
        direction, mag = "SHORT", -score
    else:
        return Vote("Technical", "PASS", 0.5,
                    f"Mixed: RSI {r:.0f}, MACD-hist {m_hist:+.2f}, ADX {adx_v:.0f}.",
                    {"rsi": r, "adx": adx_v, "macd_hist": m_hist})
    conf = min(0.92, 0.5 + mag * 0.25 + adx_v * 0.005)
    why = (f"RSI {r:.0f}, MACD-hist {m_hist:+.3f}, ADX {adx_v:.0f}, "
           f"px {'>' if price>ema50 else '<'}EMA50.")
    return Vote("Technical", direction, round(conf, 3), why,
                {"rsi": r, "adx": adx_v, "macd_hist": m_hist,
                 "ema50": ema50, "ema200": ema200, "price": price})


AGENT_WEIGHTS = {"Technical": 0.25, "Macro": 0.20,
                 "News": 0.20, "OnChain": 0.20, "Sentiment": 0.15}
ALL_AGENTS = [macro_agent, sentiment_agent, news_agent,
              onchain_agent, technical_agent]
