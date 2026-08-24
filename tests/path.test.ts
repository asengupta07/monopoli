import test from 'node:test';
import assert from 'node:assert/strict';
import { walkPath, isWalk, MAX_WALK } from '../lib/path';
import { gridPosition, TILES } from '../lib/board';

test('a walk visits every tile between the two squares, in order', () => {
  assert.deepEqual(walkPath(1, 4), [2, 3, 4]);
  assert.deepEqual(walkPath(0, 2), [1, 2]);
});

test('standing still produces no movement', () => {
  assert.deepEqual(walkPath(7, 7), []);
  assert.equal(isWalk(7, 7), false);
});

test('a walk past START wraps around the board', () => {
  assert.deepEqual(walkPath(38, 3), [39, 0, 1, 2, 3]);
  assert.equal(isWalk(38, 3), true);
});

test('a walk turns the corner instead of cutting across it', () => {
  // top row -> jail corner -> right column
  assert.deepEqual(walkPath(8, 13), [9, 10, 11, 12, 13]);
  assert.ok(walkPath(8, 13).includes(10), 'the corner tile is stepped on, not skipped');
});

test('moves no dice roll could produce are jumps, not walks', () => {
  // Go to prison: 30 -> 10 is 20 squares forward
  assert.deepEqual(walkPath(30, 10), [10]);
  assert.equal(isWalk(30, 10), false);

  // "Advance to START" from midway round the board
  assert.deepEqual(walkPath(22, 0), [0]);
  assert.equal(isWalk(22, 0), false);
});

test('every distance a pair of dice can roll is walked', () => {
  for (let roll = 2; roll <= MAX_WALK; roll++) {
    const path = walkPath(0, roll);
    assert.equal(path.length, roll, `roll of ${roll}`);
    assert.equal(path[path.length - 1], roll);
    assert.equal(isWalk(0, roll), true);
  }
});

// The point of walking tile by tile: a piece must never travel diagonally.
test('consecutive steps are always orthogonal neighbours one cell apart', () => {
  for (let from = 0; from < TILES.length; from++) {
    const path = walkPath(from, (from + MAX_WALK) % TILES.length);
    const squares = [from, ...path];

    for (let i = 1; i < squares.length; i++) {
      const a = gridPosition(squares[i - 1]);
      const b = gridPosition(squares[i]);
      const dc = Math.abs(a.col - b.col);
      const dr = Math.abs(a.row - b.row);

      assert.equal(
        dc + dr, 1,
        `step ${squares[i - 1]} -> ${squares[i]} moved (${dc},${dr}); must be exactly one cell on one axis`,
      );
    }
  }
});

test('a full lap returns the piece to where it started', () => {
  let at = 0;
  for (let i = 0; i < 10; i++) {
    const path = walkPath(at, (at + 4) % TILES.length);
    at = path[path.length - 1];
  }
  assert.equal(at, 0, 'ten four-step moves make exactly one lap');
});
