# 002: Feedback from the second game

**Status:** done (2026-11-03) · **Commits:** 6ad8588 and the commits after it

Migrated on 2026-11-04 from `docs/feedback-plan.md` ("Round 2") and `progress.md`, which no longer exist. Where the text below mentions `progress.md`, `feedback-plan.md` or `bots-plan.md`, read this file (or the earlier work items). Leftovers that were not done or not checked became open work items; see the [index](README.md).

## Plan

Agreed with the owner on 2026-11-03. Same working rules as round 1 (one commit per step, tests passing, `progress.md` updated, usage checked, park above 85%). Progress is in `progress.md` under "Round 2".

### The feedback and what was decided

| # | Feedback | Decision |
|---|---|---|
| 1 | Starting resources don't fly out | The setup `gain` event records the source hexes (`gains:[{hex,r,n}]` like a roll); the client glows those tiles and flies cards to the player, same as production. Old saves don't animate |
| 2 | Build cards only grey out; show what I have / miss | Each cost icon shows a green check (have) or a red dot (missing), also off-turn; tooltip names what's missing ("Missing: 1 brick, 1 wool") |
| 3 | Same dev cards should stack | One card per type with a count badge top-right like resource cards; "n new" note when some were bought this turn; clicking plays one playable card of that type |
| 4 | Tooltips everywhere | One styled tooltip system (`data-tip`, short delay, long-press on touch) replacing `title` popups. Contents: dev cards (what they do, in hand and history), roads (hover highlights that player's **longest route** and shows its length; engine/view exposes the route's edges), settlements/cities (owner, adjacent numbers/resources), hexes (resource, number, odds, robber), ports, sidebar player cards, award tiles (holder, what beats it), build cards, resource cards (count, your trade rate), dice, header buttons |
| 5 | Feedback when another player places something | 3-second pulsing ring in the player's colour on a new road/settlement/city by someone else, and on the robber hex when it moves. From the event tracker, not replayed on reload |
| 6 | Build cards show "left" at the bottom | Corner badge top-right like resource cards |
| 7 | Saved seats pile up in `localStorage` | Silent cleanup: drop a seat when the server says the room is gone or the seat is invalid; drop finished games after 7 days; cap at 20 most recent |
| 8 | White background when scrolling the ready page | Background painted on `html`, covers the full page |
| 9 | Game page scrolls | Desktop/tablet (≥851px): game page locked to the viewport, only history (and the trade panel internally) scrolls; check short windows (~700px tall) and the compact tier. Phones keep page scroll (stacked layout) |

### Steps

1. **Page fixes (8, 9).** CSS; browser test asserts no document scroll at desktop size.
2. **Saved seats (7).** `app.js` `saved` gets `at` timestamps and `finished`; pruning on load and on 404/401 from join/events. Browser test: a stale seat for a missing room disappears.
3. **Build cards (2, 6).** `buildBar()`: corner badge, have/missing marks, reason tooltip. Browser test checks marks.
4. **Stacked dev cards (3).** `hand()` groups `me.cards` by type. Keep `data-card` (id of the card to play).
5. **Setup flights (1).** Engine `gain` event gets `gains`; `playEffects()` handles `gain` like `roll`. Engine test for the event shape.
6. **Placement highlight (5).** `board()` draws `.placed` rings for live `build`/`robber` effects from other players (needs vertex/edge in the build event; add if missing).
7. **Tooltips (4).** Tooltip layer + contents above; engine `routePath(g,p)` returning edge ids for the longest route, exposed in `view()`. `RULES.md` unaffected unless the route traversal changes.
8. **Checks.** `npm test`, `THROTTLE=6 npm test`, review screenshots.

## Progress

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

### Round 2 log

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
