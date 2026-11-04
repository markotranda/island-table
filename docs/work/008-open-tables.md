# 008: Open tables (public rooms), kicking, and lobby cleanup

**Status:** in progress · **Commits:** … · **Depends on:** —

## Feedback
2026-11-04, owner:
1. "Room picker. When opening the home screen for the game, beside just inputting a code for a game, you can see all public rooms."
2. "That also means we need to be able to set room to be public or private."
3. (answer to questions) "Public by default. But that also means we need to add kick function."
4. (answer to "hide empty lobbies?") "Shouldn't that lobby just be deleted?"

## Current state
- Rooms are reachable only by the 12-hex code: `POST /api/rooms/:id/join` (`server.mjs:73`), entered in the home "Join friends" tab (`home()` in `public/app.js:128`). No listing endpoint.
- Joining is only legal in the lobby with a free seat (`addPlayer`, `lib/engine.mjs:19`).
- The host can remove bots (`removeBot`, `lib/engine.mjs:138`, `[data-remove-bot]`), not people.
- Table settings: `settings` command (`lib/engine.mjs:130`), `SETTINGS` / `tableSettings()` in `app.js:131-134`; any change un-readies the others.
- Rooms are never deleted. The server knows who is connected (`clients`, `online(id)`).
- A rejected seat token returns 401 from the stream; `connect()` (`app.js:46`) just keeps retrying.
- Copy says "private" in several places (create card, lobby "YOUR PRIVATE TABLE", README "No public matchmaking").

## Open questions
- (none)

