"""Backtest engine — runs Parliament every hour on every symbol,
applies risk gates, executes simulated trades, and tracks Evolution Score.
"""
from __future__ import annotations
import math
import statistics
from dataclasses import dataclass, field, asdict
from datetime import datetime, timedelta
from typing import Dict, List, Optional

from .data import (Bar, MarketEvent, UserTrade, SYMBOLS,
                    SYMBOLS_CRYPTO, BACKTEST_DAYS, summarise_bad_habits)
from .agents import Context, ALL_AGENTS, Vote
from .parliament import tally, debate, Consensus
from .risk import (evaluate, OpenPosition, RiskDecision,
                    ACCOUNT_START, RISK_PER_TRADE)


@dataclass
class ClosedTrade:
    symbol: str
    side: str
    entry_ts: datetime
    exit_ts: datetime
    entry: float
    exit: float
    qty: float
    leverage: float
    pnl_usd: float
    r_multiple: float
    exit_reason: str
    consensus_conf: float
    debate_id: str


@dataclass
class BlockedSignal:
    ts: datetime
    symbol: str
    proposed_direction: str
    reason: str
    habit_blocked: Optional[str]
    debate_id: str
    estimated_loss_avoided_usd: float


@dataclass
class BacktestResult:
    equity_curve: List[tuple]                     # (ts, equity)
    trades: List[ClosedTrade]
    blocked: List[BlockedSignal]
    debates: Dict[str, dict]                       # debate_id -> log
    daily_briefs: List[dict] = field(default_factory=list)
    metrics: Dict = field(default_factory=dict)


# ---------- Helpers ----------

def _r_multiple(trade: ClosedTrade, init_risk_usd: float) -> float:
    return trade.pnl_usd / init_risk_usd if init_risk_usd > 0 else 0.0


def _simulate_exit(pos: OpenPosition, future_bars: List[Bar]) -> tuple:
    """Walk future bars until SL or any TP fills; return (exit_price, exit_ts, reason, realised_qty).

    TPs are partial — we collapse to single weighted exit price for clean accounting.
    Forced TP: if 2R fills, we lock 50% gain; if then SL hits remainder we still
    book the 0.5*2R - 0.5*1R = +0.5R minimum.
    """
    qty_remaining = 1.0
    realised_value = 0.0  # in units of price-per-qty * frac
    # Sort TPs by distance from entry direction
    tps = list(pos.tps)
    hit_any_tp = False
    for b in future_bars:
        # Check SL first (worst-case fill bias)
        if pos.side == "LONG":
            if b.low <= pos.stop:
                # SL hits remaining
                realised_value += qty_remaining * pos.stop
                qty_remaining = 0.0
                reason = "SL" if not hit_any_tp else "SL-after-TP1"
                return realised_value, b.ts, reason
            # Then TPs (ascending price)
            for frac, tp_px in tps:
                if b.high >= tp_px and qty_remaining > 0:
                    take = min(frac, qty_remaining)
                    realised_value += take * tp_px
                    qty_remaining -= take
                    hit_any_tp = True
            if qty_remaining <= 1e-6:
                return realised_value, b.ts, "TP-full"
        else:  # SHORT
            if b.high >= pos.stop:
                realised_value += qty_remaining * pos.stop
                qty_remaining = 0.0
                reason = "SL" if not hit_any_tp else "SL-after-TP1"
                return realised_value, b.ts, reason
            for frac, tp_px in tps:
                if b.low <= tp_px and qty_remaining > 0:
                    take = min(frac, qty_remaining)
                    realised_value += take * tp_px
                    qty_remaining -= take
                    hit_any_tp = True
            if qty_remaining <= 1e-6:
                return realised_value, b.ts, "TP-full"
    # Time-stopped: close at last bar's close
    last = future_bars[-1] if future_bars else None
    if last is not None and qty_remaining > 0:
        realised_value += qty_remaining * last.close
        return realised_value, last.ts, "Time-stop"
    return realised_value, pos.entry_ts, "Stale"


# ---------- Main backtest loop ----------

