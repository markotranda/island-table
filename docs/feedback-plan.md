# Plan: feedback from the first game

Agreed with the owner on 2026-11-03. Progress is tracked in [`progress.md`](../progress.md) at the repo root; read that first to see which step is next.

## Working rules (from the owner)

- Do the steps in order, **one commit per step**, each with all tests passing (`npm test`).
- After each step:
  1. Update `progress.md`: what was done, the commit hash, anything left over or surprising, and what the next step is.
  2. Check session usage (`mcp__ccd_session_mgmt__get_usage`): the 5-hour limit, the weekly limit and the context window.
  3. If **any of them is over 85%**, park the work: commit what is finished, write a self-contained handoff prompt into `progress.md` (section "Handoff prompt"), and stop.
- Write everything down. A new session with no context must be able to continue from `progress.md` + this file + `CLAUDE.md`.
- Follow `CLAUDE.md`: no dependencies, compact code style, keep `data-ui`/`data-command`/`data-vertex`/`data-edge`/`data-hex` hooks stable, update `RULES.md` for any digital convention.

## The feedback and what was decided

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

### History events (item 12)

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

## Steps

### Step 1 — Engine and rules
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

### Step 2 — Board and build bar
- Board fills the space (sidebars narrower; trade and building costs leave the right column).
- Larger number tokens; pips on their own row below the number; resource icon smaller and inside the hex above the token.
- Build bar in the hand row: four buttons with the piece in the player's colour, cost underneath, pieces left, disabled when unaffordable; click highlights legal spots, Esc cancels. Remove the Building costs card. Keep existing `data-command` hooks or add new stable `data-ui` ones and update tests.

### Step 3 — Trade panel
- Floating panel at the top-right of the board with Players and Supply tabs.
- Active player composes offers; others see incoming offers with Accept / Counter / Decline; active player sees who accepted and a Confirm button per player.
- Opens automatically when an offer arrives; bottom sheet at phone width.
- Update browser tests for the new flow.

### Step 4 — Dice
- On your `preRoll`: dice enlarged, pulsing glow, clickable, "Roll the dice" underneath; remove the separate roll button.
- On every new roll event, all clients play a ~0.5 s tumble then settle on the result; show the total big near the dice.

### Step 5 — Resource animations
- From new `produce` events: highlight producing hexes briefly; fly resource icons from hex to the player's card.
- From `steal` events: fly from victim card to thief card; face-down card for third parties.
- Track the last animated event so reloads/initial load don't replay; skip under `prefers-reduced-motion`.

### Step 6 — Win screen and sound
- Full-screen overlay when `phase==='finished'`: winner name in colour, confetti (CSS/SVG), scoreboard with revealed cards, "View board" (dismiss), host "Rematch".
- Web Audio synthesized fanfare and dice rattle; mute toggle in the header (`localStorage`), sounds only after a user gesture.

### Step 7 — Icons
- Ask the owner before downloading. Source: the official `@fortawesome/fontawesome-free` package SVGs (e.g. via `https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@<pinned-version>/svgs/solid/<name>.svg`).
- Add ~12 icons (arrows, close, check, swap/exchange, volume on/off, trophy, dice, etc.) to `scripts/icons.mjs`, regenerate with `node scripts/icons.mjs`.
- Replace text arrows in the UI; add CC BY 4.0 attribution to README and How to play.

### Step 9 — Sound everywhere (added 2026-11-03 at the owner's request)
- Synthesized cues (Web Audio, no files) through a quiet master gain, triggered by new history entries via `playEffects()`: dice rattle + settle, a pop per resource card landing (pitched by resource), robber thud, steal swish (+ sour note for the victim), discard warning for those who must discard, wooden knocks for road/settlement/city, card flip for buying/discarding, flourish for playing a card, coins for Monopoly, sparkle for Invention, clink for trades, bell when an offer reaches you, tick when someone accepts your offer, brass sting for awards, whoosh for ending a turn, chime when your turn starts, fanfare for a win.
- Mute toggle unchanged. Browser tests check routing through `window.__sounds`.

### Step 8 — Checks
- Full `npm test`; `THROTTLE=6 npm test` for timing flakes.
- `node scripts/review-screens.mjs <dir>` (add screens for trade panel, build bar, dice, win overlay if missing) and send screenshots to the owner.
- Update `CLAUDE.md` if commands, hooks or architecture notes changed; add a section to `docs/project-log.md`.

---

# Round 2: feedback from the second game

Agreed with the owner on 2026-11-03. Same working rules as round 1 (one commit per step, tests passing, `progress.md` updated, usage checked, park above 85%). Progress is in `progress.md` under "Round 2".

## The feedback and what was decided

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

## Steps

1. **Page fixes (8, 9).** CSS; browser test asserts no document scroll at desktop size.
2. **Saved seats (7).** `app.js` `saved` gets `at` timestamps and `finished`; pruning on load and on 404/401 from join/events. Browser test: a stale seat for a missing room disappears.
3. **Build cards (2, 6).** `buildBar()`: corner badge, have/missing marks, reason tooltip. Browser test checks marks.
4. **Stacked dev cards (3).** `hand()` groups `me.cards` by type. Keep `data-card` (id of the card to play).
5. **Setup flights (1).** Engine `gain` event gets `gains`; `playEffects()` handles `gain` like `roll`. Engine test for the event shape.
6. **Placement highlight (5).** `board()` draws `.placed` rings for live `build`/`robber` effects from other players (needs vertex/edge in the build event; add if missing).
7. **Tooltips (4).** Tooltip layer + contents above; engine `routePath(g,p)` returning edge ids for the longest route, exposed in `view()`. `RULES.md` unaffected unless the route traversal changes.
8. **Checks.** `npm test`, `THROTTLE=6 npm test`, review screenshots.

---

# Round 3: feedback from the third game

Agreed with the owner on 2026-11-03. Same working rules as round 1. Progress is in `progress.md` under "Round 3".

## The feedback and what was decided

| # | Feedback | Decision |
|---|---|---|
| 1 | Settings are fixed when the room is created; want to change them after inviting, and more options (points to win) | The create form only asks for a name. The lobby shows the settings; the host changes them with a `settings` command (map, island setup, points to win 5–20, discard limit 7–12, friendly robber). Others see them read-only. A change un-readies everyone except the host. Rematch keeps them. House rules go in `RULES.md` |
| 2 | History scroll bar breaks with long text | Reproduce in the browser and fix (suspects: the notepad's rotation, long unbreakable lines) |
| 3 | Trade panel blinks whenever someone interacts | Its entry animation replays on every redraw; play it only when the panel opens (start time kept like other effects) |
| 4 | Warning when holding more than the discard limit | Your hand gets a red edge and a "!" note "Over 7: a 7 makes you discard n"; tooltip explains |
| 5 | Discards go unnoticed | Full-screen discard window (like the win screen) with the picker, for players who owe cards; others see who is still discarding |
| 6 | Steal shows other players' cards in a tooltip | Owner: it named resource types of others. Reproduce; likely `retip()` instantly showing the tip of whatever history line slides under the pointer after the steal panel disappears |
| 7 | Players should roll for the starting player themselves, all at once | New `order` phase after start: every player taps their dice (`firstRoll`), in any order; ties reroll among the tied; then setup begins |

## Steps

1. **Lobby settings (1).**
2. **Starting roll (7).**
3. **Discard warning and window (4, 5).**
4. **Client fixes (2, 3, 6).**
5. **Checks.**
