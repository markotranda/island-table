# 020: Home and lobby fit one screen

**Status:** in review · **Commits:** see Progress

## Feedback
2026-11-12, owner: "We have made main game screen nice and one screen and non scrollable. But, main menu, lobby screen, that is still scrollable. Let's fix that."

## Current state
- The game screen fits the window above 850×575 (`style.css`: `@media(min-width:851px){.game-layout{height:calc(100dvh - 76px)…}}`, `html:has(.game-layout){overflow:hidden}` from 575px tall). Phones and shorter windows scroll.
- Home (`home()` in `public/app.js`): `.landing` is a grid with fixed padding (75px top), a 76px `h1` and a 300px `.illustration`, then `.landing-footer` below. The Join tab adds `openTables()` and the saved seats to the form card. Measured document height: 882px (Create) / 987px (Join, one open table) at 1280×720; it fits at 1440×900 only while the lists are short.
- Lobby (`lobby()`): eyebrow + two-line 48px `h1`, a 260px illustration above the seats, and the place card with the "Almost an island." heading, six settings, a long description paragraph (`tableSettings()`), the code, four stacked buttons and a note. Measured 1268px tall at every desktop size with six seats, so it always scrolls.
- Probe: `scratchpad/probe.mjs` (not committed) printed `document.documentElement.scrollHeight` per size; screenshots showed it.

## Open questions
- (none)

## Decisions
| # | Feedback | Decision | Why |
|---|---|---|---|
| 1 | Home and lobby scroll | Fit one screen on desktop only, with the game's rule: wider than 850px and at least 575px tall. Phones and short windows keep scrolling. | Owner's choice; a six-seat lobby can't fit a phone without cramming. |
| 2 | How the lobby fits | Compact: heading on one smaller line beside the seat pill; the board picture takes whatever height is left (hidden below 680px tall); the place card drops the "Almost an island." heading, and the rules description becomes a tooltip on a short line `[data-ui="rules-note"]` ("What these settings mean"). The code and Copy link share a row; the "your seat is saved in this browser" note becomes the tooltip of "Play on another device". If a column is still too tall it scrolls inside itself. Applies on phones too (same markup), the layout changes only on desktop. | Owner's choice (recommended option). |
| 3 | How home fits | The heading and illustration scale with window height; the open tables and saved seats sit in one scroll area `.entry-lists` inside the form card; the footer strip stays at the bottom of the screen. | Owner's choice (recommended option). |
| 4 | — | No `overflow:hidden` on `html` for home/lobby: the layout is sized to fit, so nothing is clipped if a case was missed; it just scrolls. | The game needed it for animations; these screens don't. |
| 5 | — | `.entry-lists`, `.lobby-table` and `.place-card` join `SCROLLERS`, so the 5 s open-tables refresh and live lobby updates keep their scroll position. | Every update rebuilds the page. |

## Plan

### Client (`public/style.css`, `public/app.js`)
Shared: `@media(min-width:851px) and (min-height:575px)` block ("fit" below). Both screens use the same frame: `#app:has(.landing)`/`#app:has(.lobby)` is a `100dvh` flex column, the header `flex:none` (it is 76px, 65px at ≤1080 wide, so no hard-coded heights), the main `flex:1;min-height:0` with vertical spacing as padding, not margin. The grids `.landing` and `.lobby-grid` get `grid-template-rows:minmax(0,1fr)` and their items (`.intro`, `.form-card`, `.lobby-table`, `.place-card`) `min-height:0`, otherwise the auto rows grow to content and `max-height:100%` does nothing (review 1).
- **Home, step 1.** `home()` wraps the open tables and saved seats in `<div class="entry-lists">`. Fit: `#app:has(.landing)` is a `100dvh` flex column; `.landing` `flex:1;min-height:0`, padding and gap scaled with `vh` (`clamp`), `align-items:stretch`; `.intro` a flex column centred vertically with `h1` `font-size:clamp(44px,9vh,76px)` and `.illustration` `flex:1 1 0;min-height:0;height:auto;max-height:300px`; `.form-card` `align-self:center;max-height:100%;display:flex;flex-direction:column`; `.entry-lists` `flex:1 1 auto;min-height:96px;overflow-y:auto` (a floor of about one and a half rows, so it never collapses); the card's h2/paragraph spacing tightened so the fixed part fits 1000×600 with that floor; the footer `flex:none;margin:0 auto` (its `margin:auto` would eat the free space).
- **Lobby, step 2.** Markup: drop the `h2`; `tableSettings()` keeps the description paragraph (`.rules-text`) and adds `<p class="fine rules-note" data-ui="rules-note" data-tip="…same text…">What these settings mean</p>`; fit shows the note and hides the paragraph, elsewhere (phones) the paragraph stays and the note is hidden, so phones keep the host-only and friendly-robber lines readable (review 6); code input and a Copy link button (`data-ui="invite"`, same handler) in one `.code-row`; the device note moves to `data-tip` on `[data-ui="seat"]`; the `h1`'s `<br>` hidden in fit. Fit: `.lobby` is the frame's main (flex column, padding instead of `margin:55px auto`); `h1` ~36px; `.lobby-grid` `flex:1;min-height:0;align-items:stretch`; `.lobby-table` flex column with `overflow-y:auto` and a few px of inner padding (negative margin to keep alignment) so seat shadows, the ready ring and focus outlines aren't clipped (review 7), `.illustration` `flex:1 1 0;min-height:0;height:auto`; `.place-card` `overflow-y:auto;max-height:100%` with tighter label/select/button spacing; inside the fit query, `(max-height:679px)` hides the lobby illustration (phones in landscape keep theirs). The second `[data-ui="invite"]` (the Copy link in `.code-row`) uses the same handler; tests click the first match, the header's, as before.

