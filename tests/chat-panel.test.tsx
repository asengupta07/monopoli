import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import ChatPanel from '../components/ChatPanel';
import type { ChatMessage, LogEntry } from '../types/game';

const message = (overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id: 'm1',
  playerId: 'a',
  name: 'Ana',
  color: '#5bd67a',
  text: 'hello',
  ts: 1,
  ...overrides,
});

const render = (chat: ChatMessage[] = [], log: LogEntry[] = [], myId: string | null = 'b') =>
  renderToStaticMarkup(
    <ChatPanel chat={chat} log={log} myId={myId} onSend={() => {}} />,
  );

test('the closed bubble shows an unread count for waiting messages', () => {
  const html = render([message(), message({ id: 'm2', text: 'again' })]);
  assert.ok(html.includes('chat-unread'), 'shows the unread badge');
  assert.ok(html.includes('Chat, 2 unread'));
  assert.ok(!html.includes('chat-panel'), 'panel stays closed until opened');
});

test('an empty room has no unread badge', () => {
  const html = render([]);
  assert.ok(!html.includes('chat-unread'));
  assert.ok(html.includes('Toggle chat'));
});
