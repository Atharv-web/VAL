# Lennox Voice Agent — Backend

A Node.js + Express backend powering the **Lennox HVAC voice sales agent** on top of the
**OpenAI Realtime API (WebRTC)**. It runs a server-orchestrated, phase-driven sales flow
(qualification → recommendation → detail → booking) with deterministic tool execution and
in-memory session state.

## Stack

- **Runtime:** Node.js, ES modules, bundled with Rollup into `run.js`
- **Server:** Express (port **9018**), PM2 for process management
- **AI:** OpenAI Realtime (`gpt-realtime-2025-08-28`) for voice, `gpt-4o` for text evaluation
- **Cache:** Redis (`ioredis`/`redis`) — competitor catalog; conversation/session state is in-memory
- **Observability:** Sentry, PostHog

## Project Layout

```
src/
├── server.js                         # Boot: Sentry, Redis connect, app.listen
├── app.js                            # Express assembly + Lennox route mounting
├── config/
│   ├── index.js                      # Central env config
│   ├── redis.js                      # Redis client
│   └── sentry.js                     # Sentry helper
├── utils/
│   ├── express-helper.js             # res.ok / res.error / res.created ...
│   └── ping.js                       # /ping health check
└── services/voice-agent-lennox/      # The Lennox agent (all logic lives here)
    ├── voice-agent-lennox.router.js
    ├── voice-agent-lennox.controller.js
    ├── voice-agent-lennox.helper.js  # session store, rate limiter, cleanup
    ├── config/prompts.js             # System prompt + tool-context templates
    ├── core/
    │   ├── config/
    │   │   ├── index.js              # Model registry (lennox-ucp)
    │   │   ├── tools.js              # Realtime tool/function definitions
    │   │   └── lennox-orchestration.config.js
    │   └── helpers/
    │       ├── session-state.js      # Phase machine + per-session orchestrator state
    │       ├── data-builders.js      # UI payload builders
    │       ├── validation.js         # Booking/guardrail validation
    │       ├── email-parser.js
    │       └── lennox-products.json  # Product catalog (serialized SQLite dump)
    └── services/
        ├── webrtc-tools-service.js   # getSessionConfig (instructions + tools + VAD)
        ├── redis-cache.js            # Conversation history + competitor catalog cache
        ├── competitor-data/          # tier1–tier4 competitor JSON
        ├── posthog-logger.js         # Analytics events
        └── token-monitor.js          # Per-session token accounting
```

## Local Development

### 1. Prerequisites

- Node.js (ES modules) + Yarn
- Redis running locally (`redis://localhost:6379`)

### 2. Environment (`.env`)

```bash
OPENAI_API_KEY=sk-...                 # required — Realtime + eval
PORT=9018
REDIS_URL=redis://localhost:6379
CACHE=true                            # set "true" to connect Redis + warm competitor catalog
LENNOX_ASSETS_BASE_URL=https://...    # S3 base for product images (<base>/<productId>.png)
SENTRY_URL=                           # optional — error/trace reporting
WEB_BASE_URL=                         # optional
NODE_ENV=development
VOICE_AGENT_DEBUG=false               # optional — verbose agent logging
DEBUG_LLM=false                       # optional — log LLM payloads
```

### 3. Run

```bash
yarn dev          # rollup -c -w  (watch + run)
```

Production build / start:

```bash
yarn build-prod   # NODE_ENV=production rollup -c  → run.js
yarn start        # pm2 start run.js --name salesagent-api-v2
```

## API

The Lennox router is mounted at **`/voice-agent/lennox`** and **`/voice-agent-lennox`**.
All routes are rate-limited per IP; voice routes are authorized by the server-issued opaque
`session_token` (no header auth).

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/session` | Create OpenAI Realtime session + local `session_token` |
| `POST` | `/realtime` | Relay SDP offer/answer to OpenAI (WebRTC handshake) |
| `POST` | `/tools` | Execute a Realtime function/tool call (returns UI payload + context) |
| `POST` | `/` | Server-side turn orchestrator (deterministic qualification/booking) |
| `GET`  | `/dealers?zip=` | Proxy Lennox dealer-locator API (server-side key) |
| `GET`  | `/booking-slots?session_token=` | Date/time picker slots (gated) |
| `POST` | `/conversation/message` | Store a conversation message |
| `GET`  | `/conversation/history` | Read conversation history |
| `POST` | `/conversation/prune` | Prune old messages |
| `POST` | `/usage` | Report token usage from client |
| `POST` | `/context-debug` | Dump context to `logs/context-debug/` |
| `POST` | `/evaluate` | Text-mode evaluation via Chat Completions (`gpt-4o`) |
| `GET`  | `/api/token-usage` | Token usage summary |

Health check: `GET /ping` → `pong`.
Frontend UI is served from `public/voice-agent/lennox/` via `GET /voice-agent/lennox`.

## How It Works

1. Browser ↔ OpenAI Realtime over WebRTC (audio direct; SDP relayed through `/realtime`).
2. The model is given Lennox tools. When it calls one, the browser `POST`s `/tools`; the
   backend executes deterministically and returns a UI payload plus an instruction `context`
   the model speaks to.
3. In parallel, raw transcripts can be `POST`ed to `/` for a fully server-driven
   qualification/booking flow.
4. Conversation phases are derived from session data (`QUALIFICATION → RECOMMENDATION →
   DETAIL → BOOKING`); guardrails gate booking until all contact fields are confirmed.

Products come from a JSON catalog (`lennox-products.json`); competitors from tiered JSON
cached in Redis. Bookings are currently simulated (logged, not emailed). All per-session
state is in-memory and process-local.

## Operational Notes

- **Session TTL:** 30 minutes; cleaned every 5 minutes.
- **Logs:** `get-logs.js` fetches PostHog session logs — `yarn get-logs <session-id> [days] [outfile]`.
- **Deploy:** AWS CodeDeploy via `appspec.yml` + `scripts/{before,after,start,stop,validate}.sh`.

## Code Style

See [CLAUDE.md](CLAUDE.md) for the project conventions (ES module syntax, named exports,
logging format).
