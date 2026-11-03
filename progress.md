# Progress

Plan: [`docs/feedback-plan.md`](docs/feedback-plan.md). Read its "Working rules" first.

After every step: update this file, check usage (`mcp__ccd_session_mgmt__get_usage`), and if the 5-hour limit, weekly limit or context is over 85%, park and write the handoff prompt below.

## Status

| Step | State | Commit | Notes |
|---|---|---|---|
| 0. Plan written | done | 2816040 (with step 1) | Usage at start: 5-hour 24%, weekly 19%, context 11% |
| 1. Engine and rules | done | 2816040 | Usage after: 5-hour 32%, weekly 20%, context 22% |
| 2. Board and build bar | done | e4605aa | Usage after: 5-hour 37%, weekly 21%, context 25% |
| 3. Trade panel | done | 24a38f2 | Usage after: 5-hour 40%, weekly 21%, context 27% |
| 4. Dice | done | 3e524c8 | Usage after: 5-hour 42%, weekly 21%, context 29% |
| 5. Resource animations | done | d581ba4 | Usage after: 5-hour 46%, weekly 22%, context 30% |
| 6. Win screen and sound | done | bf3c105 | Usage after: 5-hour 50%, weekly 22%, context 32% |
| 7. Icons | done | 1e9d72f | 12 Font Awesome Free 6.7.2 icons downloaded from jsDelivr with the owner's OK. Usage after: 5-hour 55%, weekly 23%, context 35% |
| 9. Sound everywhere | done | 2bb69b2 | Added at the owner's request after step 8 |
| 8. Checks | done | 953c10e, 1e9d72f | `npm test` and `THROTTLE=6 npm test` 33/33 after step 7 |

## Log