def run_backtest(market: Dict[str, List[Bar]],
                 events: List[MarketEvent],
                 start: datetime) -> BacktestResult:
    # Time index = union of all symbols' timestamps (they share grid)
    base_sym = SYMBOLS[0]
    timeline = [b.ts for b in market[base_sym]]
    warmup_h = 500  # need 20d for macro long-trend + ema200
    decision_step = 4  # decide every 4 hours (6/day) to keep volume reasonable
    equity = ACCOUNT_START
    equity_curve: List[tuple] = []
    open_positions: List[OpenPosition] = []
    closed: List[ClosedTrade] = []
    blocked: List[BlockedSignal] = []
    debates: Dict[str, dict] = {}
    debate_counter = 0
    daily_pnl: Dict[str, float] = {}
    recent_closed_lookup: Dict[str, List[dict]] = {s: [] for s in SYMBOLS}

    for i in range(warmup_h, len(timeline)):
        now = timeline[i]
        day = now.date().isoformat()
        daily_pnl.setdefault(day, 0.0)

        # ---- 1. Update open positions for fills using current bar ----
        still_open: List[OpenPosition] = []
        for pos in open_positions:
            future = market[pos.symbol][i:i + 1]  # this hour's bar
            if not future:
                still_open.append(pos)
                continue
            b = future[0]
            # Use single-bar walk; full path simulated on entry
            # We'll close at end of position trajectory — recompute incrementally:
            still_open.append(pos)  # placeholder; we'll close-on-entry below
        open_positions = still_open

        # ---- 2. Decide new trades on this step ----
        if (i - warmup_h) % decision_step != 0:
            equity_curve.append((now.isoformat(), round(equity, 2)))
            continue

        for sym in SYMBOLS:
            bars_so_far = market[sym][:i + 1]
            ctx = Context(now=now, symbol=sym, bars=bars_so_far,
                          market={s: market[s][:i + 1] for s in SYMBOLS},
                          events=events)
            votes: List[Vote] = [a(ctx) for a in ALL_AGENTS]
            cons = tally(votes)
            debate_counter += 1
            d_id = f"D{debate_counter:05d}"
            log = debate(sym, votes, cons, seed=debate_counter)
            log["ts"] = now.isoformat()
            log["votes"] = [asdict(v) for v in votes]
            log["consensus"] = asdict(cons)
            debates[d_id] = log

            decision = evaluate(now, sym, cons, bars_so_far, events,
                                open_positions, recent_closed_lookup[sym],
                                equity, daily_pnl[day])
            if not decision.allow:
                # estimate $-loss avoided when habit-blocked
                est_loss = 0.0
                if decision.habit_blocked:
                    # Estimate using next-24h adverse move proxy
                    fut = market[sym][i + 1:i + 1 + 24]
                    if fut and cons.direction != "PASS":
                        entry_px = bars_so_far[-1].close
                        worst = min(b.low for b in fut) if cons.direction == "LONG" else max(b.high for b in fut)
                        adverse = (entry_px - worst) if cons.direction == "LONG" else (worst - entry_px)
                        # Assume user would have used 10x like history shows
                        est_loss = max(0, adverse * 10 * (RISK_PER_TRADE * equity / max(entry_px, 1e-6)) * 10)
                if cons.direction != "PASS":
                    blocked.append(BlockedSignal(
                        ts=now, symbol=sym, proposed_direction=cons.direction,
                        reason=decision.block_reason or "blocked",
                        habit_blocked=decision.habit_blocked,
                        debate_id=d_id,
                        estimated_loss_avoided_usd=round(est_loss, 2),
                    ))
                continue

            # Build position
            entry_px = bars_so_far[-1].close
            qty = decision.risk_usd / abs(entry_px - decision.stop_loss)
            notional = qty * entry_px
            pos = OpenPosition(
                symbol=sym, side=cons.direction, entry_ts=now,
                entry=entry_px, qty=qty, leverage=decision.leverage,
                stop=decision.stop_loss, tps=decision.take_profits,
                risk_usd=decision.risk_usd, notional=notional,
                consensus_conf=cons.confidence, debate_id=d_id,
            )
            # Simulate exit on full future path up to 7 days max
            horizon = market[sym][i + 1:i + 1 + 24 * 7]
            exit_value, exit_ts, reason = _simulate_exit(pos, horizon)
            # exit_value is sum of (fraction * exit_price)
            avg_exit_px = exit_value  # because qty_remaining fractions sum to 1
            if pos.side == "LONG":
                pnl = (avg_exit_px - entry_px) * qty * pos.leverage / max(pos.leverage, 1)
                pnl = (avg_exit_px - entry_px) * qty
            else:
                pnl = (entry_px - avg_exit_px) * qty
            r_mult = pnl / decision.risk_usd if decision.risk_usd > 0 else 0.0
            trade = ClosedTrade(symbol=sym, side=pos.side,
                                entry_ts=now, exit_ts=exit_ts,
                                entry=round(entry_px, 4),
                                exit=round(avg_exit_px, 4),
                                qty=round(qty, 6), leverage=pos.leverage,
                                pnl_usd=round(pnl, 2),
                                r_multiple=round(r_mult, 2),
                                exit_reason=reason,
                                consensus_conf=cons.confidence,
                                debate_id=d_id)
            closed.append(trade)
            equity += pnl
            daily_pnl[day] += pnl
            recent_closed_lookup[sym].append({
                "symbol": sym, "exit_ts": exit_ts, "pnl_usd": pnl
            })
            # Keep lookup small
            recent_closed_lookup[sym] = recent_closed_lookup[sym][-10:]

        equity_curve.append((now.isoformat(), round(equity, 2)))

    metrics = compute_metrics(closed, blocked, equity_curve)
    return BacktestResult(equity_curve=equity_curve,
                          trades=closed, blocked=blocked,
                          debates=debates, metrics=metrics)


