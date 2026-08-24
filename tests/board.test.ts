import test from 'node:test';
import assert from 'node:assert/strict';
import { TILES, gridPosition, groupMembers, isOwnable, travelFacing } from '../lib/board';

test('board has exactly 40 tiles with the four corners in place', () => {
  assert.equal(TILES.length, 40);
  assert.equal(TILES[0].kind, 'corner');
  assert.equal(TILES[10].kind, 'corner');
  assert.equal(TILES[20].kind, 'corner');
  assert.equal(TILES[30].kind, 'corner');
});

test('every clockwise index maps to a distinct grid cell on the ring', () => {
  const seen = new Set<string>();
  for (let i = 0; i < TILES.length; i++) {
    const { col, row } = gridPosition(i);
    const key = `${col},${row}`;
    assert.ok(!seen.has(key), `index ${i} collides at ${key}`);
    seen.add(key);

    // every tile must sit on the outer ring of the 11x11 grid
    const onRing = col === 1 || col === 11 || row === 1 || row === 11;
    assert.ok(onRing, `index ${i} is not on the ring (${key})`);
    assert.ok(col >= 1 && col <= 11 && row >= 1 && row <= 11);
  }
  assert.equal(seen.size, 40);
});

// regression: the right column was computed as index-8, putting Venice at row 3
// and pushing the whole column one cell out of alignment.
test('the right column runs top to bottom starting directly below the jail corner', () => {
  assert.deepEqual(gridPosition(10), { col: 11, row: 1, side: 'corner' });
  assert.deepEqual(gridPosition(11), { col: 11, row: 2, side: 'r' });
  assert.deepEqual(gridPosition(19), { col: 11, row: 10, side: 'r' });
  assert.deepEqual(gridPosition(20), { col: 11, row: 11, side: 'corner' });
});

test('the bottom row runs right to left and the left column runs bottom to top', () => {
  assert.deepEqual(gridPosition(21), { col: 10, row: 11, side: 'b' });
  assert.deepEqual(gridPosition(29), { col: 2, row: 11, side: 'b' });
  assert.deepEqual(gridPosition(31), { col: 1, row: 10, side: 'l' });
  assert.deepEqual(gridPosition(39), { col: 1, row: 2, side: 'l' });
});

test('the top row runs left to right between the start and jail corners', () => {
  assert.deepEqual(gridPosition(0), { col: 1, row: 1, side: 'corner' });
  assert.deepEqual(gridPosition(1), { col: 2, row: 1, side: 't' });
  assert.deepEqual(gridPosition(9), { col: 10, row: 1, side: 't' });
});

test('colour groups have the members the rent rules expect', () => {
  assert.deepEqual(groupMembers('brazil'), [1, 3]);
  assert.deepEqual(groupMembers('israel'), [6, 7, 9]);
  assert.deepEqual(groupMembers('usa'), [37, 39]);
  // only cities belong to a group, never airports or utilities
  for (const idx of groupMembers('china')) {
    assert.equal(TILES[idx].kind, 'city');
  }
});

test('clockwise travel faces the way the piece will walk', () => {
  assert.equal(travelFacing(0), 'right', 'START looks along the top row');
  assert.equal(travelFacing(9), 'right');
  assert.equal(travelFacing(10), 'down', 'jail looks down the right column');
  assert.equal(travelFacing(15), 'down');
  assert.equal(travelFacing(20), 'left');
  assert.equal(travelFacing(25), 'left');
  assert.equal(travelFacing(30), 'up');
  assert.equal(travelFacing(35), 'up');
});

test('exactly the cities, airports and utilities are ownable', () => {
  const ownable = TILES.filter(isOwnable);
  assert.equal(ownable.length, 28);
  for (const tile of ownable) {
    assert.ok('price' in tile && tile.price > 0);
  }
});
