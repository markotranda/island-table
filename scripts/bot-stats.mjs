// Plays many seeded games and prints how bots do, for tuning their strength: node scripts/bot-stats.mjs [games]
// All-bot tables show game length; mixed tables (bots against the simple scripted test player) show the win share.
import {play,bot,scripted} from '../test/sim.mjs';
const games=Number(process.argv[2]||30),median=a=>a.toSorted((x,y)=>x-y)[Math.floor(a.length/2)];
for(const count of [2,3,4,5,6]){const turns=[],seats=Array(count).fill(0);let trades=0,offers=0;
  for(let seed=1;seed<=games;seed++){const {g}=play({count,seed,players:Array(count).fill(bot)});turns.push(g.turn);seats[g.winner]++;trades+=g.events.filter(e=>e.kind==='trade').length;offers+=g.events.filter(e=>e.kind==='offer').length;}
  console.log(`${count} bots: median ${median(turns)} turns (${Math.min(...turns)}-${Math.max(...turns)}), wins by seat ${seats.join('/')}, offers/trades in the last 400 events per game ${(offers/games).toFixed(1)}/${(trades/games).toFixed(1)}`);}
let wins=0;for(let seed=1;seed<=games;seed++){const seats=seed%2?[bot,scripted,bot,scripted]:[scripted,bot,scripted,bot],{g}=play({count:4,seed,players:seats});if(seats[g.winner]===bot)wins++;}
console.log(`2 bots vs 2 scripted players: bots win ${wins} of ${games} (${Math.round(wins/games*100)}%)`);
