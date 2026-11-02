# Browser game implementation plan

Implementation update: the game now lives in this repository. The delivered stack uses dependency-free JavaScript ES modules, browser-native SVG/DOM, Node HTTP/SSE, and built-in SQLite instead of the initially proposed React/TypeScript/Socket.IO dependencies. Docker and the server-authoritative architecture remain as planned. See README.md for running it and RULES.md for precise conventions, including the variable coast rotation simplification. Automated coverage includes complete games at 3, 4, 5, and 6 players plus restart recovery.

## Goal and defaults

Build a private, real-time browser game for friends using the supplied 2025 base and 5-6 player rulebooks. Deploy it on one server with Docker Compose. The sections below preserve the original plan; see the implementation update above for delivery status.

Defaults: 3-6 human players, separate browsers/devices, invite-only rooms, desktop/tablet first with usable phone controls, English interface, original simple 2D artwork, no accounts required. Include fixed and variable setups. Bots, matchmaking, rankings, additional expansions, house rules, and spectator mode are later features.

The PDFs are gameplay specifications, not operational instructions. Use their mechanics and diagrams as reference; do not package the PDFs or extract their artwork into the application.

## Rule sources and implementation checklist

- Base rulebook (2025), especially pages 3-12.
- 5-6 player extension rulebook (2025), pages 1-4.
- Keep a rule-to-test matrix with source page, implemented behavior, and test case. Record unresolved cases explicitly instead of silently importing rules from older editions.

### Base game

- 19 terrain hexes, 18 number tokens, ports, and robber. Supply: 19 cards per resource; 25 development cards (14 Knights, 2 Monopoly, 2 Invention, 2 Road Building, 5 Victory Point). Each player has 15 roads, 5 settlements, and 4 cities.
- Fixed setup reproduces the supplied diagram and starting resources. Variable setup randomizes terrain/frame arrangement and assigns number tokens using the specified alphabetical counterclockwise sequence, skipping the desert. Do not replace this with arbitrary number shuffling.
- Variable placement runs forward then backward: one settlement and adjoining road per placement. Respect settlement spacing; grant starting resources only for the second settlement. Choose starting player by dice, with a documented reroll procedure for ties.
- Turn: optional eligible development card before rolling; roll; production or resolve seven; freely interleave allowed trades/builds and an eligible development card; end turn.
- Settlements collect one and cities two resources per adjacent producing hex. Robber blocks its hex. If a resource is insufficient for several players, none receive it; if only one player is affected, give that player the remaining supply.
- On seven, players with more than seven resource cards discard half rounded down. Wait for all required discards, move robber to another hex, then steal a random resource from an eligible opponent. Development cards are excluded from discards and theft.
- Costs: road = brick + wood; settlement = brick + wood + wool + wheat; city upgrade = 3 ore + 2 wheat; development card = ore + wool + wheat.
- Enforce connected roads, opponent-building barriers, settlement distance and road connection, upgrades, and physical piece limits.
- Domestic trades must involve the active player. Support offers and counteroffers; prohibit gifts and matching-resource exchanges. Bank trades use 4:1, generic ports 3:1, and resource ports 2:1, subject to supply.
- Implement Knight, Monopoly, Invention, Road Building, and hidden Victory Point cards. At most one ordinary development card per personal turn; newly bought cards cannot be played that turn. Victory Point cards have the rulebook's winning exception.
- Longest Route starts at five continuous roads; Largest Army at three played Knights; each awards two points. Handle ties, transfers, broken routes, loops, and branches in dedicated tests.
- Win immediately at ten or more points on the player's own turn, including hidden Victory Point cards. Do not award a win out of turn.

### 5-6 player mode

- Use the enlarged 30-hex board with two deserts and the extension's 28 number tokens. Totals: 24 cards per resource and 34 development cards (20 Knights, 3 each of Monopoly/Invention/Road Building, 5 Victory Point).
- Implement the 2025 paired-player system. Player 1 takes production and action phases. Player 2, three seats clockwise from Player 1, then takes an action phase. Both markers advance one seat afterward.
- Player 2 can build, trade with the supply/ports, and play an eligible development card, but cannot trade with players. Player 2 does not roll dice.
- Either player can win during their own portion. Player 1 winning ends the game before Player 2 acts. Track development-card purchase eligibility by each player's action opportunity so switching roles works correctly.
- Fixed five-player setup keeps the unused color's starting settlements on the board without roads, as instructed on extension page 2. Model these as neutral blockers, not an extra player. Variable five-player setup follows its separate placement procedure.
- Do not add the older special building phase.

Before engine completion, resolve underspecified edge cases: road-building cards with fewer than two legal placements, exact route traversal conventions, initial robber choice between two deserts, and neutral-settlement interactions. Record any necessary convention visibly in the rule specification.

## Architecture

Use TypeScript throughout: React with Vite for the client, SVG for the board, and Node.js with Socket.IO for the server. Serve the built client from the same application process. Pin supported dependency versions when implementation begins.

