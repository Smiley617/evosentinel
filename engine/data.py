"""Synthetic but realistic market data + user historical trade habits.

Produces 90 days of hourly OHLCV for BTC, ETH, SOL (crypto perps on Bitget)
and AAPL, TSLA, NVDA, QQQ (Bitget Stocks 2.0 tokenized). Also synthesises
an event calendar (earnings, FOMC, CPI) and a 9-month "user trade history"
that intentionally encodes bad habits we will later auto-prevent.
"""

from __future__ import annotations
import math
import random
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Tuple

SYMBOLS_CRYPTO = ["BTCUSDT", "ETHUSDT", "SOLUSDT"]
SYMBOLS_STOCK = ["AAPL", "TSLA", "NVDA", "QQQ"]
SYMBOLS = SYMBOLS_CRYPTO + SYMBOLS_STOCK

BASE_PRICES = {
    "BTCUSDT": 68000.0, "ETHUSDT": 3500.0, "SOLUSDT": 165.0,
    "AAPL": 225.0, "TSLA": 245.0, "NVDA": 128.0, "QQQ": 480.0,
}
ANNUAL_VOL = {
    "BTCUSDT": 0.70, "ETHUSDT": 0.85, "SOLUSDT": 1.10,
    "AAPL": 0.28, "TSLA": 0.62, "NVDA": 0.55, "QQQ": 0.22,
}

BACKTEST_DAYS = 90
HOURS_PER_DAY = 24
SEED = 20260314
SYMBOL_SEEDS = {  # fixed offsets so runs are bit-identical across processes
    "BTCUSDT": 19, "ETHUSDT": 23, "SOLUSDT": 29,
    "AAPL": 31, "TSLA": 37, "NVDA": 41, "QQQ": 43,
}


@dataclass
class Bar:
    ts: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float


@dataclass
class MarketEvent:
    ts: datetime
    symbol: str          # "" for macro
    kind: str            # earnings, fomc, cpi, listing, halving_proxy
    label: str
    surprise: float = 0.0  # -1..1 — used to shock the price path


@dataclass
class UserTrade:
    ts: datetime
    symbol: str
    side: str            # LONG / SHORT
    leverage: float
    entry: float
    exit: float
    pnl_usd: float
    reason_tag: str      # revenge, fomo_top, no_stop, held_loser, normal


def _seed_rng(suffix: int = 0) -> random.Random:
    return random.Random(SEED + suffix)


def _generate_event_calendar(start: datetime) -> List[MarketEvent]:
    """Hand-place macro and stock events across the 90-day window."""
    ev: List[MarketEvent] = []
    # Macro
    for d, surp, lab in [(8, -0.6, "Hot CPI print"),
                          (22, 0.4, "FOMC dovish hold"),
                          (51, -0.5, "FOMC hawkish dots"),
                          (68, 0.3, "Cool CPI"),
                          (84, -0.3, "Jobs report hot")]:
        kind = "cpi" if "CPI" in lab else "fomc" if "FOMC" in lab else "jobs"
        ev.append(MarketEvent(start + timedelta(days=d, hours=14), "", kind, lab, surp))
    # Stock earnings
    earn = [(15, "AAPL", 0.55, "AAPL beats, services strong"),
            (16, "QQQ",  0.20, "Big-tech beats lift QQQ"),
            (29, "TSLA", -0.70, "TSLA miss, margin compression"),
            (43, "NVDA", 0.80, "NVDA blowout, data-center +120%"),
            (72, "TSLA", 0.35, "TSLA delivery beat"),
            (78, "AAPL", -0.25, "AAPL guides soft on China")]
    for d, sym, surp, lab in earn:
        ev.append(MarketEvent(start + timedelta(days=d, hours=20), sym, "earnings", lab, surp))
    # Crypto-specific
    ev.append(MarketEvent(start + timedelta(days=12, hours=3), "BTCUSDT", "listing",
                          "Spot-ETH ETF inflow surge", 0.45))
    ev.append(MarketEvent(start + timedelta(days=38, hours=9), "SOLUSDT", "listing",
                          "Solana memecoin frenzy", 0.55))
    ev.append(MarketEvent(start + timedelta(days=60, hours=2), "BTCUSDT", "halving_proxy",
                          "Mt.Gox repayment fear", -0.55))
    return sorted(ev, key=lambda e: e.ts)


