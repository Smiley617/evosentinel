"""Daily Parliament Chamber Brief generator.

Emits one brief per trading day, with:
  • Headline verdicts (top votes, biggest debates)
  • One funny debate moment
  • $ impact for the day (realised PnL + loss-avoided $)
  • One practical lesson tied to either a closed trade or a blocked habit.
"""
from __future__ import annotations
import random
from collections import defaultdict
from datetime import datetime
from typing import Dict, List

from .backtest import ClosedTrade, BlockedSignal


LESSONS = [
    "When 4 out of 5 voices agree, your job is to size — not to debate.",
    "A blocked revenge trade is a green trade you never had to take.",
    "The 2R forced TP is unsexy; the equity curve disagrees.",
    "Volatility expansion is not an entry signal — it's a sizing signal.",
    "If News says STAND DOWN, the chart's prettiest setup is still a trap.",
    "Whales fill quietly; retail tweets loudly. Follow the fills.",
    "Strong trend (ADX > 25) + 3-of-5 alignment is the highest-edge config.",
    "A 'good' trade you can't size into is just stress — pass on it.",
    "Macro regime trumps any 5-minute candle pattern.",
    "Forced partials at 2R remove the only decision your dopamine can't make.",
]


def generate_briefs(trades: List[ClosedTrade],
                    blocked: List[BlockedSignal],
                    debates: Dict[str, dict]) -> List[dict]:
    by_day: Dict[str, dict] = defaultdict(
        lambda: {"trades": [], "blocked": []})
    for t in trades:
        by_day[t.entry_ts.date().isoformat()]["trades"].append(t)
    for b in blocked:
        by_day[b.ts.date().isoformat()]["blocked"].append(b)

    out: List[dict] = []
    rng = random.Random(7)
    for day in sorted(by_day):
        bucket = by_day[day]
        t_list: List[ClosedTrade] = bucket["trades"]
        b_list: List[BlockedSignal] = bucket["blocked"]
        if not t_list and not b_list:
            continue
        realised = sum(t.pnl_usd for t in t_list)
        saved = sum(b.estimated_loss_avoided_usd for b in b_list)
        # Highlight: best & worst trade
        best = max(t_list, key=lambda t: t.pnl_usd, default=None)
        worst = min(t_list, key=lambda t: t.pnl_usd, default=None)
        # Funny moment: pick any debate from the day
        all_debate_ids = ([t.debate_id for t in t_list] +
                          [b.debate_id for b in b_list])
        funny_line = ""
        funny_symbol = ""
        if all_debate_ids:
            pick = rng.choice(all_debate_ids)
            d = debates.get(pick, {})
            funny_line = d.get("funny_line", "")
            funny_symbol = d.get("symbol", "")
        # Lesson: rotate based on day hash + bias toward blocked-habit insight
        if b_list and rng.random() < 0.5:
            habit = b_list[0].habit_blocked or "no_stop"
            lesson_map = {
                "revenge": LESSONS[1],
                "fomo_top": LESSONS[3],
                "no_stop": LESSONS[8],
                "held_loser": LESSONS[2],
            }
            lesson = lesson_map.get(habit, rng.choice(LESSONS))
        else:
            lesson = LESSONS[hash(day) % len(LESSONS)]

        # Vote highlights
        highlights = []
        for t in t_list[:3]:
            d = debates.get(t.debate_id, {})
            cons = d.get("consensus", {})
            highlights.append({
                "kind": "TAKEN",
                "symbol": t.symbol, "side": t.side,
                "lev": t.leverage, "r": t.r_multiple,
                "pnl": t.pnl_usd, "exit_reason": t.exit_reason,
                "aligned": cons.get("agreeing", []),
                "dissent": cons.get("dissenting", []),
            })
        for b in b_list[:2]:
            highlights.append({
                "kind": "BLOCKED", "symbol": b.symbol,
                "side": b.proposed_direction,
                "habit": b.habit_blocked,
                "reason": b.reason,
                "loss_avoided_usd": b.estimated_loss_avoided_usd,
            })

        out.append({
            "date": day,
            "realised_pnl_usd": round(realised, 2),
            "loss_avoided_usd": round(saved, 2),
            "net_impact_usd": round(realised + saved, 2),
            "n_trades": len(t_list),
            "n_blocked": len(b_list),
            "best_trade": ({"symbol": best.symbol, "pnl": best.pnl_usd,
                            "r": best.r_multiple} if best else None),
            "worst_trade": ({"symbol": worst.symbol, "pnl": worst.pnl_usd,
                             "r": worst.r_multiple} if worst else None),
            "funny_moment": {"line": funny_line, "symbol": funny_symbol},
            "lesson": lesson,
            "highlights": highlights,
        })
    return out
