import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import CenterLog from '../components/CenterLog';
import type { LogEntry } from '../types/game';

const entry = (id: string, text: string, kind: LogEntry['kind'] = 'info'): LogEntry => ({
  id, text, kind, ts: 1,
});

test('the centre log keeps the stored history, not only the last few lines', () => {
  const log = Array.from({ length: 8 }, (_, i) => entry(`e${i}`, `event ${i}`));
  const html = renderToStaticMarkup(<CenterLog log={log} />);
  assert.ok(html.includes('event 0'), 'oldest stored line is still there');
  assert.ok(html.includes('event 7'), 'newest stored line is there');
  assert.equal([...html.matchAll(/log-line/g)].length, 8);
});

test('an empty log renders nothing in the centre', () => {
  assert.equal(renderToStaticMarkup(<CenterLog log={[]} />), '');
});
