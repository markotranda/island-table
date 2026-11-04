# Project log: from parked tests to a published, table-top game

This records one long working session on Island Table: what was done, why, and how. It is written for whoever works on the project next (including future you). Commit hashes refer to `main` after the history rewrite described in section 4.

## Contents

1. [Finishing the parked browser-test work](#1-finishing-the-parked-browser-test-work)
2. [Is the game complete?](#2-is-the-game-complete)
3. [GitHub repository and automatic Docker images](#3-github-repository-and-automatic-docker-images)
4. [Making the repository public](#4-making-the-repository-public)
5. [Choose a map, start with two players](#5-choose-a-map-start-with-two-players)
6. [Redrawing the resource icons](#6-redrawing-the-resource-icons)
7. [Making it look like a board game](#7-making-it-look-like-a-board-game)
8. [How to do things now](#8-how-to-do-things-now)
9. [Ideas not done](#9-ideas-not-done)

---

## 1. Finishing the parked browser-test work

**Starting point.** There were uncommitted changes:

- new browser tests, with a `stage()` fixture that rewrites the saved game between commands;
- an engine fix where cancelling one trade offer removed all of them;
- a client change that retries a trade offer when two players post at the same moment.

**What was found.**

- **The new test was flaky: 3 failures in 10 runs.** The cause was the test, not the game. B and C post offers simultaneously, so either can arrive second. The test always cancelled "the second offer on screen", and sometimes that was the wrong one.
  - **Fix:** cancel C's offer by its text (`Seat N offers`), not its position. After that it passed 10 runs out of 10.
- **The test does catch the race.** As a check, the offer retry in `retryContext()` was turned off on purpose (a "mutation test").
  - The test then failed every time with "Offers did not reach the active player".
  - The code was restored byte for byte, confirmed with `cmp`.
- **The full suite passed: 27 tests at that point.** No headless Edge or server processes were left running afterwards.

**Docs.** `CLAUDE.md` now explains:

- the `stage()` fixture;
- that `retryContext()` lists which commands retry automatically on a 409 (stale revision): lobby `ready` and `offer`.

**Commits**

- `2aae03b` Fix cancelling one offer clearing all; retry simultaneous offers
- `fa3163f` The staged browser tests and docs

## 2. Is the game complete?

The engine and `RULES.md` were checked against the 2025 rulebooks.

**Every rulebook section is implemented**, including:

- setup, production and supply shortages;
- the robber and discards;
- trades and ports;
- Longest Route and Largest Army;
- all development cards;
- winning at 10 points on your own turn;
- 5–6 player paired turns.

`matches.test.mjs` plays complete simulated games at every player count.

**Known caveats.** Some edge cases are "digital conventions", because the rulebooks don't say. Examples:

- whether a route may revisit a crossing;
- Road Building when fewer than 2 spots are legal;
- dev-card timing in paired turns.

Also:

- The 5–6 player number-token layout is reconstructed from the booklet's description.
- Variable boards don't simulate every possible sea-frame arrangement.
- A disconnected player pauses the game. This is deliberate: there are no bots, timers or auto-skips.

## 3. GitHub repository and automatic Docker images

**Goal.** Your home server pulls a Docker image, and every push produces a new version.

**How**

- **The repository.** `markotranda/island-table` was created with `gh`.
- **The workflow.** `.github/workflows/publish.yml` runs on every push to `main`:
  1. It runs `npm test`.
  2. Only if the tests pass, it builds the image for **amd64 and arm64** and pushes it to `ghcr.io/markotranda/island-table`. The arm64 build is so a Raspberry Pi works too.
- **Tags.** Each build gets three tags:
  - `latest`;
  - `1.0.<build number>`, an increasing version you can pin to;
  - `sha-<commit>`, so you can trace an image back to its code.
- **Compose.** `compose.yaml` now names the published image:
  - `docker compose pull` fetches the image;
  - `docker compose up --build` still builds locally.
- **Pinning and rollback.** `IMAGE_TAG` in `.env` pins a version or rolls back.

**The first CI run failed, and that exposed a real bug.** GitHub's runners are much slower than this PC. On them, a quick click on the Monopoly or Invention choice was silently ignored.

- **Cause 1: a busy flag.**
  1. The live update (SSE) usually arrives *before* the HTTP response to your own command.
  2. So the next choice appeared on screen while the client still had its `busy` flag set from the previous command.
  3. The next click was then dropped.
- **Cause 2: a double redraw.** The response also re-rendered the page a second time, replacing buttons mid-click.
- **Fix in `command()`.**
  - It still drops a *repeat* of the in-flight command, so a double-click can't buy twice.
  - A *different* command now waits its turn instead of being dropped.
  - The redundant redraw is skipped.
- **Test support.**
  - `THROTTLE=6` was added to the test browser driver. It uses CPU throttling to reproduce slow-runner timing locally.
  - The simultaneous-offer test submits both forms with `requestSubmit()`, because a layout shift can make a mouse click miss.

**Commits**

- `3d1fff5` the workflow
- `d174286` the click fix
- `6474bd5` the test robustness changes

## 4. Making the repository public

**An audit came first.**

- There were no secrets anywhere in the history.
- Commits used your GitHub noreply email.
- The rulebook PDFs had never been committed.
- But the docs named the original game, a trademark, and `PLAN.md` included your local rulebook file paths.

**Decision (yours): scrub the name and rewrite the history.**

- **Why:** a public repo that calls itself an implementation of a trademarked game is the kind of thing that attracts takedowns. The game is already branded "Island Table".
- **How:**
  1. A bundle backup of the old history was made.
  2. `git filter-branch` ran a small script on every commit, replacing six lines in `README.md`, `CLAUDE.md` and `PLAN.md`.
  3. It was verified that no commit on `main` still contains the name or the paths.
  4. The new history was force-pushed with `--force-with-lease`.
- The two old Actions runs were deleted (with your approval), because they linked to the old commits.
- Then the repo was made public.

**The image went public too.**

- You switched the package's visibility on GitHub, because the token used here has no packages permission.
- The README's login step was removed.
- It was verified with an anonymous `docker pull` using an empty Docker config. The container started and `/health` answered `{"ok":true}`.

**Commit:** `36d73fc` (README). The rewrite itself changed every earlier hash.

## 5. Choose a map, start with two players

**The problem you hit.** The "Set sail" button stayed grey. The table had been created for 4 players (the default), and only 2 had joined. Nothing told you why.

**Your decision.** No player-count dropdown. Pick a map instead:

- **Base**: 2–4 players.
- **Extended**: 2–6 players.

The host can start once at least 2 players are in and everyone is ready.

**How**

- **Engine.** A room has a `map` (`base`/`extended`, defined in `MAPS`) and a `seats` limit.
  - `count` is 0 in the lobby and is set to the number of players when the host starts.
  - All in-game rules that use `count` therefore follow who actually plays. For example, paired turns need 5 or 6 real players.
  - Board, supply and development deck come from the map.
- **Old saves.** `upgrade()` gives saves from before this change their implied map. It runs in one place, where `server.mjs` loads state.
- **Lobby hint.** A line under the button says what it's waiting for, for example "Waiting for you, Ana and Ben to get ready."
- **Rules.** `RULES.md` records the new digital conventions, since neither rulebook covers them:
  - 2-player games use the normal rules;
  - 2–4 players on the Extended map use classic turns;
  - unused fixed starting spots stay empty. The rulebook's neutral blockers remain a 5-player-only rule.
- **Tests.**
  - The player-count loops now include 2, so complete 2-player games are simulated.
  - New tests cover seat limits, start conditions and old-save upgrades.

**Commit:** `39c406a`

## 6. Redrawing the resource icons

**The problem.** The icons were Unicode characters (♠ ▰ ♧ ♜ ◆), which looked out of place.

**Process: rounds with an independent grader.**

- I drew each round as SVG.
- A script rendered a preview sheet with headless Edge: large icons, board hexes, hand cards, and small sizes on light and dark.
- A separate agent graded the sheet strictly on:
  - board-game feel;
  - shading;
  - legibility at small sizes;
  - consistency;
  - fit on the terrain colours.

**Scores:** 5.5 → 6.5 → 7 → 7.5 → **8 ("ship it")**.

**Main lessons along the way**

- **Small sizes need shapes, not detail.**
  - Thin interior lines and ground shadows vanished at 18–24px and were removed.
  - Wheat went from 5 stalks to 3.
- **Contrast on the icon's own terrain colour matters.**
  - A crisp cream outline (a halo) behind every icon fixed grey-on-grey ore and gold-on-gold wheat.
  - Ore became slate blue.
- **Silhouettes must read instantly.**
  - The desert went through a cactus, a "loaf", a "heap" and finally a low dune with wind ripples.
  - The ore's gold vein read as a lightning bolt, and then as eye sockets, before becoming two flat nuggets.

**How it's built**

- The art is generated by `scripts/icons.mjs` and inlined as an SVG sprite in `index.html`.
- **Why inline:** the server only serves a short allowlist of files, and inline symbols work both inside the board SVG and in plain HTML.
- Everything references the sprite with `<use href="#ico-wood">` or the `icon()` helper.
- To change the art, edit the script and run `node scripts/icons.mjs`.

**Commit:** `859214b`

## 7. Making it look like a board game

**Your idea.** Show screenshots to a reviewer with no context, whose taste is: the more it looks like a physical board game and the less like a video game or web app, the better.

**How the review worked**

- **The screenshots.** `scripts/review-screens.mjs` starts a throwaway server and seats 4 players through the real UI. It then stages a believable mid-game and screenshots 10 screens: home, lobby, setup, mid-game, trade offer, trade panel, supply trade, discard, phone, game over.
  - The staging uses the engine's own legality functions, so roads and buildings are placements the rules allow.
  - It also conserves the supply and the deck.
- **Checking my own staging.** The early staging had my own mistakes, for example a win at 9 points. Those were fixed before the reviewer saw anything, so it would judge the game rather than my staging.
- **The brief.** The reviewer got only a one-paragraph description of the game and its taste. It was told nothing about our concerns or the code.
- **Checking the feedback.** I verified each factual claim against the code before acting. Several were real bugs, not taste. I sorted the feedback into groups for you to choose from.

**Scores:** 4 → 6.5 → 7.5 → 8 → **8.5**.

**Group 1: clarity fixes (real bugs and confusion)**

- **Labels.** Trade and discard inputs labelled both wood and wool as "woo", because they took the first three letters. Full names now.
- **Dice.** Glyph dice were unreadable; they are now drawn dice with clear pips.
- **Discards.** The discard screen said "Mara's move" to a player who had to discard. Now it says "Discard 8 cards" to whoever owes cards, and "Waiting for discards" to everyone else.
- **Player stats.** The symbols "≡ ◇ ⚑ ~" had no labels. They became labelled icons with tooltips, and later card fans.
- **Turn badge.** The badge stayed on the winner after the game ended. It no longer does.
- **Pale pieces.** Pieces get stronger outlines, so a white player reads.

**Group 2: the board and the table**

- **Table and sea.** The play area is a wooden table. The island sits in a blue sea inside a wooden frame (the island's convex outline, pushed outward), with piers to the ports.
- **Tiles.** Tiles have a darker underside, so they look thick.
- **Pieces.** Settlements and cities are shaded wooden pieces in 3/4 view. Roads are raised bars, shortened so they don't overlap the pieces.
- **Robber.** It's a pawn standing beside the number it blocks; the number is dimmed.
- **Dice.** Two ivory dice sit on the table.
- **Building costs.** The costs became a slightly tilted reference card whose rows are the build buttons.
- **Supply.** The supply shows as card stacks, including a labelled development deck.
- **Game over.** It shows a scoreboard that splits points into buildings, awards and VP cards.
- **Tile names.** These were removed after roads kept covering them. The art names the tile, and hovering still says it.

**Group 3: cards instead of forms**

- **Your hand.** It's a fan of real cards, stacked when you hold several, with counts. Empty resources show as ghost outlines.
- **Development cards.** They are illustrated cards; the playable ones glow.
- **Picking cards.** Trades, discards and Invention are chosen by tapping cards, with "−" to take one back and a running "3 of 8 chosen".
- **Supply trades.** Choose a give card, which shows its ratio (4:1, 3:1, 2:1), and a receive card.
- **Monopoly.** A row of cards to tap.
- **Phones.** Player mats wrap into two rows instead of being cut off.

**Round 3: everything onto the table**

- **Top bar.** It's a dark wooden rail, and the connection status is a little lamp.
- **Home page.** The illustration is a framed island with wooden pieces.
- **Lobby.**
  - The island waits in its frame.
  - Seats are mats in each player's colour.
  - Your pieces lie down until you click "Stand my pieces up · I'm ready".
  - The invitation code is handwritten on a place card.
- **Player mats.** Tinted mats with face-down card fans for hand size and development cards, and played knights laid out.
- **Award tiles.** Longest Route and Largest Army are tiles that sit in the supply until someone earns them, then move onto that player's mat.
- **Right column.** Trade offers are paper slips with mini cards, the turn card has a wax seal in the active player's colour, and the log is a lined notepad.

**A real bug the review exposed.**

- Toast messages sat on top of the development cards at the bottom of the screen, and swallowed clicks for 5 seconds.
- It was found by checking which element sat at the card's centre when a test click "didn't work".
- **Fix:** toasts are click-through (`pointer-events:none`).

**Keeping tests stable through a redesign**

- Buildings carry `data-owner` (-1 for neutral) and `data-kind`, instead of tests matching fill colours.
- The card pickers keep their counts in hidden inputs with the old names (`give-*`, `want-*`, `discard-*`, `take-*`, and `give`/`want` for the supply). Tests can still set them with `fill()`.
- After each round, the full suite ran normally, and the browser tests also ran 3 times at `THROTTLE=6`.

**Commits**

- `3e5b03b` Groups 1–3
- `8e65f2c` round 3

## 8. How to do things now

| Task | How |
|---|---|
| Run all tests | `npm test` (31 tests) |
| Shake out timing bugs before pushing | `THROTTLE=6 node --test test/browser.test.mjs` |
| Publish a new version | Push to `main`; CI tests, then publishes `latest`, `1.0.N`, `sha-…` |
| Update the home server | `docker compose pull && docker compose up -d` |
| Pin or roll back | `IMAGE_TAG=1.0.N` in `.env`, then the command above |
| Back up saved games | `docker compose exec game node scripts/backup.mjs /data/backup.sqlite` |
| Change the icon art | Edit `scripts/icons.mjs`, run `node scripts/icons.mjs` |
| Screenshot every screen for a review | `node scripts/review-screens.mjs <folder>` |

**Published versions in this session**

| Version | Change |
|---|---|
| 1.0.3 | First build after the history rewrite |
| 1.0.4 | Public image (README) |
| 1.0.5 | Map choice, 2+ players |
| 1.0.6 | New icons |
| 1.0.7 | Board-game look, card hand |
| 1.0.8 | Lobby, mats and right column on the table |

## 9. Ideas not done

These came up but weren't built:

- **Tactile controls.** "End turn" as a coin you push. Trade buttons as tabs on the supply and on offer slips.
- **Card fans.** Larger fans on the player mats, sized to the hand.
- **Animation.** Cards animating out of your hand into a "give" pile when you trade.
- **Automatic updates.** Watchtower on the home server, so it updates itself after each publish instead of you running `docker compose pull`.

---

## 10. Feedback from the first game

The owner's notes after the first real game, the decisions taken, and the plan live in [`work/001-feedback-round-1.md`](work/001-feedback-round-1.md); step-by-step status, commits and gotchas are in the same file.

**Done (one commit each):**

- **History says who got what.** Events are structured; private details (stolen resource, bought card) reach only the players involved.
- **Robber** steals at once when only one player can be robbed.
- **Trading** follows the table: only the current player offers; others accept, decline or counter; the current player picks who to trade with. It lives in a panel floating over the board that opens itself for incoming offers.
- **Bigger board**, larger number tokens with the dots on their own row, icons inside the hexes.
- **Build bar** beside the hand, with costs and pieces left.
- **Dice** are the roll button (glowing, "Roll the dice"), and every roll tumbles on every screen.
- **Animations:** producing tiles flash and cards fly to their owners; stolen cards fly face-down for onlookers.
- **Win banner** over the whole screen with confetti and a synthesized fanfare; dice rattle; mute toggle.

**Confirmed, no change:** the extended map also plays to 10 points (5-6 rulebook).

## 11. Feedback from the third game

Plan and decisions: `docs/work/003-feedback-round-3.md`.

- **Lobby settings.** The create form asks only for a name. The host sets the map, island setup, points to win (5–20), discard limit (7–12) and the friendly robber in the lobby, and can change them until setting sail; a change asks the others to ready up again.
- **Starting roll.** Everyone taps their own dice at once; the highest total starts and only tied players roll again.
- **Discards.** A red edge and an "Over 7" note on your hand when a 7 would cost you cards; a full-screen window when you must discard.
- **Fixes.** History lines wrap instead of scrolling sideways and the list keeps its scroll through updates; the trade panel no longer replays its entrance on every update; tooltips only follow a moving pointer; building tooltips say what they produce (and are hoverable at all, which they weren't).
- **A test flake explained.** The occasional failure in the trades/development-cards browser test was the robber's 3-second pulse from the previous player's 7 being counted as a road pulse.

## 12. Bots

Plan: [`work/004-bots.md`](work/004-bots.md), reviewed by a second agent over three rounds before any code (plan and progress).

- **Bot seats.** The host clicks an open lobby seat to add a bot ("Ana (Bot)", never a name already at the table) and × to remove it. Bots are always ready and come back for a rematch.
- **Stand-ins.** When a player drops out, anyone can let a bot play their seat; the game does it by itself after a minute if it is waiting on them and someone else is still connected. Their name reads "Name (Bot)" meanwhile; reconnecting or acting gives the seat back at once.
- **Fair play.** A bot decides only from its own seat's view. A test changes everyone else's hidden cards and the deck and checks the bot's choice stays the same.
- **Average strength.** One build ahead, a bit of chance in its picks, one simple 1-for-1 offer on about half its turns, accepts trades that help it (not from someone about to win), spends down big hands. Against the simple scripted test player two bots win about 80% of four-player games; all-bot four-player games last about 16–19 rounds.
- **Pacing.** About a second per bot move so people can follow; `BOT_PACE` speeds it up for tests.
- **Found on the way.** Leaving a game mid-animation threw errors from card flights still in the air (fixed). Headless Edge keeps a page's live stream open after navigating to a blank page, so the browser test leaves through the Home button.

## 13. The starting roll stays up

Plan: [`work/007-starting-roll-hold.md`](work/007-starting-roll-hold.md).

- **Who rolled what.** The starting-roll card used to vanish the moment the last player rolled, before anyone saw that roll. Now it stays 3 seconds ("Seat 2 goes first!"), then fades; the first player can already place or roll underneath it. A tie stays up 3 seconds too ("Tie at 8!") before the tied players get their dice back.

## 14. Open tables

Plan: [`work/008-open-tables.md`](work/008-open-tables.md), reviewed by a second agent (approved, eleven small notes folded in).

- **Find a game.** The Join tab lists open tables: public lobbies with a free seat and someone in them, with the host's name, seats, map and points. Join uses the name you typed; tables you already sit at offer Resume.
- **Public or private.** New tables are public; the host switches Visibility in the lobby without making anyone ready up again. Tables from before stay private.
- **Kicking.** The host removes anyone from the lobby with the × on their seat; they land on the home screen with a message. In a game, a bot standing in still covers people who leave.
- **Cleanup.** A lobby nobody has had open for an hour is deleted with its seats. Games under way and finished games are kept.
