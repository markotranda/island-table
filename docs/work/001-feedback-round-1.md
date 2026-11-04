# 001: Feedback from the first game

**Status:** done (2026-11-03) · **Commits:** 2816040, e4605aa, 24a38f2, 3e524c8, d581ba4, bf3c105, 1e9d72f, 2bb69b2, 953c10e

Migrated on 2026-11-04 from `docs/feedback-plan.md` and `progress.md`, which no longer exist. Where the text below mentions `progress.md`, `feedback-plan.md` or `bots-plan.md`, read this file (or the earlier work items). Leftovers that were not done or not checked became open work items; see the [index](README.md).

## Plan

Agreed with the owner on 2026-11-03. Progress is tracked in [`progress.md`](../progress.md) at the repo root; read that first to see which step is next.

### Working rules (from the owner)

- Do the steps in order, **one commit per step**, each with all tests passing (`npm test`).
- After each step:
  1. Update `progress.md`: what was done, the commit hash, anything left over or surprising, and what the next step is.
  2. Check session usage (`mcp__ccd_session_mgmt__get_usage`): the 5-hour limit, the weekly limit and the context window.
  3. If **any of them is over 85%**, park the work: commit what is finished, write a self-contained handoff prompt into `progress.md` (section "Handoff prompt"), and stop.
- Write everything down. A new session with no context must be able to continue from `progress.md` + this file + `CLAUDE.md`.
- Follow `CLAUDE.md`: no dependencies, compact code style, keep `data-ui`/`data-command`/`data-vertex`/`data-edge`/`data-hex` hooks stable, update `RULES.md` for any digital convention.

### The feedback and what was decided

| # | Feedback | Decision |
|---|---|---|
| 1 | Numbers and dots not always visible; board small; number overlaps dots; resource icon overlaps tile edge | Bigger board, bigger tokens with dots on their own row, icon moved inside the hex |
| 2 | Robber with one possible victim still asks to pick | Steal automatically when exactly one victim |
| 3 | Rolling the dice isn't eye-catching | Dice themselves become the roll button: enlarged, pulsing, "Roll the dice" hint underneath; tumble animation for every player; total shown big |
| 4 | Non-active players can offer trades | Rulebook allows counteroffers, so: non-active players can't start offers, but can **counter** an active player's offer (prefilled, editable) |
| 5 | Trade is not eye-catching | Floating trade panel at the top-right of the board (Players and Supply tabs), opens itself on an incoming offer; bottom sheet on phones |
| 6 | Accepting completes the trade immediately | Accept marks the player as willing (withdrawable); the active player confirms with one of them |
| 7 | Animation when resources arrive | Producing tiles glow; icons fly tile → player card; steals fly victim → thief, face-down for third parties; only for new events, not on reload; respect `prefers-reduced-motion` |
| 8 | Building widget hard to find | Build bar in the hand row: road / settlement / city / dev card, cost shown, pieces left, greyed out when unaffordable; replaces the Building costs card |
| 9 | Extended map plays to 10 VP | Correct per the 5-6 rulebook ("reaching 10 VPs"); no change |
| 10 | Win screen hidden on the right | Full-screen banner: winner in their colour, confetti, scoreboard, "View board" and host "Rematch"; fanfare |
| 11 | Font Awesome | Vendor ~12 Font Awesome Free SVGs (CC BY 4.0) into `scripts/icons.mjs`, no CDN/font; credit in README and How to play; replace text arrows (→, ↔) |
| 12 | History should say who got what | Structured events with per-viewer private details (table below) |
| — | Sound | Yes: fanfare and dice rattle synthesized with Web Audio (no audio files), mute toggle in the header stored in `localStorage` |

#### History events (item 12)

Events become structured, e.g. `{turn, kind:'produce', actor, gains:[{player, hex, resource, n}]}`; the client renders them with resource icons. Private details live in a `secret` field with the list of players allowed to see it; `view()` strips it for everyone else. Old `{turn,text}` events from earlier saves still render as text. Raise the event cap from 160 to ~400.

| Event | Public | Private (involved players only) |
|---|---|---|
| Roll / production | "Mara rolled 8", per-player gains, "nobody produced", robber-blocked hex | — |
| Setup | settlement/road placed, starting resources | — |
| Robber / steal | moved robber to hex X, stole from Y | thief and victim: which resource |
| Discard on 7 | who discarded what (public in the physical game) | — |
| Dev card bought | bought a development card | buyer: which card |
| Cards played | Knight, Road Building, Monopoly (total and per-victim), Invention (which resources) | — |
| Trades | offer posted, counter, accept/decline, completed trade with contents, supply trade with rate | — |
| Building | road / settlement / city | — |
| Awards | Longest Route / Largest Army gained or lost | — |
| Turn flow | turn ended | — |

The same events drive the animations in step 5 (production event names the hexes; steal event names thief and victim).

### Steps

