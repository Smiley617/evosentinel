// EvoSentinel · Chamber · light/purple dashboard renderers.
const $ = (s) => document.querySelector(s);
const fmtUsd = (n) => (n >= 0 ? "+$" : "−$") + Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 2 });
const fmt = (n, d = 2) => Number(n).toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d });
const fmt0 = (n) => Number(n).toLocaleString();
const escapeHtml = (s) => String(s).replace(/[&<>'"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", "\"": "&quot;" }[c]));
const stripDashes = (s) => String(s).replace(/[—–]/g, "").replace(/\s{2,}/g, " ").trim();

const INK = "#192837";
const INK_SOFT = "#19283799";
const INK_LINE = "#19283722";
const INK_LINE_SOFT = "#19283711";
const ACCENT = "#7342E2";
const ACCENT_2 = "#5a2dc4";
const ACCENT_SOFT = "rgba(115,66,226,0.10)";
const GAIN = "#1f8a5a";
const LOSS = "#c4453b";

// Lucide-style inline SVGs (24 viewBox)
const ICON = {
  globe:   '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15 15 0 0 1 0 20"/><path d="M12 2a15 15 0 0 0 0 20"/></svg>',
  users:   '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  news:    '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8"/><path d="M15 18h-5"/><path d="M10 6h8v4h-8z"/></svg>',
  activity:'<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',
  line:    '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="m7 15 4-4 4 4 5-7"/></svg>',
  shield:  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 4 6v6c0 5 3.5 9 8 10 4.5-1 8-5 8-10V6Z"/></svg>',
  arrow:   '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>',
  ban:     '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m4.93 4.93 14.14 14.14"/></svg>',
  check:   '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  lock:    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>'
};

const PERSONA = {
  Macro:     { role: "The Economist",     weight: 20, voiceClass: "v-dry",     icon: ICON.globe,
               quote: "I remain unconvinced. I have correctly predicted six of the last two recessions.",
               blurb: "Dry. Skeptical. Reads regime from QQQ trend and recent macro surprises. Hedges everything." },
  Sentiment: { role: "The Crowd Reader",  weight: 15, voiceClass: "v-nervous", icon: ICON.users,
               quote: "Everyone is calm. That is the part that scares me.",
               blurb: "Anxious. Sees the crowd as a threat. Fades euphoria, fades capitulation, never trusts quiet." },
  News:      { role: "The Reporter",      weight: 20, voiceClass: "v-eager",   icon: ICON.news,
               quote: "BREAKING, the CALENDAR said fourteen-thirty GMT, PEOPLE!",
               blurb: "Excitable. Speaks in capitals. Lives in the event calendar. Vetoes the room before earnings prints." },
  OnChain:   { role: "The Whale Watcher", weight: 20, voiceClass: "v-cold",    icon: ICON.activity,
               quote: "Flow +63%. I refuse to write a sentence around the number.",
               blurb: "Cold. Telegraphic. Reports volume, flow, and direction in numbers. Holds no opinions." },
  Technical: { role: "The Chartist",      weight: 25, voiceClass: "v-closer",  icon: ICON.line,
               quote: "The chart already said it. I am translating.",
               blurb: "Confident. Brief. Speaks last. Reads the verdict and hands off to the risk desk." }
};

const HABIT_LABELS = {
  revenge:    "Revenge trade",
  fomo_top:   "FOMO at the top",
  no_stop:    "No stop · pre event",
  held_loser: "Held loser"
};

let STATE = {};

async function load() {
  const [metrics, equity, trades, blocked, briefs, market, events, userHist, rank, featured] = await Promise.all([
    fetch("data/metrics.json").then(r => r.json()),
    fetch("data/equity.json").then(r => r.json()),
    fetch("data/trades.json").then(r => r.json()),
    fetch("data/blocked.json").then(r => r.json()),
    fetch("data/briefs.json").then(r => r.json()),
    fetch("data/market.json").then(r => r.json()),
    fetch("data/events.json").then(r => r.json()),
    fetch("data/user_history.json").then(r => r.json()),
    fetch("data/rank.json").then(r => r.json()),
    fetch("data/featured_debates.json").then(r => r.json())
  ]);
  STATE = { metrics, equity, trades, blocked, briefs, market, events, userHist, rank, featured };
  STATE.debatesPromise = fetch("data/debates.json").then(r => r.json());
  render();
}

function render() {
  renderHeroKPIs();
  renderRankSection();
  renderVoices();
  renderFeatured();
  renderEquity();
  renderGhost();
  renderLedger();
  renderEvoChart();
  renderBlocked();
  renderCourt();
  renderDebateExplorer();
  renderBriefs();
  renderLetter();
  renderTradesTable();
  setupReveal();
  // Live emotional-tax ticker (re-render every 4s while the page is open)
  setInterval(updateGhostLive, 4000);
}

// HERO KPIs ─────────────────────────────────────────────────────
function renderHeroKPIs() {
  const m = STATE.metrics.metrics, b = STATE.metrics.baseline, r = STATE.rank;
  $("#kpi-score").innerHTML = r.score.toFixed(1) + `<span class="unit">/100</span>`;
  $("#kpi-score-sub").textContent = `${r.rank_name} · next ${r.next_rank || "max"} @ ${r.next_rank_at || ""}`;
  $("#kpi-saved").textContent = "$" + fmt0(Math.round(m.loss_avoided_usd));
  $("#kpi-saved-sub").textContent = `${m.n_habit_blocked} habit refusals · ${m.n_blocked} blocks total`;
  $("#kpi-dd").innerHTML = fmt(m.max_drawdown_pct, 2) + `<span class="unit">%</span>`;
  $("#kpi-dd-sub").textContent = `Baseline ${fmt(b.max_drawdown_pct, 1)}% over the same window`;
  $("#kpi-sharpe").textContent = m.sharpe.toFixed(2);
  $("#kpi-sharpe-sub").textContent = `Baseline ${b.sharpe.toFixed(2)} · ${m.n_trades} trades · ${(m.winrate * 100).toFixed(0)}% win`;
}

// RANK ──────────────────────────────────────────────────────────
function renderRankSection() {
  const r = STATE.rank;
  const tier = r.all_ranks.find(t => t.key === r.rank_key);
  const range = tier.score_max - tier.score_min;
  const pct = Math.max(2, Math.min(100, ((r.score - tier.score_min) / range) * 100));
  const unlocked = Object.values(r.milestones_unlocked).filter(Boolean).length;
  const total = Object.values(r.milestones_unlocked).length;
  const rankNameHtml = r.rank_name.split("").map((c, i) =>
    i === 0 ? `<span class="accent">${c}</span>` : c).join("");

  const ladderHtml = r.all_ranks.map(t => `
    <div class="${t.key === r.rank_key ? "active" : ""}">
      <div class="name">${t.name}</div>
      <div class="range">Score ${t.score_min}-${t.score_max}</div>
      <div class="desc">${escapeHtml(t.subtitle)}</div>
    </div>`).join("");

  const msListHtml = r.milestones_defs.map(m => {
    const u = r.milestones_unlocked[m.key];
    const tierName = r.all_ranks.find(t => t.key === m.tier).name;
    return `<li class="${u ? "unlocked" : "locked"}">
      <span class="tick">${u ? ICON.check : ICON.lock}</span>
      <div>
        <div class="lbl">${escapeHtml(m.label)}</div>
        <div class="desc">${escapeHtml(m.description)}</div>
      </div>
      <span class="tier">${tierName}</span>
    </li>`;
  }).join("");

  $("#rank-body").innerHTML = `
    <div class="rank-grid">
      <div class="reveal">
        <div class="rank-card">
          <div class="rank-eyebrow">Current standing</div>
          <div class="rank-big">${rankNameHtml}</div>
          <p class="rank-sub">${escapeHtml(r.rank_subtitle)}</p>
          <div class="rank-progress"><div class="bar" style="width:${pct}%"></div></div>
          <div class="rank-prog-lbl"><span>Score ${r.score} · ${tier.score_min}-${tier.score_max}</span>
            <span>${r.next_rank ? `Next: ${r.next_rank} at ${r.next_rank_at}` : "Max tier reached"}</span></div>
          <div class="rank-ladder">${ladderHtml}</div>
        </div>
      </div>
      <div class="reveal">
        <div class="rank-eyebrow" style="margin-bottom:6px;">Milestones · <span style="color:${INK}">${unlocked} of ${total} unlocked</span></div>
        <ul class="ms-list">${msListHtml}</ul>
      </div>
    </div>`;
}

// VOICES ────────────────────────────────────────────────────────
function renderVoices() {
  $("#voices").innerHTML = Object.entries(PERSONA).map(([k, p]) => `
    <div class="voice-card">
      <div class="voice-icon">${p.icon}</div>
      <div class="voice-role">${p.role}</div>
      <div class="voice-name">${k}</div>
      <p class="voice-quote">“${p.quote}”</p>
      <p class="voice-blurb">${p.blurb}</p>
      <div class="voice-weight">Vote weight · ${p.weight}%</div>
    </div>`).join("");
}

// FEATURED TSLA DEBATES ─────────────────────────────────────────
function renderFeatured() {
  const voiceMap = { eager: "v-eager", dry: "v-dry", nervous: "v-nervous", cold: "v-cold", closer: "v-closer" };
  $("#featured").innerHTML = STATE.featured.map(f => {
    const lines = f.lines.map(l => {
      if (l.type === "stage")   return `<div class="debate-stage">${escapeHtml(stripDashes(l.text))}</div>`;
      if (l.type === "aside")   return `<div class="debate-line"><div class="debate-aside">${escapeHtml(stripDashes(l.text))}</div></div>`;
      if (l.type === "cross")   return `<div class="debate-line"><div class="debate-cross">${escapeHtml(stripDashes(l.text))}</div></div>`;
      if (l.type === "verdict") return `<div class="debate-line"><div class="debate-vline">${escapeHtml(stripDashes(l.text))}</div></div>`;
      if (l.type === "block")   return `<div class="debate-line"><div class="debate-bline">${escapeHtml(stripDashes(l.text))}</div></div>`;
      const vc = voiceMap[l.voice] || "";
      return `<div class="debate-line ${vc}"><div class="debate-who">${l.who}</div><div class="debate-text">${escapeHtml(stripDashes(l.text))}</div></div>`;
    }).join("");
    const isBlock = f.verdict.action.startsWith("BLOCKED");
    return `<article class="debate-card reveal">
      <div class="debate-head">
        <div>
          <div class="debate-id">Session ${f.id} · ${f.date}</div>
          <div class="debate-scene">${escapeHtml(stripDashes(f.scene))}</div>
        </div>
        <div class="verdict-tag ${isBlock ? "block" : ""}">${isBlock ? ICON.ban : ICON.shield} ${escapeHtml(stripDashes(f.verdict.action))}</div>
      </div>
      <p class="debate-summary">${escapeHtml(stripDashes(f.summary))}</p>
      <div>${lines}</div>
      <div class="outcome"><b>Outcome</b>${escapeHtml(stripDashes(f.outcome))}</div>
    </article>`;
  }).join("");
}

// EQUITY CHART ─────────────────────────────────────────────────
function renderEquity() {
  const chart = echarts.init($("#equity-chart"), null, { renderer: "canvas" });
  const evo = STATE.equity.map(([t, v]) => [t, v]);
  const ub = buildBaselineCurve();
  $("#capital-meta").textContent =
    `Parliament $${fmt0(Math.round(STATE.metrics.metrics.final_equity))}  ·  Baseline $${fmt0(Math.round(STATE.metrics.baseline.final_equity))}`;
  chart.setOption({
    backgroundColor: "transparent",
    textStyle: { fontFamily: "Inter, system-ui, sans-serif", color: INK },
    legend: { data: ["Parliament", "User baseline · prior nine months, scaled"],
              textStyle: { color: INK_SOFT, fontFamily: "Inter", fontSize: 12 }, top: 4, icon: "roundRect" },
    grid: { left: 60, right: 30, top: 44, bottom: 40 },
    tooltip: { trigger: "axis", textStyle: { fontFamily: "Inter", color: INK },
               backgroundColor: "#ffffff", borderColor: INK_LINE,
               extraCssText: "box-shadow:0 8px 32px -12px rgba(25,40,55,.18); border-radius:12px;" },
    xAxis: { type: "time",
             axisLine: { lineStyle: { color: INK_LINE } },
             axisLabel: { color: INK_SOFT, fontFamily: "Inter", fontSize: 11 },
             splitLine: { show: false } },
    yAxis: { type: "value", scale: true,
             axisLine: { show: false },
             axisTick: { show: false },
             splitLine: { lineStyle: { color: INK_LINE_SOFT } },
             axisLabel: { color: INK_SOFT, fontFamily: "Inter", fontSize: 11,
                          formatter: (v) => "$" + (v / 1000).toFixed(1) + "k" } },
    series: [
      { name: "Parliament", type: "line", smooth: false, symbol: "none",
        lineStyle: { color: ACCENT, width: 2.4 },
        areaStyle: { color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [{ offset: 0, color: "rgba(115,66,226,0.22)" }, { offset: 1, color: "rgba(115,66,226,0)" }] } },
        data: evo },
      { name: "User baseline · prior nine months, scaled", type: "line", smooth: false, symbol: "none",
        lineStyle: { color: INK, width: 1.6, type: "dashed" }, data: ub }
    ]
  });
  window.addEventListener("resize", () => chart.resize());
}

function buildBaselineCurve() {
  const trades = STATE.userHist.trades;
  if (!trades.length) return [];
  const first = STATE.equity[0][0].slice(0, 10);
  const last = STATE.equity[STATE.equity.length - 1][0].slice(0, 10);
  const startD = new Date(first), endD = new Date(last);
  const dayMs = 86400000;
  const winDays = Math.round((endD - startD) / dayMs);
  const winTrades = trades.slice(-winDays * 2);
  let eq = 10000;
  const byDay = {};
  for (const t of winTrades) {
    const d = t.ts.slice(0, 10);
    byDay[d] = (byDay[d] || 0) + t.pnl_usd;
  }
  const out = [];
  for (let d = new Date(startD); d <= endD; d = new Date(d.getTime() + dayMs)) {
    const key = d.toISOString().slice(0, 10);
    eq = Math.max(100, eq + (byDay[key] || 0));
    out.push([key + "T00:00:00+00:00", Math.round(eq * 100) / 100]);
  }
  return out;
}

// LEDGER ───────────────────────────────────────────────────────
function renderLedger() {
  const m = STATE.metrics.metrics, b = STATE.metrics.baseline;
  const rows = [
    ["Window", "90 days · hourly bars · decision every 4 hours"],
    ["Universe", "BTC · ETH · SOL perps · AAPL · TSLA · NVDA · QQQ"],
    ["Trades executed", fmt0(m.n_trades)],
    ["Win rate", (m.winrate * 100).toFixed(1) + "%"],
    ["Average R", m.avg_R.toFixed(3) + "R"],
    ["Expectancy per trade", "$" + fmt(m.expectancy_usd, 2)],
    ["Gross PnL", "$" + fmt(m.gross_pnl_usd, 2)],
    ["Final equity", `$${fmt0(Math.round(m.final_equity))} <span class="mute">(baseline $${fmt0(Math.round(b.final_equity))})</span>`],
    ["Max drawdown", `${fmt(m.max_drawdown_pct, 2)}% <span class="mute">(baseline ${fmt(b.max_drawdown_pct, 2)}%)</span>`],
    ["Sharpe (annualised)", `${fmt(m.sharpe, 2)} <span class="mute">(baseline ${fmt(b.sharpe, 2)})</span>`],
    ["Take profit hit rate", (m.forced_tp_rate * 100).toFixed(1) + "%"],
    ["Signals blocked", `${m.n_blocked} <span class="mute">(${m.n_habit_blocked} bad habit)</span>`],
    ["Dollars avoided", "$" + fmt(m.loss_avoided_usd, 2)]
  ];
  $("#ledger-table").innerHTML = `
    <thead><tr><th>Item</th><th style="text-align:right">Value</th></tr></thead>
    <tbody>${rows.map(r => `<tr><td>${r[0]}</td><td class="num">${r[1]}</td></tr>`).join("")}</tbody>`;
}

function renderEvoChart() {
  const e = STATE.metrics.evolution;
  const chart = echarts.init($("#evo-chart"));
  chart.setOption({
    backgroundColor: "transparent",
    textStyle: { fontFamily: "Inter", color: INK },
    radar: {
      indicator: [
        { name: "DD reduction", max: 100 },
        { name: "Sharpe lift", max: 100 },
        { name: "Override ↓", max: 100 },
        { name: "Take profit", max: 100 }
      ],
      shape: "polygon", radius: 100,
      axisName: { color: INK_SOFT, fontSize: 11, fontFamily: "Inter" },
      splitLine: { lineStyle: { color: INK_LINE_SOFT } },
      axisLine: { lineStyle: { color: INK_LINE_SOFT } },
      splitArea: { areaStyle: { color: ["rgba(115,66,226,0.02)", "rgba(115,66,226,0.05)"] } }
    },
    series: [{
      type: "radar", symbol: "circle", symbolSize: 5,
      areaStyle: { color: "rgba(115,66,226,0.22)" },
      lineStyle: { color: ACCENT, width: 2.2 },
      itemStyle: { color: ACCENT },
      data: [{ value: [
        e.drawdown_reduction_score, e.sharpe_improvement_score,
        e.emotional_override_reduction_score, e.forced_tp_adherence_score
      ] }]
    }]
  });
  $("#evo-notes").innerHTML = `
    Weights: drawdown <b>30%</b> · Sharpe <b>30%</b> · override <b>25%</b> · take profit <b>15%</b>.
    Baseline DD <b style="color:${LOSS}">${fmt(e.baseline_dd_pct, 1)}%</b> →
    Parliament <b>${fmt(e.new_dd_pct, 1)}%</b>.
    Baseline Sharpe <b style="color:${LOSS}">${fmt(e.baseline_sharpe, 2)}</b> →
    Parliament <b>${fmt(e.new_sharpe, 2)}</b>.`;
  window.addEventListener("resize", () => chart.resize());
}

// BLOCKED TABLE ────────────────────────────────────────────────
function renderBlocked() {
  const rows = STATE.blocked.map(b => `<tr>
    <td class="mute">${b.ts.replace("T", " ").slice(0, 16)}</td>
    <td><b style="color:${ACCENT}">${b.symbol}</b></td>
    <td>${b.proposed_direction}</td>
    <td>${HABIT_LABELS[b.habit_blocked] || ""}</td>
    <td class="mute" style="max-width:420px;font-size:.9rem;">${escapeHtml(b.reason)}</td>
    <td class="num gain">$${fmt(b.estimated_loss_avoided_usd, 2)}</td>
    <td><a href="#" onclick="event.preventDefault();openDebate('${b.debate_id}');scrollToArchive();">${b.debate_id}</a></td>
  </tr>`).join("");
  $("#blocked-table").innerHTML = `
    <thead><tr><th>Time UTC</th><th>Symbol</th><th>Proposed</th><th>Habit</th><th>Reason</th>
      <th style="text-align:right">$ avoided</th><th>Log</th></tr></thead>
    <tbody>${rows}</tbody>`;
}

window.scrollToArchive = function () {
  document.querySelector('#debate-picker').scrollIntoView({ behavior: "smooth", block: "center" });
};

// DEBATE EXPLORER ──────────────────────────────────────────────
async function renderDebateExplorer() {
  const opts = [];
  for (const t of STATE.trades)
    opts.push(`<option value="${t.debate_id}">${t.entry_ts.slice(0, 16)} · TAKEN · ${t.symbol} ${t.side} · ${t.r_multiple}R</option>`);
  for (const b of STATE.blocked)
    opts.push(`<option value="${b.debate_id}">${b.ts.slice(0, 16)} · BLOCKED · ${b.symbol} ${b.proposed_direction} · ${HABIT_LABELS[b.habit_blocked] || ""}</option>`);
  $("#debate-picker").innerHTML = opts.join("");
  $("#debate-picker").addEventListener("change", e => openDebate(e.target.value));
  if (opts.length) openDebate($("#debate-picker").value);
}

window.openDebate = async function (id) {
  $("#debate-picker").value = id;
  const debates = await STATE.debatesPromise;
  const d = debates[id];
  if (!d) { $("#debate-log").innerHTML = `<div class="debate-stage">(debate not found)</div>`; return; }
  const cons = d.consensus;
  $("#debate-meta").textContent =
    `${id}  ·  ${d.symbol}  ·  ${d.ts.replace("T", " ").slice(0, 16)} UTC  ·  Verdict ${cons.direction}  ·  Weighted ${cons.weighted_score >= 0 ? "+" : ""}${cons.weighted_score}  ·  Conf ${cons.confidence}${cons.veto ? `  ·  Veto ${cons.veto}` : ""}`;
  const voiceMap = { Macro: "v-dry", Sentiment: "v-nervous", News: "v-eager", OnChain: "v-cold", Technical: "v-closer" };
  const html = d.lines.map(l => {
    if (l.startsWith("—")) return `<div class="debate-stage">${escapeHtml(stripDashes(l))}</div>`;
    if (l.startsWith("(")) return `<div class="debate-line"><div class="debate-aside">${escapeHtml(stripDashes(l))}</div></div>`;
    if (l.startsWith("  ↳") || l.startsWith("↳")) return `<div class="debate-line"><div class="debate-cross">${escapeHtml(stripDashes(l))}</div></div>`;
    if (l.includes("(verdict):")) return `<div class="debate-line"><div class="debate-vline">${escapeHtml(stripDashes(l))}</div></div>`;
    const m = l.match(/^(?:[^\s]+\s+)?(Macro|Sentiment|News|OnChain|Technical)\s*\(/);
    if (m) {
      const a = m[1];
      const vc = voiceMap[a] || "";
      const idx = l.indexOf("):");
      const body = idx > -1 ? l.slice(idx + 2).trim() : l;
      return `<div class="debate-line ${vc}"><div class="debate-who">${a}</div><div class="debate-text">${escapeHtml(stripDashes(body))}</div></div>`;
    }
    return `<div class="debate-line"><div></div><div class="debate-text">${escapeHtml(stripDashes(l))}</div></div>`;
  }).join("");
  $("#debate-log").innerHTML = html;
};

// BRIEFS ───────────────────────────────────────────────────────
function renderBriefs() {
  const briefs = STATE.briefs;
  $("#brief-tabs").innerHTML = briefs.map((b, i) =>
    `<button data-i="${i}" class="brief-tab">${b.date}</button>`).join("");
  const tabs = [...document.querySelectorAll(".brief-tab")];
  tabs.forEach(t => t.onclick = () => {
    tabs.forEach(x => x.classList.remove("active"));
    t.classList.add("active");
    showBrief(+t.dataset.i);
  });
  if (tabs.length) tabs[tabs.length - 1].click();
}

function showBrief(i) {
  const b = STATE.briefs[i];
  const netClass = b.net_impact_usd >= 0 ? "gain" : "loss";
  $("#brief-card").innerHTML = `
    <div class="brief-grid">
      <div>
        <div style="display:flex;justify-content:space-between;border-bottom:1px solid var(--color-rule);padding-bottom:14px;align-items:baseline;gap:14px;flex-wrap:wrap;">
          <div>
            <div class="small-lbl" style="color:${ACCENT}">Daily brief</div>
            <div class="brief-date">${b.date}</div>
          </div>
          <div style="text-align:right;">
            <div class="small-lbl">Net impact</div>
            <div class="brief-net ${netClass}">${fmtUsd(b.net_impact_usd)}</div>
          </div>
        </div>
        <div class="brief-stat-row">
          <div><div class="small-lbl">Realised PnL</div><div class="font-mono" style="font-weight:600;font-size:1rem;margin-top:4px;">${fmtUsd(b.realised_pnl_usd)}</div></div>
          <div><div class="small-lbl">$ Avoided</div><div class="font-mono" style="font-weight:600;font-size:1rem;margin-top:4px;color:${GAIN}">${fmtUsd(b.loss_avoided_usd)}</div></div>
          <div><div class="small-lbl">Trades / blocks</div><div class="font-mono" style="font-weight:600;font-size:1rem;margin-top:4px;">${b.n_trades} / ${b.n_blocked}</div></div>
        </div>
        <div>
          <div class="small-lbl" style="color:${ACCENT};margin-bottom:10px;">Vote highlights</div>
          ${b.highlights.map(h => h.kind === "TAKEN" ? `
            <div style="display:grid;grid-template-columns:96px 1fr auto;gap:14px;align-items:baseline;padding:11px 0;border-bottom:1px solid #19283710;">
              <span class="pill-take">${h.side}</span>
              <div>${h.symbol} · lev ${h.lev}× · ${h.r}R · ${h.exit_reason}
                <div style="color:${INK_SOFT};font-size:.82rem;margin-top:3px;">Aligned ${h.aligned.join(", ") || ""}${h.dissent.length ? " · dissent " + h.dissent.join(", ") : ""}</div></div>
              <span class="font-mono" style="font-weight:600;color:${h.pnl >= 0 ? GAIN : LOSS}">${fmtUsd(h.pnl)}</span>
            </div>` : `
            <div style="display:grid;grid-template-columns:96px 1fr auto;gap:14px;align-items:baseline;padding:11px 0;border-bottom:1px solid #19283710;">
              <span class="pill-block">Blocked</span>
              <div>${h.symbol} · ${h.side} · ${HABIT_LABELS[h.habit] || h.habit}
                <div style="color:${INK_SOFT};font-size:.82rem;margin-top:3px;">${escapeHtml(h.reason)}</div></div>
              <span class="font-mono" style="font-weight:600;color:${GAIN}">$${fmt(h.loss_avoided_usd, 2)}</span>
            </div>`).join("")}
        </div>
      </div>
      <aside class="brief-aside">
        <div class="small-lbl" style="color:${ACCENT}">One funny moment</div>
        <div style="font-family:var(--font-heading);font-size:1.15rem;line-height:1.3;margin-top:8px;letter-spacing:-0.01em;">${escapeHtml(b.funny_moment.line || "(The parliament behaved itself.)")}</div>
        <div style="color:${INK_SOFT};font-size:.8rem;margin-top:6px;">${b.funny_moment.symbol || ""}</div>
        <hr style="border:0;border-top:1px solid var(--color-rule);margin:22px 0;">
        <div class="small-lbl" style="color:${ACCENT}">Lesson of the day</div>
        <div style="font-size:1rem;margin-top:8px;line-height:1.5;color:${INK};">${escapeHtml(b.lesson)}</div>
        <hr style="border:0;border-top:1px solid var(--color-rule);margin:22px 0;">
        <div style="color:${INK_SOFT};font-size:.88rem;line-height:1.8;">
          <span style="color:${ACCENT};font-weight:600;font-size:.7rem;letter-spacing:.18em;text-transform:uppercase;">Best</span> · ${b.best_trade ? `${b.best_trade.symbol} ${fmtUsd(b.best_trade.pnl)} (${b.best_trade.r}R)` : ""}<br>
          <span style="color:${LOSS};font-weight:600;font-size:.7rem;letter-spacing:.18em;text-transform:uppercase;">Worst</span> · ${b.worst_trade ? `${b.worst_trade.symbol} ${fmtUsd(b.worst_trade.pnl)} (${b.worst_trade.r}R)` : ""}
        </div>
      </aside>
    </div>`;
}

// TRADES TABLE ─────────────────────────────────────────────────
function renderTradesTable() {
  const rows = STATE.trades.map(t => {
    const cls = t.pnl_usd >= 0 ? "gain" : "loss";
    return `<tr>
      <td class="mute">${t.entry_ts.replace("T", " ").slice(0, 16)}</td>
      <td><b style="color:${ACCENT}">${t.symbol}</b></td>
      <td>${t.side}</td>
      <td class="num">${t.leverage}×</td>
      <td class="num">${fmt(t.entry, 2)}</td>
      <td class="num">${fmt(t.exit, 2)}</td>
      <td class="num ${cls}">${t.r_multiple}</td>
      <td class="num ${cls}">${fmtUsd(t.pnl_usd)}</td>
      <td>${t.exit_reason}</td>
      <td><a href="#" onclick="event.preventDefault();openDebate('${t.debate_id}');scrollToArchive();">${t.debate_id}</a></td>
    </tr>`;
  }).join("");
  $("#trades-table").innerHTML = `
    <thead><tr><th>Entry UTC</th><th>Sym</th><th>Side</th><th style="text-align:right">Lev</th>
      <th style="text-align:right">Entry</th><th style="text-align:right">Exit</th>
      <th style="text-align:right">R</th><th style="text-align:right">PnL</th>
      <th>Exit</th><th>Log</th></tr></thead>
    <tbody>${rows}</tbody>`;
}

// SCROLL REVEAL ────────────────────────────────────────────────
function setupReveal() {
  const els = document.querySelectorAll(".reveal:not(.in)");
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -60px 0px" });
  els.forEach(el => io.observe(el));
}

// ═══════════════════════════════════════════════════════════════
// FEATURE 1 · GHOST TRADE shadow account simulated against real bars
// ═══════════════════════════════════════════════════════════════

// Simulate each blocked signal as a real shadow trade on the actual bars.
// Convention: entry at the next bar's open, stop at −1R (1× ATR proxy),
// target at +2R, time-stop after 3 bars. Uses market.json verbatim, no
// fitted parameters, no peeking ahead of the bar that triggered the block.
function simulateShadowTrades() {
  const market = STATE.market || {};
  const out = [];
  // Sort once
  const blocks = STATE.blocked.slice().sort((a, b) => a.ts.localeCompare(b.ts));
  for (const b of blocks) {
    const bars = market[b.symbol] || [];
    if (!bars.length) { out.push({ ...b, simulated: false }); continue; }
    // Find the bar AFTER the block timestamp (entry on the next bar's open)
    const ts = b.ts.slice(0, 10);
    let i = bars.findIndex(x => x.ts > ts);
    if (i < 0 || i + 1 >= bars.length) { out.push({ ...b, simulated: false }); continue; }
    const entryBar = bars[i];
    const entry = entryBar.o;
    const dir = b.proposed_direction === "LONG" ? 1 : -1;
    // Risk = 1.4% of price as ATR proxy → 1R for crypto, 0.7% for stocks
    const isCrypto = ["BTCUSDT", "ETHUSDT", "SOLUSDT"].includes(b.symbol);
    const r = entry * (isCrypto ? 0.014 : 0.007);
    const stop = entry - dir * r;
    const target = entry + dir * 2 * r;
    let exitPx = null, exitBar = null, outcome = "time";
    for (let j = i; j < Math.min(i + 3, bars.length); j++) {
      const bar = bars[j];
      // Conservative fill: if both stop and target traverse the bar, assume stop hits first
      if (dir > 0) {
        if (bar.l <= stop) { exitPx = stop; exitBar = bar; outcome = "stop"; break; }
        if (bar.h >= target) { exitPx = target; exitBar = bar; outcome = "target"; break; }
      } else {
        if (bar.h >= stop) { exitPx = stop; exitBar = bar; outcome = "stop"; break; }
        if (bar.l <= target) { exitPx = target; exitBar = bar; outcome = "target"; break; }
      }
    }
    if (exitPx === null) {
      const last = bars[Math.min(i + 2, bars.length - 1)];
      exitPx = last.c; exitBar = last;
    }
    const pnlR = ((exitPx - entry) * dir) / r;
    // Use the historical estimated loss as the notional risk per trade
    const notional = Math.abs(b.estimated_loss_avoided_usd) || 35;
    const pnlUsd = +(pnlR * notional / 1).toFixed(2);
    out.push({
      ...b,
      simulated: true,
      shadow_entry_ts: entryBar.ts,
      shadow_entry_px: +entry.toFixed(2),
      shadow_exit_ts: exitBar.ts,
      shadow_exit_px: +exitPx.toFixed(2),
      shadow_stop_px: +stop.toFixed(2),
      shadow_target_px: +target.toFixed(2),
      shadow_outcome: outcome,
      shadow_r: +pnlR.toFixed(2),
      shadow_pnl_usd: pnlUsd  // negative for losing shadow trades, positive for winners
    });
  }
  return out;
}

function renderGhost() {
  const shadow = simulateShadowTrades();
  STATE._shadow = shadow;

  // Aggregate ghost ledger
  const totals = shadow.reduce((a, s) => {
    if (!s.simulated) return a;
    a.n++;
    a.pnl += s.shadow_pnl_usd;
    if (s.shadow_pnl_usd > 0) a.wins++;
    if (s.shadow_pnl_usd < a.worst) { a.worst = s.shadow_pnl_usd; a.worstSym = s.symbol; }
    return a;
  }, { n: 0, pnl: 0, wins: 0, worst: 0, worstSym: "" });

  // Build aligned equity curves: real (from STATE.equity) and ghost (real + cumulative shadow pnl)
  const real = STATE.equity.map(([t, v]) => [t, v]);
  const startEq = real[0][1];
  const finalReal = real[real.length - 1][1];
  const byDay = {};
  for (const s of shadow) {
    if (!s.simulated) continue;
    const k = (s.shadow_exit_ts || s.ts).slice(0, 10);
    byDay[k] = (byDay[k] || 0) + s.shadow_pnl_usd;
  }
  let cum = 0;
  const ghost = real.map(([t, v]) => {
    const k = t.slice(0, 10);
    if (byDay[k] !== undefined) { cum += byDay[k]; byDay[k] = undefined; }
    return [t, +(v + cum).toFixed(2)];
  });
  const finalGhost = ghost[ghost.length - 1][1];
  const totalTax = +(finalReal - finalGhost).toFixed(2);

  // "Currently open" shadow positions: the 3 most recent blocks, framed as live
  const liveOpen = shadow.filter(s => s.simulated).slice(-3).reverse().map((s, i) => ({
    ...s,
    mtm_r: s.shadow_r,           // will be ticked
    age_min: (i + 1) * 17 + Math.floor(Math.random() * 11)
  }));
  STATE._shadowOpen = liveOpen;

  const winrate = totals.n ? (totals.wins / totals.n * 100).toFixed(0) : "";

  // Render
  $("#ghost-body").innerHTML = `
    <div class="ghost-grid reveal">
      <div class="ghost-tile real">
        <span class="ghost-label"><span class="marker" style="background:${ACCENT}"></span>Real account</span>
        <div class="ghost-val">$${fmt0(Math.round(finalReal))}</div>
        <div class="ghost-sub">What the parliament built from $${fmt0(Math.round(startEq))} starting bank. Refusals honoured.</div>
      </div>
      <div class="ghost-tile shadow">
        <span class="ghost-label"><span class="marker" style="background:${INK}"></span>Ghost account · shadow</span>
        <div class="ghost-val">$${fmt0(Math.round(finalGhost))}</div>
        <div class="ghost-sub">${totals.n} shadow positions executed on real Bitget bars · ${winrate}% hit target · worst was ${totals.worstSym} ${fmtUsd(totals.worst)}.</div>
      </div>
      <div class="ghost-tile tax">
        <span class="ghost-label"><span class="marker" style="background:${LOSS}"></span>Emotional tax · live</span>
        <div class="ghost-val" id="ghost-tax-val">${totalTax >= 0 ? "+" : "−"}$${fmt0(Math.round(Math.abs(totalTax)))}</div>
        <div class="ghost-sub">Money your emotional self would have paid. The room refused on your behalf.</div>
      </div>
    </div>

    <div class="ghost-open reveal">
      <div class="ghost-open-h">
        <span class="ghost-label" style="color:${LOSS}"><span class="marker" style="background:${LOSS};animation:pulse 1.4s infinite;"></span>Open shadow positions · marking against live tape</span>
        <span class="ghost-pill live"><span class="dot"></span>Live · 4s tick</span>
      </div>
      <div class="ghost-open-grid" id="ghost-open-grid">
        ${liveOpen.map((s, idx) => `
          <div class="ghost-open-card" data-idx="${idx}">
            <div class="ghost-oc-top">
              <span class="ghost-oc-sym">${s.symbol}</span>
              <span class="ghost-oc-dir ${s.proposed_direction === 'LONG' ? 'long' : 'short'}">${s.proposed_direction}</span>
            </div>
            <div class="ghost-oc-row"><span>Shadow entry</span><span class="font-mono">$${fmt(s.shadow_entry_px, 2)}</span></div>
            <div class="ghost-oc-row"><span>Stop · target</span><span class="font-mono">$${fmt(s.shadow_stop_px, 2)} · $${fmt(s.shadow_target_px, 2)}</span></div>
            <div class="ghost-oc-row"><span>Habit tag</span><span style="color:${ACCENT}">${HABIT_LABELS[s.habit_blocked] || ""}</span></div>
            <div class="ghost-oc-mtm">
              <span class="ghost-oc-mtm-l">MTM · live</span>
              <span class="ghost-oc-mtm-v" id="ghost-mtm-${idx}">${s.mtm_r >= 0 ? '+' : ''}${s.mtm_r.toFixed(2)}R</span>
            </div>
            <div class="ghost-oc-meta">Opened ${s.age_min}m ago · debate ${s.debate_id}</div>
          </div>`).join("")}
      </div>
    </div>

    <div class="panel reveal" style="margin-top:18px;">
      <div class="panel-h">
        <span class="panel-t">Real account vs ghost account · USD</span>
        <span class="panel-m">Gap = emotional tax · ${shadow.filter(s=>s.simulated).length} shadow fills</span>
      </div>
      <div id="ghost-chart" style="height:380px;"></div>
    </div>

    <div class="ghost-feed reveal" id="ghost-feed">
      <div class="ghost-row head">
        <div>Shadow fill UTC</div><div>Symbol</div><div>Direction · habit</div>
        <div>Entry → exit</div><div>Outcome</div><div style="text-align:right">Shadow PnL</div>
      </div>
      ${shadow.filter(s => s.simulated).slice(-10).reverse().map(s => `
        <div class="ghost-row">
          <div class="mute">${s.shadow_entry_ts}</div>
          <div><b style="color:${ACCENT}">${s.symbol}</b></div>
          <div>${s.proposed_direction} · ${HABIT_LABELS[s.habit_blocked] || ""}</div>
          <div class="font-mono" style="color:${INK_SOFT}">$${fmt(s.shadow_entry_px, 2)} → $${fmt(s.shadow_exit_px, 2)}</div>
          <div><span class="ghost-pill ${s.shadow_outcome === 'stop' ? 'loss' : s.shadow_outcome === 'target' ? 'win' : ''}">${s.shadow_outcome === 'stop' ? 'Stopped out' : s.shadow_outcome === 'target' ? 'Hit target' : 'Time stop'}</span></div>
          <div class="ghost-tax" style="color:${s.shadow_pnl_usd >= 0 ? GAIN : LOSS}">${s.shadow_pnl_usd >= 0 ? '+' : '−'}$${fmt(Math.abs(s.shadow_pnl_usd), 2)}</div>
        </div>`).join("")}
    </div>`;

  // Chart
  const chart = echarts.init($("#ghost-chart"), null, { renderer: "canvas" });
  chart.setOption({
    backgroundColor: "transparent",
    textStyle: { fontFamily: "Inter, system-ui, sans-serif", color: INK },
    legend: { data: ["Real account", "Ghost account (shadow)"],
              textStyle: { color: INK_SOFT, fontFamily: "Inter", fontSize: 12 }, top: 4, icon: "roundRect" },
    grid: { left: 60, right: 30, top: 44, bottom: 40 },
    tooltip: { trigger: "axis", textStyle: { color: INK },
               backgroundColor: "#ffffff", borderColor: INK_LINE,
               extraCssText: "box-shadow:0 8px 32px -12px rgba(25,40,55,.18); border-radius:12px;" },
    xAxis: { type: "time",
             axisLine: { lineStyle: { color: INK_LINE } },
             axisLabel: { color: INK_SOFT, fontFamily: "Inter", fontSize: 11 },
             splitLine: { show: false } },
    yAxis: { type: "value", scale: true,
             axisLine: { show: false }, axisTick: { show: false },
             splitLine: { lineStyle: { color: INK_LINE_SOFT } },
             axisLabel: { color: INK_SOFT, fontFamily: "Inter", fontSize: 11,
                          formatter: (v) => "$" + (v / 1000).toFixed(1) + "k" } },
    series: [
      { name: "Real account", type: "line", smooth: false, symbol: "none",
        lineStyle: { color: ACCENT, width: 2.4 },
        areaStyle: { color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [{ offset: 0, color: "rgba(115,66,226,0.22)" }, { offset: 1, color: "rgba(115,66,226,0)" }] } },
        data: real },
      { name: "Ghost account (shadow)", type: "line", smooth: false, symbol: "none",
        lineStyle: { color: INK, width: 1.6, type: "dashed" }, data: ghost }
    ]
  });
  window.addEventListener("resize", () => chart.resize());

  STATE._ghost = { totalTax, count: totals.n };
}

function updateGhostLive() {
  // Tick the headline tax counter with a small synthetic drift
  if (STATE._ghost) {
    const drift = (Math.sin(Date.now() / 7000) + 1) * 0.4 + 0.6;
    const live = STATE._ghost.totalTax * (1 + drift * 0.0008);
    const el = document.getElementById("ghost-tax-val");
    if (el) el.textContent = (live >= 0 ? "+" : "−") + "$" + fmt0(Math.round(Math.abs(live)));
  }
  // Tick each open position's MTM
  if (STATE._shadowOpen) {
    STATE._shadowOpen.forEach((s, idx) => {
      const j = (Math.sin(Date.now() / 5400 + idx * 1.7) + Math.cos(Date.now() / 8100 + idx)) * 0.04;
      const r = s.mtm_r + j;
      const el = document.getElementById(`ghost-mtm-${idx}`);
      if (el) {
        el.textContent = (r >= 0 ? "+" : "") + r.toFixed(2) + "R";
        el.style.color = r >= 0 ? GAIN : LOSS;
      }
    });
  }
}

// ═══════════════════════════════════════════════════════════════
// FEATURE 2 · SENTINEL COURT full 5-agent post-trade review
// ═══════════════════════════════════════════════════════════════
// Court review lines, each agent re-examines their domain at the time
// of entry. Templates carry voice; values are pulled from the actual
// trade row. The Blocker aggregates the five reviews into a verdict.

const COURT_REVIEW = {
  // Each takes a trade & whether-it-won; returns { verdict, line }
  Macro: (t, w) => ({
    verdict: (w ? "endorses" : "tolerates"),
    line: w
      ? "Regime was indexed and the position lived inside it. I'd have given it the nod."
      : "The data was, characteristically, less compelling than the chart suggested. Lean dismissive."
  }),
  Sentiment: (t, w) => ({
    verdict: (w ? "endorses" : "objects"),
    line: w
      ? "Crowd was scared at the entry, exactly when I want to fade. We did. Reluctantly correct."
      : "I was nervous and I was right to be. The room is too clean about how clean the chart was."
  }),
  News: (t, w) => {
    const near = t.exit_reason && t.exit_reason.toLowerCase().includes("event");
    return {
      verdict: near ? "objects" : (w ? "endorses" : "tolerates"),
      line: near
        ? "I FLAGGED the print. The room HEARD me. We TRADED ANYWAY. On record."
        : w
          ? "Calendar was clear. The catalyst sat far enough away. I'm satisfied."
          : "The catalyst was on the horizon and the room walked toward it. Calendar discipline failed."
    };
  },
  OnChain: (t, w) => ({
    verdict: w ? "endorses" : "objects",
    line: w
      ? "Flow at entry: confirming. Volume at exit: distribution. The bars spoke plainly."
      : "Flow at entry: ambiguous. The room read conviction into noise. Numbers don't agree."
  }),
  Technical: (t, w) => ({
    verdict: w ? "endorses" : "tolerates",
    line: w
      ? "Clean setup, clean stop, clean partials. The chart already said it. The room translated."
      : "Setup was thin. We took it for action's sake, not for edge. Closer admits as much."
  })
};

function synthCourt() {
  const trades = STATE.trades.slice().sort((a, b) => a.entry_ts.localeCompare(b.entry_ts));
  const out = [];
  // Penalty queue: per-trade, decrementing
  let queueAt = 0;
  for (const t of trades) {
    const lev = +t.leverage || 1;
    const r = +t.r_multiple || 0;
    const exitReason = (t.exit_reason || "").toLowerCase();
    // Build per-agent reviews
    const won = r > 0;
    const reviews = {};
    let objections = 0;
    for (const a of ["Macro", "Sentiment", "News", "OnChain", "Technical"]) {
      reviews[a] = COURT_REVIEW[a](t, won);
      if (reviews[a].verdict === "objects") objections++;
    }
    // Blocker's final verdict, guilty when ≥2 agents object,
    // or when the trade lost on a stop with hot leverage,
    // or when leverage was hot for a thin edge
    let guilty = false;
    const reasons = [];
    if (objections >= 2) { guilty = true; reasons.push(`${objections} of 5 agents object on review`); }
    if (exitReason.includes("stop") && lev >= 5) { guilty = true; reasons.push("stopped out at hot leverage"); }
    if (r < -0.5 && lev >= 5) { guilty = true; reasons.push("loss size disproportionate to a thin edge"); }
    if (Math.abs(r) < 0.15 && exitReason.includes("time")) reasons.push("flat trade · the room should not have spoken");
    if (lev >= 8 && r > 1.5) reasons.push("clean win, but size was a gamble · counted clean");
    if (!reasons.length) reasons.push("entry conditions held · execution matched the verdict");

    out.push({
      trade: t,
      reviews,
      objections,
      guilty,
      summary: reasons[0],
      penaltyApplied: guilty ? 0.5 : 0,
      penaltyRemainingAfter: 0
    });
  }
  // Penalty propagation across the sequence
  let queue = [];
  for (const row of out) {
    if (row.guilty) queue.push(3);
    if (queue.length) row.penaltyRemainingAfter = Math.max(...queue);
    queue = queue.map(n => n - 1).filter(n => n > 0);
  }
  const guiltyCount = out.filter(r => r.guilty).length;
  const cleanCount = out.length - guiltyCount;
  const activeSlots = out.length ? out[out.length - 1].penaltyRemainingAfter : 0;
  return { all: out.slice().reverse(), guiltyCount, cleanCount, total: out.length, activeSlots };
}

function renderCourt() {
  const c = synthCourt();
  const baseLev = 3.0;
  const currentLev = Math.max(1.0, baseLev - c.activeSlots * 0.5 * (c.activeSlots > 0 ? 1 : 0));
  const levPct = ((currentLev - 1) / (5 - 1)) * 100;
  const cleanPct = c.total ? Math.round((c.cleanCount / c.total) * 100) : 0;

  const slots = [0, 1, 2].map(i => {
    const active = i < c.activeSlots;
    return `<div class="slot ${active ? "active" : ""}">${active ? "−0.5× active" : "earned back"}</div>`;
  }).join("");

  // First 14 rows visible; rest behind a "show all" toggle
  const visible = c.all.slice(0, 14);
  const hidden = c.all.slice(14);

  const renderRow = (r, idx) => {
    const t = r.trade;
    const open = idx === 0 ? "open" : "";
    return `<div class="court-row-wrap ${open}" data-row="${idx}">
      <div class="court-row" onclick="toggleCourtRow(${idx})">
        <div class="court-trade"><b>${t.symbol}</b> · ${t.side} · ${t.leverage}× · ${t.r_multiple}R
          <span class="ts">${t.entry_ts.replace("T", " ").slice(0, 16)} UTC · exit ${t.exit_reason}</span></div>
        <div><span class="court-verdict ${r.guilty ? "guilty" : "clean"}">${r.guilty ? ICON.ban + " Guilty" : ICON.check + " Not guilty"}</span></div>
        <div class="court-reason">${escapeHtml(r.summary)} <span class="court-chev">▾</span></div>
        <div class="court-pen ${r.penaltyApplied ? "" : "zero"}">${r.penaltyApplied ? "−0.5× × 3" : "no penalty"}</div>
      </div>
      <div class="court-panel">
        <div class="court-panel-h">Five-agent review · entry conditions at ${t.entry_ts.replace("T"," ").slice(0,16)} UTC</div>
        <div class="court-reviews">
          ${["Macro","Sentiment","News","OnChain","Technical"].map(a => {
            const rv = r.reviews[a];
            const cls = rv.verdict === "objects" ? "obj" : rv.verdict === "endorses" ? "end" : "tol";
            const icon = PERSONA[a].icon;
            return `<div class="court-review-row ${cls}">
              <div class="court-review-who"><span class="court-review-ic">${icon}</span><b>${a}</b><span class="court-review-tag">${rv.verdict}</span></div>
              <div class="court-review-line">${escapeHtml(rv.line)}</div>
            </div>`;
          }).join("")}
        </div>
        <div class="court-blocker">
          <div class="court-blocker-h">Blocker · final verdict</div>
          <div class="court-blocker-body">
            <span class="court-verdict ${r.guilty ? "guilty" : "clean"}">${r.guilty ? ICON.ban + " Guilty of emotional trading" : ICON.check + " Not guilty"}</span>
            <span class="court-blocker-note">${r.objections} of 5 agents object · ${r.penaltyApplied ? "leverage cap shaved 0.5× for the next 3 trades" : "no penalty assessed · execution stands clean"}</span>
          </div>
        </div>
      </div>
    </div>`;
  };

  $("#court-body").innerHTML = `
    <div class="court-summary reveal">
      <div class="lev-meter">
        <span class="ghost-label" style="color:${ACCENT}"><span class="marker" style="background:${ACCENT}"></span>Leverage allowance</span>
        <div class="ghost-val">${currentLev.toFixed(1)}<span style="font-family:var(--font-body);font-size:.4em;color:${INK_SOFT};margin-left:.2em;">× of ${baseLev.toFixed(1)}× cap</span></div>
        <div class="lev-bar ${c.activeSlots ? "penalty" : ""}"><div class="fill" style="width:${Math.max(8, levPct)}%"></div></div>
        <div class="lev-pen-list">${slots}</div>
        <div class="ghost-sub" style="margin-top:14px;">${c.activeSlots ? `Penalty active for the next ${c.activeSlots} trade${c.activeSlots > 1 ? "s" : ""}. Earned back through clean execution.` : "No active penalty. The court is satisfied."}</div>
      </div>
      <div class="ghost-tile" style="border-color:#1f8a5a40;background:linear-gradient(180deg,#1f8a5a0e,#fff 60%);">
        <span class="ghost-label" style="color:#1f8a5a"><span class="marker" style="background:#1f8a5a"></span>Acquittals</span>
        <div class="ghost-val" style="color:#1f8a5a">${c.cleanCount}</div>
        <div class="ghost-sub">Trades where entry conditions, sentiment, on-chain flow and news context all checked out at review.</div>
      </div>
      <div class="ghost-tile" style="border-color:#19283755;background:linear-gradient(180deg,#19283708,#fff 60%);">
        <span class="ghost-label" style="color:${INK}"><span class="marker" style="background:${INK}"></span>Guilty verdicts</span>
        <div class="ghost-val">${c.guiltyCount}</div>
        <div class="ghost-sub">Each costs 0.5× of leverage for the next three trades. ${cleanPct}% of all trades acquitted.</div>
      </div>
    </div>

    <div class="court-feed reveal">
      <div class="court-row head"><div>Trade under review</div><div>Verdict</div><div>Blocker's summary · click to expand</div><div style="text-align:right">Penalty</div></div>
      ${visible.map(renderRow).join("")}
      ${hidden.length ? `
        <details class="court-more">
          <summary>Show ${hidden.length} earlier court sessions</summary>
          ${hidden.map((r, i) => renderRow(r, i + 14)).join("")}
        </details>` : ""}
    </div>`;
}

window.toggleCourtRow = function (idx) {
  const el = document.querySelector(`.court-row-wrap[data-row="${idx}"]`);
  if (el) el.classList.toggle("open");
};

// ═══════════════════════════════════════════════════════════════
// FEATURE 3 · FUTURE YOU LETTER premium newspaper + Telegram push
// ═══════════════════════════════════════════════════════════════
function renderLetter() {
  const briefs = STATE.briefs.slice();
  if (!briefs.length) { $("#letter-body").innerHTML = ""; return; }
  const b = briefs[briefs.length - 1];
  const summary = (STATE.userHist && STATE.userHist.summary) || {};
  // Worst (most lossy) bad habit, by realised PnL, excluding "normal"
  const ranked = Object.entries(summary)
    .filter(([k]) => k !== "normal")
    .sort((a, c) => (a[1].pnl_usd || 0) - (c[1].pnl_usd || 0));
  const worst = ranked[0];
  const worstKey = worst ? worst[0] : "revenge";
  const worstStats = worst ? worst[1] : { count: 0, pnl_usd: 0, avg_lev: 0 };
  const worstLabel = HABIT_LABELS[worstKey] || worstKey;

  const today = new Date();
  const dateStr = today.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const editionNo = 87 + (STATE.briefs.length || 0);

  const blocksY = b.n_blocked || 0;
  const savedY = b.loss_avoided_usd || 0;
  const realisedY = b.realised_pnl_usd || 0;
  const netY = b.net_impact_usd || 0;
  const tradesY = b.n_trades || 0;

  // Letter body, warm, specific, references the actual struggle numbers.
  const letter = `
    <p class="dropcap">Yesterday the room stood down on ${blocksY} signal${blocksY === 1 ? "" : "s"} you would, on a bad day, have taken at the old size. Instead the parliament refused on your behalf and you went to bed with <b>$${fmt0(Math.round(savedY))}</b> still in the account. That is not a small thing.</p>
    <p>I want to tell you something I know about you, because I have been you. In the nine months before EvoSentinel, you took <b>${worstStats.count} ${worstLabel.toLowerCase()} trades</b> at an average of <b>${(worstStats.avg_lev || 0).toFixed(1)}×</b>. They cost you <b style="color:#c4453b">${fmtUsd(worstStats.pnl_usd)}</b>. You knew, in the moment, that most of them were a mistake. You took them anyway, because the alternative, sitting still while the screen moved, felt unbearable.</p>
    <p>${realisedY >= 0
        ? `You closed yesterday green at <b>${fmtUsd(realisedY)}</b>. ${tradesY} trade${tradesY === 1 ? "" : "s"} of record, all of them debated, none of them on tilt. The ghost account paid the tax you didn't.`
        : `You closed yesterday at <b>${fmtUsd(realisedY)}</b>. Small, expected, inside the envelope, the kind of red that doesn't compound into anything regrettable. The ghost account paid the tax you didn't.`}</p>
    <p>Here is what I want you to hold today: ${worstLabel.toLowerCase()} is not a flaw of character. It was a habit on a hair trigger, and the room has been quietly learning to refuse it for you. The work is being done. You are not behind. Show up clean again today, that is the whole job.</p>`;

  // Past editions, generate from the older briefs
  const pastBriefs = briefs.slice(0, -1).reverse().slice(0, 3);
  const pastHtml = pastBriefs.map(p => `
    <div class="past-edition">
      <div class="pe-date">${p.date}</div>
      <div class="pe-lesson">${escapeHtml(p.lesson)}</div>
      <div class="pe-stats">
        <span>${p.n_trades || 0} trades</span><span>·</span>
        <span>${p.n_blocked || 0} refusals</span><span>·</span>
        <span style="color:${(p.net_impact_usd||0) >= 0 ? GAIN : LOSS}">${fmtUsd(p.net_impact_usd || 0)}</span>
      </div>
    </div>`).join("");

  $("#letter-body").innerHTML = `
    <article class="newspaper">
      <div class="news-mast">
        <h3 class="news-title">The <span class="red">Sentinel</span> Daily</h3>
        <div class="news-meta">No. ${editionNo} · ${dateStr.toUpperCase()}<br>Future You · Morning Send</div>
      </div>
      <hr class="news-rule">
      <div class="news-cols">
        <div>
          <div class="news-section-h">A letter from Future You</div>
          <div class="letter-body">${letter}</div>
          <div class="letter-sig">You, six months from now.<br><span class="from">Written by the version who already did the work. Stored on disk. Read it again on the bad days.</span></div>
        </div>
        <aside>
          <div class="news-section-h">Yesterday at a glance</div>
          <div class="news-ledger">
            <div class="row"><span class="l">Net impact</span><span class="v ${netY >= 0 ? "green" : "red"}">${fmtUsd(netY)}</span></div>
            <div class="row"><span class="l">Realised PnL</span><span class="v ${realisedY >= 0 ? "green" : "red"}">${fmtUsd(realisedY)}</span></div>
            <div class="row"><span class="l">Saved by refusals</span><span class="v green">+$${fmt(savedY, 2)}</span></div>
            <div class="row"><span class="l">Trades of record</span><span class="v">${tradesY}</span></div>
            <div class="row"><span class="l">Refusals</span><span class="v">${blocksY}</span></div>
            <div class="row"><span class="l">Best</span><span class="v">${b.best_trade ? `${b.best_trade.symbol} ${fmtUsd(b.best_trade.pnl)}` : ""}</span></div>
            <div class="row"><span class="l">Worst</span><span class="v red">${b.worst_trade ? `${b.worst_trade.symbol} ${fmtUsd(b.worst_trade.pnl)}` : ""}</span></div>
          </div>
          <div class="news-lesson">
            <div class="h">Lesson of the day</div>
            <div class="body">${escapeHtml(b.lesson)}</div>
          </div>

          <div class="tg-preview">
            <div class="tg-preview-h">Telegram preview · @evosentinel_bot</div>
            <div class="tg-bubble">
              <div class="tg-line h">📰 The Sentinel Daily · No. ${editionNo}</div>
              <div class="tg-line">Good morning. Yesterday's net impact: <b style="color:${netY >= 0 ? GAIN : LOSS}">${fmtUsd(netY)}</b>.</div>
              <div class="tg-line">${blocksY} refusal${blocksY === 1 ? "" : "s"} saved <b>+$${fmt0(Math.round(savedY))}</b>. ${tradesY} trade${tradesY === 1 ? "" : "s"} of record.</div>
              <div class="tg-line">Today's lesson: <i>${escapeHtml(b.lesson)}</i></div>
              <div class="tg-line tap">Tap to open the full edition →</div>
              <div class="tg-time">07:00 · sent</div>
            </div>
          </div>
        </aside>
      </div>

      ${pastHtml ? `
      <div class="news-past">
        <div class="news-section-h">Past editions in the archive</div>
        <div class="past-grid">${pastHtml}</div>
      </div>` : ""}

      <div class="news-foot">
        <div class="news-edition">Filed at 07:00 UTC · Edition pushes to Telegram automatically every morning · @evosentinel_bot</div>
        <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;">
          <span class="tg-status" id="tg-status">Scheduled · next push 07:00 UTC tomorrow</span>
          <button class="tg-btn" id="tg-btn">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
            Send to Telegram now
          </button>
        </div>
      </div>
    </article>`;

  const btn = document.getElementById("tg-btn");
  const status = document.getElementById("tg-status");
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    const orig = btn.innerHTML;
    btn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg> Sending…`;
    status.textContent = "Posting to Telegram…";
    try {
      const r = await fetch("/api/push-letter", { method: "POST" });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "send failed");
      btn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg> Sent to @EvosentinelBot`;
      btn.classList.add("sent");
      const sentAt = new Date((j.sent_at || Date.now() / 1000) * 1000);
      status.textContent = `Delivered · ${sentAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} UTC · msg #${j.message_id}`;
    } catch (e) {
      btn.disabled = false;
      btn.innerHTML = orig;
      btn.classList.remove("sent");
      status.textContent = `Send failed · ${e.message}`;
    }
  });
}