### Tests (`test/browser.test.mjs`)
New test "home and lobby fit one desktop screen":
- Content without many pages (review 8): from Node, `POST /api/rooms` five times and hold an SSE `fetch` to `/events` open for each (Bearer token), so all five are open tables; put three more API-created rooms' tokens into page A's `island-seats` via `page.init` before load (saved seats; they exist, so `checkSeats()` keeps them). Five open tables + saved seats overflow the list at every size. A on the Join tab at 1280×720, 1000×600 and 1920×1080: `documentElement.scrollHeight<=innerHeight`; `.landing-footer` bottom within the window; `.entry-lists` `clientHeight` ≥ one `.open-table` row; for every `[data-join]`/`[data-resume]`, after `scrollIntoView({block:'nearest'})` its rect lies inside both the `.entry-lists` rect and the viewport. Create tab: no page scroll. Streams are aborted in `finally`.
- Lobby (step 2): page B creates a table through the UI, picks Extended, adds three bots; page D joins by invite and asks B for B's colour so B's seat shows `[data-ui="color-ask"]` (the tallest seat). For B and D at the same sizes: no page scroll; at 1280×720 neither `.lobby-table` nor `.place-card` scrolls inside (`scrollHeight<=clientHeight+1`). At 1000×520 (below the fit) the page scrolls instead (nothing clipped).
- `[data-ui="rules-note"]` carries the description (e.g. `/paired-player turns/` on Extended).
- Each part fails before its step (the test lands with step 1 for home and grows in step 2).
The existing phone test (no horizontal overflow at 375px) stays.

### Steps (one commit each, `npm test` passing)
1. Home fits: markup wrapper, CSS, SCROLLERS, browser test (home part).
2. Lobby fits: markup, CSS, SCROLLERS, browser test (lobby part); screenshots at 1280×720 and 1440×900 checked before committing.
3. Docs: `CLAUDE.md` hooks (`.entry-lists`, `[data-ui="rules-note"]`, the fit rule), project log, index; `THROTTLE=6 npm test`; close.

## Review
Round 1 (REVISE): 1 grid rows need `minmax(0,1fr)` + `min-height:0` → accepted. 2 home list can collapse at 1000×600 and the reachability check would pass anyway → accepted (floor, tighter card, rect checks). 3 hard-coded 76px wrong at ≤1080 and margin on a fixed height → accepted (shared flex frame). 4 footer `margin:auto` → accepted. 5 scope the height query to desktop → accepted. 6 description hidden on phones → accepted (paragraph stays on phones). 7 scroller clips seat shadows → accepted. 8 test too heavy, list won't overflow → accepted (API rooms + held SSE, 5 tables). 9 scrollTop carried across tab switches → intended/harmless: the Create tab has no list. 10 two invite buttons → noted for CLAUDE.md.

## Progress
| Step | State | Commit | Notes |
|---|---|---|---|

## Not verified

## Next step / Handoff prompt
Read CLAUDE.md, then this file. Review is next, then step 1.
