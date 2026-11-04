# 003: Feedback from the third game

**Status:** done (2026-11-03) · **Commits:** see `git log` for 2026-11-03

Migrated on 2026-11-04 from `docs/feedback-plan.md` ("Round 3") and `progress.md`, which no longer exist. Where the text below mentions `progress.md`, `feedback-plan.md` or `bots-plan.md`, read this file (or the earlier work items). Leftovers that were not done or not checked became open work items; see the [index](README.md).

## Plan

Agreed with the owner on 2026-11-03. Same working rules as round 1. Progress is in `progress.md` under "Round 3".

### The feedback and what was decided

| # | Feedback | Decision |
|---|---|---|
| 1 | Settings are fixed when the room is created; want to change them after inviting, and more options (points to win) | The create form only asks for a name. The lobby shows the settings; the host changes them with a `settings` command (map, island setup, points to win 5–20, discard limit 7–12, friendly robber). Others see them read-only. A change un-readies everyone except the host. Rematch keeps them. House rules go in `RULES.md` |
| 2 | History scroll bar breaks with long text | Reproduce in the browser and fix (suspects: the notepad's rotation, long unbreakable lines) |
| 3 | Trade panel blinks whenever someone interacts | Its entry animation replays on every redraw; play it only when the panel opens (start time kept like other effects) |
| 4 | Warning when holding more than the discard limit | Your hand gets a red edge and a "!" note "Over 7: a 7 makes you discard n"; tooltip explains |
| 5 | Discards go unnoticed | Full-screen discard window (like the win screen) with the picker, for players who owe cards; others see who is still discarding |
| 6 | Steal shows other players' cards in a tooltip | Owner: it named resource types of others. Reproduce; likely `retip()` instantly showing the tip of whatever history line slides under the pointer after the steal panel disappears |
| 7 | Players should roll for the starting player themselves, all at once | New `order` phase after start: every player taps their dice (`firstRoll`), in any order; ties reroll among the tied; then setup begins |

### Steps

1. **Lobby settings (1).**
2. **Starting roll (7).**
3. **Discard warning and window (4, 5).**
4. **Client fixes (2, 3, 6).**
5. **Checks.**

## Progress

Plan: "Round 3" in [`docs/feedback-plan.md`](docs/feedback-plan.md).

| Step | State | Commit | Notes |
|---|---|---|---|
| 0. Plan written | done | with step 1 | |
| 1. Lobby settings | done | see log | |
| 2. Starting roll | done | see log | |
| 3. Discard warning and window | done | see log | |
| 4. Client fixes | done | see log | |
| 5. Checks | done | see log | `npm test` and `THROTTLE=6 npm test` 37/37 |

### Round 3 log

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
