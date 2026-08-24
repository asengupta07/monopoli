import test from 'node:test';
import assert from 'node:assert/strict';
import { tileNameSize } from '../lib/labels';
import { TILES } from '../lib/board';

/** Rough width of a label in cqw: the longest line, at the chosen size. */
function estimatedWidth(name: string): number {
  const longest = Math.max(...name.trim().split(/\s+/).map((w) => w.length));
  // Barlow Semi Condensed averages a little over half its size per character
  return longest * tileNameSize(name) * 0.55;
}

/** Rough height of a label in cqw: one line per word that has to stack. */
function estimatedHeight(name: string): number {
  const words = name.trim().split(/\s+/).length;
  return words * tileNameSize(name) * 1.05;
}

test('longer words are set smaller', () => {
  assert.ok(tileNameSize('Rio') > tileNameSize('Salvador'));
  assert.ok(tileNameSize('Salvador') > tileNameSize('Manchester'));
  assert.ok(tileNameSize('Manchester') >= tileNameSize('San Francisco'));
});

// Regression: sizing looked only at the longest word, so "Power Company" kept
// full size, stacked onto two lines and overflowed its tile.
test('names that stack onto two lines are set smaller than single words', () => {
  assert.ok(
    tileNameSize('Power Company') < tileNameSize('Jerusalem'),
    'a two-line name must be smaller than a one-line name of similar word length',
  );
  assert.ok(tileNameSize('Water Company') <= 1.15);
  assert.ok(tileNameSize('Power Company') <= 1.15);
});

test('every board label fits inside a tile', () => {
  // a tile is roughly 7.8cqw across and 12cqw deep on the outer band
  const MAX_WIDTH = 7.4;
  const MAX_HEIGHT = 6.5;

  for (const tile of TILES) {
    if (tile.kind === 'corner') continue;
    assert.ok(
      estimatedWidth(tile.name) <= MAX_WIDTH,
      `"${tile.name}" is ~${estimatedWidth(tile.name).toFixed(2)}cqw wide, over ${MAX_WIDTH}`,
    );
    assert.ok(
      estimatedHeight(tile.name) <= MAX_HEIGHT,
      `"${tile.name}" is ~${estimatedHeight(tile.name).toFixed(2)}cqw tall, over ${MAX_HEIGHT}`,
    );
  }
});

test('sizes stay within a sensible range', () => {
  for (const tile of TILES) {
    const size = tileNameSize(tile.name);
    assert.ok(size >= 0.9 && size <= 1.7, `${tile.name} got ${size}cqw`);
  }
});
