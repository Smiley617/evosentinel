# EvoSentinel — Bitget Base Camp Hackathon S1 entry
# Reproducible commands for judges. All paper, no real funds.

.PHONY: help install backtest server live test smoke clean

help:
	@echo "EvoSentinel — make targets"
	@echo "  make install   — install Node + Python deps"
	@echo "  make backtest  — regenerate data/metrics.json + briefs + equity curve"
	@echo "  make server    — start the live chamber on :3000 (needs TG_BOT_TOKEN, TG_CHAT_ID)"
	@echo "  make live      — alias for server"
	@echo "  make smoke     — quick smoke-test (activate + open + close round-trip)"
	@echo "  make test      — run unit tests"
	@echo "  make clean     — remove generated data + node_modules"

install:
	npm install
	@which python3 >/dev/null || (echo "python3 missing" && exit 1)
	@python3 -c "import numpy" 2>/dev/null || pip3 install --user numpy

backtest:
	python3 -m engine.run

server:
	@test -n "$$TG_BOT_TOKEN" || (echo "set TG_BOT_TOKEN" && exit 1)
	@test -n "$$TG_CHAT_ID"   || (echo "set TG_CHAT_ID" && exit 1)
	node server.js

live: server

smoke:
	@curl -s http://localhost:3000/api/health | head -c 200 && echo
	@curl -s -X POST -H "content-type: application/json" -d '{}' http://localhost:3000/api/activate | head -c 400 && echo

test:
	node test/run-tests.js

clean:
	rm -rf node_modules
	rm -f data/paper_trades.jsonl data/paper_state.json