# ---------- Metrics + Evolution Score ----------

def compute_metrics(trades: List[ClosedTrade],
                    blocked: List[BlockedSignal],
                    eq_curve: List[tuple]) -> Dict:
    if not trades:
        return {"n_trades": 0}
    pnls = [t.pnl_usd for t in trades]
    wins = [p for p in pnls if p > 0]
    losses = [p for p in pnls if p <= 0]
    eqs = [v for _, v in eq_curve]
    # Daily returns from equity curve
    daily = []
    last_day = None
    last_eq = eqs[0]
    by_day: Dict[str, float] = {}
    for ts, v in eq_curve:
        d = ts[:10]
        by_day[d] = v
    days = sorted(by_day)
    for i in range(1, len(days)):
        daily.append(by_day[days[i]] / by_day[days[i - 1]] - 1)
    sharpe = 0.0
    if daily and statistics.pstdev(daily) > 0:
        sharpe = (statistics.mean(daily) / statistics.pstdev(daily)) * math.sqrt(252)
    # Max drawdown
    peak = eqs[0]
    mdd = 0.0
    for v in eqs:
        if v > peak:
            peak = v
        dd = (v - peak) / peak
        if dd < mdd:
            mdd = dd
    avg_R = sum(t.r_multiple for t in trades) / len(trades)
    forced_tp_hits = sum(1 for t in trades if "TP" in t.exit_reason)
    return {
        "n_trades": len(trades),
        "winrate": round(len(wins) / len(trades), 3),
        "avg_R": round(avg_R, 3),
        "expectancy_usd": round(sum(pnls) / len(pnls), 2),
        "gross_pnl_usd": round(sum(pnls), 2),
        "final_equity": round(eqs[-1], 2),
        "max_drawdown_pct": round(mdd * 100, 2),
        "sharpe": round(sharpe, 2),
        "forced_tp_rate": round(forced_tp_hits / len(trades), 3),
        "n_blocked": len(blocked),
        "n_habit_blocked": sum(1 for b in blocked if b.habit_blocked),
        "loss_avoided_usd": round(sum(b.estimated_loss_avoided_usd for b in blocked), 2),
    }


def evolution_score(user_history_summary: Dict[str, dict],
                    metrics: Dict,
                    user_baseline: Dict) -> Dict:
    """Composite 0-100. Each component scored 0-100 then weighted."""
    # Baseline DD from history (synth proxy)
    base_dd = user_baseline.get("max_drawdown_pct", -22.0)
    new_dd = metrics.get("max_drawdown_pct", 0)
    dd_improvement = max(0.0, (abs(base_dd) - abs(new_dd)) / max(abs(base_dd), 1e-6))
    dd_score = min(100, dd_improvement * 100)

    base_sharpe = user_baseline.get("sharpe", -0.4)
    new_sharpe = metrics.get("sharpe", 0)
    sharpe_score = min(100, max(0, (new_sharpe - base_sharpe) / 2.0 * 100))

    # Emotional override reduction = blocked-habits / opportunities-to-revenge
    total_habit_blocks = metrics.get("n_habit_blocked", 0)
    # Normalise: assume user historically had ~1 bad-habit trade/day
    expected_bad = BACKTEST_DAYS
    eo_score = min(100, total_habit_blocks / max(expected_bad, 1) * 100)

    forced_tp_score = metrics.get("forced_tp_rate", 0) * 100

    composite = (dd_score * 0.30 + sharpe_score * 0.30 +
                 eo_score * 0.25 + forced_tp_score * 0.15)
    return {
        "drawdown_reduction_score": round(dd_score, 1),
        "sharpe_improvement_score": round(sharpe_score, 1),
        "emotional_override_reduction_score": round(eo_score, 1),
        "forced_tp_adherence_score": round(forced_tp_score, 1),
        "evolution_score": round(composite, 1),
        "baseline_dd_pct": base_dd, "new_dd_pct": new_dd,
        "baseline_sharpe": base_sharpe, "new_sharpe": new_sharpe,
        "usd_saved_from_habits": metrics.get("loss_avoided_usd", 0),
    }
