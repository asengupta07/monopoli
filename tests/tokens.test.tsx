import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import TokenLayer from '../components/TokenLayer';
import { tileCentre } from '../lib/geometry';
import type { Player } from '../types/game';

function player(overrides: Partial<Player> = {}): Player {
  return {
    id: 'p1',
    name: 'Ana',
    color: '#5bd67a',
    cash: 1500,
    pos: 0,
    inPrison: false,
    jailTurns: 0,
    alive: true,
    connected: true,
    ...overrides,
  };
}

/** The piece itself — not `token-layer`, `token-body` or `token-shadow`. */
const TOKEN_CLASS = /class="token(?![-\w])[^"]*"/g;

const render = (players: Player[], currentPlayerId: string | null = null) =>
  renderToStaticMarkup(
    <TokenLayer players={players} myId="p1" currentPlayerId={currentPlayerId} />,
  );

// Regression: tokens used to be measured from the DOM, so nothing rendered
// until a layout pass produced a non-zero board — which left the pieces
// invisible on the starting square.
test('pieces render on the very first paint, with no measurement', () => {
  const html = render([player()]);
  const tokens = html.match(TOKEN_CLASS) ?? [];
  assert.equal(tokens.length, 1, 'exactly one piece for one player');
  assert.ok(html.includes('token-body'), 'the piece has a body');
  assert.ok(html.includes('token-shadow'), 'the piece has a contact shadow');
});

test('a piece is placed at the centre of the tile it occupies', () => {
  const html = render([player({ pos: 0 })]);
  const centre = tileCentre(0);
  assert.ok(html.includes(`left:${centre.x}%`), `expected left:${centre.x}%`);
  assert.ok(html.includes(`top:${centre.y}%`), `expected top:${centre.y}%`);
});

test('each player carries their own colour', () => {
  const html = render([
    player({ id: 'p1', color: '#5bd67a' }),
    player({ id: 'p2', name: 'Ben', color: '#e35b5b' }),
  ]);
  assert.ok(html.includes('--tone:#5bd67a'));
  assert.ok(html.includes('--tone:#e35b5b'));
});

test('pieces sharing a tile are offset so both stay visible', () => {
  const html = render([
    player({ id: 'p1', pos: 0 }),
    player({ id: 'p2', name: 'Ben', pos: 0 }),
  ]);
  const lefts = [...html.matchAll(/left:([-\d.]+)%/g)].map((m) => Number(m[1]));
  assert.equal(lefts.length, 2);
  assert.notEqual(lefts[0], lefts[1], 'two pieces on one tile must not overlap exactly');
});

test('only the player on turn gets the active marker', () => {
  const html = render(
    [player({ id: 'p1' }), player({ id: 'p2', name: 'Ben' })],
    'p2',
  );
  assert.equal((html.match(/\bactive\b/g) ?? []).length, 1);
});

test('a piece on the top row looks right, the way it will walk', () => {
  const html = render([player({ pos: 9 })]);
  assert.ok(html.includes('face-right'));
});

test('a piece on the right column looks down the track', () => {
  const html = render([player({ pos: 15 })]);
  assert.ok(html.includes('face-down'));
});

test('the current player is marked as mine and eliminated players are dropped', () => {
  const html = render([
    player({ id: 'p1' }),
    player({ id: 'p2', name: 'Ben', alive: false }),
  ]);
  const tokens = html.match(TOKEN_CLASS) ?? [];
  assert.equal(tokens.length, 1, 'a bankrupt player has no piece on the board');
  assert.ok(tokens[0].includes('me'), 'my own piece is highlighted');
});
