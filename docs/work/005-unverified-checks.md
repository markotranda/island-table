# 005: Checks that tests could not do

**Status:** waiting on owner · **Commits:** none

## Feedback
Not owner feedback: collected on 2026-11-04 from the "Not checked / Not verified" notes of items [001](001-feedback-round-1.md)–[004](004-bots.md).

## Current state
Every item below was left unverified because headless tests can't do it, or only the owner can.

## Open questions
- Which of these has the owner already seen in real games, and did anything look or sound wrong?

## The checks
| # | Check | From | Who |
|---|---|---|---|
| 1 | Sounds by ear (`SFX` cues in `app.js`): which to tune | 001 steps 6, 9 | owner |
| 2 | 1280×720 laptop viewport | 001 step 8 | Claude (screenshots) |
| 3 | Extended 30-hex board: screenshots, placement pulse and hex glow | 001 step 8, 002 step 8 | Claude (screenshots) |
| 4 | Touch long-press tooltips on a real phone | 002 step 8 | owner |
| 5 | Phone layout of the starting-roll card and the discard window | 003 step 5 | Claude (screenshots), owner |
| 6 | Steal tooltip no longer shows other players' resources (owner's browser) | 003 step 4 | owner: report with a screenshot if it recurs |
| 7 | A human-vs-bots game played by a person | 004 step 6 | owner |
| 8 | Rare flake in browser test "discards, player and bank trades": one cause fixed in 003 step 4; if it recurs, capture the output first | 001 step 9, 003 | Claude |

## Next step
Ask the owner about 1, 4, 6 and 7 (any of their findings become new feedback via the answering-feedback skill). Claude can do 2, 3 and 5 with `node scripts/review-screens.mjs` at those sizes and send the screenshots.