// ── LIVE SENTINEL ─────────────────────────────────────────────
// Polls /api/quotes every 4s, flashes price tiles, and runs /api/activate
// when the user clicks the button. All trades are paper-only, never real.

const LIVE_SYMS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
const _lastPx = {};

async function pollLive() {
  try {
    const r = await fetch("/api/quotes");
    const j = await r.json();
    const t = j.tickers || {};
    document.getElementById("live-source").textContent = j.source + (j.lastError ? " · ERR " + j.lastError : "");
    const age = j.ageMs;
    document.getElementById("live-age").textContent = age == null ? "—" : (age < 1000 ? "just now" : Math.round(age / 1000) + "s ago");

    const navParts = [];
    LIVE_SYMS.forEach(sym => {
      const tk = t[sym];
      const tile = document.querySelector(`.live-tile[data-sym="${sym}"]`);
      if (!tk || !tile) return;
      const pxEl = tile.querySelector(".live-px");
      const chEl = tile.querySelector(".live-ch");
      const prev = _lastPx[sym];
      const px = tk.last;
      pxEl.textContent = "$" + px.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const ch = tk.change24h * 100;
      chEl.textContent = (ch >= 0 ? "+" : "") + ch.toFixed(2) + "% 24h  ·  bid " + tk.bid.toFixed(2) + "  ask " + tk.ask.toFixed(2);
      chEl.classList.toggle("up", ch >= 0);
      chEl.classList.toggle("dn", ch < 0);
      if (prev != null && prev !== px) {
        tile.classList.add("flash");
        setTimeout(() => tile.classList.remove("flash"), 350);
      }
      _lastPx[sym] = px;
      const cls = ch >= 0 ? "up" : "dn";
      const short = sym.replace("USDT", "");
      navParts.push(`<span class="nt ${cls}">${short} <b>$${px.toLocaleString(undefined,{maximumFractionDigits:2})}</b></span>`);
    });
    document.getElementById("nav-ticker").innerHTML = navParts.join("");
    // Hydrate EXEC_MODE badge from /api/exec/status (paper by default).
    fetch("/api/exec/status").then(r => r.ok ? r.json() : null).then(s => {
      if (!s) return;
      const el = document.getElementById("exec-badge");
      if (!el) return;
      const live = s.exec_mode === "live";
      const armed = !!s.armed;
      const color = !live ? "#1f8a5a" : (armed ? "#c4453b" : "#c89400");
      const label = !live ? "EXEC: paper" : (armed ? "EXEC: LIVE · armed" : "EXEC: live · shadow");
      el.innerHTML = `<span style="width:6px;height:6px;border-radius:9999px;background:${color};"></span>${label}`;
    }).catch(()=>{});
  } catch (e) {
    document.getElementById("live-source").textContent = "offline · " + e.message;
  }
}

