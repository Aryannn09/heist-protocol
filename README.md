# HEIST PROTOCOL

A complete five-vault browser bluffing game for 2–8 players. No login, API key, or database setup is needed for local play.

## Run locally (Node.js 22 or newer)

```
cd heist-protocol
npm run dev
```

Open http://localhost:8787 in a normal browser and an Incognito window. Create a room as Aryan, join as Alex, mark both ready, and start. Each round has 60 seconds of discussion, up to 30 seconds for secret decisions, a three-second countdown, and 15 seconds of results. Discuss in person or on an existing call.

**Local development does not require npm install.** Local rooms are in memory and disappear when the server restarts. Phones on the same network can use your computer's LAN IP and port 8787, subject to firewall settings. A localhost address is not a public URL.

## Rules

| Outcome | Split | Steal | Guard |
| --- | --- | --- | --- |
| No thieves | +600 | — | 0 |
| One thief, no guards | 0 | +1200 | — |
| One thief with guards | +600 | −300 | floor(900 / number of guards) |
| Multiple thieves | 0 | −300 | +300 |

Vault multipliers are 1, 1, 2, 2, 3. One Double Down per player doubles their own result, including a loss. Unconfirmed decisions default to Split without Double Down. Highest credits wins; ties share the win.

## Architecture and implementation choices

- Lightweight HTML/CSS/JavaScript frontend; no React build dependency. This changes the originally proposed React stack, not gameplay.
- One-second polling of authoritative snapshots, rather than the originally proposed WebSockets. Countdown timestamps are server-controlled; visual phase changes can arrive up to roughly one polling interval later, plus network delay.
- Native Node.js local server; Cloudflare Worker and SQLite-backed Durable Object for production.
- HttpOnly, SameSite cookies; Secure in production. Room and nickname do not authenticate a player.
- Other players' actions and gadget usage are withheld until results. Credentials never appear in game JSON.
- Durable Object requests and alarms are serialized. Persisted phase/history make duplicate alarms and decision retries idempotent.
- Active roster stays fixed. Offline players follow ordinary timeouts. Host transfers after 30 seconds offline to the earliest connected crew member, or immediately on explicit departure.
- Rematch returns to lobby and resets scores, gadgets, decisions, and readiness.
- Room cleanup occurs after 24 hours without activity. Every active five-round game completes before that threshold.

## Test and build

```
npm test
npm run build
```

Tests cover approved examples, all 9,837 action combinations for two through eight players across all five multipliers, private projections, defaults, duplicate locks, gadget use, limits, stale requests, reconnecting, host transfer, and a complete five-round Durable Object simulation with two authenticated sessions, concurrent locks, restart recovery, winner, and rematch.

The Durable Object integration test uses an in-memory mock of its storage API and an accelerated test clock. It is not a deployed Cloudflare integration test.

## Deploy to your Cloudflare account

```
npm install
npx wrangler login
npm run build
npm run deploy
```

Cloudflare authentication is required for publishing. The included configuration binds static assets and a SQLite Durable Object. Change the Worker name if it conflicts with an existing project. Do not upload this project to Netlify Drop: it needs the Worker and Durable Object backend.

Before sharing the public URL, play a full game on two separate devices, check reconnects and the final winner, and try a rematch. Production account limits, costs, abuse controls, and real-network behavior must be evaluated before a broad launch. This project is a playable V1, not a certified competition winner.

## File map

- public/index.html — game entry and rules dialog
- public/app.js — room, lobby, round, results and winner screens
- public/style.css — navy/cyan/gold responsive design
- lib/game.mjs — shared authoritative rules and state machine
- server.mjs — dependency-free local server
- worker.mjs — Cloudflare Worker and Durable Object
- wrangler.jsonc — bindings and SQLite migration
- test/game.test.mjs — scoring and multiplayer state tests
- scripts/build.mjs — static asset build
- package.json / package-lock.json — commands and deployment dependencies

No OpenAI API key is used or needed.
