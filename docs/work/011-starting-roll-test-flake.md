# 011: Starting-roll test can miss the 3 s hold under load

**Status:** done · **Commits:** "Browser tests wait for the live stream after staging…" (the commit after 7c66cff)

## Feedback
None: found during item 010 (2026-11-04).

## Current state
`browser: invite, lobby, live setup, turns, reload and seat recovery` failed once in a full `npm test`: "the starting roll result was not held on every screen" (0 !== 3). It passed 6 of 6 alone and in later full runs. `rollForStart()` (`test/browser.test.mjs`) polls each page in turn every 150 ms, and each poll is a DevTools round trip, so under load it may not see `[data-held="first"]` on every page within the hold.

## Open questions
- (none)

## Decisions
| # | Point | Decision | Why |
|---|---|---|---|
| 1 | Where to record the hold | A `MutationObserver` that `rollForStart()` installs in each page, setting `window.__heldFirst` (no change to `app.js`) | The pages don't reload during the starting roll, so `page.init` isn't needed; the app stays free of test-only code |

## Plan
1. `rollForStart()` installs the observer on every page (resetting `__heldFirst`, so a second call after a tie starts clean), reads the flag while polling and once more at the end, then disconnects. Verify with `THROTTLE=6`. Committed together with item 013.

## Review
Skipped the agent review: a test-only change with the plan already written in the earlier session.

## Progress
| Step | State | Commit | Notes |
|---|---|---|---|
| 1 | done | after 7c66cff | 2026-11-04 |

## Not verified
- The original failure was seen only once, so the fix can't be proven to remove it. The observer catches the hold regardless of polling speed.

## Next step / Handoff prompt
Done.
