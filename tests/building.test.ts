import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createRoom, addPlayer, updateSettings, startGame,
  buildHouse, sellHouse, sellProperty,
  mortgageProperty, unmortgageProperty,
  calcRent, getPlayer,
} from '../lib/gameEngine';
import {
  HOTEL_LEVEL, MAX_HOUSES, HOUSE_RENT_MULTIPLIERS,
  houseCost, cityRent, rentWithHouses, sellValue,
  mortgageValue, unmortgageCost, DEFAULT_SETTINGS,
} from '../lib/rules';
import { TILES, groupMembers } from '../lib/board';
import type { GroupKey, Room } from '../types/game';

/** A running game where Ana owns a whole set. */
function gameWithSet(group: GroupKey = 'uk', settings: Partial<typeof DEFAULT_SETTINGS> = {}) {
  const room = createRoom(new Set(), 'testid');
  const ana = addPlayer(room, { name: 'Ana' }).player!;
  const ben = addPlayer(room, { name: 'Ben' }).player!;
  updateSettings(room, ana.id, { randomizeOrder: false, ...settings });
  startGame(room, ana.id);

  const set = groupMembers(group);
  for (const i of set) room.ownership[i] = { ownerId: ana.id, houses: 0, mortgaged: false };
  return { room, ana, ben, set };
}

const cash = (room: Room, id: string) => getPlayer(room, id)!.cash;

/* ---------------- prices ---------------- */

test('house prices rise with the value of the set', () => {
  assert.ok(houseCost('brazil') < houseCost('italy'), 'the opening streets build cheapest');
  assert.ok(houseCost('italy') < houseCost('china'));
  assert.ok(houseCost('china') < houseCost('uk'));
  assert.equal(houseCost('uk'), houseCost('usa'), 'the two priciest sets match');
});

test('the rent ladder climbs with every building', () => {
  const price = 300;
  const ladder = [0, 1, 2, 3, 4, HOTEL_LEVEL].map((h) => rentWithHouses(price, h));
  for (let i = 1; i < ladder.length; i++) {
    assert.ok(ladder[i] > ladder[i - 1], `level ${i} should out-earn level ${i - 1}`);
  }
  assert.equal(ladder[0], cityRent(price), 'bare land earns the base rent');
  assert.equal(HOUSE_RENT_MULTIPLIERS.length, HOTEL_LEVEL, 'one multiplier per build level');
});

/* ---------------- building ---------------- */

test('building needs the whole set', () => {
  const room = createRoom(new Set(), 'testid');
  const ana = addPlayer(room, { name: 'Ana' }).player!;
  addPlayer(room, { name: 'Ben' });
  updateSettings(room, ana.id, { randomizeOrder: false });
  startGame(room, ana.id);
  room.ownership[31] = { ownerId: ana.id, houses: 0, mortgaged: false }; // one UK tile only

  assert.equal(buildHouse(room, ana.id, 31).error, 'You need the whole set to build');
});

test('a house costs the set price and raises the rent', () => {
  const { room, ana } = gameWithSet('uk');
  const before = cash(room, ana.id);

  assert.equal(buildHouse(room, ana.id, 31).error, undefined);
  assert.equal(room.ownership[31].houses, 1);
  assert.equal(cash(room, ana.id), before - houseCost('uk'));
  assert.equal(calcRent(room, 31, 7), rentWithHouses(TILES[31].kind === 'city' ? 290 : 0, 1));
});

test('four houses then a hotel, and no further', () => {
  const { room, ana, set } = gameWithSet('uk');
  getPlayer(room, ana.id)!.cash = 10_000;

  // even build forces the set up together, so cycle through it
  for (let round = 0; round < HOTEL_LEVEL; round++) {
    for (const i of set) assert.equal(buildHouse(room, ana.id, i).error, undefined);
  }
  assert.equal(room.ownership[31].houses, HOTEL_LEVEL, 'tops out at a hotel');
  assert.equal(buildHouse(room, ana.id, 31).error, 'This property already has a hotel');
  assert.equal(MAX_HOUSES + 1, HOTEL_LEVEL, 'a hotel is the step after four houses');
});

test('even build stops one property running ahead of its set', () => {
  const { room, ana } = gameWithSet('uk', { evenBuild: true });
  getPlayer(room, ana.id)!.cash = 10_000;

  assert.equal(buildHouse(room, ana.id, 31).error, undefined);
  assert.equal(buildHouse(room, ana.id, 31).error, 'Build evenly across the set');

  assert.equal(buildHouse(room, ana.id, 32).error, undefined, 'the rest of the set may catch up');
});

test('with even build off a single property can be developed alone', () => {
  const { room, ana } = gameWithSet('uk', { evenBuild: false });
  getPlayer(room, ana.id)!.cash = 10_000;

  for (let i = 0; i < HOTEL_LEVEL; i++) {
    assert.equal(buildHouse(room, ana.id, 31).error, undefined);
  }
  assert.equal(room.ownership[31].houses, HOTEL_LEVEL);
});

test('you cannot build what you cannot afford', () => {
  const { room, ana } = gameWithSet('uk');
  getPlayer(room, ana.id)!.cash = 10;
  assert.equal(buildHouse(room, ana.id, 31).error, `A house here costs $${houseCost('uk')}`);
});

test('a mortgaged set cannot be developed', () => {
  const { room, ana } = gameWithSet('uk');
  room.ownership[32].mortgaged = true;
  assert.equal(buildHouse(room, ana.id, 31).error, 'Lift the mortgages on this set first');
});

/* ---------------- selling buildings ---------------- */

