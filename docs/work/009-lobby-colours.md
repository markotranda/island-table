# 009: Choosing a colour in the lobby

**Status:** done · **Commits:** 6b1cae8, 1642ac7, d2fb2fd, docs commit after them

## Feedback
2026-11-04, owner:
1. "It would be useful if we could change color in lobby."

Answers to questions, same day: a colour held by a person can be asked for (they accept or decline), and a colour held by a bot is taken straight away with the bot getting yours; the picker is a row of swatches on your own seat card.

## Current state
- Colour is the seat: `addPlayer` uses `COLORS[g.players.length]` (`lib/engine.mjs:23`), `unseat` repacks `COLORS[j]` (`lib/engine.mjs:29`), so removing someone recolours everyone after them. `rematch` re-adds players in order (`lib/engine.mjs:145`).
- Six colours (`lib/board.mjs:2`). A 2-4 player table only ever saw the first four.
- Fixed setup: starting spots follow the seat, except at five players, where `place()` shuffles seats and overwrites `pl.color` with `COLORS[seats[i]]` (`lib/engine.mjs:99-100`), which would throw away a chosen colour. The unused colour's settlements are neutral and always drawn grey (`public/app.js:165`), so they don't need a colour. Rulebook (5-6 p. 2) draws colours at random because physical colours have printed spots.
- `view()` passes `color` per player (`lib/engine.mjs:228`) and clones other game fields. The client has no palette. Nothing else depends on the colour's index: tests at `test/engine.test.mjs:170,198` assert the repacking, which goes away.
- Lobby seat card: `lobby()` (`public/app.js:143-145`).

## Open questions
- (none)

## Decisions
| # | Feedback | Decision | Why |
|---|---|---|---|
| 1 | Who chooses | Each person their own colour, lobby only. Colours are always unique | A shared colour makes the board unreadable |
| 2 | Colour taken by a bot | Tap it: you get it, the bot gets your old colour, at once | Owner. Bots have no preference |
| 3 | Colour taken by a person | Tap it to ask; they accept (colours swap) or decline. The asker sees a line on their own card, the person asked sees Accept/Decline on theirs, others see nothing; tap the swatch again to withdraw | Owner |
| 4 | Picker | Six round swatches on a full-width row of your own seat card; taken ones dimmed but tappable | Owner |
| 5 | Palette | The existing six, with names (Blue, Red, Orange, White, Purple, Green) | Already checked against the board at six players |
| 6 | Requests at once | One outstanding request per asker (a new one replaces it). Someone can have several incoming. Requests only exist between two people | Keeps the flow small |
| 7 | Stale requests | Any colour change by either party, either leaving the table, or starting the game drops the request | Otherwise accepting would hand over a colour nobody asked for |
| 8 | Ready | Changing colour doesn't un-ready anyone, including a ready person who accepts or a ready bot | Like Visibility: colour changes no rule anyone agreed to |
| 9 | Starting with a request open | Allowed; the host's start drops it | A pending request is not a reason to hold up the table: whoever cares isn't ready yet |
| 10 | New seat | Takes the first free colour, in palette order. Someone leaving no longer recolours anyone | People keep what they picked |
| 11 | Rematch | Everyone keeps their colour | Same table, same pieces |
| 12 | Fixed setup | Starting spots keep following seats, not colours. At five players, seats are still shuffled for spots, but chosen colours stay; `RULES.md` convention updated | Six colours but only four base spots, so spots cannot follow colours; the random draw in the rulebook exists to assign spots, which the shuffle still does |
| 13 | Old saves | Lobbies load with `swaps` defaulted; running games are untouched | Additive |

Not doing: more than six colours, the host choosing for bots or others, a sound on an incoming request (the request is visible on the card).

## Plan

