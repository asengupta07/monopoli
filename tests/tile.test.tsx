import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import Tile from '../components/Tile';
import { TILES, GROUP_COLORS } from '../lib/board';
import type { Player } from '../types/game';

const jerusalem = TILES.find((t) => t.name === 'Jerusalem');
assert.ok(jerusalem && jerusalem.kind === 'city');
const index = TILES.indexOf(jerusalem);

const ana: Player = {
  id: 'a', name: 'Ana', color: '#e05ba3', cash: 1500, pos: 0,
  inPrison: false, jailTurns: 0, alive: true, connected: true,
};

test('an unowned city shows its list price', () => {
  const html = renderToStaticMarkup(
    <Tile index={index} tile={jerusalem} side="t" col={1} row={1} />,
  );
  assert.ok(html.includes('120 $'));
  assert.ok(!html.includes('owner-strip'));
});

// The strip alone is the ownership indicator — no separate badge, at any
// house count. Kept as an explicit regression test since this went back and
// forth: a badge was added, then removed for colliding with the strip, then
// dropped again outright because the strip already says everything needed.
test('an owned tile shows the strip and nothing else marking ownership', () => {
  const html = renderToStaticMarkup(
    <Tile index={index} tile={jerusalem} side="t" col={1} row={1} owner={ana} />,
  );
  assert.ok(html.includes('owner-strip'));
  assert.ok(html.includes('price-slot'), 'the price chip stays a hidden spacer so the name does not jump');
  assert.ok(html.includes('120 $'), 'the digits remain only to hold the same width as an unowned tile');
  assert.ok(!html.includes('ownership-mark'), 'no badge, stamped or otherwise');
  assert.ok(!html.includes('owned-badge'), 'no badge, stamped or otherwise');
});

test('an owned city with houses shows only the strip and the roof pips, still no badge', () => {
  const html = renderToStaticMarkup(
    <Tile index={index} tile={jerusalem} side="t" col={1} row={1} owner={ana} houses={2} />,
  );
  assert.ok(html.includes('owner-strip'));
  assert.ok(html.includes('tile-house'), 'the roof pips show the build level');
  assert.ok(!html.includes('ownership-mark'));
});

test('a completed set renders a one-shot flash in the owner\'s colour', () => {
  const html = renderToStaticMarkup(
    <Tile
      index={index}
      tile={jerusalem}
      side="t"
      col={1}
      row={1}
      owner={ana}
      setComplete
      setColor={ana.color}
    />,
  );
  assert.ok(html.includes('set-flash'), 'a transient flash element is rendered');
  assert.ok(html.includes(`--set-color:${ana.color}`), 'the flash carries the owner colour');
});

test('the flash never recolours the tile\'s own permanent glow', () => {
  // the persistent .glow must stay the group's brand colour, not the owner's —
  // a completed set should look like a normal owned tile once the flash ends
  const html = renderToStaticMarkup(
    <Tile
      index={index}
      tile={jerusalem}
      side="t"
      col={1}
      row={1}
      owner={ana}
      setComplete
      setColor={ana.color}
    />,
  );
  const glowStyleAt = html.indexOf('class="glow"');
  const glowTag = html.slice(glowStyleAt - 5, html.indexOf('>', glowStyleAt));
  assert.ok(glowTag.includes(GROUP_COLORS.israel), 'the orb stays the group colour');
  assert.ok(!glowTag.includes(ana.color), 'the orb is never recoloured to the owner');
});

test('an owned tile that is not part of a completed set gets no flash', () => {
  const html = renderToStaticMarkup(
    <Tile index={index} tile={jerusalem} side="t" col={1} row={1} owner={ana} />,
  );
  assert.ok(!html.includes('set-flash'));
  assert.ok(!html.includes('--set-color'));
});
