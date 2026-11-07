# 017: A live update swallows a click in progress

**Status:** in progress · **Commits:** see `git log -- docs/work/017-press-during-update.md`

## Feedback
2026-11-07, owner:
1. "Pressing accept at the same time as another player sometimes doesn't work."

## Current state
- **Cause, reproduced:** every state update from the live stream goes through `accept()` to `render()`, which replaces the whole page with `app.innerHTML=` (`public/app.js:44`, `:381`). If that happens between mouse-down and mouse-up, the pressed button no longer exists, so the browser fires no click on it and `[data-accept]` never runs. No request, no toast. Another player's answer is exactly such an update, so answering at the same moment hits it. The new browser test fails this way: B presses Accept, C's accept arrives, B releases, and the server never hears from B.
- **Not the cause:** the server and the retries. `acceptOffer` is retried after a 409 (`retryContext`, `app.js:109`), and SQLite commits are serialized.
- **Not only Accept:** any button, and the board's `data-edge`/`data-vertex`/`data-hex`, on any screen. Bots make it more frequent, since their moves are updates too.
- **Tests knew:** two tests work around it. `test/browser.test.mjs:502` answers with a synthetic `.click()` because "a mouse click can miss when the other answer arrives", and `sixSeats()` (`:125`) re-adds a bot because "a live update can redraw the lobby between press and release and swallow a click".
- **Second cause of the same symptom:** `offerHtml` puts the "Accepted: …" line above the buttons, and it exists only once someone has answered. The first answer pushes Accept down a line, so a press aimed just before it lands can miss (`app.js:252`).
- **Touch:** in Chromium a touch click is hit-tested afresh and isn't swallowed by a redraw, but it comes after `pointerup`, possibly after a `setTimeout(0)`.

## Open questions
- (none)

