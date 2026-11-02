# Rules reference and digital conventions

Gameplay source of truth: the two user-supplied 2025 PDFs. They are not bundled with the application. The engine's saved rules identifier is `2025-v1`.

| Rule | Source | Implementation and validation |
| --- | --- | --- |
| Components and limits | Base p. 3; extension p. 1 | Exact resource/development supplies and terrain counts; graph/inventory tests |
| Fixed starting positions and resources | Base pp. 4-5; extension p. 2 | Diagram-based terrain, number, settlement, road and port presets; all-count fixed setup tests |
| Variable setup | Base pp. 11-12; extension p. 4 | Random terrain, counterclockwise number sequence skipping deserts, forward/reverse settlement placement |
| Production and supply shortages | Base p. 6 | Simultaneous claims per resource; partial allocation only when a single player is affected |
| Seven and robber | Base p. 6 | Exact discards, robber move, random resource theft, production blocking |
| Player/bank/port trades | Base p. 7 | Active-player participation, no gifts or same-resource exchanges; 4:1 / 3:1 / 2:1 |
| Roads, settlements and Longest Route | Base p. 8 | Connectivity, distance, opponent barriers, piece limits, longest edge trail |
| Cities and development cards | Base p. 9 | Upgrade costs/limits; Knight, Invention, Monopoly, Road Building, VP; purchase/play timing |
| Largest Army and victory | Base pp. 9-10 | Thresholds, ties, immediate victory only during own turn |
| Paired-player turns | Extension p. 3 | P1 production/actions, P2 actions, rotate markers; P2 has no player trades |
| Fixed five-player setup | Extension p. 2 | Random color assignment including one unused color, whose settlements remain without roads |

## Explicit digital conventions

The source booklets are concise. The following conventions make incomplete edge cases executable:

- Tied starting dice rolls are rerolled among the tied players.
- A continuous route may revisit a vertex but cannot reuse a road. Opposing and neutral settlements stop traversal through their vertices; routes may end at them. The current award holder keeps a tied maximum; if they lose eligibility and others tie, the award becomes unclaimed.
- Road Building places as many legal roads as possible, up to two; it finishes automatically if no piece or legal location remains.
- Invention takes all remaining resource cards if fewer than two exist in the supply.
- Robbery targets only opponents with a resource card. If there are none adjacent, movement completes without theft. Neutral buildings have no hand and cannot be robbed.
- For two-desert islands, the robber starts on the first desert in top-to-bottom, left-to-right board order.
- A personal action opportunity is the unit of development-card aging. A card purchased as P2 becomes eligible during that player's next P1 opportunity, and vice versa. VP cards automatically reveal on a winning turn.
- Variable boards randomize terrain and rotate the coastal port pattern while preserving its spacing. They do not simulate every possible permutation of physical sea-frame pieces. Number tokens follow the fixed alphabetic sequence from a corner around successive counterclockwise rings, never unrestricted number shuffling.
- Fixed layouts use the source diagrams; artwork and terrain illustrations are original simplified graphics. Board presets are data and can be corrected without changing the engine. The extension's number-to-letter mapping is encoded in `LARGE_NUMBERS`; the booklet describes letter order but does not print a complete mapping table.
- Inactive colors in fixed five-player games are neutral obstacles and receive no production or awards.
- A disconnected player retains their seat and required decisions. The application does not invent a move, discard, or forfeit for them.

There is no special building phase from older editions and no rule that allows Player 2 to trade with players.
