# 018: The "Accepted" tag looks unlike the buttons beside it

**Status:** done · **Commits:** see Progress

## Feedback
2026-11-07, owner: "The accepted button looks different then other buttons, off center and smaller font."

## Current state
After you accept an offer, `offerHtml()` in `public/app.js` drew `<span class="badge ready">Accepted ✓</span>` next to the Withdraw button. `.badge` is the 9px sidebar label style (padding 3px 6px), so in the `.offer-actions` row it was smaller and sat off-centre next to `button.small` (12px, padding 7px 10px).

## Open questions
- (none)

## Decisions
| # | Feedback | Decision | Why |
|---|---|---|---|
| 1 | Accepted looks different, off centre, smaller font | Own class `.accepted-tag` (`data-ui="accepted"`): same padding, font size, weight, line-height and radius as `button.small`, green like the ready badge, check icon first. It stays a non-clickable label; Withdraw beside it undoes the accept. | It must read as part of the button row but not invite a click. |

## Plan
One step: CSS + markup, a browser assertion that the tag and Withdraw have equal height, font size and vertical centre, and a `05b-trade-accepted` screenshot in `scripts/review-screens.mjs`. Agent review skipped: a one-rule style fix with nothing to decide.

## Review
Skipped (see Plan).

## Progress
| Step | State | Commit | Notes |
|---|---|---|---|
| 1 | done | (this commit) | Measuring with `getBoundingClientRect()` showed a 1px centre gap that was only the offer card's `rotate(-.6deg)` tilt; the test uses `offsetTop`/`offsetHeight`, which ignore transforms. |

## Not verified
- Phone width (the row wraps there; the tag has the same box as the buttons, so it should wrap like them).

## Next step / Handoff prompt
Nothing left.
