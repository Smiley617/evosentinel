"""Run the full EvoSentinel backtest and emit JSON artifacts for the dashboard.

Outputs (written to ../data/):
  market.json         — OHLCV per symbol (down-sampled to daily for the chart)
  events.json         — event calendar
  equity.json         — equity curve (hourly)
  trades.json         — closed trades
  blocked.json        — blocked signals (incl. habit reason + $ avoided)
  debates.json        — full debate logs by debate_id
  briefs.json         — daily Parliament Chamber Briefs
  metrics.json        — headline metrics + Evolution Score
  user_history.json   — prior 9-month user trading + bad-habit summary
"""
from __future__ import annotations
import json
import os
import sys
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path

# When run as `python -m engine.run`, package import works directly.
# When run as `python engine/run.py`, fix path:
if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from engine.data import (generate_market, generate_user_history,
                              summarise_bad_habits, SYMBOLS,
                              SYMBOLS_CRYPTO, SYMBOLS_STOCK)
    from engine.backtest import run_backtest, evolution_score
    from engine.brief import generate_briefs
    from engine.rank import compute_milestones, determine_rank
else:
    from .data import (generate_market, generate_user_history,
                        summarise_bad_habits, SYMBOLS,
                        SYMBOLS_CRYPTO, SYMBOLS_STOCK)
    from .backtest import run_backtest, evolution_score
    from .brief import generate_briefs
    from .rank import compute_milestones, determine_rank


def _ts(ts):
    return ts.isoformat() if hasattr(ts, "isoformat") else ts


def _daily_downsample(bars):
    """Take last bar of each day → list of {ts, o, h, l, c}."""
    out, cur_day, day_bars = [], None, []
    for b in bars:
        d = b.ts.date()
        if cur_day is None:
            cur_day = d
        if d != cur_day:
            if day_bars:
                o = day_bars[0].open
                h = max(x.high for x in day_bars)
                l = min(x.low for x in day_bars)
                c = day_bars[-1].close
                out.append({"ts": cur_day.isoformat(), "o": o, "h": h, "l": l, "c": c})
            cur_day = d
            day_bars = [b]
        else:
            day_bars.append(b)
    if day_bars:
        o = day_bars[0].open
        h = max(x.high for x in day_bars)
        l = min(x.low for x in day_bars)
        c = day_bars[-1].close
        out.append({"ts": cur_day.isoformat(), "o": o, "h": h, "l": l, "c": c})
    return out


def main(out_dir: str = None):
    out_dir = Path(out_dir or (Path(__file__).resolve().parent.parent / "data"))
    out_dir.mkdir(parents=True, exist_ok=True)

    start = datetime(2026, 3, 15, 0, 0, tzinfo=timezone.utc)
    print("→ Generating synthetic market (90 days, 7 symbols, hourly)...")
    market, events = generate_market(start)

    print("→ Generating prior 9-month user trade history (with bad habits)...")
    history = generate_user_history(start, days_back=270)
    habit_summary = summarise_bad_habits(history)

    # Crude baseline metrics for the user's prior 9 months
    daily_pnl = {}
    for t in history:
        daily_pnl.setdefault(t.ts.date().isoformat(), 0.0)
        daily_pnl[t.ts.date().isoformat()] += t.pnl_usd
    eq = 10_000.0
    peak = eq
    mdd = 0.0
    daily_rets = []
    for d in sorted(daily_pnl):
        prev = max(eq, 100.0)
        eq = max(eq + daily_pnl[d], 100.0)  # account floor at $100 (margin-call proxy)
        daily_rets.append((eq / prev) - 1)
        peak = max(peak, eq)
        if eq < peak:
            mdd = min(mdd, (eq - peak) / peak)
    import statistics, math as _m
    base_sharpe = 0.0
    if daily_rets and statistics.pstdev(daily_rets) > 0:
        base_sharpe = (statistics.mean(daily_rets) / statistics.pstdev(daily_rets)) * _m.sqrt(252)
    baseline = {"max_drawdown_pct": round(mdd * 100, 2),
                "sharpe": round(base_sharpe, 2),
                "final_equity": round(eq, 2)}

    print(f"  baseline (prior 9mo): DD {baseline['max_drawdown_pct']}%, Sharpe {baseline['sharpe']}, eq ${baseline['final_equity']}")

    print("→ Running EvoSentinel backtest (Parliament every 4h × 7 symbols)...")
    res = run_backtest(market, events, start)
    print(f"  trades:{res.metrics['n_trades']}  winrate:{res.metrics['winrate']}  "
          f"avgR:{res.metrics['avg_R']}  Sharpe:{res.metrics['sharpe']}  "
          f"MDD:{res.metrics['max_drawdown_pct']}%  final:${res.metrics['final_equity']}")
    print(f"  blocked:{res.metrics['n_blocked']}  habit-blocked:{res.metrics['n_habit_blocked']}  "
          f"$avoided:{res.metrics['loss_avoided_usd']}")

    print("→ Generating Daily Parliament Chamber Briefs...")
    briefs = generate_briefs(res.trades, res.blocked, res.debates)
    print(f"  {len(briefs)} briefs.")

    evo = evolution_score(habit_summary, res.metrics, baseline)
    print(f"→ Evolution Score: {evo['evolution_score']}/100")

    milestones = compute_milestones(res.trades, res.blocked, res.metrics, evo, baseline)
    rank = determine_rank(evo["evolution_score"], milestones)
    print(f"→ Rank: {rank['rank_name']} "
          f"({sum(milestones.values())}/{len(milestones)} milestones)")

    # ---- Dump JSON ----
    print(f"→ Writing artifacts to {out_dir}/")
    market_daily = {sym: _daily_downsample(bars) for sym, bars in market.items()}
    with open(out_dir / "market.json", "w") as f:
        json.dump(market_daily, f)
    with open(out_dir / "events.json", "w") as f:
        json.dump([{"ts": _ts(e.ts), "symbol": e.symbol, "kind": e.kind,
                    "label": e.label, "surprise": e.surprise} for e in events], f)
    with open(out_dir / "equity.json", "w") as f:
        json.dump(res.equity_curve, f)
    with open(out_dir / "trades.json", "w") as f:
        json.dump([{**asdict(t), "entry_ts": _ts(t.entry_ts),
                    "exit_ts": _ts(t.exit_ts)} for t in res.trades], f)
    with open(out_dir / "blocked.json", "w") as f:
        json.dump([{**asdict(b), "ts": _ts(b.ts)} for b in res.blocked], f)
    with open(out_dir / "debates.json", "w") as f:
        json.dump(res.debates, f)
    with open(out_dir / "briefs.json", "w") as f:
        json.dump(briefs, f)
    with open(out_dir / "metrics.json", "w") as f:
        json.dump({"metrics": res.metrics, "evolution": evo,
                    "baseline": baseline,
                    "symbols": SYMBOLS,
                    "symbols_crypto": SYMBOLS_CRYPTO,
                    "symbols_stock": SYMBOLS_STOCK}, f)
    with open(out_dir / "rank.json", "w") as f:
        json.dump(rank, f)
    with open(out_dir / "user_history.json", "w") as f:
        json.dump({
            "summary": habit_summary,
            "trades": [{
                "ts": _ts(t.ts), "symbol": t.symbol, "side": t.side,
                "leverage": t.leverage, "entry": t.entry, "exit": t.exit,
                "pnl_usd": t.pnl_usd, "tag": t.reason_tag,
            } for t in history[-200:]],  # last 200 for table view
            "baseline": baseline,
        }, f)
    print("✓ Done.")


if __name__ == "__main__":
    main()
