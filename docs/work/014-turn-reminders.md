# 014: Noticing your turn, and remembering to end it

**Status:** in progress · **Commits:** see `git log -- docs/work/014-turn-reminders.md`

## Feedback
2026-11-04, owner:
1. "Some players complained that they miss that it's their turn … I was thinking a big message that says your turn across the screen with background in transparent color of that player. But I'm open to suggestions."
2. "… and also that they miss that they didn't end the turn … if a player has no valid actions (beside trade with players) then a subtle effect on the end turn button. Maybe just a pulsing button, but subtle."

## Current state
- Turn start: `playEffects()` (`public/app.js` ~line 330) plays the `turn` chime once per turn key `turn:setupIndex:active:role` when the page's player becomes active in `preRoll`, `setupSettlement`, or paired player 2's `action`. Only heard if sound is on and the page has been tapped. The board dice glow (`.table-dice.roll-me`) on your roll. Nothing visual on setup turns or paired phase 2 beyond the turn card text. Nothing when the tab is in the background; the page title is fixed (`index.html`).
- End turn: `controls()` renders `[data-command="end"]` in `action` for the active player; it never changes look. The build bar (`buildBar()`) already knows per piece whether it's affordable, has a legal spot and pieces left; `devStacks()`/`hand()` know which dev cards are playable; `state.ratios`/`state.bank` give supply trades.

## Open questions
- (none)

