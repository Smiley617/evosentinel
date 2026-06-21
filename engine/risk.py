"""Risk manager + bad-habit auto-blocker.

Responsibilities:
  • Position sizing (1% account risk per trade, capped by margin)
  • Dynamic leverage based on realised vol regime
  • Forced take-profits at 2R / 3R / trail
  • Auto-prevent the user's documented bad habits
"""
from __future__ import annotations
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Dict, List, Optional

from .data import Bar, MarketEvent, SYMBOLS_CRYPTO, SYMBOLS_STOCK, UserTrade
from .indicators import atr, rsi, sma, closes, realised_vol
from .parliament import Consensus

ACCOUNT_START = 10_000.0
RISK_PER_TRADE = 0.01          # 1% of equity per trade
MAX_OPEN_POSITIONS = 3
DAILY_LOSS_CIRCUIT = -0.03     # -3% of equity = halt for the day


@dataclass
class RiskDecision:
    allow: bool
    block_reason: Optional[str] = None
    leverage: float = 1.0
    stop_loss: float = 0.0
    take_profits: List[tuple] = field(default_factory=list)  # (pct_of_pos, R)
    risk_usd: float = 0.0
    habit_blocked: Optional[str] = None  # which bad habit was blocked


@dataclass
class OpenPosition:
    symbol: str
    side: str
    entry_ts: datetime
    entry: float
    qty: float
    leverage: float
    stop: float
    tps: List[tuple]              # (frac_remaining, target_price)
    risk_usd: float
    notional: float
    consensus_conf: float
    debate_id: str


def dynamic_leverage(symbol: str, bars: List[Bar], conf: float) -> float:
    """Lower leverage in high-vol or low-confidence regimes."""
    cl = closes(bars)
    rv = realised_vol(cl, 48)            # ~2 days
    if symbol in SYMBOLS_CRYPTO:
        # rv typical ~0.005-0.03
        base = 5.0 if rv < 0.010 else 3.0 if rv < 0.020 else 2.0
    else:
        base = 3.0 if rv < 0.005 else 2.0 if rv < 0.010 else 1.5
    # Confidence taper
    if conf < 0.55:
        base *= 0.6
    elif conf < 0.70:
        base *= 0.8
    return round(base, 2)


def _near_event(now: datetime, symbol: str, events: List[MarketEvent],
                window_minutes: int = 30) -> Optional[MarketEvent]:
    for e in events:
        rel = (e.ts - now).total_seconds() / 60
        if 0 <= rel <= window_minutes:
            if e.symbol == symbol:
                return e
            if not e.symbol and e.kind in ("fomc", "cpi", "jobs"):
                return e
    return None


def evaluate(now: datetime,
              symbol: str,
              cons: Consensus,
              bars: List[Bar],
              events: List[MarketEvent],
              open_positions: List[OpenPosition],
              recent_closed_today: List[dict],
              equity: float,
              session_pnl_today: float,
              ) -> RiskDecision:
    """Return RiskDecision. If allowed, includes leverage, stop, TPs, size."""
    if cons.direction == "PASS":
        return RiskDecision(False, "Parliament said STAND DOWN.")

    # Circuit breaker
    if session_pnl_today / max(equity, 1) <= DAILY_LOSS_CIRCUIT:
        return RiskDecision(False, "Daily -3% circuit breaker active.",
                            habit_blocked="no_stop")

    # Max open positions
    if len(open_positions) >= MAX_OPEN_POSITIONS:
        return RiskDecision(False, f"Max {MAX_OPEN_POSITIONS} positions open.")

    # Already open same symbol → don't double up
    if any(p.symbol == symbol for p in open_positions):
        return RiskDecision(False, f"Already long/short {symbol}.")

    # Habit: REVENGE — last 2 trades on symbol in past 4h were losses
    recent_sym = [t for t in recent_closed_today
                  if t["symbol"] == symbol
                  and (now - t["exit_ts"]).total_seconds() <= 4 * 3600]
    if len(recent_sym) >= 2 and all(t["pnl_usd"] < 0 for t in recent_sym[-2:]):
        return RiskDecision(False,
                            "Blocked: revenge-trade pattern (2 losses on "
                            f"{symbol} within 4h).",
                            habit_blocked="revenge")

    # Habit: FOMO-TOP — long after RSI>75 + price 2σ above 20-MA
    cl = closes(bars)
    r = rsi(cl, 14)
    m20 = sma(cl, 20)
    if len(cl) >= 20:
        s = cl[-20:]
        mean = sum(s) / 20
        sd = (sum((x - mean) ** 2 for x in s) / 20) ** 0.5
        z = (cl[-1] - mean) / sd if sd else 0
    else:
        z = 0
    if cons.direction == "LONG" and r > 75 and z > 2:
        return RiskDecision(False,
                            f"Blocked: FOMO-top long (RSI {r:.0f}, z {z:.1f}).",
                            habit_blocked="fomo_top")

    # Habit: pre-event trading — within 30 min of stock earnings / macro print
    ev = _near_event(now, symbol, events, window_minutes=30)
    if ev is not None:
        return RiskDecision(False,
                            f"Blocked: trading inside 30m of '{ev.label}'.",
                            habit_blocked="no_stop")

    # Sizing
    a = atr(bars, 14)
    stop_distance = 1.2 * a
    if stop_distance <= 0:
        return RiskDecision(False, "ATR=0, cannot size.")
    risk_usd = RISK_PER_TRADE * equity
    qty = risk_usd / stop_distance
    price = bars[-1].close
    notional = qty * price

    lev = dynamic_leverage(symbol, bars, cons.confidence)
    # cap notional by leverage * equity (use 80% margin headroom)
    max_notional = lev * equity * 0.8
    if notional > max_notional:
        qty = max_notional / price
        notional = qty * price
        risk_usd = qty * stop_distance  # recompute realised risk

    if cons.direction == "LONG":
        stop = price - stop_distance
        tp1 = price + 2 * stop_distance
        tp2 = price + 3 * stop_distance
    else:
        stop = price + stop_distance
        tp1 = price - 2 * stop_distance
        tp2 = price - 3 * stop_distance

    # Forced TP plan: 50% at 2R, 25% at 3R, 25% trail (modelled as 4R hard cap)
    tps = [(0.50, tp1), (0.25, tp2),
           (0.25, price + (4 * stop_distance if cons.direction == "LONG"
                            else -4 * stop_distance))]

    return RiskDecision(
        allow=True,
        leverage=lev,
        stop_loss=round(stop, 4),
        take_profits=[(round(f, 3), round(p, 4)) for f, p in tps],
        risk_usd=round(risk_usd, 2),
    )
