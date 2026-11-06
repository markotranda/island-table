# 015: Declined offers leave the table, bots hear everyone out

**Status:** in review · **Commits:** see `git log -- docs/work/015-trade-answers.md`

## Feedback
2026-11-06, owner:
1. "When everyone declines a trade offer, remove it automatically."
2. "Bots should wait for all trade response before choosing who to accept."

## Current state
- **Declines:** `apply()` records a decline in `o.declined` and logs `respond` (`lib/engine.mjs:179-182`). Nothing removes the offer: it stays until the current player cancels it, completes a trade or ends the turn. A bot cleans up its own offer (`lib/bot.mjs:73`); a person has to press Cancel. Reproduced by reading the code; `test/bot.test.mjs:33` covers the bot's cleanup.
- **Bots choosing:** `decide()` confirms as soon as `offer.accepted` holds anyone, taking the lowest score among those who have answered so far (`lib/bot.mjs:73`). Whoever answers first in practice gets the trade, and a person is often beaten by the bots, which answer within a second. A counter to the bot is judged even earlier (`lib/bot.mjs:71`), and accepting it ends the trade with others still undecided. With nobody accepting, the bot already waits up to 20 s of `offerAge` (scaled by `BOT_PACE`), and any commit wakes it again (`server.mjs:34-35`).
- **Removal is already safe elsewhere:** `cancelOffer` removes an offer and leaves its counters; a counter needs its base only when posted (`engine.mjs:167`), and the client closes an open counter form when the base goes (`public/app.js:238`).

## Open questions
- (none)

## Decisions
| # | Feedback | Decision | Why |
|---|---|---|---|
| 1 | Remove when all declined | The engine removes the offer in the same command as the last decline, when every other player is in `declined`. Everyone sees it through the normal state update | Server-authoritative, works the same for people and bots |
| 1a | — | A counter is not a decline for this rule: a player who countered and never pressed Decline keeps the offer open, since their counter may be turned down and they can still accept | The owner said "declines"; the current player can still Cancel |
| 1b | — | Counters to a removed offer stay on the table | They are live proposals, and `cancelOffer` already works this way |
| 1c | — | History gets one line after the last decline: "Everyone declined X's offer." (`cancel` event with `declined:true`) | The offer vanishing otherwise has no explanation |
| 1d | — | No extra sound or toast | The history line and the panel change are enough; the owner didn't ask for more |
| 1e | — | A player who can't afford the offer isn't declined for them | They answer like everyone else; changing that is a separate wish |
| 2 | Bots wait for all answers | The bot acts on its own offer only once every other player has accepted, declined or countered, or `offerAge` reaches the existing 20 s | A silent or absent person must not stall the table; the 20 s already exists and "no auto-skips" stays true for people's own moves |
| 2a | — | Then: anyone accepted → confirm with the lowest score, as now. Otherwise answer counters, one at a time. Otherwise cancel | Its own terms are the trade it wanted; `exchange` clears the rest |
| 2b | — | Counters are held until then too, unless the bot has no open offer of its own (answered at once, as now) | Accepting a counter also "chooses" and ends the trade |
| 2c | — | A countering player counts as answered through this turn's `offer` events with `counter:true`, so declining their counter doesn't restart the wait | `decide()` stays pure and works from `view()`; `events` are public |
| 2d | — | Old saves: an offer already declined by all stays until someone acts; a bot's is cancelled by the same branch, a person's by Cancel. No migration | Additive, and it only lasts one turn |

## Plan
### Engine (`lib/engine.mjs`, `apply`, `declineOffer` branch)
After recording the answer: `if(!accept&&o.declined.length>=g.count-1){g.offers=g.offers.filter(x=>x!==o);log(g,'cancel',{p:o.from,from:o.from,declined:true});}`. Counters take the earlier branch, so they never reach this. A withdrawn acceptance goes through the same path and can be the last decline.

### Client (`public/app.js`, `story()`)
`case 'cancel'`: `e.declined?'Everyone declined '+who+'’s offer.'` before the existing wording. No other change: the panel already falls back to the launcher when no offer is left and no form is open (`app.js:240`), and a form the current player has open stays.

