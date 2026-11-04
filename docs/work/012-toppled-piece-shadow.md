# 012: Toppled lobby pieces had a sideways shadow

**Status:** done · **Commits:** see `git log -- docs/work/012-toppled-piece-shadow.md`

## Feedback
2026-11-04, owner: "In lobby, while the player is not ready. This game pieces are toppled (knocked over), but their shadow is sideways..."

## Current state
`lobby()` in `public/app.js` wrapped the whole `piece('settlement',…)` in `rotate(-78)` when not ready. `piece()` draws the shadow ellipse as part of the piece, so the shadow rotated with the body and stood upright beside it (measured 13×29 px, height greater than width).

## Open questions
- (none)

## Decisions
| # | Feedback | Decision | Why |
|---|---|---|---|
| 1 | Shadow is sideways on toppled pieces | `piece(kind,color,glow,pose)` takes an optional transform for the body only; the shadow stays flat. The lying body is shifted (`translate(7 -6)`) so it rests on that shadow, and the seat icon's viewBox moves down 2 so the top of the standing roof is no longer cut off | A bug with one obvious fix; nothing for the owner to decide |

## Plan
One step: the fix plus a browser test (`browser: toppled lobby pieces lie on a flat shadow and stay inside their seat`) that checks, both not ready and ready, that each shadow is wider than three times its height and that every outline (traced through its transforms) stays inside the seat icon. No review round: a one-line visual fix.

## Review
Skipped (trivial fix, see Plan).

## Progress
| Step | State | Commit | Notes |
|---|---|---|---|
| 1 | done | (this commit) | The new test fails without the fix ("the shadow lies flat, width/height 0.44") |

Log 2026-11-04: zoomed screenshots before and after. Full `npm test`: 61 pass, 1 fail, and `THROTTLE=6` on the browser tests: 1 fail. Both failures are item 010 tests with timing problems that also fail on main without this change; see item 013.

## Not verified
- Phone width by eye (the seat icon keeps its size; the phone-layout test passes).

## Next step / Handoff prompt
Nothing left.
