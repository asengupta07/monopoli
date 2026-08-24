import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  tileCentre, trackCentre, TILE_CENTRES,
  BOARD_PADDING, BOARD_GAP, CORNER_FR,
} from '../lib/geometry';
import { walkPath } from '../lib/path';
import { TILES } from '../lib/board';

const near = (a: number, b: number, tolerance = 0.001) =>
  assert.ok(Math.abs(a - b) < tolerance, `${a} is not within ${tolerance} of ${b}`);

test('every tile centre sits inside the board', () => {
  assert.equal(TILE_CENTRES.length, 40);
  for (const [i, point] of TILE_CENTRES.entries()) {
    assert.ok(point.x > 0 && point.x < 100, `tile ${i} x=${point.x}`);
    assert.ok(point.y > 0 && point.y < 100, `tile ${i} y=${point.y}`);
    assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
  }
});

test('the grid is symmetric end to end', () => {
  // first and last tracks are the corners, and mirror each other
  near(trackCentre(1), 100 - trackCentre(11));
  near(trackCentre(2), 100 - trackCentre(10));
  near(trackCentre(6), 50, 0.0001); // the middle track is centred
});

test('the four corners sit at the four extremes', () => {
  const start = tileCentre(0);
  const jail = tileCentre(10);
  const vacation = tileCentre(20);
  const prison = tileCentre(30);

  near(start.x, jail.y);              // same inset from their edges
  near(start.y, start.x);             // START is on the diagonal
  near(jail.x, 100 - start.x);
  near(vacation.x, 100 - start.x);
  near(vacation.y, 100 - start.y);
  near(prison.x, start.x);
  near(prison.y, 100 - start.y);
});

test('tiles on the same edge share an axis exactly', () => {
  // top row: constant y
  for (let i = 1; i < 10; i++) near(tileCentre(i).y, tileCentre(1).y);
  // right column: constant x
  for (let i = 11; i < 20; i++) near(tileCentre(i).x, tileCentre(11).x);
  // bottom row: constant y
  for (let i = 21; i < 30; i++) near(tileCentre(i).y, tileCentre(21).y);
  // left column: constant x
  for (let i = 31; i < 40; i++) near(tileCentre(i).x, tileCentre(31).x);
});

// The visual promise: a piece never travels diagonally between two squares.
test('each step of a walk moves along exactly one axis', () => {
  for (let from = 0; from < TILES.length; from++) {
    const squares = [from, ...walkPath(from, (from + 12) % TILES.length)];

    for (let i = 1; i < squares.length; i++) {
      const a = tileCentre(squares[i - 1]);
      const b = tileCentre(squares[i]);
      const movedX = Math.abs(a.x - b.x) > 0.001;
      const movedY = Math.abs(a.y - b.y) > 0.001;

      assert.ok(
        movedX !== movedY,
        `step ${squares[i - 1]} -> ${squares[i]} moved on ${movedX && movedY ? 'both axes' : 'neither axis'}`,
      );
    }
  }
});

test('a corner is where the piece changes axis', () => {
  // approaching the jail corner along the top row, then down the right column
  const before = tileCentre(9);
  const corner = tileCentre(10);
  const after = tileCentre(11);

  near(before.y, corner.y, 0.001);          // travelled horizontally into the corner
  near(corner.x, after.x, 0.001);           // then vertically out of it
  assert.ok(before.x < corner.x, 'moving right along the top');
  assert.ok(after.y > corner.y, 'then down the right side');
});

// The geometry mirrors the CSS grid; if one changes the other must too.
test('the geometry constants still match the board CSS', () => {
  const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
  const board = css.slice(css.indexOf('.board{'), css.indexOf('.tile{'));

  // CSS may write .45cqw or 0.45cqw, so compare numbers rather than spelling
  const declared = (property: string): number => {
    const match = board.match(new RegExp(`${property}:\\s*(\\d*\\.?\\d+)cqw`));
    assert.ok(match, `globals.css .board is missing a ${property} in cqw`);
    return Number(match![1]);
  };

  assert.equal(declared('gap'), BOARD_GAP, '.board gap must match BOARD_GAP');
  assert.equal(declared('padding'), BOARD_PADDING, '.board padding must match BOARD_PADDING');

  const tracks = board.match(/grid-template-columns:\s*(\d*\.?\d+)fr repeat\(9,\s*minmax\(0,\s*1fr\)\)\s*(\d*\.?\d+)fr/);
  assert.ok(tracks, '.board must use the 11-track corner/tile grid');
  assert.equal(Number(tracks![1]), CORNER_FR, 'leading corner track must match CORNER_FR');
  assert.equal(Number(tracks![2]), CORNER_FR, 'trailing corner track must match CORNER_FR');
});