## Decisions
| # | Feedback | Decision | Why |
|---|---|---|---|
| 1 | Room list | List in the "Join friends" tab under the code form: `OPEN TABLES`, a row per room with the host name ("Ana's table"), seats filled / seats, map, points to win, and a Join button that uses the typed name. Refreshes every 5 s while the home screen is on the Join tab. | Owner picked this layout. |
| 2 | Which rooms | Only public rooms in the lobby with a free seat **and** at least one human from the room connected right now. | Owner: joinable only; empty lobbies are hidden right away (cleanup below). |
| 3 | Public/private | New lobby setting `public` (Visibility: "Public · listed" / "Private · code only"), host only, any time in the lobby. Changing it does **not** un-ready anyone (it doesn't change the game). | Owner: lobby setting. |
| 4 | Default | New rooms are public. Saves from before this change load as **private** (`upgrade()` sets `public??=false`): their codes were shared as private. Rematch keeps the setting. | Owner: public by default; old rooms were created as private. |
| 5 | Kick | Lobby only. The host gets a remove button on each other human seat (`[data-kick="<seat>"]`). The engine removes the player and recolours the seats, like `removeBot`. Their seat token stops working (401 "The host removed you from this table."), their open streams close, and their client goes home with that message and forgets the seat. In-game, the existing bot takeover covers people who leave. | Owner: lobby only. Kicking mid-game would be a forfeit, which `CLAUDE.md` rules out. |
| 6 | Rejoin after kick | Nothing extra: a kicked person can join again from the list or the code. The host can switch to private. | Owner: "Nothing extra". There are no accounts to tell people apart. |
| 7 | Abandoned lobbies | Hidden from the list as soon as no human from the room is connected. Deleted (room, sessions, commands) once nobody has been connected for 1 h (`LOBBY_TTL` ms, default 3600000). Applies to private lobbies too, and to rematch lobbies (a finished table whose host tapped Rematch and everyone left). Rooms in a game or finished are never deleted. After the upgrade, existing lobbies get one TTL from boot. | Owner: "Hide now, delete after 1 h". Rematch/upgrade consequences written down per review. |
| 8 | Copy | "Create a private table" becomes "Create a table". The lobby eyebrow says "YOUR PUBLIC TABLE" or "YOUR PRIVATE TABLE". README limitation line updated. The "PRIVATE EDITION" brand stays (it describes the self-hosted app). | Wording follows the feature. |
| 9 | Rooms you already sit in | The list shows "Resume" instead of Join for rooms with a saved seat in this browser (`data-resume`, existing handler). | Avoids taking a second seat by accident. |

## Plan

### Engine (`lib/engine.mjs`)
- `newGame` adds `public:true`; `upgrade` adds `g.public??=false`; `rematch` copies `public`.
- `settings`: accept `cmd.public` (boolean, else "Invalid setting."). It is not part of the `before` key, so it doesn't un-ready anyone.
- New command `kick {player}`: `ensure(p===0&&g.phase==='lobby')`, target is an integer seat, `>0`, exists and is not a bot (bots use `removeBot`). Splice and recolour (share a small `unseat(g,i)` helper with `removeBot`). Log nothing (lobby has no events).
- `view()` already shows settings fields; make sure `public` comes through (it copies top-level fields).

### Server (`server.mjs`)
- `session()`: a token whose player is no longer in `g.players` → 401 "The host removed you from this table." (today it's 400 "Seat not found."). The session row stays (harmless; deleted with the room).
- `broadcast()`: a client whose player is gone gets `res.end()` instead of being skipped, so a kicked person's streams close.
- `GET /api/rooms` → `[{id,host,players,seats,map,goal}]`: iterate `clients.keys()` (rooms with someone connected, so no full table scan), `read()` each, keep `phase==='lobby'&&public&&players.length<seats`. Newest-first isn't tracked, so sort by player count descending, then id. Rate-limited like other `/api/` routes. Exposes only what a joiner would see in the lobby anyway.
- Lobby cleanup: `seen=new Map()` room → last time a human was connected. It's set on create, join, every command, stream connect and stream close. Rooms not in the map fall back to server start. A 60 s sweep (`Math.min(60000,ttl/2)`, unref) runs `SELECT id,state FROM rooms` and finds lobbies with no clients and `now-(seen.get(id)??started)>=LOBBY_TTL`. It deletes each one in a transaction, re-reading the phase first, from `commands`, `sessions` and `rooms`, then clears the `timers`/`watched`/`offerSeen`/`away`/`seen` entries. At startup that gives every lobby a full TTL from boot.

### Client (`public/app.js`)
- `SETTINGS` gets `['public','Visibility',[['true','Public · listed'],['false','Private · code only']]]`. The change handler parses `public` as a boolean like `friendly`. The summary line mentions "Listed under open tables" or "Only people with the code can join".
- Lobby seat: for the host, human seats other than seat 0 get `<button class="ghost small remove-bot" data-kick="i" data-tip="Remove from the table">`. Click → `command('kick',{player})`. No confirm dialog (CLAUDE.md tests avoid dialogs; the kicked person can rejoin).
- `connect()`: a 401/404 response means the seat is gone. It deletes `saved[room]`, aborts, goes home (same as the `home` action) and toasts the server's message.
- Home: `[data-ui="open-tables"]` under the Join form, rows `[data-open="<id>"]` with `data-join="<id>"` buttons (or `data-resume`). Clicking Join puts the id in `#code` and calls `form.requestSubmit()`, so name validation and the existing join path are reused. While on the home Join tab, a `setInterval` (5 s) fetches `/api/rooms` and only replaces the list's `outerHTML`, so typing in the name field isn't disturbed. It starts on render of home/join and stops otherwise. The empty state is "No open tables right now. Create one and it shows up here."
- Phone width: rows wrap (flex-wrap); checked by the existing phone-width test.

### Tests
- `engine.test.mjs`: `public` default, setting toggle doesn't un-ready, invalid value rejected; `upgrade` makes old saves private; rematch keeps it. `kick`: host only, lobby only, not self, not bots, recolours, the kicked player can't act.
- `server.test.mjs`: list shows a public lobby only while its host's stream is open, hides private, full and started rooms. Kick → kicked token gets 401 with the message on GET, and its open stream ends. Cleanup with `LOBBY_TTL=1500`: an abandoned lobby is gone (404) after the TTL, a running game isn't. Spawn the server with the env var for this test.
- `browser.test.mjs`: device A creates a room. Device B's home Join tab lists it (`[data-open]`), B types a name and clicks Join and lands in the lobby. Host kicks B (`[data-kick="1"]`), and B is back home with the toast and no saved seat. The host switches Visibility to private, and a third device's list no longer shows it. Phone-width test still passes with a row in the list.

### Steps (one commit each, `npm test` green after each)
1. Engine: `public` setting, `kick`, `upgrade`, rematch, plus engine tests.
2. Server: `GET /api/rooms`, kicked-token 401 + stream close, lobby cleanup with `LOBBY_TTL`, plus server tests; client `connect()`/`command()` go home on 401/404.
3. Client lobby: Visibility setting, kick button, plus browser test for kick (kicked device goes home) and visibility.
4. Client home: open tables list with polling, Join/Resume, copy changes, plus browser test for joining from the list and phone width.
5. Docs: `CLAUDE.md` (route, `LOBBY_TTL`, `data-kick`/`data-open`/`open-tables`/`data-setting="public"`, `kick` in the command list), README (open tables, kicking, cleanup, limitation line), How to play text, project log. Screenshots of home with the list and the lobby via `scripts/review-screens.mjs`. `THROTTLE=6 npm test`.

## Review
Round 1 (fresh general-purpose agent): APPROVE, 11 minor findings. All accepted:
1. Client loops on 401 between steps → `connect()` 401/404 handling moves into step 2.
2. `command()` on 401/404 also goes home and forgets the seat (step 2).
3. `kick` goes by seat index like `removeBot` and is **not** added to `retryContext()` (indices shift on joins; a 409 just says try again).
4. Sweep filters in SQL: `WHERE json_extract(state,'$.phase')='lobby'`.
5./6. Rematch lobbies and lobbies existing at upgrade fall under cleanup → Decision 7 + README.
7. README says plainly that on an internet-facing server anyone with the URL sees public tables.
8. Server test polls `/api/rooms` after closing a stream; browser tests select `[data-open="<id>"]` only.
9. Extra tests: deleted lobby (404) sends the client home; `kick` rejects bad seats; the list has exactly the keys `{id,host,players,seats,map,goal}`.
10. Client caches the last list; the poll stops on every path off home.
11. CLAUDE.md: Routes line, `LOBBY_TTL` env var, cleanup in the server bullet. RULES.md unchanged.

## Progress
| Step | State | Commit | Notes |
|---|---|---|---|

## Not verified

## Next step / Handoff prompt
Read `CLAUDE.md`, then this file. The plan is in review; after approval, implement steps 1–5 in order, one commit each, updating Progress.
