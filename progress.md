# Progress

Plan: [`docs/feedback-plan.md`](docs/feedback-plan.md). Read its "Working rules" first.

After every step: update this file, check usage (`mcp__ccd_session_mgmt__get_usage`), and if the 5-hour limit, weekly limit or context is over 85%, park and write the handoff prompt below.

## Status

| Step | State | Commit | Notes |
|---|---|---|---|
| 0. Plan written | done | 2816040 (with step 1) | Usage at start: 5-hour 24%, weekly 19%, context 11% |
| 1. Engine and rules | done | 2816040 | Usage after: 5-hour 32%, weekly 20%, context 22% |
| 2. Board and build bar | next | | |
| 3. Trade panel | pending | | Trade UI currently lives in the right sidebar (`offerHtml()` in `app.js`), functional but below the fold |
| 4. Dice | pending | | |
| 5. Resource animations | pending | | Roll events already carry `gains:[{p,hex,r,n}]`; steal events carry `p`, `from` |
| 6. Win screen and sound | pending | | |
| 7. Icons | pending | | Needs the owner's OK before downloading SVGs |
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

## Handoff prompt

(Empty until work is parked.)
