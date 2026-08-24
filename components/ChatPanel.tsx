'use client';

import { useEffect, useRef, useState } from 'react';
import { MessageSquare, X, SendHorizontal } from 'lucide-react';
import type { ChatMessage, LogEntry } from '@/types/game';

interface Props {
  chat: ChatMessage[];
  log: LogEntry[];
  myId: string | null;
  onSend: (text: string) => void;
}

type Tab = 'chat' | 'log';

export default function ChatPanel({ chat, log, myId, onSend }: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('chat');
  const [draft, setDraft] = useState('');
  const [seen, setSeen] = useState(0);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const viewingChat = open && tab === 'chat';
  // Messages on screen count as read without an effect — otherwise a busy
  // game-log tab (or a closed bubble) is the only place unread can accumulate.
  const unread = viewingChat ? 0 : Math.max(0, chat.length - seen);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ block: 'end' });
  }, [chat, log, open, tab]);

  useEffect(() => {
    if (open && tab === 'chat') inputRef.current?.focus();
  }, [open, tab]);

  const markChatRead = () => setSeen(chat.length);

  const toggleOpen = () => {
    if (tab === 'chat') markChatRead();
    setOpen((v) => !v);
  };

  const selectTab = (next: Tab) => {
    if (next === 'chat' || tab === 'chat') markChatRead();
    setTab(next);
  };

  const close = () => {
    if (tab === 'chat') markChatRead();
    setOpen(false);
  };

  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft('');
    selectTab('chat');
  };

  return (
    <>
      {open && (
        <div className="chat-panel">
          <div className="chat-head">
            <div className="chat-tabs" role="tablist" aria-label="Chat and game log">
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'chat'}
                className={`chat-tab${tab === 'chat' ? ' on' : ''}`}
                onClick={() => selectTab('chat')}
              >
                Chat
                {tab !== 'chat' && unread > 0 && (
                  <span className="chat-tab-unread">{unread > 9 ? '9+' : unread}</span>
                )}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'log'}
                className={`chat-tab${tab === 'log' ? ' on' : ''}`}
                onClick={() => selectTab('log')}
              >
                Game log
              </button>
            </div>
            <button type="button" className="icon-btn sm" onClick={close} aria-label="Close chat">
              <X size={14} />
            </button>
          </div>

          <div className="chat-log">
            {tab === 'chat' ? (
              chat.length === 0 ? (
                <div className="chat-empty">No messages yet. Say something.</div>
              ) : (
                chat.map((message) => (
                  <div
                    key={message.id}
                    className={`chat-line${message.playerId === myId ? ' mine' : ''}`}
                  >
                    <span className="chat-author" style={{ color: message.color }}>
                      {message.name}
                    </span>
                    <span className="chat-text">{message.text}</span>
                  </div>
                ))
              )
            ) : log.length === 0 ? (
              <div className="chat-empty">Nothing has happened yet.</div>
            ) : (
              log.map((entry) => (
                <div key={entry.id} className={`chat-msg ${entry.kind}`}>{entry.text}</div>
              ))
            )}
            <div ref={endRef} />
          </div>

          <div className="chat-input-row">
            <input
              ref={inputRef}
              className="chat-input"
              placeholder="Say something..."
              maxLength={200}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
              onFocus={() => selectTab('chat')}
            />
            <button type="button" className="chat-send" onClick={submit} aria-label="Send">
              <SendHorizontal size={15} />
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        className={`chat-bubble${open ? ' open' : ''}`}
        onClick={toggleOpen}
        aria-label={unread > 0 ? `Chat, ${unread} unread` : 'Toggle chat'}
      >
        {open ? <X size={20} /> : <MessageSquare size={20} />}
        {!open && unread > 0 && (
          <span className="chat-unread">{unread > 9 ? '9+' : unread}</span>
        )}
      </button>
    </>
  );
}
