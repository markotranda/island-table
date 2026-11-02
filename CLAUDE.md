# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

"Island Table": a private, self-hosted 2-6 player browser implementation of the 2025 edition of a classic island-trading board game and its 5-6 player (paired-player) expansion. Server-authoritative, dependency-free: Node.js 24+ built-ins only (`node:http`, `node:sqlite`, `node:crypto`, `node:test`), browser-native SVG/DOM on the client. There is no `npm install`, build step, bundler, linter, or TypeScript. Keep it dependency-free.

## Commands

```sh
npm start                         # node server.mjs  (http://localhost:3000)
npm run dev                       # node --watch server.mjs
npm test                          # node --test test/*.test.mjs
node --test test/engine.test.mjs  # one test file
node --test --test-name-pattern="paired" test/*.test.mjs   # tests matching a name
docker --context desktop-linux compose up -d --build       # Docker on this Windows machine (Linux containers), host port 8080
docker compose exec game node scripts/backup.mjs /data/backup.sqlite   # consistent live backup (refuses to overwrite)
```

Env vars: `PORT`, `HOST`, `DATA_DIR` (default `data/`, Docker `/data`), `PUBLIC_ORIGIN`. Compose also reads `BIND_ADDRESS` (default `127.0.0.1`) from `.env`.

`test/server.test.mjs` spawns `server.mjs` with `PORT=0` and a temp `DATA_DIR` under `tmp/`, detecting the port from the `http://localhost:<port>` line on stdout — keep that log line format. `tmp/` and `data/` are gitignored scratch/state.

Browser tests (`test/browser.test.mjs`) drive a real headless Chrome/Chromium/Edge through `test/browser.mjs`, a tiny DevTools Protocol client over Node's built-in `WebSocket` (no Playwright/Puppeteer). They auto-detect an installed browser (Edge on this machine), honor `BROWSER=<path>`, and skip when none exists. Each `newPage()` is an isolated browser context, i.e. a separate device with its own `localStorage`; clipboard writes are captured in `window.__copied`. The driver finds the endpoint via the profile's `DevToolsActivePort` file because Edge's launcher exits immediately and hands off to another process. Tests select elements by the client's `data-ui`/`data-command`/`data-vertex`/`data-edge`/`data-hex` attributes — keep those stable. To reach situations dice can't reliably produce (a seven with discards, specific hands, dealt dev cards, a stacked deck), the test-only `stage(server,pages,fn)` fixture opens the room's SQLite state between commands, lets `fn` edit it via `setHand`/`deal`/`topDeck` (which move cards to and from the bank and deck so supply and deck totals stay conserved), bumps `revision`, and reloads every page; everything after staging goes through the UI. Simultaneous actions (offers posted at once) can arrive in either order, so assert on content, not position. CI runners are much slower than this machine; set `THROTTLE=6` (CDP CPU throttling) to shake out timing flakes locally before pushing.

## Architecture

- **`lib/board.mjs`** — board graph (hexes, unique vertices and edges with adjacency), fixed presets for the 19-hex and 30-hex boards, ports, and number-token sequences (`BASE_NUMBERS`, `LARGE_NUMBERS`). Rule legality uses the graph, never screen coordinates.
- **`lib/engine.mjs`** — pure rules engine. `apply(state, playerIndex, cmd, random)` returns the next state for a command `{type: ...}` (`start`, `ready`, `roll`, `road`, `settlement`, `city`, `buyCard`, `playCard`, `offer`/`acceptOffer`/`cancelOffer`, `bank`, `discard`, `robber`, `steal`, `monopoly`, `invention`, `end`, `rematch`). Game flow is an explicit `phase` state machine (`lobby`, `setupSettlement`, `setupRoad`, `preRoll`, `discard`, `robber`, `steal`, `action`, `freeRoads`, `monopoly`, `invention`, `finished`). A room's `map` (`base`/`extended`, see `MAPS`) fixes the board, supply, deck and `seats` limit; `count` is 0 in the lobby and set to the number of players when the host starts (2+, all ready), so in-game rules such as paired turns (`count>4`) follow who actually plays. `upgrade()` gives pre-map saves their implied map when `server.mjs` loads them. All randomness comes through the injected `random(n)` so tests can be deterministic. `view(state, playerIndex)` produces the filtered per-player snapshot — opponents' cards, hidden VP totals, and deck order must never leak through it.
- **`server.mjs`** — HTTP API + SSE live updates (not WebSockets) + SQLite persistence. Routes: `/health`, `POST /api/rooms`, `/api/rooms/:id/{join,events,commands}`. Whole game state is stored as JSON in `rooms`; `sessions` stores SHA-256 hashes of bearer seat tokens; `commands` stores `(room, player, id)` for idempotency. Each command carries an ID and expected revision: stale revisions are rejected, duplicate IDs are acknowledged without re-applying, and state is committed in a `BEGIN IMMEDIATE` transaction before acknowledging, then broadcast as `view()` to each connected client.
- **`public/`** — single-page client (`app.js`, `index.html`, `style.css`); renders the board as original SVG. Resource icons are original art in an SVG sprite inlined in `index.html` (`#ico-wood` … `#ico-desert`, referenced with `<use>` and the `icon()` helper); edit `scripts/icons.mjs` and run `node scripts/icons.mjs` to regenerate it rather than hand-editing the sprite. The client also stores seat tokens in `localStorage` key `island-seats`.
- **Tests** — `engine.test.mjs` (rules, edge cases), `matches.test.mjs` (complete seeded games at 2-6 players using only real commands, with JSON round-trips simulating save/restore), `server.test.mjs` (auth, idempotency, private views, stale revisions, restart persistence), `browser.test.mjs` (invite → lobby → simultaneous ready → setup → turns → reload → seat recovery across devices; phone-width layout).
- **Stale revisions in the client** — a 409 refreshes state and shows "try again", keeping form values (`render(true)`). `retryContext()` in `app.js` lists the commands `command()` retries automatically instead: lobby `ready` (friends ready up simultaneously) and `offer` during `action` (several players post offers at once). A retry happens only if the context it returns (own ready flag; turn/active/role) is unchanged after the refresh. Add new auto-retried commands there. `command()` drops a repeat of the in-flight command type (double clicks) but queues a different one, because the SSE stream often reveals the next choice (Monopoly, Invention) before the HTTP response returns; it also skips redrawing when the stream already delivered the response's revision.

## Code style

Code is written in a compact, dense style: long single-line functions, minimal whitespace, terse names, ES modules (`.mjs`). Match it when editing rather than reformatting.

## Rules and conventions

- `RULES.md` is the rule-to-source mapping and the list of **explicit digital conventions** for underspecified cases (Longest Route traversal, Road Building with < 2 legal spots, two-desert robber start, dev-card aging per personal action opportunity in paired turns, neutral blockers in fixed 5-player setup, etc.). Update it when changing any such behavior. The saved rules identifier is `2025-v1`.
- Rule source of truth is the 2025 rulebooks; text extracts live in `tmp/pdfs/*.pdf.txt`. Do not bundle the PDFs or their artwork in the app.
- No older-edition rules: no special building phase; Player 2 in paired turns never trades with players and never rolls.
- Never invent moves for disconnected players (no auto-skips, bots, or timers).
- Schema is additive and auto-created at startup; incompatible changes need an explicit migration.
- `PLAN.md` is the original proposal; its React/TypeScript/Socket.IO stack was deliberately not used.