### Engine (`lib/board.mjs`, `lib/engine.mjs`)
- `COLOR_NAMES` in `board.mjs`, same order as `COLORS`.
- `addPlayer(g,id,name,bot=false,color)`: `color??` first of `COLORS` no player holds. `unseat`: stops repacking, drops swaps naming the removed id. `rematch`: passes `pl.color`.
- `place()`: removes the `pl.color=COLORS[seats[i]]` line.
- `newGame` gains `swaps:[]`, `upgrade` `g.swaps??=[]`. `swaps` holds `{from:id,to:id}` with **player ids** (seats shift when someone leaves). `start` empties it.
- `color {color}` (lobby, any seat): `COLORS.includes`, not your own. Free: take it. Held by a bot: swap at once. Held by a person: replace your outstanding request with `{from:you,to:them}`. In the free and bot cases, helper `recolor` drops all swaps naming you (or both, on an accepted swap).
- `colorAnswer {from:id,accept}` (lobby; the asker's **id**, because a retried seat number could point at someone else after a kick): a request from `from` to you must exist, else "That request was withdrawn." Accept swaps colours and drops all swaps naming either; decline drops that one.
- `colorCancel` (lobby): drops your outstanding request, no error if none.
- `view()`: in the lobby adds `colors:[{hex,name}]`. `swaps` passes through the clone; the data isn't secret (ids are already public), the UI just shows it only to the two people involved.
- Bots: `decide()` is never asked in the lobby, nothing changes. `pending()` unaffected.

### Server
Nothing: `commands` route is generic, `auto` stripped already. Covered by a server test that `color` round-trips and shows in other seats' views.

### Client (`public/app.js`, `public/style.css`)
- `lobby()`: on your own seat card, `<div class="seat-colors" data-ui="colors">` with `<button data-color="<hex>" data-state="mine|free|bot|person|asked">` per `state.colors`; `mine` has `aria-pressed="true"` and sends nothing (not `disabled`, which would dim it); `data-tip`/`aria-label` with colour name and what tapping does ("Red: Ana's, tap to ask"). Row is `flex-basis:100%` with `flex-wrap:wrap` added to the own card, the request line likewise; buttons 28px, larger at `max-width:620px`, white swatch outlined, `mine` carries the check icon, taken dimmed.
- Requests on cards: an incoming request on your card: "Ana asks for your colour" with `[data-swap-accept="<id>"]` and `[data-swap-decline="<id>"]`; the asker gets an `asked` swatch and a line "Asked Ana for Red". Tapping an `asked` swatch sends `colorCancel`.
- `retryContext()`: `color`, `colorAnswer` in the lobby retry while your own colour is unchanged (friends act at the same moment); `colorCancel` always retries in the lobby, since it is a harmless no-op once answered, so no "try again" appears.
- Accepted: a retried `color` resolves the hex afresh, so a tap on free Red that loses to Carol becomes a request to Carol. It is visible and can be withdrawn. Rapid taps of the same command type are dropped by `command()`, as everywhere (Red then Green quickly keeps Red). Keyboard focus is lost on redraw, as for all lobby buttons.

### Tests
- `engine.test.mjs`: free pick; own and unknown colour rejected; bot swap; request/accept/decline/cancel; replacing a request; a third party can't answer; dropped on either party's colour change, kick and start; new seat takes the first free colour, also out of order (host picks Orange, joiner gets Blue); kicking or removing a bot recolours nobody (replaces the assertions at lines 170, 198); rematch keeps colours; five-player fixed keeps chosen colours and still has two neutral settlements, colours unique; `upgrade` default; not after the game starts; no ready change.
- `server.test.mjs`: `color` reaches other seats.
- `browser.test.mjs`: pick a free colour, seat card and other page update; ask a person, asker's line and target's buttons show, accept swaps; decline; withdraw by tapping the `asked` swatch; incoming request survives a reload; two pages tapping swatches at once both land; take from a bot; chosen colour shows on pieces in-game; phone-width layout with swatches (`noOverflow` plus swatches inside the card).
- `matches.test.mjs` needs no change.

### Steps (one commit each)
1. Engine: colours chosen and kept: `COLOR_NAMES`, `addPlayer` free colour, `unseat` stops repacking, rematch, five-player `place()`, `color` for free and bot colours (a person's colour rejected for now), `view().colors`. `RULES.md` lines 17, 24, 39 and the stale comment at `lib/engine.mjs:139`. Engine tests.
2. Engine: swap requests: `swaps`, `color` for people, `colorAnswer`, `colorCancel`, `upgrade`, start clears, `unseat` and colour changes drop swaps. Engine and server tests.
3. Client: swatches, request lines, `retryContext`, CSS. Browser tests, screenshots at desktop, ~860px and phone.
4. Docs: `CLAUDE.md` (commands, `data-color`/`data-swap-*`, `retryContext` list), README, How to play, `scripts/review-screens.mjs` lobby shot, project log, close item. `THROTTLE=6 npm test`.

### Verification
Tests that fail without the change; `THROTTLE=6 npm test` output kept in the scratchpad; lobby screenshots sent to the owner.

## Review
Round 1: no blocking findings, APPROVE. Accepted: asker id in `colorAnswer` (1), `colorCancel` retry without a toast (3), who sees requests made explicit (4), step boundaries (5), test changes (6), dropped the focus bullet (7), CSS and tap sizes (8), `mine` swatch sends nothing (9), docs list (11). Accepted as behaviour and written down: retried `color` re-resolves (2), dropped rapid taps (10).

## Progress
| Step | State | Commit | Notes |
|---|---|---|---|
| 1 | done | 6b1cae8 | Colours chosen and kept in the engine |
| 2 | done | 1642ac7 | Swap requests |
| 3 | done | d2fb2fd | Swatches. First layout wrapped the sixth swatch at 860px; swatches now shrink to stay on one row |
| 4 | done | see git log | Docs, review screenshot |

Gotcha: under `THROTTLE=6` the full suite once timed out in `browser: discards, player and bank trades…` waiting for `.road` count 8 (`test/browser.test.mjs:331`). It passed 3 of 3 alone on this branch and on the commit before this work, and the next full `THROTTLE=6` run passed 57 of 57, so it looks like load, not this change.

## Not verified
Tapping swatches on a real phone (checked at 375px in headless Edge only). Long player names on narrow seat cards still break mid-word at about 860px ("Tobia/s"), as they did before this work.

## Next step / Handoff prompt
Read `CLAUDE.md`, then this file. Finished; nothing left to do.