- 2026-11-03: Plan agreed and written.
- 2026-11-03, step 1 (commit 2816040):
  - `lib/engine.mjs`: `log(g,kind,data,secret)` writes structured events with sequential `id` (`g.eventSeq`), cap 400. `view()` strips `secret` unless the viewer is in `secret.to`. Kinds: `first, gain, build, roll, discard, robber, steal, buy, play, monopoly, invention, offer, respond, cancel, trade, bank, award, end, win`.
  - `produce()` now returns `{gains,short}` per hex/player; the roll event stores them plus `blocked` (robber hex if it matched the roll).
  - Auto-steal with one victim (`steal()` helper). Trade flow: `offer` (active only, or a counter with `counterTo`), `acceptOffer`/`declineOffer` (willingness list `accepted`/`declined`; on a counter, the active player's accept completes it), `confirmOffer {offerId, player}`, `cancelOffer`. `exchange()` re-checks resources.
  - `public/app.js`: `story(e)` renders history (names with colour dots, resource icons); `offerHtml(o)` for offer actions (`data-accept`, `data-decline`, `data-confirm`+`data-player`, `data-counter`, `data-cancel`); counter form prefilled via `picker(prefix,limit,start)`; `counter` global holds the offer being countered. `retryContext()` retries `offer`/`acceptOffer`/`declineOffer`.
  - Tests: new engine tests for trades, auto-steal, history/secrets; browser trade test rewritten (B accepts while C counters at once; A declines counter, confirms B); passed 3/3 with `THROTTLE=6`. `scripts/review-screens.mjs` uses the new flow and structured events.
  - `RULES.md` conventions added (auto-steal, trade flow, what history reveals); help text updated; `CLAUDE.md` updated.
  - Gotcha: Python `open(...,'w')` on Windows writes CRLF; harmless because `core.autocrlf=true`, but prefer the Edit tool or `newline=''`.

- 2026-11-03, step 2 (commit e4605aa):
  - `board()` viewBox margins 190/170 → 152/152; `token(h)` draws a r=23 disc at `h.y+11`, number at `cy-4`, pips as circles at `cy+13`; icon 28px at `h.y-43`; robber at `x+33,y+24` on numbered hexes.
  - Heading row removed: `.table-line` is absolutely positioned on `.board-wrap`; Field guide button removed (`modal==='costs'` still works but nothing opens it).
  - `buildBar()` / `buildPiece()` / `BUILD` in `app.js`, rendered at the end of `hand()`'s `.hand-row`; disabled with a `title` reason. Costs card removed from `controls()`. Esc clears `mode`.
  - CSS appended at the end of `style.css` (token pips, build bar, one-row hand on desktop with a 851–1250px compact tier).
  - Browser test asserts the build bar is disabled off-turn and enables only affordable items.
  - Right column now holds: turn card, Trade with supply, End turn, Offer a player trade, offers, history. Step 3 moves trade out of it.

- 2026-11-03, step 3:
  - `tradePanel()` in `app.js`, rendered first inside `.board-wrap`. Shown when `mode` is `trade`/`bank` or some offer id is not in `dismissed`; otherwise a `.trade-launcher` with the same tabs (current player only) and an "Offers n" button (`data-ui="trade-show"`). Close (`data-ui="trade-close"`) puts current offer ids into `dismissed`.
  - Tabs: Players (`data-mode="trade"`, current player in role 1) and Supply (`data-mode="bank"`, current player). Non-active players see offers only; Counter switches `mode` to `trade` with `counter` set.
  - Bank and trade forms moved out of `controls()`; the right column is now turn card, End turn (+ build hint), waiting text, history.
  - New offers flash once (`seenOffers`, `.offer.fresh`), respecting reduced motion. Phone: bottom sheet.
  - Browser test: incoming offer opens the panel; close hides it behind the launcher; reopen works. Browser suite passed 2/2 with `THROTTLE=6`.

- 2026-11-03, step 4:
  - Event tracker in `app.js`: `noticeEvents()` (called from `render()`) turns history entries newer than `seenEvent` into `effects` with a start time; the first state per room only sets the baseline (`enter()` resets it). `effect(kind,ms)` finds a live effect; `since(f)` gives elapsed ms, used as a negative `animation-delay` (`--t`) so redraws don't restart animations. Step 5 should reuse this for production/steal effects.
  - `diceHtml()`: on your `preRoll` the dice are a `<button class="table-dice roll-me" data-command="roll">` with a glow and "Roll the dice" pill; otherwise the last roll, with `.tumbling` + `.roll-total` for 2.6 s after a new roll. Roll button removed from the turn card; preRoll instruction text updated.
  - CSS keyframes `roll-glow`, `roll-wiggle`, `tumble`, `tumble2`, `total-pop`; disabled under `prefers-reduced-motion`.
  - `scripts/review-screens.mjs` adds `11-your-roll` and `12-roll-seen`.

- 2026-11-03, step 5:
  - Hex polygons carry `data-tile="<hex id>"`. `board()` draws `.hex-glow` over hexes in a live roll effect's `gains` (2.6 s, delayed to after the tumble).
  - `playEffects()` (end of `render()`) plays each effect once (`f.played`): roll gains fly from `[data-tile]` to the owner (`cardOf(p,r)`: your own matching hand card, else that player's `.sidebar .player`), up to 3 cards per gain, starting at 800 ms; steals fly victim → thief, `.fly-back` when the viewer has no `secret`. Elements go in `#fx` (fixed overlay outside `#app`, created on demand) and use the Web Animations API, so redraws don't interrupt them. Skipped under reduced motion.
  - Browser test stages a lone victim: no pick, onlooker sees `#fx .fly .fly-back`, victim sees the ore icon, histories differ accordingly. 3/3 with `THROTTLE=6`.
  - `scripts/review-screens.mjs` re-stages and rerolls until the roll produces, so `12-roll-seen` shows glow and flights.

- 2026-11-03, step 6:
  - `victoryHtml()` renders a fixed full-screen `.victory` (`data-ui="victory"`) whenever `phase==='finished'` and not `victoryClosed`: confetti (`CONFETTI`, deterministic, resumed via `--t` from `victoryAt`), trophy, winner name in colour, `scoreboard()`, "View the board" (`data-ui="victory-close"`) and the host's `data-command="rematch"`. The right column's `.winner` card (with its own rematch button) appears only after closing, so there is one rematch button at a time. Both reset when the phase leaves `finished`.
  - Sound: Web Audio, unlocked on the first `pointerdown`; `fanfare()` on a new `win` event, `rattle()` on every new `roll` event (both via `playEffects()`, which still plays sounds under reduced motion but skips flights). Mute button in the header (`data-ui="mute"`, inline speaker SVG), stored in `localStorage` key `island-muted`.
  - Win browser test: banner on every screen; closing it reveals the board and the winner card; rematch from the banner.
  - Not verified by ear in this session: sound output (headless tests can't hear). Worth a manual listen.

- 2026-11-03, step 8 (for steps 1–6): `npm test` and `THROTTLE=6 npm test` both 33/33. Review screenshots regenerated and sent to the owner. Section 10 appended to `docs/project-log.md` (that file was untracked before this work and is left uncommitted). Not checked: a 1280×720 laptop viewport, the extended 30-hex board screenshot, and sound by ear.

- 2026-11-03, step 7 (owner approved the download):
  - Path data of arrow-right, arrow-right-arrow-left, arrow-up-right-from-square, xmark, check, volume-high, volume-xmark, house, dice, trophy, handshake, building-columns copied into `UI` in `scripts/icons.mjs` (keys `arrow, swap, external, close, check, sound-on, sound-off, house, dice, trophy, handshake, bank`); `sprite()` emits `#ui-<key>` symbols with `fill="currentColor"`; regenerated with `node scripts/icons.mjs`.
  - `ui(k,label)` helper in `app.js`; text arrows/checks/×/⌂ replaced (invite, home, create, resume, footer, ready badges, set sail, end turn, play again, close buttons, accepted badge), `SPEAKER` uses the sound icons, trade tabs get handshake/bank, roll pill gets dice, victory banner gets the trophy. `.ui-ico` CSS sizes icons to 1em.
  - Tests that matched on "ready ✓" now match on words / `.lobby-seat.is-ready`.
  - CC BY 4.0 credit: README "Credits" section and a "Credits" entry in How to play. `CLAUDE.md` notes the `#ui-*` symbols.
  - All plan steps are now done. Remaining unchecked: sound by ear, a 1280×720 viewport, an extended-board screenshot.

- 2026-11-03, step 9 (sound everywhere):
  - `app.js` sound kit: `tone()` and `noise()` primitives into a `master` gain (0.55), `knock()`, and `SFX` with one function per cue (`roll, pop, robber, steal, sour, warn, road, settlement, city, flip, play, coins, clink, sparkle, offer, tick, sting, end, turn, fanfare`). `cue(name,...)` logs to `window.__sounds` (if a test set it to an array) and plays only when unmuted and the AudioContext is running (unlocked on the first `pointerdown`).
  - `playEffects()` maps each new event kind to its cue. Personal cues: `warn` (a 7 when you must discard), `sour` (you were robbed), `offer` (an offer you can answer), `tick` (someone accepted your offer), `turn` (chime once per turn key `turn:setupIndex:active:role` when your turn starts; `turnCue` is armed in the lobby, and only sets a baseline on a mid-game page load). `fly()` takes a `land` callback so each card's `pop` lands with it; under reduced motion the pops play on timers instead.
  - Browser tests: victim hears `sour`, onlooker doesn't; the offer bell reaches others but not the poster; the next player hears `turn`, others hear `end`; mute is stored and survives a reload.
  - Flake seen once: one failure of "discards, player and bank trades…" in 10 throttled full runs, message not captured; 9 later runs passed. If it recurs, capture the output first.
  - Not verified: how the sounds actually sound (headless tests can't hear). The owner should listen and say which to tune.

- 2026-11-03: README refreshed (feature tour, screenshots in `docs/screenshots/`, play and test notes); `review-screens.mjs` gained `FORMAT=jpeg`. Pushed to origin. The owner is play-testing; more feedback will follow.

## Handoff prompt

(Empty until work is parked.)

# Round 2

Plan: "Round 2" in [`docs/feedback-plan.md`](docs/feedback-plan.md).

| Step | State | Commit | Notes |
|---|---|---|---|
| 0. Plan written | done | 6ad8588 | Usage at start: 5-hour 64%, weekly 24%, context 11% |
| 1. Page fixes | done | 6ad8588 | |
| 2. Saved seats | done | see log | |
| 3. Build cards | done | see log | |
| 4. Stacked dev cards | done | see log | |
| 5. Setup flights | done | see log | |
| 6. Placement highlight | done | see log | |
| 7. Tooltips | done | see log | |
| 8. Checks | done | see log | `npm test` and `THROTTLE=6 npm test` 35/35 |

## Round 2 log

- 2026-11-03, step 1 (commit 6ad8588):
  - White strip: `:root` painted cream, so the body's wood stopped at the body box and a collapsed bottom margin showed cream below. The wood is now on `:root`; `#app` is a `flow-root` so margins don't escape.
  - Scroll: `.game-layout` had `min-height:570px` (+76px top bar), so any window under ~646px tall scrolled. Floor is now 470px, and `html:has(.game-layout){overflow:hidden}` at ≥851px wide and ≥546px tall. Phones keep page scroll (stacked layout).
  - Driver gained `page.resize(w,h)`. The first browser test asserts no document scroll at 1280x900 and 1000x600 (fails with the old floor) and the wood gradient on `html` in the lobby.
  - `test/browser.test.mjs` has CRLF line endings in the working copy; edit with that in mind.

- 2026-11-03, step 2:
  - `app.js`: `store()`, `prune()`, `markOver(id,over)`, `checkSeats()`. Seats carry `at` (last entered, set by `remember()`) and `over` (when first seen finished; cleared on rematch). `accept()` and `enter()` keep `over` current; `enter()` forgets the seat on 401/404. On load: `prune()`, then `checkSeats()` asks the server about every other saved seat and re-renders the home page only if something changed. Home list shows the 5 most recently used.
  - Browser test (phone-width test) seeds a seat for a missing room and one finished 8 days ago; only the live seat remains and is the one offered for resume. Fails with the cleanup call removed.

- 2026-11-03, step 3:
  - `buildBar()`: pieces left is a corner badge `<b class="build-left">` (like hand cards); each cost card is `<i class="cost have|miss" data-res="r">`, green underline when in hand, faded with a red underline when missing, also off-turn. Title adds "(missing 1 brick, …)" and "n left". Disabled build cards no longer fade as a whole, only piece and name, so the marks stay readable. Cost icons are 12px (10px in the 851–1250px tier) so the city's five fit.
  - Step 1 follow-up: the right column still scrolled as a whole with a long history, because the `.sr` screen-reader spans (absolutely positioned) escaped the log list's clipping to the nearest positioned ancestor. `.log-list{position:relative}`; on desktop the history fills the rest of the column (`flex:1`) and only its list scrolls.
  - `scripts/review-screens.mjs` now prints which elements scroll on each screen (`scrolls:<class> client/scroll`).
  - Browser tests: road cost marks for the active player and an off-turn player; with 40 staged history entries only `.log-list` scrolls, not `.control-sidebar` (fails without the `position:relative`).

- 2026-11-03, step 4:
  - `devStacks(me,playable)` in `app.js`: one `.dev-card` per type (order of `names`), `data-card` = id of a playable card of that type (else the first), new `data-type`, count badge `<b>` when more than one, "n new" tag moved to the bottom. `DEV_HELP` holds what each card does; it is in the card's title now and is meant for the step 7 tooltips (and history).
  - Stacks get an offset second edge (`box-shadow`); badge styled like hand cards.
  - Browser test: two dealt Knights render as one card with "2"; the title explains the card. Review script deals Mara two Knights.

- 2026-11-03, step 5:
  - Engine: `sources(g,p,v)` lists `{p,hex,r,n:1}` for the non-desert hexes around a vertex. Fixed setup's `gain` event and variable setup's second-settlement `build` event carry `gains` (same shape as a roll's).
  - Client: `board()` glows hexes for any live effect with `gains` (non-roll ones for 1.8 s, with `--t` shifted 800 ms past the roll tumble); `playEffects()` flies `gains` for every event kind, starting at 150 ms instead of 800 for non-rolls.
  - Tests: engine test that every starting grant's `gains` match its resources and hex terrain (fixed and variable); first browser test hears `pop` on every page after setup (fails when flights are limited to rolls).

- 2026-11-03, step 6:
  - `board()`: for live `build`/`robber` effects by another player (`f.p!==state.me`, not neutral, < 3 s) draws `.placed` with `data-placed="edge|vertex|hex"` and `--c` = player colour, `--t` = elapsed. Road glows (`.placed-road`, pale line with a coloured drop-shadow) go before the roads so the road stays on top; rings for settlements/cities and the robber hex go last. CSS: three 1 s pulses; reduced motion shows a steady ring that fades at 3 s.
  - Browser test: after C's two free roads, A sees two `[data-placed="edge"]`, C sees none.
  - Checked by eye with a scratch script (`pulse.mjs` in the session scratchpad, not committed): rings and road glows are visible against all terrains.

- 2026-11-03, step 7:
  - Engine: `routePath(g,p)` returns the edges of one longest route (`routeLength` is its length); `view()` adds `routeEdges` next to `route` for every player.
  - Client: every `title="…"` attribute became `data-tip="…"`. One `#tip` layer (outside `#app`): 350 ms hover delay, instant when moving between tips, long press (450 ms) on touch that swallows the following click, hidden on scroll and pointerdown. `retip()` at the end of `render()` re-attaches the tip and route highlight to whatever is under the pointer after a redraw.
  - New tips: hexes (resource, number, odds out of 36, robber), ports (rate, whether you use it), settlements/cities (owner, what they produce on which numbers), roads (owner, longest route length, whether this road is on it; hover lights the route via `.board.route-mode .road.route-lit`), award tiles (holder and what takes it), resource cards (your supply rate), dice (who rolled), dev cards and "played X" in the history (`DEV_HELP`), invite and help buttons. Hex `<title>` removed.
  - Fixed on the way: dev cards turned grey on hover (generic `button:hover` background).
  - Tests: engine test that `routePath` is a continuous trail of the owner's roads and appears in other players' views; browser test hovers C's road (tip, lit count = route length), then the dev card button (tip moves, highlight clears). Driver gained `page.hover()`. Review script adds `13-road-tip` and `14-card-tip`.
  - Gotcha: the scratchpad edit helper read stdin as cp1252 and garbled `’` once (fixed in `app.js` and an engine test name). If you script edits on this machine, read stdin as UTF-8.
  - Not done from the step 7 list: a tip on the sidebar player card as a whole (its stats already have tips) and on the robber pawn.

- 2026-11-03, step 8: `npm test` and `THROTTLE=6 npm test` both 35/35. Review screenshots regenerated (now also `13-road-tip`, `14-card-tip`). All round 2 steps done; the owner should play-test. Not checked: touch long-press on a real phone, and the pulse/glow at the extended 30-hex board.

# Round 3

Plan: "Round 3" in [`docs/feedback-plan.md`](docs/feedback-plan.md).

| Step | State | Commit | Notes |
|---|---|---|---|
| 0. Plan written | done | with step 1 | |
| 1. Lobby settings | done | see log | |
| 2. Starting roll | done | see log | |
| 3. Discard warning and window | done | see log | |
| 4. Client fixes | done | see log | |
| 5. Checks | done | see log | `npm test` and `THROTTLE=6 npm test` 37/37 |

## Round 3 log

- 2026-11-03, step 1 (lobby settings):
  - Engine: `goal` (points to win, default 10), `limit` (discard when holding more than this, default 7), `friendly` (friendly robber) on the game; `upgrade()` fills them for old saves; `LIMITS` holds the ranges (5-20, 7-12). New `settings` command (host, lobby only) takes any of `map, setup, goal, limit, friendly`; refuses a map with fewer seats than players; a real change un-readies everyone except the host. Win check uses `g.goal`, discards use `g.limit`, friendly robber drops victims with public score ≤ 2. Rematch keeps the settings.
  - Client: create form asks only for a name. `tableSettings()` in the lobby: host gets selects (`data-setting="map|setup|goal|limit|friendly"`), others read-only values (`data-value=…`); the block carries the current values as `data-map`, `data-goal`… so tests can wait for the server's confirmation. `settings` is auto-retried on 409 (`retryContext`). Table line, help, discard texts use the settings.
  - Tests: engine test for validation, un-ready, discard limit, goal, friendly robber, rematch; browser test: host changes points to win, guest sees it and is un-readied, table line says "First to 12 points". `createTable()` now picks map/setup in the lobby.
  - The "discards, player and bank trades" browser test failed once in a full run (passed 6/6 alone and the next full run). Still the known rare flake; message not captured.

- 2026-11-03, step 2 (starting roll):
  - Engine: `start()` builds the board and enters phase `order` with `g.order={round,candidates,done,dice}`. Command `firstRoll` (any candidate who hasn't rolled this round) logs `order {p,dice,round}`; when all candidates have rolled, a tie logs `tie {players,total,round}` and narrows `candidates`, otherwise `first {p,total}` and `place()` (fixed placements or the setup order, formerly the tail of `start()`). No win check in `order`.
  - Client: `orderHtml()` (`data-ui="order"`) over the board lists every player with their dice (tumble on new rolls), your own dice are the button (`data-command="firstRoll"`); turn card says who still rolls; toast "X goes first."; sounds: roll, warn on a tie. `firstRoll` auto-retries on 409 while the round and your own rolled flag are unchanged.
  - Tests: engine test for any-order rolls, double-roll refusal, ties narrowing to the tied players, fixed placement after the roll; `fixture()`/matches/server tests roll through `order`. Browser: `rollForStart(pages)` clicks every page's dice at once (used by `playSetup` and `seatTable`); the first test asserts everyone has dice, nobody gets "try again", and the winner is in the history.

- 2026-11-03, step 3 (discard warning and window):
  - `hand()`: holding more than `state.limit` cards adds `.hand.at-risk` (red edge on the cards) and a `[data-ui="discard-risk"]` note "Over 7: a 7 costs you n" with a tooltip.
  - `discardHtml()`: a fixed full-screen `.discard-screen` (`data-ui="discard"`) holding the same `#discard` form (h3 "Return n resources", picker, total) for players who owe cards; names others still discarding. Removed from the right column. Entrance animation resumes from `discardAt` so live redraws don't replay it.
  - Browser test asserts the window, the warning at 9 cards, none at 1, and both gone after discarding. Review script: new `15-starting-roll`; `08-discard` now shows the window.

- 2026-11-03, step 4 (client fixes):
  - History scroll bar: reproduced with 24-character names at 1000px wide: the list's content was 219px in a 173px box, so it scrolled sideways (`.who` was `nowrap`). Now `.log-list{overflow-x:hidden;overflow-wrap:anywhere;scrollbar-gutter:stable}` and names wrap. `render()` also keeps the scroll position of `.log-list`, `.trade-panel` and `.discard-card` (`SCROLLERS`) across redraws.
  - Trade panel blink: its `panel-in` entrance replayed on every redraw. `panelAt` (reset when the panel closes) gives it `--t`, used as `animation-delay`.
  - Steal tooltip: could not reproduce a leak of resource types; `view()` and every `data-tip` were audited and none carries another player's hand. Likely causes fixed: (1) tips popped up for whatever appeared under a still pointer (the browser reports the new element when the robber's hex overlay or the victim panel vanishes); `pointerover` at the last `pointermove` position is now ignored and `retip()` re-shows only the same tip text; (2) building tips read like hands ("Mara’s city: 2 cards each on 6 ore") and now say "Mara’s city. Produces 2 ore on 6, 2 wool on 9." Also found buildings had `pointer-events:none`, so their round 2 tooltips never showed; now hoverable.
  - Flake found: "discards, player and bank trades" counted all `[data-placed]` on C after Road Building, which includes B's robber pulse when B had just rolled a 7 (actual 1). Now counts only `[data-placed="edge"]`.
  - Tests: still-pointer `pointerover` shows no tip; building tip wording; hovering a building shows its tip; history has no sideways scroll and keeps its scroll through a redraw; the open trade panel has no running animation after live answers.
  - Owner should report with a screenshot if the steal tooltip still shows other players' resources.

- 2026-11-03, step 5 (checks): `npm test` and `THROTTLE=6 npm test` both 37/37. Review screenshots regenerated (new `15-starting-roll`; `02-lobby` shows the settings, `08-discard` the window). `CLAUDE.md` updated (commands, `order` phase, settings, new hooks, tooltip rule). Section 11 appended to `docs/project-log.md` (still untracked). Not checked: the steal tooltip in the owner's own browser, phone layout of the order card and discard window by eye.

# Round 4: bots

Plan: [`docs/bots-plan.md`](docs/bots-plan.md) (reviewed by a second agent over three rounds, approved). Same working rules as round 1.

| Step | State | Commit | Notes |
|---|---|---|---|
| 1. Plan and rule docs | done | see log | Usage at start: 5-hour 19%, weekly 32%, context 19% |
| 2. Engine | done | see log | |
| 3. Bot brain | done | see log | |
| 4. Server runner | done | 866d4ee | |
| 5. Client | done | see log | |
| 6. Checks | done | see log | `npm test` and `THROTTLE=6 npm test` 47/47 |

## Round 4 log

- 2026-11-03, steps 1–3:
  - Review found (and fixed before code): rematch must keep bots; the runner must ask every pending bot seat (the active bot waits on its offer while others answer); bot offers need an `offerId` from the runner; per-turn limits must come from `v.events` since `decide` is pure; release must work after the game finished; automatic takeover only while another human is connected and only when the game waits on that player; an `auto` seat is released by any command from it.
  - Engine: `addPlayer(g,id,name,bot)`, `BOT_NAMES`, `addBot`/`removeBot` (host, lobby; colours re-packed by index), `takeover {player}` (`auto:true` from the server = automatic, self, `by:null`), `release` (above the finished check), winning clears `auto`, settings keep bots ready, `pending(g)`, `bot`/`auto` in `view()`. Human names ending in "(Bot)" are rejected.
  - `lib/bot.mjs`: `decide(v,random,ctx)` and `fallback(v)`. `test/sim.mjs`: seeded `rng`, `scripted` (the old matches-test player, now shared), `bot`, `play()` with a simulated clock, `setHand`. `matches.test.mjs` uses it.
  - Strength (`node scripts/bot-stats.mjs`): all-bot 4-player games median ~65 turns (~16 rounds), 5–6 players ~130 turns (paired turns count twice); 2 bots vs 2 scripted players win ~80–100%. The scripted player is weak, so this shows sense, not strength; the browser play-test in step 6 is the real check.
  - Bots post a 1-for-1 offer on about half their turns when one or two cards short; they rarely trade with each other (both must gain).
- 2026-11-03, step 4 (commit 866d4ee): `wake()`/`step()` runner, `PAUSE` per phase × `BOT_PACE`, offer ages per room (divided by the pace, so a 20 s wait is 1 s at pace .05), presence (`away`, `offlineFor`, `waitsOn`, 5 s check, `BOT_AWAY`), release on stream connect and before any command from an `auto` seat (its own commit, so a stale command can't undo it), startup wake. Server test: host + 2 bots to turn 9 (the host plays via `decide` and answers offers), takeover refused while connected, `auto` refused from HTTP, automatic takeover, release on reconnect and on acting. Gotcha: an unread fetch stream in Node gets garbage-collected and closed, so the test reads every stream in the background.
- 2026-11-03, step 5: client `named()` adds " (Bot)" to `auto` seats in every state it receives; `onlineIds` from the stream (a presence change now redraws even at the same revision); lobby open seats are `[data-command="addBot"]` buttons for the host, bot seats carry `data-bot` and `[data-remove-bot]`; sidebar "Away · let a bot play" `[data-takeover]` (only once the stream has reported presence); history lines `takeover`/`release`; `retryContext()` retries all active-player commands in `action`, and `discard`. Fixed: `fly()` threw after leaving a game mid-animation (state null). Browser test: add/remove bots, start with a friend, the friend leaves (Home button: headless Edge keeps the stream open on about:blank), takeover, two rounds, return.
- 2026-11-03, step 6: played a full 4-seat game on the dev server (me via a click-anything script + 3 bots): Mila (Bot) won 10–5–5–2; bots offered and answered trades, discarded, moved the robber, bought and played cards. It showed bots sitting on 12–13 cards; they now spend down over the discard limit (end-of-turn hands over the limit 10% → 2%, discards per game 50 → 32). `bot-stats`: 4 bots median ~75 turns; 2 bots vs 2 scripted win ~80%. Docs: README, CLAUDE.md, How to play, project-log section 12.
- 2026-11-03, step 6 checks: `npm test` 47/47; `THROTTLE=6 npm test` 47/47 twice. A throttled run once stalled in the new browser test: the runner re-checked a bot's own offer after `wait` *game* ms instead of `wait × BOT_PACE` real ms, so at test pace each ignored bot offer cost ~19 s (harmless at pace 1). Fixed in `step()`. Section 12 appended to `docs/project-log.md` (that file stays untracked, as before). Not checked: a real phone, and a human-vs-bots game played by a person rather than a script; the owner should play-test.
