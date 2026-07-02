# EvoSentinel — 3-minute demo script

Target: **~420 words spoken**, ~140 wpm, leaves ~10s of headroom.
Format: **[TIME] · [WHAT'S ON SCREEN] · VOICEOVER.**
Tone: dry, confident, slightly self-deprecating. No hype-trader voice.

---

## [0:00 → 0:20] · COLD OPEN — black screen, single line

> "Most trading agents try to make you money.
> Mine tries to stop you from losing it.
> Because — let's be honest — that's the bigger market."

*(beat, then dashboard fades in)*

---

## [0:20 → 0:45] · THE PITCH IN 25 SECONDS

**SHOW:** EvoSentinel dashboard at `nxdyhdet.mule.page`, navbar with BTC / ETH / SOL ticking live, "EXEC: paper" badge visible.

> "This is EvoSentinel. Five AI agents — Macro, On-chain, News, Sentiment, Technical — debate every trade in real time on Bitget data.
> Four say buy. One yells *'have you LOOKED at RSI?'*
> Trade gets blocked. That's the whole product."

---

## [0:45 → 1:15] · THE PARLIAMENT, LIVE

**SHOW:** click **Activate Sentinel** on SOLUSDT. The five-voice verdict animation runs. Highlight the weighted score, then the **Habit-Blocker** badge firing.

> "Each voice has a weight. News is 0.25 because news moves crypto more than charts. Macro is 0.20. Etcetera.
> But — here's the part no human trader would ever build for themselves — there's a *Habit-Blocker*.
> If you try to long SOL when RSI is 78 and price is two sigmas above the mean, the agent literally refuses.
> It is a tiny digital adult, and you are the toddler."

*(verdict shows BLOCKED · FOMO-top)*

> "See? It just called me out. Live. In front of judges. Thank you, agent."

---

## [1:15 → 1:50] · BITGET AGENT HUB INTEGRATION

**SHOW:** flip to a terminal. Hit `/api/exec/test-auth` — Bitget returns `code: 00000`, real sub-account balance prints.

> "Plugged into the Bitget Agent Hub. Real keys, real HMAC-SHA256 signing, real sub-account.
> Skill Hub modules are pluggable — Macro, Market-Intel, News, Sentiment, Technical — each one is a one-line swap to the upstream Bitget version.
> Execution layer is wired. Paper mode by default, live mode behind two separate flags so I cannot accidentally yeet my rent."

*(quick cut to the MCP config showing `evosentinel` and `bitget` co-running)*

> "It runs as an MCP server too, so Claude, Cursor, or any agent can call it next to the official Bitget MCP. Co-operative, not competitive."

---

## [1:50 → 2:30] · THE FUTURE-YOU BRIEF

**SHOW:** click **Push Letter**. Telegram notification arrives on phone showing the Daily Brief with Evolution Score, Emotional Tax Avoided, Habit Refusals.

> "End of every day, you get a Telegram brief from Future You.
> Not 'here's your alpha'. More like: *'today you tried to chase a 9 percent green candle. We said no. You're welcome. Bank's up.'*
> 'Emotional Tax Avoided' is my favorite metric. The dollar amount of dumb trades that did not happen."

---

## [2:30 → 3:00] · THE CLOSE

**SHOW:** GitHub repo, then the THESIS.md scrolling.

> "Most agents add a faster way to lose money.
> EvoSentinel adds a *slower* way to make it — by refusing the trades that feel the best.
> Built on MuleRun in a weekend. Composes with the Bitget Agent Hub. Sub-account ready, paper-mode safe, audit-trail clean.
> If you want an agent that flatters you, use ChatGPT.
> If you want one that out-disciplines you, use this."

*(final card: **EvoSentinel · Parliament of Five · nxdyhdet.mule.page**)*

---

## Filming tips (45 seconds of work)

- Record screen at 1080p. Use **OBS** or **QuickTime**. No fancy cuts needed.
- Voice over second pass — record screen first, then narrate. Easier.
- Mac users: `Cmd+Shift+5` for the screen recorder. Done.
- One take is fine. Mistakes are charming. The "thank you, agent" line lands harder if you actually laugh.

## Submission caption (X / form)

> EvoSentinel — the refusal-first trading agent. Five AI voices argue. A Habit-Blocker vetoes the dumb ones. Built on @MuleRun_AI, plugged into @Bitget_AI Agent Hub. Paper-safe, sub-account ready, judges-approved drawdown. #BitgetHackathon
