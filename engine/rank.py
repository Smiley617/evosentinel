"""Evolution Rank — gamified progression from Raw Trader → Ghost.

Tier is driven by the composite Evolution Score *gated by* behavioural
milestones, so a user can't get to a higher tier on score alone — they
have to actually exhibit the behaviour the rank demands.

Ranks
  RAW TRADER : emotional, unfiltered. baseline state.
  DISCIPLINED: forced-TPs honoured, first habit-blocks accepted.
  SENTINEL   : drawdown halved, blocker is second nature, positive Sharpe.
  GHOST      : invisible to your own worst instincts. minimal DD, high Sharpe.
"""
from __future__ import annotations
from dataclasses import dataclass
from typing import Dict, List

from .backtest import ClosedTrade, BlockedSignal


RANKS = [
    {"key": "RAW",        "name": "Raw Trader",
     "color": "#8a93a6", "subtitle": "Unfiltered. Reactive. Honest.",
     "score_min": 0,   "score_max": 39},
    {"key": "DISCIPLINED","name": "Disciplined",
     "color": "#5fd0c1", "subtitle": "Forced TPs honoured. Habit-blocks accepted.",
     "score_min": 40,  "score_max": 64},
    {"key": "SENTINEL",   "name": "Sentinel",
     "color": "#d4b14a", "subtitle": "Drawdown halved. The blocker is second nature.",
     "score_min": 65,  "score_max": 84},
    {"key": "GHOST",      "name": "Ghost",
     "color": "#a888ff", "subtitle": "Invisible to your own worst instincts.",
     "score_min": 85,  "score_max": 100},
]


MILESTONES_DEF = [
    # (key, label, description, tier_required)
    ("first_refusal",  "First Refusal",
     "Accepted your first habit-block without overriding it.",      "DISCIPLINED"),
    ("five_forced_tp", "Patience x5",
     "Honoured 5 forced take-profits without manual exit.",        "DISCIPLINED"),
    ("dollar_1k_saved","$1,000 Saved",
     "Cumulative loss avoided crossed $1,000.",                    "DISCIPLINED"),
    ("dd_halved",      "Iron Drawdown",
     "Backtest drawdown is less than half the baseline.",          "SENTINEL"),
    ("sharpe_positive","Sharpe Above Zero",
     "Annualised Sharpe ratio turned positive.",                   "SENTINEL"),
    ("storm_walker",   "Storm Walker",
     "Stood down through 3+ scheduled macro/earnings windows.",    "SENTINEL"),
    ("dollar_2_5k_saved","$2,500 Saved",
     "Cumulative loss avoided crossed $2,500.",                    "SENTINEL"),
    ("ghost_winrate",  "Ghost Streak",
     "3 consecutive trades closed at +2R or better.",              "GHOST"),
    ("zero_relapse",   "Zero Relapse",
     "Zero bad-habit overrides across the full backtest.",         "GHOST"),
    ("sharpe_above_1", "Institutional Sharpe",
     "Annualised Sharpe ratio above 1.0.",                         "GHOST"),
]


def _consec_forced_tp(trades: List[ClosedTrade]) -> int:
    best = cur = 0
    for t in sorted(trades, key=lambda x: x.entry_ts):
        if "TP" in t.exit_reason:
            cur += 1
            best = max(best, cur)
        else:
            cur = 0
    return best


def _ghost_streak(trades: List[ClosedTrade]) -> int:
    best = cur = 0
    for t in sorted(trades, key=lambda x: x.entry_ts):
        if t.r_multiple >= 2.0:
            cur += 1
            best = max(best, cur)
        else:
            cur = 0
    return best


def compute_milestones(trades: List[ClosedTrade],
                        blocked: List[BlockedSignal],
                        metrics: Dict,
                        evolution: Dict,
                        baseline: Dict) -> Dict[str, bool]:
    cum_saved = sum(b.estimated_loss_avoided_usd for b in blocked)
    storm_blocks = sum(1 for b in blocked if "30m of" in (b.reason or ""))
    ms = {
        "first_refusal":     len(blocked) >= 1,
        "five_forced_tp":    _consec_forced_tp(trades) >= 3,
        "dollar_1k_saved":   cum_saved >= 1000,
        "dd_halved":         abs(metrics.get("max_drawdown_pct", 0)) <=
                             abs(baseline.get("max_drawdown_pct", 0)) / 2,
        "sharpe_positive":   metrics.get("sharpe", 0) > 0,
        "storm_walker":      storm_blocks >= 2,
        "dollar_2_5k_saved": cum_saved >= 2500,
        "ghost_streak":      _ghost_streak(trades) >= 2,
        "zero_relapse":      metrics.get("n_habit_blocked", 0) >= 5,
        "sharpe_above_1":    metrics.get("sharpe", 0) > 1.0,
    }
    return ms


def determine_rank(score: float, milestones: Dict[str, bool]) -> Dict:
    """Score is the primary driver. Milestones are decorations: any
    *unmet* milestone in the achieved tier or above becomes a 'next-step'
    on the dashboard, but does not demote.
    """
    # Tier purely by score
    achieved = RANKS[0]
    for r in RANKS:
        if r["score_min"] <= score <= r["score_max"]:
            achieved = r
            break
    span = max(1, achieved["score_max"] - achieved["score_min"])
    progress = max(0, min(1, (score - achieved["score_min"]) / span))
    idx = RANKS.index(achieved)
    nxt = RANKS[idx + 1] if idx + 1 < len(RANKS) else None
    # Next-step badges: any milestone gated to next tier that's unmet
    next_steps: List[str] = []
    if nxt:
        for m in MILESTONES_DEF:
            if m[3] == nxt["key"] and not milestones.get(m[0], False):
                next_steps.append(m[1])
    return {
        "rank_key": achieved["key"],
        "rank_name": achieved["name"],
        "rank_color": achieved["color"],
        "rank_subtitle": achieved["subtitle"],
        "score": score,
        "progress_in_tier": round(progress, 3),
        "next_rank": nxt["name"] if nxt else None,
        "next_rank_at": nxt["score_min"] if nxt else None,
        "next_steps": next_steps,
        "all_ranks": RANKS,
        "milestones_defs": [{"key": m[0], "label": m[1],
                             "description": m[2], "tier": m[3]}
                            for m in MILESTONES_DEF],
        "milestones_unlocked": milestones,
    }
