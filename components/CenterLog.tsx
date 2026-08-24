'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import type { LogEntry } from '@/types/game';

interface Props {
  log: LogEntry[];
}

const NEAR_BOTTOM_PX = 8;

export default function CenterLog({ log }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);

  const syncEdges = () => {
    const el = scrollerRef.current;
    const root = rootRef.current;
    if (!el || !root) return;
    const overflow = el.scrollHeight > el.clientHeight + 1;
    const atTop = el.scrollTop <= 3;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 3;
    root.toggleAttribute('data-overflow', overflow);
    root.toggleAttribute('data-fade-top', overflow && !atTop);
    root.toggleAttribute('data-fade-bottom', overflow && !atBottom);
  };

  const onScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    stickRef.current = el.scrollTop + el.clientHeight >= el.scrollHeight - NEAR_BOTTOM_PX;
    syncEdges();
  };

  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
    syncEdges();
  }, [log]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return undefined;
    const observer = new ResizeObserver(syncEdges);
    observer.observe(el);
    return () => observer.disconnect();
  }, [log.length]);

  if (log.length === 0) return null;

  return (
    <div className="log" ref={rootRef}>
      <div className="log-edge top" aria-hidden="true" />
      <div
        ref={scrollerRef}
        className="log-scroll"
        onScroll={onScroll}
        tabIndex={0}
        aria-label="Game log"
      >
        {log.map((entry) => (
          <div key={entry.id} className={`log-line ${entry.kind}`}>{entry.text}</div>
        ))}
      </div>
      <div className="log-edge bottom" aria-hidden="true" />
    </div>
  );
}
