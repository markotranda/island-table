# 019: No trade requests for resources no opponent can hold

**Status:** in review · **Commits:** …

## Feedback
2026-11-09, owner: "Can't send trade requests for resources that are all in supply." Clarified: this is a wish, not a bug. Such a request should not be possible.

## Current state
- `public/app.js:244` calls `picker('want',null,base?.give)`: no limit, every resource up to 99.
- `lib/engine.mjs:166-172` (`offer`) never looks at what other players hold.
- `lib/bot.mjs:84` picks the first resource it is short of, even if nobody else has one.
- Result: an offer for a resource that is entirely in the supply is posted, and nobody can accept it.

## Open questions
(none)

## Decisions
| # | Feedback | Decision | Why |
|---|---|---|---|
| 1 | Block it | Refuse in the engine and grey out in "I want" | Server-authoritative; the owner chose blocking over a warning |
| 2 | When | Unavailable when no opponent can hold it: supply + own hand = every card of that resource (owner) | Also covers holding all the cards outside the supply yourself |
| 3 | Quantity | Same limit caps the amount: at most what the other players hold between them (own decision) | Asking for 3 when only 2 are out is equally impossible, and `picker` already caps by its limit |
| 4 | Counters | Same rule, counting everyone but the sender (own decision) | The client cannot know the active player's hand alone, only the sum of the others |
| 5 | Open offers | Offers already posted stay, even if the cards return to the supply (own decision) | Accepting already checks the hand; the check is only when posting |
| 6 | Rules | Digital convention in `RULES.md`; the rulebook is silent | The count follows from public information: nothing new is revealed |

## Plan
**Engine.** `offer`: after the gift check, `ensure(R.every(r=>want[r]<=others(g,p,r)),'No other player holds that many of that resource.')`, where `others` sums the other players' `hand[r]`. Cards are conserved, so this equals total − supply − own hand, and old saves need nothing.

**View.** `view()` adds `others` (`{wood:n,…}`, sum of other players' hands) once the game has a bank. It is derivable by anyone from the supply and their own hand, so it leaks nothing. It saves the client from duplicating the 19/24 totals.

**Bot.** `lib/bot.mjs:84`: `get=R.find(r=>me.hand[r]<want[r]&&v.others[r]>0)`, so it asks for the next thing it needs that someone can have.

**Client.** `picker('want',state.others,base?.give)`. Tips: `N held by other players`, or `No other player holds any` when 0. A disabled button may not get hover events, so the tip of an empty pick must be shown from its `.pick` wrapper; check with `page.hover`. The give and invention pickers keep their tips.

**Steps (one commit each)**
1. Engine, view, bot. Tests in `engine.test.mjs`: refused at 0, refused above the sum, allowed at the sum, holding all outside cards yourself is refused, counter uses the same rule; `view().others` is correct per seat; `bot.test.mjs`: never posts an offer the engine refuses when its first need is unavailable. Fix fixtures that ask for cards nobody holds, by giving an opponent that card (not by weakening the rule).
2. Client picker and tips. Browser test: stage a hand where all ore is in the supply: `want-ore` is disabled with `.pick.none`, tip visible on hover; a resource an opponent holds can be added up to the sum and no further; counter prefill still works.
3. Docs: `RULES.md`, `CLAUDE.md` (`view().others`), project log; close.

**Verification.** New tests fail without the change; `npm test`; `THROTTLE=6 npm test` before the last commit; a screenshot of the panel with a greyed resource.

## Review

## Progress
| Step | State | Commit | Notes |
|---|---|---|---|

## Not verified

## Next step / Handoff prompt
Read `CLAUDE.md`, then this file; the review comes next, then step 1.
