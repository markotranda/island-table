# 010: Bigger map, fixed player sidebar, a new home for the supply

**Status:** done · **Commits:** 9763257, 14280b4, 8822e5c, e648791, 0ca8090, and the docs commit

## Feedback
2026-11-04, owner:
1. "The map can sometimes still look a little small. I was thinking we can move the banner on the top side (the one where we see the name of the game). Just keep name on the left, and options (sound, exit, etc...) to the right. While keeping middle clean, then we can expand the map even further."
2. "We played a game with 6 players. That means that the left sidebar needs to be scrolled to see supply. I want the left sidebar to be fixed (no movement). Keep only player cards there. Find a new home for supply info."

## Current state
Measured on a staged 6-player extended game (active player holding both awards, 5 kinds of development card):

| Window | Sidebar client/scroll height | Cards | Board area | Hand |
|---|---|---|---|---|
| 1920×1080 | 1004 / 1009 | 188, then 89 ×5 | 1340×839 | 165 |
| 1440×900 | 824 / 1001 | 188, then 89 ×5 | 918×659 | 165 |
| 1366×768 | 692 / 1001 | same | 844×527 | 165 |
| 1280×720 | 644 / 1001 | same | 758×479 | 165 |
| 1100×700 | 624 / 1001 | same | 578×471 | 153 |

- `header()` (`public/app.js:123`) draws the 76px `.topbar`, also on home and lobby. `.game-layout` is `calc(100dvh - 76px)` above 850px (`public/style.css:3`), and `html:has(.game-layout){overflow:hidden}` applies at 546px high and up (`public/style.css:338`).
- The board's viewBox is about 692×724, so it is **height limited** on normal windows: every pixel of banner goes straight to the map.
- `sidebar()` (`public/app.js:186`): label, player cards, supply stacks, unclaimed awards, score note. The active card grows by the turn badge and by award tiles, so cards also **jump** when the turn passes. Names may wrap (`overflow-wrap:anywhere`, 24 characters allowed).
- **Separate bug found:** `.hand-row` does not wrap above 850px (`public/style.css:257`), and hand cards + dev cards + build bar need 800–990px where 710px is free at 1280 wide. Two or more kinds of dev card push the Build buttons under the story log. Between 1081 and about 1150 wide it overflows even with no dev cards.

## Open questions
- (none)

## Decisions
| # | Feedback | Decision | Why |
|---|---|---|---|
| 1 | Banner | Owner: no strip during a game. Name above the player cards, options above the right column, map column reaches the top of the window. | Largest gain: 479→555px at 1280×720 (+16%), 839→915 at 1920×1080 (+9%). |
| 1a | Options | Above 850px the options are icons only (dot, invite, sound, ?, home). When not connected, the dot goes red and the status text appears on its own line under the icons. The dot has a tip. | They must fit in 220–248px; "Reconnecting…" must stay noticeable and must not spill over the board. |
| 1b | Other screens | Home, lobby and widths ≤850px keep today's bar. | They have no map to enlarge, or their columns stack, so there are no corners to use. |
| 1c | Name in its corner | Two lines, "settlers of / questionable ethics": 17px in the wide columns, 14px in the narrow one. No "Private edition" eyebrow during a game. | It has to fit 160–200px. |
| 2 | Sidebar | Above 850px: player cards only, `overflow:hidden`, every card the same fixed height whoever's turn it is. "Around the table" label and score note go. | Owner: "fixed (no movement)", "only player cards". Equal height also stops the jump on each turn. |
| 2a | Names, turn badge, takeover | Names are one line with an ellipsis; the tip is always the full name, escaped, followed by the bot or stand-in explanation when there is one. A second line beside the avatar, under name and points: the turn badge or `[data-takeover]` ("Away · use bot", full text in its tip). Takeover wins if an away player is also active: the stripe still shows the turn. | Names allow 24 characters; without this equal height fails. |
| 2b | Awards on the card | Gold highlight on the matching stat: knights for Largest Army, route for Longest Route. No printed `+2`: the tip names the award, its 2 points and the count. | Implementation: a printed +2 spilled out of the 230px cards as well once a player held dev cards, not only the narrow ones. The score already includes the points. |
| 2c | Score note | Moves to the tip on your own score. | Sidebar holds cards only; the fact is still reachable (README and How to play have it too). |
| 2d | Short windows | Cards 89px normally, 74px below 650px high. `.game-layout` min-height becomes 575px and the rule at `style.css:338` moves to the same 575px, so a shorter window scrolls the page and never clips. Card budget: padding 9/11px, points 20px, takeover no top margin. | 6×74 + gaps + corner = 536px; the wrapped hand needs 270 + 300 of board = 570px; the existing 1000×600 no-scroll test stays valid. |
| 3 | Supply | Owner: a slim row in the right column under the turn card: 5 resources + dev deck, with unclaimed awards as small emblems in its label line. Shown in every phase except `finished`. | Always visible, covers nothing; the log gives up the space. |
| 4 | Hand overlap (not in the feedback) | Owner: fix here. Dev cards overlap when space is tight, always showing at least 16px of each. Small card tier up to 1400 wide; narrow columns up to 1250 (existing breakpoint); below 1150 wide the Build bar is forced onto its own row (`flex:0 0 100%`) while dev cards stay beside the hand. Dev cards have no gap above 850px. Accepted: on touch at 1100–1250 wide a 16px strip does not show which card it is; a long press shows the tip. | Build must never be hidden, and slivers would be unusable. |