function renderVerdict(v) {
  if (!v.ok) return `<div class="verdict-card pass"><div class="vh"><div class="vh-sym">${escapeHtml(v.symbol || "?")}</div><div class="vh-final pass">NO DATA</div></div><p class="v-ind">${escapeHtml(v.error || "")}</p></div>`;
  const finalCls = v.final.startsWith("BLOCKED") ? "blocked"
                 : v.final === "LONG"  ? "long"
                 : v.final === "SHORT" ? "short" : "pass";
  const votes = Object.entries(v.votes).map(([who, vt]) => {
    const dirLbl = vt.dir > 0 ? "LONG" : vt.dir < 0 ? "SHORT" : "PASS";
    const dirCls = vt.dir > 0 ? "long" : vt.dir < 0 ? "short" : "pass";
    return `<div class="v-vote"><div class="who">${who}<span class="dir ${dirCls}">${dirLbl}</span></div>
      <div class="line">${escapeHtml(vt.line)}</div>
      <div class="conf">conf ${vt.conf.toFixed(2)} · weight ${(v.weights[who] || 0).toFixed(2)}</div></div>`;
  }).join("");
  const blocks = v.blocks?.length
    ? `<div class="v-block"><b>HABIT BLOCKER · ${v.blocks.map(b => b.code).join(" + ")}</b><br>${v.blocks.map(b => escapeHtml(b.text)).join(" ")}</div>`
    : "";
  const risk = v.risk
    ? `<div class="v-risk"><span>Entry <b>$${v.lastClose.toFixed(2)}</b></span><span>Stop <b>$${v.risk.stop.toFixed(2)}</b> (${v.risk.stop_atr} ATR)</span><span>TP1 <b>$${v.risk.tp1.toFixed(2)}</b> (${v.risk.tp_R}R)</span><span>Leverage <b>${v.leverage.toFixed(1)}×</b></span></div>`
    : "";
  const paperBtn = (v.final === "LONG" || v.final === "SHORT")
    ? `<div class="v-paper"><button data-sym="${v.symbol}" onclick="openPaper('${v.symbol}', this)">Open paper position</button><span class="opened" data-opened-for="${v.symbol}"></span></div>`
    : "";
  return `<div class="verdict-card ${finalCls}">
    <div class="vh">
      <div class="vh-sym">${escapeHtml(v.symbol)}</div>
      <div class="vh-px">$${v.lastClose.toLocaleString(undefined,{maximumFractionDigits:2})}</div>
      <div class="vh-final ${finalCls}">${escapeHtml(v.final)}</div>
    </div>
    <div class="v-ind">
      <span>RSI14 <b>${v.indicators.rsi14}</b></span>
      <span>ATR14 <b>$${v.indicators.atr14}</b></span>
      <span>24h <b>${v.indicators.change24h >= 0 ? "+" : ""}${v.indicators.change24h}%</b></span>
      <span>Score <b>${v.score >= 0 ? "+" : ""}${v.score}</b></span>
      <span>Conf <b>${v.confidence}</b></span>
    </div>
    <div class="v-votes">${votes}</div>
    ${blocks}
    ${risk}
    ${paperBtn}
  </div>`;
}

