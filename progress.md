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
| 3. Build cards | next | | |
| 4. Stacked dev cards | | | |
| 5. Setup flights | | | |
| 6. Placement highlight | | | |
| 7. Tooltips | | | |
| 8. Checks | | | |

## Round 2 log

- 2026-11-03, step 1 (commit 6ad8588):
  - White strip: `:root` painted cream, so the body's wood stopped at the body box and a collapsed bottom margin showed cream below. The wood is now on `:root`; `#app` is a `flow-root` so margins don't escape.
  - Scroll: `.game-layout` had `min-height:570px` (+76px top bar), so any window under ~646px tall scrolled. Floor is now 470px, and `html:has(.game-layout){overflow:hidden}` at ≥851px wide and ≥546px tall. Phones keep page scroll (stacked layout).
  - Driver gained `page.resize(w,h)`. The first browser test asserts no document scroll at 1280x900 and 1000x600 (fails with the old floor) and the wood gradient on `html` in the lobby.
  - `test/browser.test.mjs` has CRLF line endings in the working copy; edit with that in mind.

- 2026-11-03, step 2:
  - `app.js`: `store()`, `prune()`, `markOver(id,over)`, `checkSeats()`. Seats carry `at` (last entered, set by `remember()`) and `over` (when first seen finished; cleared on rematch). `accept()` and `enter()` keep `over` current; `enter()` forgets the seat on 401/404. On load: `prune()`, then `checkSeats()` asks the server about every other saved seat and re-renders the home page only if something changed. Home list shows the 5 most recently used.
  - Browser test (phone-width test) seeds a seat for a missing room and one finished 8 days ago; only the live seat remains and is the one offered for resume. Fails with the cleanup call removed.