test('selling a house pays the configured rate', () => {
  const { room, ana } = gameWithSet('uk', { sellRate: 50, evenBuild: false });
  getPlayer(room, ana.id)!.cash = 10_000;
  buildHouse(room, ana.id, 31);

  const before = cash(room, ana.id);
  assert.equal(sellHouse(room, ana.id, 31).error, undefined);
  assert.equal(cash(room, ana.id), before + sellValue(houseCost('uk'), 50));
  assert.equal(room.ownership[31].houses, 0);
});

test('the sell rate is the host setting, not a constant', () => {
  const { room, ana } = gameWithSet('uk', { sellRate: 100, evenBuild: false });
  getPlayer(room, ana.id)!.cash = 10_000;
  buildHouse(room, ana.id, 31);

  const before = cash(room, ana.id);
  sellHouse(room, ana.id, 31);
  assert.equal(cash(room, ana.id), before + houseCost('uk'), 'at 100% a house sells for cost');
});

test('even build applies in reverse when selling', () => {
  const { room, ana, set } = gameWithSet('uk', { evenBuild: true });
  getPlayer(room, ana.id)!.cash = 10_000;
  for (const i of set) buildHouse(room, ana.id, i);
  buildHouse(room, ana.id, 31); // 31 now leads the set

  assert.equal(sellHouse(room, ana.id, 32).error, 'Sell evenly across the set');
  assert.equal(sellHouse(room, ana.id, 31).error, undefined, 'the leader sells first');
});

test('there is nothing to sell on bare land', () => {
  const { room, ana } = gameWithSet('uk');
  assert.equal(sellHouse(room, ana.id, 31).error, 'Nothing to sell here');
});

/* ---------------- selling the property ---------------- */

test('selling a property pays the configured rate and releases it', () => {
  const { room, ana } = gameWithSet('uk', { sellRate: 50 });
  const before = cash(room, ana.id);

  assert.equal(sellProperty(room, ana.id, 31).error, undefined);
  assert.equal(room.ownership[31], undefined, 'the bank takes it back');
  assert.equal(cash(room, ana.id), before + sellValue(290, 50));
});

test('a developed property cannot be sold until the buildings go', () => {
  const { room, ana } = gameWithSet('uk', { evenBuild: false });
  getPlayer(room, ana.id)!.cash = 10_000;
  buildHouse(room, ana.id, 31);

  assert.equal(sellProperty(room, ana.id, 31).error, 'Sell the buildings first');
});

test('a mortgaged property cannot be sold until the loan is settled', () => {
  const { room, ana } = gameWithSet('uk');
  mortgageProperty(room, ana.id, 31);
  assert.equal(sellProperty(room, ana.id, 31).error, 'Lift the mortgage before selling');
});

test('you cannot sell what you do not own', () => {
  const { room, ben } = gameWithSet('uk');
  assert.equal(sellProperty(room, ben.id, 31).error, 'You do not own that property');
});

/* ---------------- configurable mortgage ---------------- */

test('the mortgage rate and interest come from the settings', () => {
  const { room, ana } = gameWithSet('uk', { mortgageRate: 70, mortgageInterest: 20 });
  const before = cash(room, ana.id);

  assert.equal(mortgageProperty(room, ana.id, 31).error, undefined);
  const raised = mortgageValue(290, 70);
  assert.equal(cash(room, ana.id), before + raised, 'raises the configured share');

  const owed = unmortgageCost(290, 70, 20);
  assert.ok(owed > raised, 'interest makes lifting it dearer than the loan');

  const afterMortgage = cash(room, ana.id);
  assert.equal(unmortgageProperty(room, ana.id, 31).error, undefined);
  assert.equal(cash(room, ana.id), afterMortgage - owed);
});

test('zero interest means the loan is repaid exactly', () => {
  assert.equal(unmortgageCost(290, 50, 0), mortgageValue(290, 50));
});

test('a developed property cannot be mortgaged', () => {
  const { room, ana } = gameWithSet('uk', { evenBuild: false });
  getPlayer(room, ana.id)!.cash = 10_000;
  buildHouse(room, ana.id, 31);
  assert.equal(mortgageProperty(room, ana.id, 31).error, 'Sell the buildings first');
});

test('settings validation rejects rates that are not on offer', () => {
  const room = createRoom(new Set(), 'testid');
  const ana = addPlayer(room, { name: 'Ana' }).player!;

  updateSettings(room, ana.id, { sellRate: 999 });
  assert.equal(room.settings.sellRate, DEFAULT_SETTINGS.sellRate, 'ignores an unlisted rate');

  updateSettings(room, ana.id, { sellRate: 75 });
  assert.equal(room.settings.sellRate, 75);

  updateSettings(room, ana.id, { mortgageInterest: 3 });
  assert.equal(room.settings.mortgageInterest, DEFAULT_SETTINGS.mortgageInterest);
});

/* ---------------- rent with buildings ---------------- */

test('rent follows the buildings, and the doubling rule does not stack on them', () => {
  const { room, ana } = gameWithSet('uk', { x2Rent: true, evenBuild: false });
  getPlayer(room, ana.id)!.cash = 10_000;

  // a complete but unimproved set pays double
  assert.equal(calcRent(room, 31, 7), cityRent(290) * 2);

  buildHouse(room, ana.id, 31);
  assert.equal(calcRent(room, 31, 7), rentWithHouses(290, 1), 'buildings replace the x2 rule');
});

test('a mortgaged property earns nothing however developed it was', () => {
  const { room, ana } = gameWithSet('uk', { evenBuild: false });
  getPlayer(room, ana.id)!.cash = 10_000;
  buildHouse(room, ana.id, 31);
  sellHouse(room, ana.id, 31);
  mortgageProperty(room, ana.id, 31);

  assert.equal(calcRent(room, 31, 7), 0);
});
