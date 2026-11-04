# 013: Two item-010 browser tests are flaky

**Status:** planned · **Commits:** —

## Feedback
None: found during item 012 (2026-11-04).

## Current state
- `browser: during a game the name and options sit in the corners and the map runs to the top of the window` fails about half the time on unchanged main (2 of 4 runs): `the live stream clears it`, actual `'Connecting…'` (test/browser.test.mjs, the offline/connection check). The assertion reads the connection state once instead of waiting for the stream to reconnect.
- `browser: six player cards always fit without scrolling and never change size` timed out under `THROTTLE=6` in `sixSeats()`, waiting for `document.querySelectorAll('[data-bot]').length===5` (default `waitFor` timeout too short for five bot seats under throttling).

## Open questions
- (none)

## Plan
1. Replace the one-shot connection read with a `waitFor` on the cleared state; give `sixSeats()`'s bot wait a longer timeout (or wait per added bot). Verify by running each test 10× normally and 3× with `THROTTLE=6`.

## Next step / Handoff prompt
Read CLAUDE.md and this file; do step 1 and commit when both tests pass repeatedly.
