import test from 'node:test';
import assert from 'node:assert/strict';
import {R} from '../lib/engine.mjs';
import {play,scripted} from './sim.mjs';

// Test-only players exercise actual commands; no resource grants or state edits. play() round-trips the state through JSON as a save would.
for(const count of [2,3,4,5,6])test(`${count} players complete an entire saved-and-restored game`,()=>{
  const {g,commands}=play({count,seed:143+count,players:Array(count).fill(scripted),limit:15000,check:g=>{for(const r of R){assert.equal(g.bank[r]+g.players.reduce((s,pl)=>s+pl.hand[r],0),count>4?24:19);assert.ok(g.bank[r]>=0);}}});
  assert.equal(g.phase,'finished',`${count} players did not finish after ${commands} actions, turn ${g.turn}`);assert.ok(g.winner>=0);assert.ok(g.turn>10);
});