## Plan
**Client only.** No engine, server, bot or `view()` change; nothing about rules, so `RULES.md` stays as is.

### Client
- `controls()`: `supplyRow()` after the turn card when `phase!=='finished'`: `<section class="supply-row" data-ui="supply">` with a label line (`THE SUPPLY` + unclaimed award emblems `[data-award="route|army"]`) and chips `[data-supply="wood|…|deck"]` carrying the existing tips.
- `sidebar()`: only `.player` cards. A grid: avatar spans two rows; `.player-name` and `.points` on row 1; `.player-sub` (turn badge or `[data-takeover]`) on row 2 across both columns. Knights and route stats get `.award-held` and `data-award`. Tip: "Largest Army, +2 points. N knights played" so it still ends in "knights played".
- `header(over)`: `game()` calls `header(true)`, which adds class `over`. Labels wrapped in `.btn-label`, a `.btn-icon` "?" for help, `aria-label`s on all. The pill gets class `offline` when not connected, set at render and at the two stream lines (`public/app.js:53,56`).
- `devStacks()`: each stack in `.dev-slot`.
- CSS, min-width 851:
  - column widths as variables `--col-l`/`--col-r` on `:root` per breakpoint (230/292; 260/320 at 1500+; 180/250 at ≤1250) so columns, brand and options cannot drift apart;
  - `.topbar.over` absolute, transparent, `z-index:5` (below `.discard-screen` 25, `.victory` 30, and the modal), `pointer-events:none` with children back on; `.topbar.over+.game-layout{height:100dvh;min-height:575px}`;
  - both side columns get `margin-top`, the right one big enough for the offline line too, so nothing scrolls under the corners and the sticky turn card stays clear;
  - `.sidebar{overflow:hidden}`;
  - `.hand-cards,.build-bar{flex:none}`, `.dev-cards{flex:1 1 0;min-width:0;gap:0}`, `.dev-slot{flex:0 1 <card width>;min-width:16px}`, `:last-child` not shrinking, `:hover` raised;
- Remove what becomes unused: `.supply`, `.stack`, `.supply-label`, `.supply-awards`, `awardTile`, `.award-tile`, `.mat-awards`, `.badge.award`, the comment at `public/app.js:20`, `.sidebar>.section-label`/`.bank-summary`/`.fine` rules.

### Tests (`test/browser.test.mjs`)
A 6-seat fixture: host + 5 bots on the extended map, staged straight from `order` to `action` with `g.active` the host and `role=1`, so bots stay idle during assertions. Host's name 24 characters. For away cases the fixture sets `bot:false` on a seat (takeover button) or `auto:true` (stood-in name). Then:
- at 1920×1080, 1280×720, 1100×700 and 1366×650: `.sidebar` has `scrollHeight<=clientHeight`, all 6 cards inside the window with equal height, every `.stat` inside its card, also with both awards held and with a stood-in/away second line; at 1000×545 and 1000×500 the page scrolls and all cards can be reached;
- card height does not change when the turn passes; the `PLAYER 1`/`PLAYER 2` badge shows in paired turns; an away player who is also active shows the takeover button;
- `.sidebar` holds no `[data-ui="supply"]`; `.control-sidebar` does, with 6 chips showing staged counts; unclaimed awards appear there and go when held; present in `order`, `setup*`, `preRoll`, `discard`, absent in `finished`;
- `.board-wrap` starts at the top of the window; brand and options stay inside their columns, also with the `offline` class set, which must not overlap `.turn-card`;
- with 5 kinds of dev card at 1280×720, 1200×700, 1100×700, 1000×600 and 1000×545: `.build-bar` ends inside `.hand`, does not intersect `.control-sidebar`, and the last dev card ends left of it when they share a row; each dev card shows at least 16px;
- phone width: no horizontal scroll, supply reachable, every `.stat` inside its card;
- existing mute, invite, home and takeover tests pass through the new markup.

