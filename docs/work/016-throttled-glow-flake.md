# 016: Two browser tests are flaky under THROTTLE=6

**Status:** parked · **Commits:** see `git log -- docs/work/016-throttled-glow-flake.md`

## Feedback
Found during 015, 2026-11-06. Not owner feedback.

## Current state
- **End turn glow: fixed.** The test polled for `data-nudge="soft"`, a state its shortened thresholds keep for only 600 ms. A slow poll missed it, the button moved on to `strong`, and the wait could never succeed. A diagnostic run confirmed this: the failure reported `STATE=strong`. The client was right all along, and the glow itself is unchanged.
- **Starting roll: not reproduced.** "The starting roll did not finish" happened once, in one full `THROTTLE=6` run during 015. It did not return in 6 isolated runs or in 3 more full runs. The cause is unknown and nothing was changed to fix it.

## Open questions
- (none)

## Decisions
| # | Point | Decision | Why |
|---|---|---|---|
| 1 | Glow test | A `MutationObserver` added with `page.init` records each level the button shows in `window.__glow`; the test waits for `strong`, then expects `['soft','strong']`. No client change and no longer timeouts | A transient state should be recorded in the page, not polled; `init` survives `stage()`'s reloads, and each reload starts a fresh list |
| 2 | Starting roll | Its error now reports each page's dice, order panel, connection, toast and text. No speculative fix | There is no evidence of a cause yet |

## Plan
1. Reproduce and find the glow cause: done.
2. Fix the glow test: done.
3. Starting roll: wait for it to recur, then use the new error detail.

## Review
Not reviewed by an agent: a change to two test helpers, with no plan-level choices for the owner.

## Progress
| Step | State | Commit | Notes |
|---|---|---|---|
| 1, 2 | done | see `git log` | Glow test and roll error detail |
| 3 | parked | | Needs a recurrence |

Log, 2026-11-06:
- Glow test at `THROTTLE=6`: 1 failure in 6 runs with the diagnostic, before the fix; 0 failures in 8 runs after it.
- Full `npm test` at `THROTTLE=6` after the fix: 67 of 67, three times.

## Not verified
- That the starting-roll failure is gone. It may be rare rather than fixed.
- The test on real CI runners.

## Next step / Handoff prompt
Read `CLAUDE.md`, then this file. If "The starting roll did not finish" appears again, locally or on CI, read the state in the error, find the cause in `rollForStart` (`test/browser.test.mjs`) or the client, and fix it. If it stays away for a good while, close this item.
