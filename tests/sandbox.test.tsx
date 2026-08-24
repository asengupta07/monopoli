import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';

import { createRoom, addPlayer, startGame, getPlayer, serialize } from '../lib/gameEngine';
import { applySandbox } from '../lib/sandbox';
import { isSandboxRoomId } from '../lib/protocol';
import { HOTEL_LEVEL } from '../lib/rules';
import SandboxPanel from '../components/SandboxPanel';
import type { Room } from '../types/game';
import type { SandboxCommand } from '../lib/protocol';

function lab(names = ['Ana']): { room: Room; playerId: string } {
  const room = createRoom(new Set(), 'sandbox');
  assert.equal(room.sandbox, true);
  const seated = names.map((name) => {
    const { player, error } = addPlayer(room, { name });
    assert.ok(player, error);
    return player;
  });
  return { room, playerId: seated[0].id };
}

test('sandbox and lab-prefixed codes are reserved for the UI lab', () => {
  assert.equal(isSandboxRoomId('sandbox'), true);
  assert.equal(isSandboxRoomId('lab9k2'), true);
  assert.equal(isSandboxRoomId('lobby'), false);
  assert.equal(createRoom(new Set(), 'testid').sandbox, false);
});

test('cheats are refused in a real game', () => {
  const room = createRoom(new Set(), 'real');
  addPlayer(room, { name: 'Ana' });
  addPlayer(room, { name: 'Ben' });
  assert.equal(applySandbox(room, { op: 'start' }).error, 'Not a lab room');
});

test('a lab can start with one player and does not instantly declare a winner', () => {
  const { room, playerId } = lab();
  assert.equal(startGame(room, playerId).error, undefined);
  assert.equal(room.phase, 'playing');
  assert.equal(room.winner, null);
});

test('a dummy can be seated after the match has started', () => {
  const { room, playerId } = lab();
  startGame(room, playerId);
  assert.equal(applySandbox(room, { op: 'addDummy', name: 'Ada' }).error, undefined);
  const ada = room.players.find((p) => p.name === 'Ada');
  assert.ok(ada?.dummy);
  assert.ok(room.order.includes(ada.id));
});

test('grant, houses and a hotel paint a city without paying', () => {
  const { room, playerId } = lab();
  assert.equal(applySandbox(room, { op: 'grant', playerId, tileIndex: 9 }).error, undefined);
  assert.equal(room.ownership[9]?.ownerId, playerId);
  assert.equal(applySandbox(room, { op: 'setHouses', tileIndex: 9, houses: HOTEL_LEVEL }).error, undefined);
  assert.equal(room.ownership[9].houses, HOTEL_LEVEL);
  assert.equal(room.phase, 'playing');
});

test('granting a colour set hands over every city in it', () => {
  const { room, playerId } = lab();
  assert.equal(applySandbox(room, { op: 'grantGroup', playerId, group: 'israel' }).error, undefined);
  assert.equal(room.ownership[6]?.ownerId, playerId);
  assert.equal(room.ownership[7]?.ownerId, playerId);
  assert.equal(room.ownership[9]?.ownerId, playerId);
});

test('offerBuy opens the purchase prompt on the chosen tile', () => {
  const { room, playerId } = lab();
  assert.equal(applySandbox(room, { op: 'offerBuy', playerId, tileIndex: 9 }).error, undefined);
  assert.equal(room.pending?.type, 'buy');
  if (room.pending?.type === 'buy') {
    assert.equal(room.pending.tileIndex, 9);
    assert.equal(room.pending.playerId, playerId);
  }
  assert.equal(getPlayer(room, playerId)?.pos, 9);
});

test('openAuction starts a live auction even with one seated player', () => {
  const { room } = lab();
  applySandbox(room, { op: 'addDummy', name: 'Ada' });
  assert.equal(applySandbox(room, { op: 'openAuction', tileIndex: 3 }).error, undefined);
  assert.equal(room.pending?.type, 'auction');
  if (room.pending?.type === 'auction') {
    assert.equal(room.pending.tileIndex, 3);
    assert.ok(room.pending.participants.length >= 2);
  }
});

test('teleporting does not collect a START bonus', () => {
  const { room, playerId } = lab();
  applySandbox(room, { op: 'start' });
  const player = getPlayer(room, playerId)!;
  player.pos = 35;
  const cash = player.cash;
  applySandbox(room, { op: 'setPos', playerId, pos: 2 });
  assert.equal(player.pos, 2);
  assert.equal(player.cash, cash);
});

test('cash, jail, dice and the vacation pot can be forced', () => {
  const { room, playerId } = lab();
  applySandbox(room, { op: 'setCash', playerId, cash: 42 });
  assert.equal(getPlayer(room, playerId)?.cash, 42);
  applySandbox(room, { op: 'jail', playerId, inPrison: true });
  assert.equal(getPlayer(room, playerId)?.inPrison, true);
  assert.equal(getPlayer(room, playerId)?.pos, 10);
  applySandbox(room, { op: 'setDice', d1: 6, d2: 1 });
  assert.deepEqual(room.dice, [6, 1]);
  applySandbox(room, { op: 'setPot', amount: 500 });
  assert.equal(room.vacationPot, 500);
});

test('reset drops dummies and ownership but keeps the human seat', () => {
  const { room, playerId } = lab();
  applySandbox(room, { op: 'addDummy' });
  applySandbox(room, { op: 'grant', playerId, tileIndex: 1 });
  applySandbox(room, { op: 'reset' });
  assert.equal(room.phase, 'lobby');
  assert.equal(room.players.length, 1);
  assert.equal(room.players[0].id, playerId);
  assert.equal(Object.keys(room.ownership).length, 0);
});

test('a forced walk uses the faces it was given', () => {
  const { room, playerId } = lab();
  applySandbox(room, { op: 'addDummy' });
  applySandbox(room, { op: 'start' });
  applySandbox(room, { op: 'setTurn', playerId });
  const before = getPlayer(room, playerId)!.pos;
  assert.equal(applySandbox(room, { op: 'forceRoll', d1: 2, d2: 3 }).error, undefined);
  assert.deepEqual(room.dice, [2, 3]);
  assert.equal(getPlayer(room, playerId)!.pos, (before + 5) % 40);
});

test('the lab panel lists the match and property controls', () => {
  const { room, playerId } = lab();
  applySandbox(room, { op: 'start' });
  const sent: SandboxCommand[] = [];
  const html = renderToStaticMarkup(
    <SandboxPanel
      state={serialize(room)}
      me={getPlayer(room, playerId)}
      send={(cmd) => { sent.push(cmd); }}
      selectedTile={9}
      onSelectTile={() => {}}
    />,
  );
  assert.ok(html.includes('UI lab'));
  assert.ok(html.includes('Dummy'));
  assert.ok(html.includes('Grant'));
  assert.ok(html.includes('Jerusalem'));
});