## Decisions
| # | Feedback | Decision | Why |
|---|---|---|---|
| 1 | Big "your turn" message | A band across the middle of the board in the player's colour (~60 % opaque), "Your turn" large plus the next step ("Roll the dice", "Place a settlement", "Your phase"), sweeps in, holds ~1.5 s, fades. `pointer-events:none`, never blocks. Reduced motion: fade only | Owner chose the band (option 1) |
| 1a | — | Same moments as the chime (the existing turn key). Not on a page load mid-turn. If the tab is hidden when the turn starts, the band plays when the tab becomes visible again, if it's still that turn | Hidden tabs throttle animations, so the band would otherwise be missed |
| 1b | Extras | Tab title becomes "● Your turn · Settlers of Questionable Ethics" while it's your move (any phase that waits on you: your turn, setup, discard you owe, robber/steal, picks) | Owner picked it |
| 1c | Extras | Opt-in system notification "Your turn" when the tab is hidden, toggled by a bell button `[data-ui="notify"]` in the top bar beside sound; choice per browser (`localStorage island-notify`). Only shown where the Notification API is available, which needs HTTPS or localhost (plain LAN http won't offer it) | Owner picked it; browsers restrict notifications to secure contexts |
| 1d | Extras | A smaller, quieter band "<name>'s turn" in that player's colour for everyone else, only at the start of a full turn (roll) and paired phase 2, not every setup placement | Owner picked it; setup placements come every few seconds with bots and would be noisy |
| 2 | End-turn nudge | "Nothing left to do" = in `action`, active, no build/buy button enabled, no playable dev card, and no single supply trade that would make a build/buy possible. Player offers are ignored | Owner chose "only if it enables a build" |
| 2a | Timing | Soft slow glow on End turn starting 3 s after nothing is left; after 30 s more visible pulse and one quiet `nudge` tone (once per turn) | Owner chose escalation |

## Plan
### Client (`public/app.js`, `public/style.css`, `public/index.html`)
- `turnBanner(p,mine)`: appends `<div class="turn-banner" data-ui="turn-banner" data-who="me|other" style="--player:…">` to the `#fx` layer (outside `#app`, so redraws don't restart it), positioned over `.board-wrap`'s rect, animated with `el.animate` (~2.2 s, `.small` variant for others), removed when finished. Triggered next to the `turn` cue in `playEffects()`; a second key `otherCue` handles others' turns (preRoll or role 2 action of someone else). Hidden tab: store a pending banner and play it on `visibilitychange` if `turnKey` unchanged.
- `owes()`: whether `pending` is me — computed from the view (active & phase in setup/preRoll/action/robber/steal/freeRoads/monopoly/invention, or `discards[me]`). `syncTitle()` in `render()` sets `document.title`.
- Notifications: `notifyOn` from `localStorage`; bell button `[data-ui="notify"]` with `aria-pressed`, only if `'Notification' in window && isSecureContext`; turning on calls `Notification.requestPermission()`. At turn start with `document.hidden` and permission granted: `new Notification('Your turn',{body:'<room>: roll the dice',tag:'island-turn'})`, click focuses the window. Icon `#ui-bell`/`#ui-bell-off` added to `UI` in `scripts/icons.mjs` (Font Awesome Free), sprite regenerated.
- `idle()`: pure helper from `state` → true when nothing is left (decision 2). Shares the affordability/spot/left logic with `buildBar()` via a small `canBuild(hand)` helper; supply lookahead tries every `give` with `hand[give]>=ratios[give]` and `want` with `bank[want]>0`.
- Nudge: `nudgeKey=turn:active:role:revision-independent hand signature`; `nudgeSince` set when `idle()` turns true (reset when false). End button gets `data-nudge="soft"` after 3 s and `"strong"` after 30 s; `setTimeout` re-renders at those moments; strong plays `cue('nudge')` once per turn. Thresholds `NUDGE=[3000,30000]`, overridable by `window.__nudgeMs` for tests. CSS: soft = slow 2.4 s box-shadow glow in gold, strong = slightly larger glow + gentle scale; reduced motion: static gold outline.
- `SFX.nudge`: two soft low notes.
- How to play: a line about the band, title, notifications and the End turn glow.

### Tests (`test/browser.test.mjs`)
- Banner: two humans; when the turn passes, the new active page sees `[data-ui="turn-banner"][data-who="me"]`, the other `data-who="other"` with the right name; title starts with "● Your turn" only on the active page.
- Notification: stub `window.Notification` (permission granted, records into `window.__notes`), hide the page via `Page.setWebLifecycleState`/override `document.hidden`, pass the turn, assert a note. Check the bell is absent if `Notification` is missing.
- Nudge: `stage()` the active player's hand empty after rolling → End button gets `data-nudge="soft"` (with `__nudgeMs=[200,600]`) then `strong` and `heard('nudge')`; hand with `wood+brick` → no nudge; hand with 4 ore only and bank wheat → still nudge (ore→1 doesn't make a city); hand with 5 wood + 0 brick → no nudge (4 wood → brick, road).

### Steps (one commit each, `npm test` green)
1. Turn banner for you and others, hidden-tab deferral, browser test.
2. Tab title flag and opt-in notifications (bell icon), browser tests.
3. End-turn nudge (`idle()`, soft/strong, `nudge` cue), browser tests.
4. Docs: How to play, CLAUDE.md hooks (`turn-banner`, `notify`, `data-nudge`, `__nudgeMs`), README if it lists features, review screenshots, `THROTTLE=6` run, project log.

## Review
Round 1 (fresh general-purpose agent), verdict REVISE, one blocking finding; all accepted, so no second round was needed for the design:
1. **blocking** `stage()` reloads pages, so `__nudgeMs` and a stubbed `Notification` set by `eval` vanish → add `page.init(source)` to `test/browser.mjs` (wraps `Page.addScriptToEvaluateOnNewDocument`); fake visibility with a `document.hidden` getter, never `setWebLifecycleState` (frozen stops JS). Accepted.
2. Redraws restart CSS animations → the glow uses a negative `animation-delay` from `nudgeSince` (`--t`), like the dice. Accepted.
3. `idle()`: apply `left` caps (legal cities/roads ignore the piece limits); lookahead removes `ratios[give]` from a hand copy, `give!==want`; shared `canBuild(hand,left,spots)`. Accepted.
4. No nudge while your own offer has acceptances or a counter is addressed to you. Accepted.
5. A playable Road Building with no legal road or no roads left doesn't count. Accepted.
6. Others' band keyed on any turn change outside setup, not on seeing `preRoll` (a bot may have rolled before the redraw). Accepted, done in step 1.
7. Title: include `order` when you still have to roll; restore the base title outside games; close the notification when the tab becomes visible or the turn passes. Accepted.
8. Phone: centre the band on the visible part of the board, else the viewport. Already so in step 1; checked by screenshot.
9. Drop the hand signature: reset `nudgeSince` when `idle()` is false or the turn key changes; tone once per turn key. Accepted.
10. Tests: paired player 2 nudge, fresh dev card + empty hand still nudges, assert a legal road spot in the 5-wood case, assert bands by content. Accepted.
11. Docs: all new hooks into CLAUDE.md. Accepted.

## Progress
| Step | State | Commit | Notes |
|---|---|---|---|
| 1 | done | 5d19318 | `turnStart()`/`turnBanner()` in `app.js`, `.turn-banner` in `style.css`; test `browser: a band across the board says whose turn it is…`. Screenshots desktop + phone looked right |

| 2 | done | 1160e18 | `owes()`/`syncTitle()`, bell `[data-ui="notify"]` (`toggleNotify()`, `alertTurn()`, `closeAlert()`), `#ui-bell`; driver `page.init()`; `seatTable(…,init)`; test `browser: the tab title says when the game waits on you…`. Phone: Invite is icon-only under 620 px so the bell fits |
| 3 | done | (this commit) | `buildRoom()`/`buildable()` shared with `buildBar()`, `idle()`, `syncNudge()` (state `nudge`), End button `.end-turn[data-nudge=soft|strong]` with `--t`, `SFX.nudge`; test `browser: End turn glows when nothing is left to do…` |
Log 2026-11-04, step 1: the band records itself in `window.__banners` (like `__sounds`) because it is on screen ~2.6 s. Gotcha: the hidden-tab test must hide the tab *before* ending the previous turn, or the band can already have played. Full `npm test`: 62 pass, 1 fail (`six player cards…`, intermittent: passes alone with and without this change; same family as item 013).
Log 2026-11-04, step 2: the Notification stub must keep its permission across reloads (localStorage), like a real browser, or the bell is on but alerts never fire. The off state is the bell dimmed with a CSS slash, so only one Font Awesome icon was added. Full `npm test`: 64 pass.

## Not verified

## Next step / Handoff prompt
Read CLAUDE.md, then this file (Plan + Review findings amend it). Step 4 (docs, THROTTLE=6 run, project log) is next.
Log 2026-11-04, step 3: `room` is already a module variable in `app.js` (the room code), so the helper is `buildRoom()`. The staged host has no board pieces, so the supply-lookahead case uses 5 ore + 1 wool → a development card instead of 5 wood → a road. `__nudgeMs` is set with `page.init` so it survives `stage()`'s reloads. Full `npm test`: 64 pass, 1 fail, twice: `…name and options sit in the corners…` (`the live stream clears it`), the item 013 flake that fails about half the time on unchanged main; it passes alone. Committed with that exception.