### Steps (one commit each, `npm test` passing)
1. **Supply in the right column.** `supplyRow()`, CSS, tests. Sidebar loses supply, unclaimed awards, label; score note becomes the tip on your own score.
2. **Banner into the corners.** `header(true)`, column variables, icon-only options, `offline` pill, full-height layout, narrow columns moved to ≤1250, the 575px threshold, tests.
3. **Fixed player cards.** Grid card, ellipsis names, `.player-sub`, `.award-held`, equal height, tight tier below 650px, `overflow:hidden`, removal of `awardTile`, tests. (After the banner so the height budget is tuned once.)
4. **Hand never hides Build.** `.dev-slot`, flex rules, small card tier to 1400, Build row below 1150, tests. (Columns already moved in step 2.)
5. **Docs and review screens.** `scripts/review-screens.mjs` hover target (`.topbar` is now `pointer-events:none`) and a 6-player shot; `CLAUDE.md` hooks (`data-ui="supply"`, `data-supply`, `data-award`, `.award-held`, `offline`); refresh `docs/screenshots/` with `FORMAT=jpeg`; `THROTTLE=6 npm test`; project log; close.

## Review
Round 1 (REVISE), all accepted and folded into the plan above: name and second-line fit (2a); `+2` in narrow column (2b); dev-card slivers, flex rules and breakpoints (4); wrap tier clipping Build at 1000×600 (`flex:1 1 0`, test); conflict with `style.css:338` and no card-height target (2d); name in its corner and column variables (1c); offline pill fit and dot colour (1a); z-index; fixture and coverage gaps; banner before cards, tip assigned to step 1; award tip keeps the count (2b); removal list; docs list.

Round 2 (REVISE, "no need for a full further round"), all accepted: `flex:1 1 0` would stop Build wrapping, so force the break below 1150; 540px too small for a wrapped hand, so 575px; card size budget written down; dev gap 0 and overlap assertion; 16px strip accepted knowingly; offline line clear of the turn card; away fixtures; `+2` hidden on phones; full-name tip combined with the bot tip; 1250 breakpoint belongs to step 2.

## Progress
| Step | State | Commit | Notes |
|---|---|---|---|
| 1 Supply | done | 9763257 | Row is about 96px with its margin, more than the 50px estimated; the log absorbs it. |
| 2 Banner | done | 14280b4 | 479→555px at 1280×720, 839→915px at 1920×1080, as predicted. Committed with one failing test by mistake: see the flake note. |
| 3 Cards | done | 8822e5c, e648791 | The screenshot caught what the test missed: gold stats spilled out once a player held dev cards. Test now deals them; the printed +2 went (2b). |
| 4 Hand | done | 0ca8090 | Hand padding 12px up to 1400 wide, or 1251 wide had no room for five kinds. Build wraps only when the cards really do not fit (1 kind fits from 1092 wide, 2+ kinds from 1150, none from 1040), because a forced row cost the map 105px at 1100 wide. Turn label cleared of its seal and narrow fans slimmed, since the narrow columns now reach 1250. |
| 5 Docs | done | see git log | Review script has a six-player shot; README screenshots refreshed. |

**Flake:** `browser: invite, lobby, live setup…` failed once in a full run ("the starting roll result was not held on every screen", 0 of 3) and then passed 6 of 6 alone and in every later full run. Its polling can miss the 3 s hold under load. Unrelated to layout, not fixed here: item 011.

## Not verified
- A real phone or touch screen. On touch at 1100–1400 wide, an overlapped dev card shows only its edge; a long press gives the tip.
- The owner's real six-person game, and how the icon-only options feel. "How to play" and "Invite friends" lost their words on desktop.

## Next step / Handoff prompt
Done. Leftover: item 011.
