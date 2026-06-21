#!/usr/bin/env node
// EvoSentinel · MCP Server
// Exposes the live Parliament as Model Context Protocol tools so any
// MCP-compatible LLM (Claude Desktop, Cursor, Continue, etc.) can:
//
//   evosentinel.quote       — get live Bitget ticker for BTC/ETH/SOL
//   evosentinel.activate    — convene the 5-agent Parliament on a symbol
//   evosentinel.book        — read the open paper-trade book + metrics
//   evosentinel.open        — open a paper position from a verdict
//   evosentinel.close       — close a paper position
//   evosentinel.metrics     — read bank, win rate, drawdown, return
//   evosentinel.refusals    — list recent Habit-Blocker refusals
//
// Transport: stdio JSON-RPC 2.0 per the MCP spec (no SDK dependency).
// Backend: HTTP calls to the chamber server (default http://localhost:3000).

const readline = require("readline");

const BASE = process.env.EVOSENTINEL_BASE || "http://localhost:3000";

// ── MCP protocol: minimal stdio implementation ──────────────────
const TOOLS = [
  {
    name: "evosentinel.quote",
    description: "Get the live Bitget ticker snapshot for BTC, ETH and SOL (paper-simulation, public data).",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "evosentinel.activate",
    description: "Convene the EvoSentinel Parliament (5 agents + Habit-Blocker) against the current live snapshot. Returns weighted verdict per symbol with full reasoning.",
    inputSchema: {
      type: "object",
      properties: { symbol: { type: "string", enum: ["BTCUSDT", "ETHUSDT", "SOLUSDT"], description: "Optional. Omit to run on all live symbols." } },
      required: [],
    },
  },
  {
    name: "evosentinel.book",
    description: "Read the open paper-trade book (marked-to-market) plus the last 50 closed trades and account metrics.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "evosentinel.open",
    description: "Open a paper-trade position from an actionable Parliament verdict. Position is sized at 2% account risk. No real funds touched.",
    inputSchema: {
      type: "object",
      properties: { verdict: { type: "object", description: "A verdict object as returned by evosentinel.activate (must have direction LONG or SHORT and a risk plan)." } },
      required: ["verdict"],
    },
  },
  {
    name: "evosentinel.close",
    description: "Manually close an open paper position by id (auto-exit at stop/TP is otherwise automatic).",
    inputSchema: {
      type: "object",
      properties: { id: { type: "integer", description: "Position id from evosentinel.book." } },
      required: ["id"],
    },
  },
  {
    name: "evosentinel.metrics",
    description: "Read paper-account metrics: starting bank, current bank, realized PnL, trades, win rate, drawdown, return %.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "evosentinel.refusals",
    description: "List the last N Habit-Blocker refusals from the persistent ledger, with code + reason.",
    inputSchema: {
      type: "object",
      properties: { n: { type: "integer", default: 20, description: "How many recent ledger events to scan." } },
      required: [],
    },
  },
];

async function http(method, path, body) {
  const r = await fetch(BASE + path, {
    method,
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await r.text();
  try { return JSON.parse(t); } catch { return { ok: false, raw: t, status: r.status }; }
}

async function callTool(name, args) {
  switch (name) {
    case "evosentinel.quote":    return http("GET",  "/api/quotes");
    case "evosentinel.activate": return http("POST", "/api/activate", args && args.symbol ? { symbol: args.symbol } : {});
    case "evosentinel.book":     return http("GET",  "/api/paper/book");
    case "evosentinel.open":     return http("POST", "/api/paper/open",  { verdict: args.verdict });
    case "evosentinel.close":    return http("POST", "/api/paper/close", { id: args.id });
    case "evosentinel.metrics": {
      const j = await http("GET", "/api/health");
      return { ok: true, metrics: j.paper, bitgetAgeMs: j.bitget && j.bitget.ageMs };
    }
    case "evosentinel.refusals": {
      const n = (args && args.n) || 20;
      const j = await http("GET", `/api/paper/log?n=${n * 5}`);
      const refusals = (j.ledger || [])
        .filter(e => e.event === "open" && e.position && (e.position.blocks || []).length)
        .slice(-n)
        .map(e => ({
          ts: e.ts, symbol: e.position.symbol, direction: e.position.dir,
          blocks: e.position.blocks,
        }));
      return { ok: true, refusals };
    }
    default: throw new Error("unknown tool: " + name);
  }
}

// ── JSON-RPC stdio loop ─────────────────────────────────────────
function send(msg) { process.stdout.write(JSON.stringify(msg) + "\n"); }

const rl = readline.createInterface({ input: process.stdin, terminal: false });
rl.on("line", async (line) => {
  let req;
  try { req = JSON.parse(line); } catch { return; }
  const { id, method, params } = req;
  try {
    if (method === "initialize") {
      send({ jsonrpc: "2.0", id, result: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "evosentinel-mcp", version: "1.0.0" },
      }});
    } else if (method === "tools/list") {
      send({ jsonrpc: "2.0", id, result: { tools: TOOLS } });
    } else if (method === "tools/call") {
      const out = await callTool(params.name, params.arguments || {});
      send({ jsonrpc: "2.0", id, result: {
        content: [{ type: "text", text: JSON.stringify(out, null, 2) }],
        isError: out && out.ok === false,
      }});
    } else if (method === "ping") {
      send({ jsonrpc: "2.0", id, result: {} });
    } else if (method && method.startsWith("notifications/")) {
      // notifications never get a response
    } else {
      send({ jsonrpc: "2.0", id, error: { code: -32601, message: "method not found" } });
    }
  } catch (e) {
    send({ jsonrpc: "2.0", id, error: { code: -32000, message: String(e.message || e) } });
  }
});

process.stderr.write(`evosentinel-mcp ready · backend=${BASE}\n`);
