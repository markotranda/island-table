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
| 6. Win screen and sound | done | (next commit) | |
| 7. Icons | next (ask owner first) | | Needs the owner's OK before downloading SVGs |
| 8. Checks | pending | | |

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

## Handoff prompt

(Empty until work is parked.)