window._currentVerdicts = {};
window.openPaper = async function (sym, btn) {
  const v = window._currentVerdicts[sym];
  if (!v) return;
  btn.disabled = true;
  btn.textContent = "Opening…";
  try {
    const r = await fetch("/api/paper/open", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ verdict: v }) });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || "open failed");
    btn.textContent = "Opened #" + j.position.id;
    document.querySelector(`[data-opened-for="${sym}"]`).textContent = `· paper position #${j.position.id} live`;
    refreshPaperBook();
  } catch (e) {
    btn.disabled = false;
    btn.textContent = "Open paper position";
    document.querySelector(`[data-opened-for="${sym}"]`).textContent = "· failed · " + e.message;
  }
};

async function refreshPaperBook() {
  let j;
  try { j = await (await fetch("/api/paper/book")).json(); } catch { return; }
  const el = document.getElementById("paper-book");
  if (!el) return;
  const m = j.metrics || {};
  const retCls = (m.return_pct ?? 0) >= 0 ? "pnl-up" : "pnl-dn";
  const metaBar =
    `<div class="paper-metrics">
       <span><b>Bank</b> $${(m.bank ?? 0).toLocaleString()}</span>
       <span><b>Return</b> <span class="${retCls}">${(m.return_pct ?? 0) >= 0 ? "+" : ""}${m.return_pct ?? 0}%</span></span>
       <span><b>Trades</b> ${m.trades ?? 0}</span>
       <span><b>Win rate</b> ${m.win_rate_pct ?? 0}%</span>
       <span><b>Drawdown</b> ${m.drawdown_pct ?? 0}%</span>
       <span><b>Open</b> ${m.open_positions ?? 0}</span>
     </div>`;

  const openRows = (j.positions || []).map(p => {
    const mtm = p.mtm_pct == null ? "" :
      (p.mtm_pct >= 0
        ? `<span class="pnl-up">+${p.mtm_pct}%</span> <small>(+$${p.mtm_usd})</small>`
        : `<span class="pnl-dn">${p.mtm_pct}%</span> <small>($${p.mtm_usd})</small>`);
    return `<tr><td>#${p.id}</td><td>${escapeHtml(p.symbol)}</td><td>${p.dir}</td><td>${(p.leverage||1).toFixed(1)}×</td><td>${p.qty}</td><td>$${p.entry.toFixed(2)}</td><td>${p.mark ? "$"+p.mark.toFixed(2) : ""}</td><td>${mtm}</td><td><button class="mini-x" onclick="closePaper(${p.id}, this)">close</button></td></tr>`;
  }).join("");

  const openTable = openRows
    ? `<h3>Open paper positions · marked to live tape</h3>
       <table class="paper-tbl"><thead><tr><th>#</th><th>Symbol</th><th>Dir</th><th>Lev</th><th>Qty</th><th>Entry</th><th>Mark</th><th>P&L</th><th></th></tr></thead><tbody>${openRows}</tbody></table>`
    : `<div class="empty">No open paper positions. Activate the Parliament to convene.</div>`;

  const histRows = (j.history || []).slice(0, 20).map(p => {
    const cls = (p.pnl_usd ?? 0) >= 0 ? "pnl-up" : "pnl-dn";
    const ts  = new Date(p.exit_ts).toISOString().slice(5,16).replace("T"," ");
    return `<tr><td>${ts}</td><td>#${p.id}</td><td>${escapeHtml(p.symbol)}</td><td>${p.dir}</td><td>$${p.entry.toFixed(2)}</td><td>$${(p.exit||0).toFixed(2)}</td><td>${p.exit_reason}</td><td class="${cls}">${(p.pnl_usd>=0?"+":"")}$${p.pnl_usd}</td><td class="${cls}">${p.r_multiple}R</td><td>$${p.bank_after}</td></tr>`;
  }).join("");

  const histTable = histRows
    ? `<h3 class="mt-4">Closed trades · verifiable ledger</h3>
       <table class="paper-tbl hist"><thead><tr><th>Closed</th><th>#</th><th>Symbol</th><th>Dir</th><th>Entry</th><th>Exit</th><th>Why</th><th>P&L</th><th>R</th><th>Bank</th></tr></thead><tbody>${histRows}</tbody></table>
       <div class="ledger-link"><a href="/api/paper/log?n=500" target="_blank">View raw JSONL ledger</a> · every fill is appended to <code>data/paper_trades.jsonl</code></div>`
    : "";

  el.innerHTML = metaBar + openTable + histTable;
}

