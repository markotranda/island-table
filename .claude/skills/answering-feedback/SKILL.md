---
name: answering-feedback
description: Turn the owner's feedback (play-test notes, bug reports, feature wishes, "this feels wrong") into a questioned, written, reviewed plan and then a verified implementation, tracked as work items in docs/work/. Use whenever the owner gives feedback or asks to continue an open work item.
---

# Answering feedback

The owner gives feedback; you turn it into finished, verified work without losing anything between sessions. Everything lives in a **work item**: one file `docs/work/NNN-slug.md`, listed in `docs/work/README.md`. A new session with no context must be able to continue from `CLAUDE.md` + the index + the item file alone.

Continuing existing work? Open `docs/work/README.md`, pick the item, read its file (above all "Next step" / "Handoff prompt"), and pick up at the phase it is in.

## 1. Understand

- Split the feedback into separate points and number them. Keep the owner's own words (quote them in the item).
- For each point, find the current state **before** asking anything: read the code, `RULES.md`, the tests, earlier work items (`docs/work/`, `git log`); reproduce it if it is a bug (tests, the dev server, `node scripts/review-screens.mjs <dir>` for screenshots). Do not ask what the repo can answer.
- Record what you found: file:line references, what happens now, a screenshot if it helps.

## 2. Assess

For every point, decide and write down:

- **Does it make sense?** Is it a bug, a wish, or a misunderstanding of the rules? Check the 2025 rulebook extracts (`tmp/pdfs/*.pdf.txt`) when rules are involved. Say so plainly if you disagree, and why.
- **Conflicts:** with `CLAUDE.md` constraints (no dependencies, server-authoritative, no leaks through `view()`, no older-edition rules), with `RULES.md` conventions, with earlier decisions in other work items.
- **Missing information:** what exactly should happen, where, on which screens (desktop, phone), for whom (active player, others, bots), in which phases, with old saves.
- **Size:** how many steps, which files, which tests. Can one session do it?

## 3. Question until nothing is open

- Ask with `AskUserQuestion`, up to 4 questions per round. Each question stands on its own (it says what you found), and comes with concrete options and your recommendation first, marked "(Recommended)". Use previews for layouts or code.
- Ask only what is the owner's to decide (behaviour, look, priorities, trade-offs). Settle the rest yourself and write the choice down as a decision.
- After each round, add the answers to the item and check again: did an answer raise new questions? Keep going until the "Open questions" list is empty. No round limit, but don't pad: zero questions is fine when everything is clear.

## 4. Write the plan

Create the item (next free number, short kebab slug) from the template below and add it to the index. The plan holds:

- the feedback table (point → decision), including points you decided **not** to do and why;
- design per area (engine, bot, server, client, tests, docs) with function names and `data-*` hooks;
- numbered steps, **one commit each**, each leaving `npm test` passing, each with its own tests;
- what verification proves it works (tests that fail without the change, browser checks, screenshots, `THROTTLE=6`);
- docs to update: `RULES.md` (digital conventions), `CLAUDE.md` (commands, hooks, architecture), README / How to play.

**Too big for one session?** (Rough guide: more than ~6 steps, or touching engine + server + client heavily.) Split it into several work items, each a coherent, shippable slice that can be done in one session. The first item holds the overall plan; the others link back to it and say what they depend on. Note the split in every one of them.

## 5. Review by another agent (up to 3 rounds)

Start a **fresh** reviewer with the `Agent` tool (`subagent_type: "general-purpose"`, not a fork, so it isn't anchored on your reasoning). Prompt:

> You review an implementation plan for Island Table, a dependency-free Node.js browser board game. Read `CLAUDE.md`, `RULES.md` and the plan in `docs/work/<file>.md`, and check it against the code it touches. Look for: rule or logic errors, missed cases (phases, paired turns 5–6 players, bots, old saves, phone layout, simultaneous actions, reconnects), information leaks through `view()`, conflicts with `CLAUDE.md`, steps that aren't independently committable or testable, missing tests or docs, and over-engineering. Reply with numbered findings, each marked **blocking** or **minor**, then a verdict: APPROVE or REVISE. Do not edit any files.

After each round: fix the plan for every finding you accept, write the ones you reject with a reason under "Review" in the item, and start the next round with `SendMessage` to the same agent ("plan updated, here is what changed: …"). Stop when the verdict is APPROVE or after round 3. A blocking finding you can't resolve yourself goes to the owner as a question (back to phase 3).

Then show the owner the final plan in short (decisions, steps, what the review changed) and **start right away**. The owner may interrupt.

## 6. Implement and verify

- Do the steps in order. After each step: `npm test` passes, commit (one commit per step), then update the item: what was done, the commit hash, surprises and gotchas, what's next.
- Verify for real: tests that fail without the change, browser tests for UI (selectors on `data-ui`/`data-command`…), screenshots via `scripts/review-screens.mjs` for visual changes (send them to the owner), `THROTTLE=6 npm test` before the last commit.
- Say what was **not** verified (e.g. sound by ear, a real phone). Those go into the item's "Not verified" list, and into an open item if the owner has to check them.
- Check session usage after each step if a usage tool is available (e.g. `mcp__ccd_session_mgmt__get_usage`). If the 5-hour limit, weekly limit or context is **over 85%**, park: commit what's finished, set the status to `parked`, write the handoff prompt in the item, update the index, and stop.

## 7. Close

- Status `done` in the item and the index; leftovers (not done, not verified, ideas that came up) become new open items, so nothing lives only in a log.
- Update `CLAUDE.md` / `RULES.md` / README if commands, hooks, rules or architecture changed. Append a short section to `docs/project-log.md` (the story of the project, for humans). The repo is public: before committing docs, check them for machine- or account-specific details (logins, which account is active, local paths, tokens) and keep those in memory instead.
- **Refine this skill.** If something in the process went wrong or was clumsy (a question you should have asked, a review that missed something, a step too big), improve this file and say in one line what you changed.

## Work item template

```markdown
# NNN: <title>

**Status:** questions | planned | in review | in progress | parked | waiting on owner | done · **Commits:** … · **Depends on:** NNN (if any)

## Feedback
Owner's words, numbered, with the date.

## Current state
What the code does now, with file:line references; reproduction.

## Open questions
- (empty when planning can start)

## Decisions
| # | Feedback | Decision | Why |

## Plan
Design per area, then numbered steps (one commit each) with tests and verification.

## Review
Round 1: findings → accepted / rejected (reason). Round 2 … Verdict.

## Progress
| Step | State | Commit | Notes |
Log: date, step, what was done, gotchas.

## Not verified

## Next step / Handoff prompt
A self-contained prompt a fresh session can follow ("Read CLAUDE.md, then this file; step N is next; …").
```

## Index format (`docs/work/README.md`)

Open items first, then done ones: `| # | Item | Status | Next step |`, with a link to each file. Update it whenever an item's status changes.
