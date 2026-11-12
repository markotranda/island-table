# 021: The lobby is wider than the window at tablet widths

**Status:** questions · **Commits:** —

## Feedback
2026-11-12, found while measuring item 020 (not owner feedback): at a 700×900 viewport (mobile emulation) the lobby is laid out at 743px, so it scrolls sideways. Before item 020 it was 792px; item 020's top bar rule (labels become icons at 621–1000px) narrowed it.

## Current state
Not investigated yet. Suspects: the top bar's right side and the place card at 621–767px. The existing phone test only covers 375px.

## Open questions
- Is this worth fixing before a real tablet shows it? (Claude can just fix it: it's a layout bug.)

## Next step / Handoff prompt
Read CLAUDE.md, this file and item 020. Measure `document.documentElement.scrollWidth` on the home page and lobby at 621–850px wide, find the element sticking out, fix it, and extend the phone-width browser test with a 700px case.
