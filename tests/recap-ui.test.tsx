import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { SurvivalBoard } from '../components/GameOver';
import { DEFAULT_SETTINGS } from '../lib/rules';
import { emptyStats } from '../lib/stats';
import type { Player, RoomState } from '../types/game';

function player(id: string, name: string, color: string): Player {
  return {
    id, name, color, cash: 1500, pos: 0,
    inPrison: false, jailTurns: 0, alive: true, connected: true,
  };
}

const ana = player('a', 'Ana', '#e6b455');
const ben = player('b', 'Ben', '#e35b5b');

function endedState(): RoomState {
  const stats = emptyStats();
  stats.startedAt = Date.now() - 90_000;
  stats.endedAt = Date.now();
  stats.turns = 12;
  stats.outAt = { b: 7 };
  return {
    id: 'test',
    phase: 'ended',
    hostId: ana.id,
    settings: DEFAULT_SETTINGS,
    players: [ana, ben],
    order: [ana.id, ben.id],
    currentPlayerId: null,
    dice: [2, 3],
    pending: null,
    ownership: {},
    vacationPot: 0,
    winner: ana.id,
    log: [],
    chat: [],
    trades: [],
    composing: [],
    stats,
  };
}

test('the survival board ranks the winner first and names the rest by turns', () => {
  const html = renderToStaticMarkup(
    <SurvivalBoard state={endedState()} onViewAll={() => {}} />,
  );
  assert.ok(html.includes('Game statistics'));
  assert.ok(html.includes('winner'));
  assert.ok(html.includes('Ana'));
  assert.ok(html.includes('Ben'));
  assert.ok(html.includes('7'), 'Ben dropped out on turn 7');
  assert.ok(html.includes('View all statistics'));
});
