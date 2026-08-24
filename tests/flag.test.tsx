import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import Flag from '../components/Flag';
import { TILES, GROUP_COLORS } from '../lib/board';
import type { GroupKey } from '../types/game';

const GROUPS = Object.keys(GROUP_COLORS) as GroupKey[];

test('every colour group has flag artwork', () => {
  for (const group of GROUPS) {
    const html = renderToStaticMarkup(<Flag group={group} />);
    assert.ok(html.includes('<svg'), `${group} should render an svg`);
    assert.ok(html.length > 120, `${group} artwork looks empty`);
  }
});

test('flags are labelled for screen readers', () => {
  const html = renderToStaticMarkup(<Flag group="uk" />);
  assert.ok(html.includes('role="img"'));
  assert.ok(html.includes('aria-label="United Kingdom"'));
});

test('each country renders distinct artwork', () => {
  const seen = new Map<string, GroupKey>();
  for (const group of GROUPS) {
    const html = renderToStaticMarkup(<Flag group={group} />);
    const previous = seen.get(html);
    assert.equal(previous, undefined, `${group} renders the same flag as ${previous}`);
    seen.set(html, group);
  }
  assert.equal(seen.size, GROUPS.length);
});

// Every city on the board must resolve to a flag, or a tile would render blank.
test('every city group on the board is covered', () => {
  const used = new Set<GroupKey>();
  for (const tile of TILES) if (tile.kind === 'city') used.add(tile.group);

  for (const group of used) {
    assert.ok(GROUPS.includes(group), `${group} is used on the board but has no flag`);
    const html = renderToStaticMarkup(<Flag group={group} />);
    assert.ok(html.includes('<svg'), `${group} must have artwork`);
  }
  assert.equal(used.size, GROUPS.length, 'no unused flag definitions');
});