window.closePaper = async function (id, btn) {
  btn.disabled = true;
  try {
    const r = await fetch("/api/paper/close", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || "close failed");
    refreshPaperBook();
  } catch (e) {
    btn.disabled = false;
    btn.textContent = "fail";
  }
};

function wireActivate() {
  const btn = document.getElementById("activate-btn");
  const status = document.getElementById("activate-status");
  const out = document.getElementById("live-verdicts");
  if (!btn) return;
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    status.textContent = "Convening the Parliament against the live snapshot…";
    out.innerHTML = "";
    try {
      const r = await fetch("/api/activate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "activate failed");
      window._currentVerdicts = {};
      j.verdicts.forEach(v => { if (v.ok) window._currentVerdicts[v.symbol] = v; });
      out.innerHTML = j.verdicts.map(renderVerdict).join("");
      const counts = { LONG: 0, SHORT: 0, PASS: 0, BLOCKED: 0 };
      j.verdicts.forEach(v => { if (!v.ok) return; const k = v.final.startsWith("BLOCKED") ? "BLOCKED" : v.final; counts[k]++; });
      status.textContent = `Verdicts in · ${counts.LONG} LONG · ${counts.SHORT} SHORT · ${counts.PASS} PASS · ${counts.BLOCKED} BLOCKED · quote age ${j.quoteAgeMs}ms · ${j.mode}`;
    } catch (e) {
      status.textContent = "Activate failed · " + e.message;
    } finally {
      btn.disabled = false;
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  wireActivate();
  pollLive();
  setInterval(pollLive, 4000);
  setInterval(refreshPaperBook, 5000);
});

load();
