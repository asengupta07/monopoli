import test from 'node:test';
import assert from 'node:assert/strict';

import { createRoom, addPlayer, startGame, rollDice, rematch, serialize, updateSettings } from '../lib/gameEngine';
import { applySandbox } from '../lib/sandbox';
import {
  emptyStats, formatDuration, mostVisitedTile, playerNetWorth, turnsSurvived,
} from '../lib/stats';
import type { Player, Room } from '../types/game';

function lab(): { room: Room; ana: Player; ben: Player } {
  const room = createRoom(new Set(), 'sandbox');
  const ana = addPlayer(room, { name: 'Ana' }).player!;
  const ben = addPlayer(room, { name: 'Ben' }).player!;
  return { room, ana, ben };
}

function play(room: Room, hostId: string) {
  const settings = updateSettings(room, hostId, { randomizeOrder: false });
  if (settings.error) throw new Error(settings.error);
  const started = startGame(room, hostId);
  if (started.error) throw new Error(started.error);
}

test('a fresh room has empty recap stats', () => {
  const room = createRoom(new Set(), 'testid');
  assert.deepEqual(room.stats, emptyStats());
});

test('starting a match stamps the clock and a worth sample at turn 0', () => {
  const { room, ana } = lab();
  play(room, ana.id);
  assert.ok(room.stats.startedAt > 0);
  assert.equal(room.stats.turns, 0);
  assert.equal(room.stats.worth[0]?.values[ana.id], room.settings.startingCash);
});

test('a roll counts a turn, a visit and a worth sample', () => {
  const { room, ana } = lab();
  play(room, ana.id);
  assert.equal(rollDice(room, ana.id, [2, 3]).error, undefined);
  assert.equal(room.stats.turns, 1);
  assert.equal(room.stats.doubles, 0);
  assert.equal(room.stats.tileVisits[5], 1, '2+3 from START lands on TLV Airport');
  assert.ok(room.stats.worth.some((s) => s.turn === 1));
});

test('doubles are counted on the recap', () => {
  const { room, ana } = lab();
  play(room, ana.id);
  assert.equal(rollDice(room, ana.id, [4, 4]).error, undefined);
  assert.equal(room.stats.doubles, 1);
});

test('going to prison records a visit against that player', () => {
  const { room, ana } = lab();
  applySandbox(room, { op: 'start' });
  applySandbox(room, { op: 'jail', playerId: ana.id, inPrison: true });
  assert.equal(room.stats.prisonVisits[ana.id], 1);
});

test('net worth includes an owned city', () => {
  const { room, ana } = lab();
  applySandbox(room, { op: 'grant', playerId: ana.id, tileIndex: 9 });
  assert.equal(playerNetWorth(room, ana.id), ana.cash + 120);
});

test('the snapshot carries stats to the client', () => {
  const { room, ana } = lab();
  play(room, ana.id);
  const snap = serialize(room);
  assert.ok(snap.stats);
  assert.equal(snap.stats.turns, 0);
});

test('bankruptcy records the turn a player dropped out', () => {
  const { room, ana, ben } = lab();
  play(room, ana.id);
  assert.equal(rollDice(room, ana.id, [2, 3]).error, undefined);
  assert.equal(applySandbox(room, { op: 'bankrupt', playerId: ben.id }).error, undefined);
  assert.equal(room.stats.outAt[ben.id], 1);
  assert.equal(room.stats.outAt[ana.id], undefined);
});

test('a lab endGame finalises the recap and rematch returns to the lobby', () => {
  const { room, ana, ben } = lab();
  applySandbox(room, { op: 'endGame', winnerId: ana.id });
  assert.equal(room.phase, 'ended');
  assert.ok(room.stats.endedAt);
  assert.equal(turnsSurvived(room.stats, ana, ana.id), room.stats.turns);

  const result = rematch(room, ana.id);
  assert.equal(result.error, undefined);
  assert.equal(room.phase, 'lobby');
  assert.equal(room.winner, null);
  assert.equal(ben.alive, true);
  assert.equal(room.stats.startedAt, 0);
});

test('only the host may call rematch', () => {
  const { room, ana, ben } = lab();
  applySandbox(room, { op: 'endGame', winnerId: ana.id });
  assert.equal(rematch(room, ben.id).error, 'Only the host can start another game');
});

test('duration copy stays compact', () => {
  assert.equal(formatDuration(5_000), '5s');
  assert.equal(formatDuration(90_000), '1m 30s');
  assert.equal(formatDuration(3_700_000), '1h 1m');
});

test('the most visited ownable tile wins the highlight', () => {
  const stats = emptyStats();
  stats.tileVisits[0] = 9; // START, a corner
  stats.tileVisits[9] = 4; // Jerusalem
  const best = mostVisitedTile(stats);
  assert.equal(best?.index, 9);
});
