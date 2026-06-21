"""Parliament: aggregate the 5 votes into a consensus decision and
synthesise an LLM-style debate transcript explaining the deliberation.

The debate text is generated locally from per-agent persona templates
seeded by the actual vote values, so every transcript is unique,
explainable, and reproducible from the same inputs (no live LLM call
inside the backtest loop — keeps results deterministic and free).
"""
from __future__ import annotations
import random
from dataclasses import dataclass, field
from typing import Dict, List, Optional

from .agents import Vote, AGENT_WEIGHTS


PERSONA = {
    "Macro":    {"emoji": "🌐", "title": "The Economist",   "voice": "measured"},
    "Sentiment":{"emoji": "🎭", "title": "The Crowd Reader","voice": "wry"},
    "News":     {"emoji": "📰", "title": "The Reporter",    "voice": "punchy"},
    "OnChain":  {"emoji": "🐋", "title": "The Whale Watcher","voice": "blunt"},
    "Technical":{"emoji": "📈", "title": "The Chartist",    "voice": "precise"},
}


@dataclass
class Consensus:
    direction: str           # LONG / SHORT / PASS
    weighted_score: float    # -1..+1
    confidence: float        # 0..1
    agreeing: List[str]
    dissenting: List[str]
    veto: Optional[str] = None
    block_reason: Optional[str] = None  # set later by risk layer


def tally(votes: List[Vote]) -> Consensus:
    score = 0.0
    weight_sum = 0.0
    by_dir = {"LONG": [], "SHORT": [], "PASS": []}
    for v in votes:
        w = AGENT_WEIGHTS.get(v.agent, 0.2)
        signed = 1 if v.direction == "LONG" else -1 if v.direction == "SHORT" else 0
        score += w * signed * v.confidence
        weight_sum += w
        by_dir[v.direction].append(v.agent)
    direction = "LONG" if score > 0.15 else "SHORT" if score < -0.15 else "PASS"
    # Need >=3 directional agreement to act
    aligned = by_dir.get(direction, [])
    if direction != "PASS" and len(aligned) < 3:
        direction = "PASS"
    # Veto: any agent with conf>=0.85 against
    veto = None
    if direction != "PASS":
        for v in votes:
            opp = "SHORT" if direction == "LONG" else "LONG"
            if v.direction == opp and v.confidence >= 0.85:
                veto = v.agent
                direction = "PASS"
                break
        # News PASS with conf>=0.9 is a stand-down veto
        for v in votes:
            if v.agent == "News" and v.direction == "PASS" and v.confidence >= 0.9:
                veto = "News"
                direction = "PASS"
                break
    dissent = [v.agent for v in votes
               if v.direction != direction and v.direction != "PASS"]
    return Consensus(direction=direction,
                     weighted_score=round(score, 4),
                     confidence=round(min(0.99, abs(score) / max(weight_sum, 1e-6) * 2), 3),
                     agreeing=aligned,
                     dissenting=dissent,
                     veto=veto)


# ---------- Debate transcript ----------

# ============================================================
# Distinct voices — each agent speaks in character.
#   Macro     : skeptical, dry, hedging, fond of "I suppose"
#   Sentiment : anxious, overcautious, second-guessing
#   News      : excitable, ALL-CAPS, calendar-obsessed
#   OnChain   : cold, telegraphic, numbers-only
#   Technical : the closer — terse, decisive, last word
# ============================================================