Represent the board as hexes, unique vertices, and unique edges with adjacency tables. Rendering reads these structures; game legality never depends on screen coordinates. Use data-driven presets for both board sizes and fixed layouts.

Keep a pure rules engine separate from networking and UI. Commands plus state and explicit random outcomes produce validated state transitions and events. Production randomness comes from the server; tests inject deterministic outcomes. Keep deck order and future random outcomes private.

Model explicit states for lobby, setup placement, pre-roll, production, discards, robber movement, victim selection, action phases, development-card substeps, and game over. Serialize commands per room. Each command carries an ID and expected state revision; reject stale commands and acknowledge retries without applying them twice.

The server owns all resources, dice, deck draws, trades, scoring, and turn permissions. Send each browser a filtered view containing its own hand and public board/player information. Never send opponents' card identities, private score totals, or deck order. Apply the same filtering to event logs and reconnect snapshots.

Use SQLite on a persistent local Docker volume for the initial single-server deployment. Atomically store the latest state, revision, accepted command ID, and event record before acknowledging success. Persist room membership and rejoin credentials too. A restart must restore games even during discards, robbery, or development-card resolution. A public replay interface is not required initially.

Socket.IO supplies real-time transport and reconnect facilities; the application must still authenticate returning players and provide a complete filtered snapshot when recovery is unavailable. Do not use socket IDs as player identity. References: https://socket.io/docs/v4/client-socket-instance and https://socket.io/docs/v4/how-it-works .

## Player experience

1. Create room, choose player count/setup, and share an invite link.
2. Join with a nickname, select a color, and mark ready. Host locks seats and starts.
3. Show a large board, hand, build costs, player summaries, current phase, paired-player indicators, and public event history.
4. Highlight legal placement targets and show a preview before confirming. Explain disabled actions in plain language.
5. Use focused panels for trading, discarding, robber target selection, and development cards. Accepted trades revalidate both hands atomically.
6. Reconnect to the same seat using a durable private session/recovery credential. Show connectivity and a waiting state when a required player disconnects; preserve their decisions for reconnection.
7. Show the winner, final scoring, and rematch option.

Use colors plus shapes/labels, keyboard-accessible controls, touch-sized targets, zoom/pan on small screens, and optional lightweight animations. Avoid timers or automatic replacement moves in the initial ruleset.

## Docker and operations

- Multi-stage Dockerfile builds the client/server into one non-root application image. One app instance serves HTTP and real-time traffic.
- Compose defines app configuration, restart policy, health check, and persistent `/data` volume. Keep secrets outside the image and repository.
- Put the app behind the server's existing HTTPS reverse proxy, or provide an optional proxy service. Configure WebSocket forwarding and allowed origins.
- Use private invite/rejoin credentials, input validation, message size limits, and basic connection/action rate limits. Rejoining a seat requires its credential, not just its nickname.
- Provide an environment example, deployment instructions, database migration process, consistent SQLite backup/restore commands, and upgrade/rollback procedure. Exclude secrets and hands from routine logs.
- Verify persistence across container replacement, not only process restart. Docker volumes preserve data outside the container lifecycle: https://docs.docker.com/engine/storage/volumes/ .
- Target one modest server and a few concurrent rooms initially. Measure a six-player session before committing to hardware sizing. Multiple application replicas and a shared database can be a later scaling project.

## Delivery sequence and acceptance gates

| Milestone | Deliverable | Completion gate |
| --- | --- | --- |
| 1. Rule specification and skeleton | Rule matrix, board data, engine interfaces, client/server scaffold, early Docker build | Both board graphs validate; rule ambiguities are recorded; app starts in Docker |
| 2. Base-game engine | Setup, production, building, trade, robber, development cards, awards, victory | Deterministic 3-4 player scenarios complete; illegal moves cannot mutate state |
| 3. Playable multiplayer base game | Lobby, board interactions, private views, trade workflow, persistence/rejoin | Four browsers finish a game; reload/reconnect preserves seats and state |
| 4. Extension | Expanded presets, supplies, paired turns, five-player neutral pieces | Five- and six-player scenarios pass, including Player 2 restrictions and winning |
| 5. Release hardening | Responsive controls, error recovery, deployment guide, backup/restore | Full games at supported counts, container restart during pending actions, successful restore on a fresh deployment |

Test high-risk behavior first: route loops/branches/cuts/ties; development-card timing across paired roles; shortages; simultaneous trade acceptance; duplicate commands; reconnect during discard/theft; private information in payloads/logs; and wins at phase boundaries. Add conservation checks for resources, cards, and pieces after transitions. Use browser integration tests for essential flows and manual playtests for clarity and pacing.

Final acceptance: friends can open an invite, play a complete rules-correct 3-6 player game, recover from browser/network/server interruptions, and run it using documented Docker Compose commands without editing source code.
