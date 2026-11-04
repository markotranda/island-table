# 007: Keep the starting roll on screen for a moment

**Status:** done · **Commits:** …

## Feedback
2026-11-04, owner:
1. "Initial roll just disappears after everyone rolls, meaning I don't see who rolled what. I think it should stick for 3 seconds."

## Current state
- `game()` in `public/app.js` draws `orderHtml()` only while `state.phase==='order'`. The last roll moves the engine straight into setup (`firstRoll()` → `place()`, `lib/engine.mjs:89`), so the card vanishes in the same render that would show the last die, which is never seen tumbling. Only the "X goes first" toast and the history remain.
- On a tie (`lib/engine.mjs:88`) `o.done` is emptied, so the tied rows switch to "rolls again…" / the Roll button at once and their totals are gone too.
- `g.order` stays in the state after setup and goes through `view()` unchanged; `'order'` events carry `{p,dice,round}`, `'tie'` carries `{players,total,round}`, `'first'` carries `{p,total}`.

## Open questions
- (none)

## Decisions
| # | Feedback | Decision | Why |
|---|---|---|---|
| 1 | Card disappears after the last roll | After the winner is decided the card stays 3 s, read-only, titled "<name> goes first!", winner row highlighted, then fades. Client only. | The engine already keeps everything needed; holding phases on the server would delay setup for everyone and bots. |
| 1a | Ties | Owner: hold ties 3 s too. The card shows everyone's dice of that round and "Tie at N!", tied rows highlighted; the Roll buttons come after. | Same complaint: tied totals vanished instantly. |
| — | Clicks during the hold | The held card after the winner does not take pointer events, so the first player can place right away. | Holding must not block play. |
| — | Reload during the hold | No hold (effects start empty after a load). | Hold is a live effect like the dice tumble. |
| — | Which dice to show | From the `'order'` events (latest per player with round ≤ the held round), falling back to `o.dice`. | During a tie hold a bot may already have rolled the next round, overwriting `o.dice`. |

## Plan
Client (`public/app.js`):
- `heldOrder()`: the newest `'tie'` (phase still `order`) or `'first'` (with `total`) effect younger than 3000 ms, else null.
- `game()` shows `orderHtml(held)` when the phase is `order` or a hold is active.
- `orderHtml(held)`: when held, rows are read-only with the dice of the held round, `leading` on rows whose total equals the held total, heading "Tie at N!" / "<name> goes first!", class `held` (`data-ui="order"` unchanged).
- `render()` sets one timer to redraw when the hold ends (`render(true)`).
- `data-held="tie|first"` on `[data-ui="order"]` during a hold; `leading` marks only the held round's contenders (the tied players, or the winner).
- `diceHtml()` still renders under the held card once setup or `preRoll` has begun, so the first player's Roll button is never hidden.
- CSS: `.order-card.held` fades out at the end of the 3 s (`--t` offset like other effects); `.order-card.done` (after the winner) has `pointer-events:none`.

Tests: `test/browser.test.mjs` — `rollForStart()` returns the pages that saw `data-held="first"` with no Roll buttons (and stops waiting once all have); the main game test asserts it. A new test stages seats 0 and 1 at double six, so seat 2's roll always ties at 12, and checks the tie hold (all three rolls visible, no Roll buttons) and that the Roll buttons come back afterwards.

Steps: 1. client + test + docs (one commit).

## Review
Round 1 (REVISE):
1. blocking: the held card would replace `diceHtml()` in fixed setup (`preRoll` straight away) → rejected, already handled: `game()` renders both outside phase `order`.
2. `leading` could light a player knocked out in an earlier round whose total matches → accepted (contenders only).
3. Ties can be tested with `stage()` → accepted, new browser test.
4. Keep the last die's tumble in the held card → already so (same `order` effect logic).
5. One cleared timer → already `render.hold`.
6. Expose the hold as a data attribute → accepted, `data-held`, in CLAUDE.md.
7. `rollForStart()` would wait out the 3 s in every test → accepted, it returns once every page saw the hold.
8. No leak; nothing to do.
No second round: the only blocking finding was already handled, the rest are applied.

## Progress
| Step | State | Commit | Notes |
|---|---|---|---|
| 1 | done | (this commit) | `npm test` and `THROTTLE=6 npm test` pass (48) |

## Not verified
- The look of the fade and of the held card on a phone (no screenshot taken).

## Next step / Handoff prompt
Nothing left; done.