VOICES = {
    # MACRO — dry skeptic. Flat. Hedges everything. Never excited.
    "Macro": {
        "LONG":  ["The data is, marginally, less bad. {r} A reluctant long. I expect to be wrong.",
                  "If pressed, I'd lean long. {r} I would not lean hard.",
                  "I suppose the regime tolerates a long. {r} I remain unconvinced."],
        "SHORT": ["The data is not impressive. {r} Short, with the customary disclaimers.",
                  "I'd lean short. {r} I find no reason to celebrate the call.",
                  "Skeptical of this bid. {r} Lean short. Do not extrapolate."],
        "PASS":  ["I remain unconvinced. {r} I'd want another print before committing.",
                  "Insufficient signal. {r} I abstain.",
                  "This is noise dressed as signal. {r} No conviction either way."]
    },
    # SENTIMENT — nervous, sees the crowd as a threat.
    "Sentiment": {
        "LONG":  ["The crowd is hurt and that worries me less than usual. {r} A small, anxious long.",
                  "Everyone is too scared. The crowd is wrong here, isn't it? {r} Long. I'm flinching.",
                  "I don't trust the panic — which means I should fade it. {r} Long, but I'm bracing."],
        "SHORT": ["Too many people are confident. That's how it usually breaks. {r} Short. I'm uneasy.",
                  "The crowd looks dangerous to me. {r} Fade it. I won't enjoy this.",
                  "I see euphoria where I should see caution. {r} Short. This is the part that hurts me."],
        "PASS":  ["I keep flinching and I don't know why. {r} Stand down.",
                  "The crowd is too quiet. I don't trust quiet. {r} Pass.",
                  "Whatever it is, I'm not getting it cleanly. {r} I'd rather miss than be wrong."]
    },
    # NEWS — eager, overexcitable reporter. Runs in. ALL CAPS for verbs.
    "News": {
        "LONG":  ["BREAKING — {r} GO LONG, the drift is RIGHT THERE!",
                  "WIRE just LIT UP — {r} LONG, before the desk wakes up!",
                  "I just GOT this — {r} LONG it, this is THE headline!"],
        "SHORT": ["TAPE HIT! {r} SHORT the rip, FAST!",
                  "NEGATIVE print, repeat NEGATIVE — {r} SHORT, immediately!",
                  "Catalyst BROKE ugly — {r} SHORT — don't FADE the news!"],
        "PASS":  ["WAIT — {r} STAND DOWN, I'm BEGGING you!",
                  "The CALENDAR says NO — {r} STAND DOWN. We trade the print, not the silence!",
                  "Window is CLOSED, repeat CLOSED — {r} STAND DOWN."]
    },
    # ONCHAIN — cold, telegraphic, numbers only, no opinions.
    "OnChain": {
        "LONG":  ["{r} Direction: up.",
                  "Flow confirms. {r} Long.",
                  "{r} Net positive. Long."],
        "SHORT": ["{r} Direction: down.",
                  "Distribution. {r} Short.",
                  "{r} Net negative. Short."],
        "PASS":  ["{r} No signal.",
                  "{r} Neutral. Pass.",
                  "{r} Insufficient delta."]
    },
    # TECHNICAL — confident, brief, the closer. Speaks last, calls the shot.
    "Technical": {
        "LONG":  ["{r} Long. We execute.",
                  "{r} Long. Tight stop, partials at 2R.",
                  "{r} Long. Clean entry."],
        "SHORT": ["{r} Short. Manage at 2R.",
                  "{r} Short. Risk-defined.",
                  "{r} Short. Move."],
        "PASS":  ["{r} No setup. Pass.",
                  "{r} I refuse to invent one. Pass.",
                  "{r} Chop. Sit on hands."]
    },
}

FUNNY_BY_AGENT = {
    "Macro":     ["(Macro, dryly: 'I have correctly predicted six of the last two recessions.')",
                  "(Macro: 'A hawkish dot is still, fundamentally, a dot.')",
                  "(Macro, flat: 'The curve is inverted. So is my coffee. The mechanism is similar.')"],
    "Sentiment": ["(Sentiment, fidgeting: 'what if this is the top? What if it isn't? What if both?')",
                  "(Sentiment, eyes on the door: 'the crowd is calm. That's the part that scares me.')",
                  "(Sentiment, whispering: 'fear-and-greed is just fear-and-loathing in a trenchcoat.')"],
    "News":      ["(News, sprinting in: 'the CALENDAR said 14:30 GMT, PEOPLE.')",
                  "(News: 'BREAKING — nothing happened. WHICH IS BREAKING.')",
                  "(News, panting: 'I read ALL forty-seven footnotes — THIS MATTERS.')"],
    "OnChain":   ["(OnChain: 'someone bought a yacht-sized clip. Make of that what you will.')",
                  "(OnChain: 'flow +63%. I refuse to write a sentence around the number.')",
                  "(OnChain: 'whales fill quietly. Retail tweets loudly. The math is consistent.')"],
    "Technical": ["(Technical, sipping coffee: 'ADX 14 walks into a bar. The bar is chop. Nobody trades.')",
                  "(Technical, half-smile: 'the chart already said it. I'm just translating.')",
                  "(Technical: 'a clean setup is a quiet thing. People always want fireworks.')"],
}


