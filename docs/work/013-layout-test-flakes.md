# 013: Two item-010 browser tests are flaky

**Status:** done · **Commits:** "Browser tests wait for the live stream after staging…" (the commit after 7c66cff)

## Feedback
None: found during item 012 (2026-11-04).

## Current state
- `browser: during a game the name and options sit in the corners and the map runs to the top of the window` fails about half the time on unchanged main (2 of 4 runs): `the live stream clears it`, actual `'Connecting…'` (test/browser.test.mjs, the offline/connection check). The assertion reads the connection state once instead of waiting for the stream to reconnect.
- `browser: six player cards always fit without scrolling and never change size` timed out under `THROTTLE=6` in `sixSeats()`, waiting for `document.querySelectorAll('[data-bot]').length===5` (default `waitFor` timeout too short for five bot seats under throttling).
- Found while verifying (2026-11-04): the same six-cards test also failed 1 in 8 runs at the takeover check after `stage()` (`[false,true]`: no "Away · use bot" button yet). Same root cause as the first flake: after `stage()` reloads a page, the first render comes from the HTTP state before the live stream connects, and `away()` in `app.js` needs `connected` and the stream's `online` list.

## Open questions
- (none)

## Decisions
| # | Point | Decision | Why |
|---|---|---|---|
| 1 | Connection check reads once | `waitFor` the `.connection` badge to lose `offline` | The stream reconnects some time after reload |
| 2 | `sixSeats()` bot wait | Per bot: click only if the bot is still missing, wait 10 s, up to 3 tries | A live redraw can swallow a click, and a longer wait alone can't recover from that |
| 3 | Reads right after `stage()` race the stream | `stage()` waits for the board **and** for no `.connection.offline` | Fixes every staged test at once instead of each assertion |

## Plan
1. The three changes above in `test/browser.test.mjs`, one commit together with item 011 (all test-only). Verify: the affected tests 8× normally, the whole browser suite 3× normally and 2× with `THROTTLE=6`.

## Review
Skipped the agent review: test-only changes of a few lines, with the plan already written in the earlier session.

## Progress
| Step | State | Commit | Notes |
|---|---|---|---|
| 1 | done | after 7c66cff | 2026-11-04 |

## Not verified

## Next step / Handoff prompt
Done.