### Bot (`lib/bot.mjs`, `decide`, lines 70-73)
```js
const offer=v.offers.find(o=>o.from===p),yes=offer?.accepted??[],no=offer?.declined??[],countered=i=>v.events.some(e=>e.turn===v.turn&&e.kind==='offer'&&e.counter&&e.p===i);
if(offer&&(ctx.offerAge??0)<20000&&v.players.some((_,i)=>i!==p&&!yes.includes(i)&&!no.includes(i)&&!countered(i)))return {wait:Math.max(400,20000-(ctx.offerAge??0))};
if(yes.length)return {type:'confirmOffer',offerId:offer.id,player:yes.toSorted((a,b)=>v.players[a].score-v.players[b].score)[0]};
const counter=v.offers.find(o=>o.from!==p&&o.to===p);if(counter)return {type:acceptable(…)?'acceptOffer':'declineOffer',offerId:counter.id};
if(offer)return {type:'cancelOffer',offerId:offer.id};
```
`fallback()` is unchanged. No server change: every commit already wakes the bot, and the `wait` timer covers the silent case.

### Steps (one commit each, `npm test` passing)
1. **Engine and history.** Engine change, `story()` line, RULES.md trade convention. Tests in `engine.test.mjs`: 4 players, removed only on the third decline and not on an accept plus two declines; a withdrawal as the last decline removes it; 2 players, one decline removes it; a counter survives and can still be accepted; a countering player who hasn't declined keeps the offer open; `pending()` no longer lists anyone for it; the `cancel` event has `declined:true`. Browser test, in the existing trade flow: all others decline, the offer disappears on every page and the history shows the line.
2. **Bot waits.** `decide()` change, comment and test name. Tests in `bot.test.mjs`: one accept with one silent → `wait`; same at 25 s → confirm; everyone answered → confirm with the lowest score, including a later, lower-scoring acceptor who wouldn't have won before; a counter and a silent player → `wait`; counter with everyone answered → answered; a countering player whose counter was declined still counts as answered; no open offer of its own (base gone) → counter answered at once; the existing cases still hold. Whole-game coverage comes from existing `bot.test.mjs`/`matches.test.mjs`; `node scripts/bot-stats.mjs` is compared before and after as a sanity check.
3. **Docs and close.** README (how to play), `CLAUDE.md` (engine and bot lines), `docs/project-log.md`, this item, index. `THROTTLE=6 npm test` before this commit, output in the scratchpad.

Each new test must fail without its change. No new test-only browser hooks: the browser test only reads the DOM and waits for final states.

### Docs
- `RULES.md` trade convention: an offer every other player declined leaves the table at once; counters stay.
- `RULES.md` or README: bots wait for all answers, up to 20 s.
- `CLAUDE.md`: engine trade sentence and bot `{wait:ms}` wording.

## Review
Round 1 (fresh agent, reading only), verdict APPROVE, no blocking findings:
1. A counter the player withdrew still counted as answered → accepted: `countered` excludes a player's own withdrawal (`cancel` with `p===from===i`). If they counter again the bot simply waits out the 20 s.
2. `countered` isn't tied to one offer; a stand-in seat can inherit several of a person's offers → accepted as harmless, no change.
3. Simultaneous last declines untested → accepted: the browser test answers with `Promise.all` and `.eval(click())`, asserts no "try again", and A ends on the launcher.
4. Removal creates odd toasts in races (Accept, Counter or Cancel landing just after the last decline) → accepted as correct outcomes, same as any stale action on a cancelled offer; a decliner's open counter form closes silently.
5. Not every listed test can fail without its change → accepted: guards are named as guards; the behaviour tests must fail first.
6. No 5-6 player threshold case → accepted: add a 5-player assertion (fourth decline removes it).
7. Docs list loose → accepted: check the in-app How to play (`app.js:322`) and README lines 13 and 83; the bot convention goes in the Bots bullet of `RULES.md`; update the comments at `bot.mjs:4` and `:70`.
8. Seeded strength bounds may move in step 2 → accepted: judge with `bot-stats`, change a bound only with evidence, don't just pick a new seed.
9. An absent non-current player now costs every bot offer the full 20 s, even after an early accept → accepted cost of decision 2. `online` isn't in `view()`, and `decide()` stays pure.

## Progress
| Step | State | Commit | Notes |
|---|---|---|---|
| 1 | | | |
| 2 | | | |
| 3 | | | |

## Not verified

## Next step / Handoff prompt
Read `CLAUDE.md`, then this file. Finish the review, then do the steps in order; the Progress table says which is next.
