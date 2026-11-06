# 016: Two browser tests are flaky under THROTTLE=6

**Status:** planned · **Commits:** none yet

## Feedback
Found during 015, 2026-11-06. Not owner feedback.

## Current state
- `browser: End turn glows…` sometimes fails at `THROTTLE=6` waiting for `data-nudge="soft"`, at different stages ("an empty hand", "paired player 2"). In isolated runs of the two tests it failed 1 of 3 on the commit before 015 (`5d7d818`) and 2 of 3 on 015's code, so it predates 015. Three runs each is too few to say whether 015 changed the rate.
- `browser: the tab title says…` failed once in a full `THROTTLE=6` suite with "The starting roll did not finish". It passed all 6 isolated runs (3 on each commit), so it may need the load of the full suite. Whether it predates 015 is not established.
- Both pass at normal speed.

## Open questions
- (none)

## Decisions
Tests only, unless the investigation finds a real client bug behind the missing glow.

## Plan
1. Reproduce with repeated isolated runs at `THROTTLE=6`, and find out why the glow doesn't appear within the wait. Is `idle()` false, is the timer late, or does the wait simply run out?
2. Fix the cause, with no longer timeouts unless slowness really is the cause.
3. Run the starting-roll test in the full throttled suite, then fix or close it.

## Review
Not yet reviewed.

## Progress
Nothing yet.

## Not verified
Everything above beyond the runs listed.

## Next step / Handoff prompt
Read `CLAUDE.md`, then this file, then follow the plan, starting with step 1.