def _path(symbol: str, start: datetime, events: List[MarketEvent]) -> List[Bar]:
    rng = _seed_rng(SYMBOL_SEEDS[symbol])
    n = BACKTEST_DAYS * HOURS_PER_DAY
    sigma_h = ANNUAL_VOL[symbol] / math.sqrt(365 * 24)
    drift_h = 0.05 / (365 * 24)  # mild positive drift
    px = BASE_PRICES[symbol]
    bars: List[Bar] = []
    ev_by_hour: Dict[int, List[MarketEvent]] = {}
    for e in events:
        if e.symbol and e.symbol != symbol:
            continue
        # Macro affects all; stock event only its symbol; crypto listing only crypto majors
        if not e.symbol and symbol in SYMBOLS_STOCK and e.kind in ("cpi", "fomc", "jobs"):
            pass
        elif not e.symbol and symbol in SYMBOLS_CRYPTO and e.kind in ("fomc", "cpi"):
            pass
        elif e.symbol == symbol:
            pass
        else:
            continue
        h_idx = int((e.ts - start).total_seconds() // 3600)
        ev_by_hour.setdefault(h_idx, []).append(e)

    # Regime: alternate trending / chopping every ~14 days
    for i in range(n):
        regime = (i // (14 * 24)) % 3  # 0=trend up, 1=chop, 2=trend down
        regime_drift = {0: 1.5 * drift_h, 1: 0.0, 2: -1.2 * drift_h}[regime]
        shock = 0.0
        for e in ev_by_hour.get(i, []):
            # Stock-only shocks fully hit; macro half-hits stocks, ~30% crypto
            mag = e.surprise
            if not e.symbol:
                mag *= 0.5 if symbol in SYMBOLS_STOCK else 0.3
            shock += mag * (0.03 if symbol in SYMBOLS_CRYPTO else 0.04)
        eps = rng.gauss(0, 1) * sigma_h
        ret = regime_drift + eps + shock
        new_px = px * math.exp(ret)
        hi = max(px, new_px) * (1 + abs(rng.gauss(0, sigma_h * 0.4)))
        lo = min(px, new_px) * (1 - abs(rng.gauss(0, sigma_h * 0.4)))
        vol = abs(rng.gauss(1, 0.3)) * (1_000_000 if symbol in SYMBOLS_CRYPTO else 500_000)
        if ev_by_hour.get(i):
            vol *= 3.5
        bars.append(Bar(start + timedelta(hours=i), px, hi, lo, new_px, vol))
        px = new_px
    return bars


def generate_market(start: datetime = None) -> Tuple[Dict[str, List[Bar]], List[MarketEvent]]:
    if start is None:
        start = datetime(2026, 3, 15, 0, 0, tzinfo=timezone.utc)
    events = _generate_event_calendar(start)
    series = {sym: _path(sym, start, events) for sym in SYMBOLS}
    return series, events


# ---------- User trade history (with bad habits) ----------

BAD_HABITS = ["revenge", "fomo_top", "no_stop", "held_loser"]


def generate_user_history(start: datetime, days_back: int = 270) -> List[UserTrade]:
    """Generates 9 months of user trading prior to EvoSentinel activation.

    Encodes 4 dominant bad habits at realistic frequencies. We use simple
    price proxies so the timeline is self-consistent for the dashboard.
    """
    rng = _seed_rng(99)
    hist: List[UserTrade] = []
    cur = start - timedelta(days=days_back)
    while cur < start:
        # ~1.4 trades/day on average
        n = rng.choices([0, 1, 2, 3, 4], weights=[10, 35, 30, 18, 7])[0]
        for _ in range(n):
            sym = rng.choice(SYMBOLS)
            base = BASE_PRICES[sym] * (0.7 + 0.6 * rng.random())
            side = rng.choices(["LONG", "SHORT"], weights=[72, 28])[0]
            # Bad-habit bias
            tag_roll = rng.random()
            if tag_roll < 0.22:
                tag, lev = "revenge", rng.choice([10, 15, 20])
                pnl_mult = rng.gauss(-0.9, 0.7)
            elif tag_roll < 0.40:
                tag, lev = "fomo_top", rng.choice([10, 20, 25])
                pnl_mult = rng.gauss(-0.7, 0.9)
            elif tag_roll < 0.55:
                tag, lev = "no_stop", rng.choice([5, 10, 15])
                pnl_mult = rng.gauss(-0.5, 1.4)
            elif tag_roll < 0.68:
                tag, lev = "held_loser", rng.choice([3, 5, 10])
                pnl_mult = rng.gauss(-0.4, 1.1)
            else:
                tag, lev = "normal", rng.choice([2, 3, 5])
                pnl_mult = rng.gauss(0.35, 1.0)
            entry = base
            move = rng.gauss(0, 0.018) * (3 if sym in SYMBOLS_CRYPTO else 1)
            exit_ = entry * (1 + move * (1 if side == "LONG" else -1) * (1 if pnl_mult > 0 else -1))
            risk_usd = 35.0  # baseline notional risk (realistic retail size)
            pnl = pnl_mult * risk_usd
            hist.append(UserTrade(cur + timedelta(hours=rng.randint(0, 23)),
                                   sym, side, float(lev), entry, exit_, pnl, tag))
        cur += timedelta(days=1)
    return hist


def summarise_bad_habits(hist: List[UserTrade]) -> Dict[str, dict]:
    out: Dict[str, dict] = {}
    for tag in BAD_HABITS + ["normal"]:
        trades = [t for t in hist if t.reason_tag == tag]
        if not trades:
            continue
        pnl = sum(t.pnl_usd for t in trades)
        winrate = sum(1 for t in trades if t.pnl_usd > 0) / len(trades)
        avg_lev = sum(t.leverage for t in trades) / len(trades)
        out[tag] = {"count": len(trades), "pnl_usd": round(pnl, 2),
                    "winrate": round(winrate, 3), "avg_lev": round(avg_lev, 2)}
    return out
