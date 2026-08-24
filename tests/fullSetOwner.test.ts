import test from 'node:test';
import assert from 'node:assert/strict';
import { fullSetOwner, groupMembers } from '../lib/board';
import type { Ownership } from '../types/game';

const own = (ownerId: string): Ownership => ({ ownerId, houses: 0, mortgaged: false });

test('null when nobody owns any tile in the group', () => {
  assert.equal(fullSetOwner({}, 'brazil'), null);
});

test('null when the group is split between players', () => {
  const [a, b] = groupMembers('brazil');
  assert.equal(fullSetOwner({ [a]: own('p1'), [b]: own('p2') }, 'brazil'), null);
});

test('null when only some of the group is owned', () => {
  const [first] = groupMembers('israel');
  assert.equal(fullSetOwner({ [first]: own('p1') }, 'israel'), null);
});

test('returns the owner once every tile in the group is theirs', () => {
  const ownership: Record<number, Ownership> = {};
  for (const i of groupMembers('germany')) ownership[i] = own('p1');
  assert.equal(fullSetOwner(ownership, 'germany'), 'p1');
});

test('a mortgaged tile still counts toward set completion', () => {
  // completion is about ownership, not buildability — mortgaging your own
  // last tile in a set should not un-complete it
  const ownership: Record<number, Ownership> = {};
  for (const i of groupMembers('france')) ownership[i] = own('p1');
  const [last] = groupMembers('france').slice(-1);
  ownership[last] = { ownerId: 'p1', houses: 0, mortgaged: true };
  assert.equal(fullSetOwner(ownership, 'france'), 'p1');
});

test('every group on the board can be completed', () => {
  for (const group of ['brazil', 'israel', 'italy', 'germany', 'france', 'china', 'uk', 'usa'] as const) {
    const ownership: Record<number, Ownership> = {};
    for (const i of groupMembers(group)) ownership[i] = own('sweep');
    assert.equal(fullSetOwner(ownership, group), 'sweep', `${group} should be completable`);
  }
});