## Decisions
| # | Feedback | Decision | Why |
|---|---|---|---|
| 1 | Accept is lost | While a press on a clickable control is down, `render()` waits; it draws as soon as the press ends, after the click has run. `state` itself updates at once | Keeps the pressed element alive, so the browser's click just works. The click then sends the newest revision too. Fixes every control at once, at the cause |
| 1a | — | Pressed means what the click handler acts on: `button:not(:disabled),[data-edge],[data-vertex],[data-hex]` | A finger resting on empty space must not hold the table back |
| 1b | — | A press holds drawing for at most 1.5 s, then draws anyway | A release the page never sees (pointer leaves the window) must not freeze the screen. A press that long isn't a click; a touch long-press shows a tooltip at 450 ms |
| 1c | — | Held renders merge: the delayed draw keeps form fields only if every held render asked to | A render without `preserve` means the phase changed, and that wins |
| 1d | — | A click on what the update made stale (the offer has gone) reaches the server and gets its normal refusal toast | Server-authoritative; the player learns what happened, which beats silence |
| 1e | — | The home screen never waits | `leave()` clears `state` and `session`; a click on the old table would throw inside `command()` with `busy` set and wedge the client |
| 1f | — | After a touch or pen `pointerup` the hold lasts until the click, at most 300 ms; after a mouse `pointerup` it is `setTimeout(0)`, since the click is already queued | The touch click can come after a zero timeout |
| 1g | — | `pollTables` skips its list redraw during a press | It replaces `[data-join]` outside `render()`; the next poll catches up |
| 1h | — | Only the primary button of an enabled control holds drawing | Other presses produce no click |
| 2 | Accept is lost | "Accepted: …" moves below the buttons and always keeps its line (`min-height:1lh`), on the offers people can answer | Other players' answers no longer move the Accept, Decline and Counter buttons at desktop width, also on an offer further down the panel. A long line wraps below the buttons |
| 3 | — | Not done: keyboard presses (Space held during an update); a person accepting two different offers within one request (`busy?.type===type` drops the second); a double-click whose second press spans an update now reaches the server (usually a refusal toast; `buyCard` could buy twice, `data-kick` sends a seat index). That last hazard already exists when the update lands before the second press. The current player's own "Trade with X" buttons sit before Cancel, so accepts move Cancel and a withdrawal can swap who a button trades with | None is this report. Noted in case they come up |
| 5 | — | Found while implementing: `command()` dropped a click of the same type as the command in flight, meant for double clicks. When the live stream shows the result before the HTTP response returns, a real second click (another bot, a second offer's Accept) was dropped silently. Now a repeat is dropped only while the revision is the one the first was sent with; otherwise it queues | The `sixSeats` retry loop hid it; without that loop, 2 of 15 throttled runs failed with the click reaching the button and no request sent. After: 24 of 24. Cost: a double click split by an update sends twice, as in decision 3 |
| 4 | — | A command queued behind one that sent the player home stops at `if(!state)return` | The same wedge as 1e by another route; one line |

## Plan
### Client (`public/app.js`, `public/style.css`)
Before the other pointer listeners (`:400`), capture phase: `holdDraws(ms)` restarts the timer in `pressing`, `drawHeld()` ends the hold and draws. `pointerdown` with `e.button===0` on `button:not(:disabled),[data-edge],[data-vertex],[data-hex]` holds 1500 ms; `pointerup` holds `mouse?0:300`; `pointercancel` holds 0; `click` ends the hold at once, so the click's own `render()` draws, and schedules the flush with `setTimeout`.

At the start of `render(preserve=false)`: `if(pressing!==null&&state){heldDraw=(heldDraw??true)&&preserve;return;}heldDraw=null;`. `noticeEvents()` and effects run inside `render`, so sounds and animations wait with it and are not lost.

`offerHtml`: answers below the actions; CSS `.offer-answers{min-height:1lh}`. `pollTables` writes only when `pressing===null`. Reword the comment at `:115`.

### Tests
- `test/browser.mjs`: `press(selector,{touch})` and `release(at)`.
- New test on a 3-seat table: B presses Accept, C accepts, B releases: A sees both accepted and B's screen draws C's answer. A release in the corner is no accept and still draws. C's answer leaves B's button row where it was. A press never let go draws after 1.5 s. A touch tap whose offer was cancelled meanwhile gets the refusal toast.
- Kick test: the kicked guest has Ready held down, goes home, releases, no errors.
- Remove the workarounds: `sixSeats` adds bots with a plain click, and the trade test's accept at `:503` is a real click.
- No test-only hooks in the page, so nothing has to survive `stage()`.

### Steps
1. **Hold redraws during a press** (`app.js`, driver, new test, comments). `npm test`.
2. **Drop only true double clicks** (decision 5). Evidence: the throttled `sixSeats` tests, which add five bots with plain clicks.
3. **Docs and close.** `CLAUDE.md` (driver `press`/`release`, redraws wait for a press; the note that a center click can land elsewhere stays), `docs/project-log.md`, this item, index. `THROTTLE=6 npm test` first, output in the scratchpad. No `RULES.md` change: no rule or convention moves.

### Verification
The new test fails without the change. `npm test`, `THROTTLE=6 npm test`.

## Review
Round 1 (fresh agent, reading only), verdict REVISE:
1. Blocking: `leave()` during a press leaves a clickable old table, a click throws in `command()` with `busy` set and wedges the client → accepted, decision 1e, kick test.
2. Blocking: on touch the click can come after a zero timeout → accepted, decision 1f. A trace here showed click 2 ms after `pointerup`, before the timer, while the reviewer measured the reverse on a bare page: the order is a race. The touch check passes with the wait removed, so it is a guard, not proof.
3. Blocking: the first answer moves Accept → accepted, decision 2, with an assertion that fails against the old markup (seen).
4. `pollTables` redraws outside `render()` → accepted, 1g.
5. A double-click can now send a stale second press → noted in decision 3; the hazard exists already.
6. The `sixSeats` retry hides regressions → accepted, removed.
7. Hold selector → accepted, 1h; `blur` dropped, the 1.5 s covers it.
8. Test details → accepted: no `console.log`, release at a corner. Rejected: a negative "screen doesn't change during the press" check, since the positive assertions already fail without the fix. A board press isn't tested separately: same selector and path.
9. Stale comment → accepted.
10. `toggleNotify` can clear a held `preserve=false` → harmless, no change.

Round 2, verdict REVISE, only finding 1 blocking:
1. Blocking: the touch step fails under `THROTTLE=6`, because B's accept can reach the server before A's cancel → accepted: A cancels through the app's handler, and B releases once A's page shows the offer gone.
2. Accepts move the current player's Cancel and "Trade with X" → wording narrowed, listed in decision 3 as not done; the phone panel is added to "Not verified".
3. A command queued behind a 401/404 wedges the client → accepted, decision 4.
4. Pen falls on the zero path → accepted, 1f.
5. Item text out of date → accepted.
Both earlier rejections were agreed with. The reviewer asked for no third round once the test is stable under repeated `THROTTLE=6` runs.

## Progress
| Step | State | Commit | Notes |
|---|---|---|---|
| 1 | done | `3df612b` | Hold, answers below the buttons, tests. Touch step stable 6 of 6 under `THROTTLE=6` |
| 2 | done | see `git log` | Decision 5 |
| 3 | | | |

## Not verified
- A real phone. Touch was driven by Chromium's emulation only, and its check is a guard (see Review). iOS and Android are unverified.
- The phone trade panel is `position:fixed;bottom:0`, so a wrapped answers line or a new offer can move buttons above it. The stability check runs at desktop width with one answer.
- Board controls (`data-edge`, `data-vertex`, `data-hex`) spanning an update: same code path as buttons, no test of their own.

## Next step / Handoff prompt
Read `CLAUDE.md`, then this file. Steps 1 and 2 are committed; step 3 (docs, `THROTTLE=6 npm test`, close) is next.
