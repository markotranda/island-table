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
| Fixed five-player setup | Extension p. 2 | Random assignment of starting spots including one unused spot, whose settlements remain without roads (see the colors convention below) |

## Explicit digital conventions

The source booklets are concise. The following conventions make incomplete edge cases executable:

- Players choose a map, not a player count. Base (19 hexes, 19-card supply, 25-card deck) seats 2-4; Extended (30 hexes, 24-card supply, 34-card deck) seats 2-6. The host starts once at least two players have joined and all are ready, and the number of players is fixed at that moment.
- The host sets the table in the lobby and can change it until setting sail: map, island setup, points to win (5-20, default 10 as in the rulebook), the discard limit (a 7 makes players holding more than 7-12 cards discard half, default 7) and the friendly robber. Any change asks the other players to ready up again. A rematch keeps the settings.
- Each person chooses their own color in the lobby; a color is held by one player at a time. A bot gives up its color at once and takes the one you left; a person is asked and can accept (you swap) or decline. A request ends if either color changes, either player leaves or the game starts, and it doesn't hold up the start. Changing color asks nobody to ready up again, and a rematch keeps everyone's color. Colors are looks only: a seat's starting spot on a fixed island doesn't depend on its color. The rulebook's five-player draw of colors decides who gets which spot, so here the spots are drawn at random and chosen colors stay.
- Friendly robber (house rule, off by default): a player whose public score is 2 points or fewer cannot be robbed. The robber may still be moved next to them and still blocks the hex; they are simply not eligible victims.
- Neither rulebook covers two players. A two-player game uses the normal rules unchanged, with no special variant.
- On the Extended map, paired-player turns apply only with 5 or 6 players; with 2-4, turns are classic. In a fixed Extended setup with 2-4 players, the unused starting positions stay empty; the rulebook's neutral blockers apply only to the five-player game.
- Every player rolls their own dice for the first turn, all at the same time and in any order. Once everyone still in contention has rolled, the highest total starts; tied players (only they) roll again. Fixed islands place their starting pieces once the first player is known.
- A continuous route may revisit a vertex but cannot reuse a road. Opposing and neutral settlements stop traversal through their vertices; routes may end at them. The current award holder keeps a tied maximum; if they lose eligibility and others tie, the award becomes unclaimed.
- Road Building places as many legal roads as possible, up to two; it finishes automatically if no piece or legal location remains.
- Invention takes all remaining resource cards if fewer than two exist in the supply.
- Robbery targets only opponents with a resource card. If there are none adjacent, movement completes without theft. Neutral buildings have no hand and cannot be robbed. With exactly one eligible opponent the steal happens at once, without asking the robber's owner to pick.
- Player trades follow the base rule that every trade involves the current player: only the current player starts an offer. Other players answer it by accepting, declining, or posting a counteroffer addressed to the current player (the rulebook's "make counteroffers"). Accepting only marks a player as willing and can be withdrawn; the current player then confirms the trade with one of the players who accepted, or completes a counteroffer by accepting it. Resources are checked again when the trade completes, and completing any trade clears all open offers. An offer every other player has declined leaves the table at once; a player who only countered has not declined, and counters stay when their offer goes.
- The game history is public in the same way the physical table is: rolls and who produced what, discards, robber moves, played cards and Monopoly takings, offers and completed trades, supply trades, buildings and awards. Two details are private: the resource taken in a theft (seen by the thief and the victim) and the type of a bought development card (seen by the buyer).
- For two-desert islands, the robber starts on the first desert in top-to-bottom, left-to-right board order.
- A personal action opportunity is the unit of development-card aging. A card purchased as P2 becomes eligible during that player's next P1 opportunity, and vice versa. VP cards automatically reveal on a winning turn.
- Variable boards randomize terrain and rotate the coastal port pattern while preserving its spacing. They do not simulate every possible permutation of physical sea-frame pieces. Number tokens follow the fixed alphabetic sequence from a corner around successive counterclockwise rings, never unrestricted number shuffling.
- Fixed layouts use the source diagrams; artwork and terrain illustrations are original simplified graphics. Board presets are data and can be corrected without changing the engine. The extension's number-to-letter mapping is encoded in `LARGE_NUMBERS`; the booklet describes letter order but does not print a complete mapping table.
- The unused starting spot's settlements in fixed five-player games are neutral grey obstacles and receive no production or awards.
- Bots: the host can fill empty lobby seats with bots, named with an ordinary first name and "(Bot)". A bot decides only from its own seat's view (what a human at that seat could see) and plays like an average player. When a bot offers a trade it waits until every other player has accepted, declined or countered, or for 20 seconds, before it chooses; that wait is only the bot's own patience and never makes a move for anyone.
- A disconnected player keeps their seat. A bot plays it only while they are away: when a connected player hands it over, or automatically once they have been offline for 60 seconds while the game waits on them (their turn, a discard, or the starting roll) and at least one other player is connected. Their name shows "(Bot)" meanwhile. The seat returns the moment they reconnect or act. Nothing else is decided for absent players: no skipped turns and no forfeits.

There is no special building phase from older editions and no rule that allows Player 2 to trade with players.
