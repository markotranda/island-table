# 011: Starting-roll test can miss the 3 s hold under load

**Status:** planned · **Commits:** —

## Feedback
None: found during item 010 (2026-11-04).

## Current state
`browser: invite, lobby, live setup, turns, reload and seat recovery` failed once in a full `npm test`: "the starting roll result was not held on every screen" (0 !== 3). It passed 6 of 6 alone and in later full runs. `rollForStart()` (`test/browser.test.mjs`) polls each page in turn every 150 ms, and each poll is a DevTools round trip, so under load it may not see `[data-held="first"]` on every page within the hold.

## Open questions
- (none)

## Plan
Record the held state in the page when it appears (for example a small observer the test installs) rather than polling for it; then the assertion no longer depends on timing. Verify with `THROTTLE=6`.

## Next step / Handoff prompt
Read `CLAUDE.md`, then this file, and make the change above.