def _voiced_line(v: Vote, rng: random.Random) -> str:
    tmpls = VOICES[v.agent][v.direction]
    body = rng.choice(tmpls).format(r=v.rationale)
    arrow = {"LONG": "→ LONG", "SHORT": "→ SHORT", "PASS": "→ STAND DOWN"}[v.direction]
    p = PERSONA[v.agent]
    return f"{p['emoji']} {v.agent} ({p['title']}): {body} {arrow} (conf {v.confidence:.2f})"


def _agent_line(v: Vote, rng: random.Random) -> str:
    # kept for backward-compat; routes to the voiced version
    return _voiced_line(v, rng)


def debate(symbol: str, votes: List[Vote], cons: Consensus,
           seed: int) -> Dict:
    rng = random.Random(seed)
    lines = [f"— Parliament convenes on {symbol} —"]

    # Speaking order: News first if it has a hot take (excitable, can't wait);
    # then Macro (frames the regime), Sentiment, OnChain. Technical ALWAYS closes.
    by_agent = {v.agent: v for v in votes}
    desired = ["News", "Macro", "Sentiment", "OnChain", "Technical"]
    # If News is PASS-low-conf, demote it; if News is PASS-high-conf veto, keep first
    if by_agent["News"].direction == "PASS" and by_agent["News"].confidence < 0.6:
        desired = ["Macro", "Sentiment", "News", "OnChain", "Technical"]
    order = [by_agent[a] for a in desired]

    for v in order:
        lines.append(_voiced_line(v, rng))

    # Cross-talk: pick the agent most opposed to the eventual direction
    if cons.direction != "PASS":
        opposite = next((v for v in votes
                         if v.direction != cons.direction and v.direction != "PASS"),
                        None)
        if opposite is not None:
            # In-character pushback line per dissenting agent
            push = {
                "Macro":     f"  ↳ Macro coughs: 'I'd still want more data before {cons.direction.lower()}ing into this.'",
                "Sentiment": f"  ↳ Sentiment, quietly: 'I just… I have a bad feeling about {cons.direction.lower()}ing here.'",
                "News":      f"  ↳ News, frantic: 'BUT THE CALENDAR — fine, FINE, on your heads.'",
                "OnChain":   f"  ↳ OnChain: 'My flow disagrees. Noted.'",
                "Technical": f"  ↳ Technical: 'The chart says otherwise. I'll be on record.'"
            }
            lines.append(push.get(opposite.agent, ""))

    # Mandatory in-character comic-relief line
    # Bias toward the loudest voice in the room
    loudest = max(votes, key=lambda v: v.confidence)
    funny = rng.choice(FUNNY_BY_AGENT[loudest.agent])
    lines.append(funny)

    # Verdict — Technical always reads it (the closer's privilege)
    tech = by_agent["Technical"]
    if cons.direction == "PASS":
        if cons.veto:
            verdict = f"📈 Technical (verdict): VETO by {cons.veto}. We stand down."
        else:
            verdict = (f"📈 Technical (verdict): No 3-of-5 majority "
                       f"(weighted {cons.weighted_score:+.2f}). Stand down.")
    else:
        verdict = (f"📈 Technical (verdict): {cons.direction} confirmed — "
                   f"{len(cons.agreeing)}/5 aligned, weighted {cons.weighted_score:+.2f}, "
                   f"conf {cons.confidence:.2f}. Risk desk takes over.")
    lines.append(verdict)
    return {"symbol": symbol, "lines": lines, "funny_line": funny}
