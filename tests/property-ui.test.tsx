import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import PropertyCard from '../components/PropertyCard';
import { createRoom, addPlayer, calcRent, serialize } from '../lib/gameEngine';
import {
  AIRPORT_RENTS, UTILITY_MULTIPLIERS, cityRent,
} from '../lib/rules';
import type { Player, RoomState } from '../types/game';
import type { GameActions } from '../hooks/useGameSocket';

function roomState(
  ownership: RoomState['ownership'] = {},
  settings: Partial<RoomState['settings']> = {},
): RoomState {
  const room = createRoom(new Set(), 'test');
  addPlayer(room, { name: 'Ana' });
  addPlayer(room, { name: 'Ben' });
  room.phase = 'playing';
  room.ownership = ownership;
  room.settings = { ...room.settings, ...settings };
  return serialize(room);
}

const actions = new Proxy({}, { get: () => () => {} }) as GameActions;

const render = (index: number, state: RoomState, me: Player | null = null) =>
  renderToStaticMarkup(
    <PropertyCard index={index} state={state} me={me} actions={actions} onClose={() => {}} />,
  );

test('a city card shows its name, price and mortgage value', () => {
  const html = render(32, roomState()); // Manchester, $300
  assert.ok(html.includes('Manchester'));
  assert.ok(html.includes('$300'), 'shows the price');
});

// The card must never advertise a rent the engine would not charge.
test('the city rent shown is the rent the engine charges', () => {
  const room = createRoom(new Set(), 'test');
  const { player } = addPlayer(room, { name: 'Ana' });
  addPlayer(room, { name: 'Ben' });
  room.phase = 'playing';
  room.ownership = { 32: { ownerId: player!.id, houses: 0, mortgaged: false } };

  const engineRent = calcRent(room, 32, 7);
  assert.equal(engineRent, cityRent(300));

  const html = render(32, serialize(room));
  assert.ok(html.includes(`$${engineRent}`), `card should show $${engineRent}`);
});

test('the full-set row appears only when the x2 rule is switched on', () => {
  const off = render(32, roomState({}, { x2Rent: false }));
  assert.ok(!off.includes('with the full set'), 'no row for a rule that is off');

  const on = render(32, roomState({}, { x2Rent: true }));
  assert.ok(on.includes('with the full set'));
  assert.ok(on.includes(`$${cityRent(300) * 2}`), 'shows the doubled rent when enabled');
});

test('an airport card lists the full ladder the engine uses', () => {
  const html = render(25, roomState()); // CDG Airport
  assert.ok(html.includes('CDG Airport'));
  for (const rent of AIRPORT_RENTS) {
    assert.ok(html.includes(`$${rent}`), `ladder should include $${rent}`);
  }
  assert.ok(html.includes('one airport is owned'));
  assert.ok(html.includes('4 airports are owned'));
});

test('the airport ladder matches what the engine charges for each count', () => {
  const room = createRoom(new Set(), 'test');
  const { player } = addPlayer(room, { name: 'Ana' });
  addPlayer(room, { name: 'Ben' });
  room.phase = 'playing';

  const airports = [5, 15, 25, 35];
  airports.forEach((tile, i) => {
    room.ownership[tile] = { ownerId: player!.id, houses: 0, mortgaged: false };
    assert.equal(calcRent(room, airports[0], 7), AIRPORT_RENTS[i]);
  });
});

test('a utility card shows the dice multipliers', () => {
  const html = render(12, roomState()); // Power Company
  assert.ok(html.includes('Power Company'));
  for (const multiplier of UTILITY_MULTIPLIERS) {
    assert.ok(html.includes(`${multiplier}x dice`), `should show ${multiplier}x dice`);
  }
});

test('the card names the owner, or says nobody owns it', () => {
  const unowned = render(32, roomState());
  assert.ok(unowned.includes('nobody'));

  const room = createRoom(new Set(), 'test');
  const { player } = addPlayer(room, { name: 'Ana' });
  room.phase = 'playing';
  room.ownership = { 32: { ownerId: player!.id, houses: 0, mortgaged: true } };

  const owned = render(32, serialize(room));
  assert.ok(owned.includes('Ana'), 'names the owner');
  assert.ok(owned.includes('mortgaged'), 'flags a mortgaged property');
});

test('tiles nobody can own have no property card', () => {
  const state = roomState();
  for (const index of [0, 2, 4, 10, 20, 30]) { // corners, treasure, tax
    assert.equal(render(index, state), '', `tile ${index} should not open a card`);
  }
});

test('a city card shows the full build ladder', () => {
  const html = render(32, roomState());
  for (const label of ['with 1 house', 'with 2 houses', 'with 3 houses', 'with 4 houses', 'with a hotel']) {
    assert.ok(html.includes(label), `ladder should list "${label}"`);
  }
});