#### Step 1 — Engine and rules
- `lib/engine.mjs`: structured events (above) with a `secret` part filtered in `view()`; event cap ~400.
- Auto-steal when `g.victims.length===1` in the `robber` command (still log it).
- Trade flow:
  - `offer` only by the active player (`role===1`, `phase==='action'`), except a counter: a non-active player may post an offer with `counterTo:<offerId>` referencing an existing active-player offer; the counter is addressed to the active player.
  - `acceptOffer` by a non-active player on an active player's offer adds them to `o.accepted` (no resources move). They can withdraw (`declineOffer` or a toggle), and decline is recorded too.
  - New `confirmOffer {offerId, player}` by the active player completes the trade with someone in `o.accepted`; resources checked at that moment. For a counter, the active player's accept/confirm completes it directly.
  - Old saves: offers without `accepted` are treated as `[]`.
- `public/app.js` `retryContext()`: add `acceptOffer` (several players accept at once).
- Tests: `engine.test.mjs`, `matches.test.mjs` (uses real commands; update the trade path), `server.test.mjs` (private event details must not leak to other seats). Browser tests touching trades will need the new flow (can be finished in step 3 when the UI changes; keep them passing in this step with minimal client changes).
- `RULES.md`: auto-steal, counteroffer-only for non-active players, two-step trade confirmation, what the history reveals.

#### Step 2 — Board and build bar
- Board fills the space (sidebars narrower; trade and building costs leave the right column).
- Larger number tokens; pips on their own row below the number; resource icon smaller and inside the hex above the token.
- Build bar in the hand row: four buttons with the piece in the player's colour, cost underneath, pieces left, disabled when unaffordable; click highlights legal spots, Esc cancels. Remove the Building costs card. Keep existing `data-command` hooks or add new stable `data-ui` ones and update tests.

#### Step 3 — Trade panel
- Floating panel at the top-right of the board with Players and Supply tabs.
- Active player composes offers; others see incoming offers with Accept / Counter / Decline; active player sees who accepted and a Confirm button per player.
- Opens automatically when an offer arrives; bottom sheet at phone width.
- Update browser tests for the new flow.

#### Step 4 — Dice
- On your `preRoll`: dice enlarged, pulsing glow, clickable, "Roll the dice" underneath; remove the separate roll button.
- On every new roll event, all clients play a ~0.5 s tumble then settle on the result; show the total big near the dice.

#### Step 5 — Resource animations
- From new `produce` events: highlight producing hexes briefly; fly resource icons from hex to the player's card.
- From `steal` events: fly from victim card to thief card; face-down card for third parties.
- Track the last animated event so reloads/initial load don't replay; skip under `prefers-reduced-motion`.

#### Step 6 — Win screen and sound
- Full-screen overlay when `phase==='finished'`: winner name in colour, confetti (CSS/SVG), scoreboard with revealed cards, "View board" (dismiss), host "Rematch".
- Web Audio synthesized fanfare and dice rattle; mute toggle in the header (`localStorage`), sounds only after a user gesture.

#### Step 7 — Icons
- Ask the owner before downloading. Source: the official `@fortawesome/fontawesome-free` package SVGs (e.g. via `https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@<pinned-version>/svgs/solid/<name>.svg`).
- Add ~12 icons (arrows, close, check, swap/exchange, volume on/off, trophy, dice, etc.) to `scripts/icons.mjs`, regenerate with `node scripts/icons.mjs`.
- Replace text arrows in the UI; add CC BY 4.0 attribution to README and How to play.

#### Step 9 — Sound everywhere (added 2026-11-03 at the owner's request)
- Synthesized cues (Web Audio, no files) through a quiet master gain, triggered by new history entries via `playEffects()`: dice rattle + settle, a pop per resource card landing (pitched by resource), robber thud, steal swish (+ sour note for the victim), discard warning for those who must discard, wooden knocks for road/settlement/city, card flip for buying/discarding, flourish for playing a card, coins for Monopoly, sparkle for Invention, clink for trades, bell when an offer reaches you, tick when someone accepts your offer, brass sting for awards, whoosh for ending a turn, chime when your turn starts, fanfare for a win.
- Mute toggle unchanged. Browser tests check routing through `window.__sounds`.

#### Step 8 — Checks
- Full `npm test`; `THROTTLE=6 npm test` for timing flakes.
- `node scripts/review-screens.mjs <dir>` (add screens for trade panel, build bar, dice, win overlay if missing) and send screenshots to the owner.
- Update `CLAUDE.md` if commands, hooks or architecture notes changed; add a section to `docs/project-log.md`.

## Progress

Plan: [`docs/feedback-plan.md`](docs/feedback-plan.md). Read its "Working rules" first.

After every step: update this file, check usage (`mcp__ccd_session_mgmt__get_usage`), and if the 5-hour limit, weekly limit or context is over 85%, park and write the handoff prompt below.

### Status

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

### Log

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

### Handoff prompt

(Empty until work is parked.)
