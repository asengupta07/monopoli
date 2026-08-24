'use client';

import { useState } from 'react';
import { MessageSquare, HelpCircle, Volume2, Sparkles, Check, Copy } from 'lucide-react';

interface Props {
  roomId: string;
  centre?: React.ReactNode;
  showShare?: boolean;
}

export default function BottomBar({ roomId, centre, showShare }: Props) {
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    const url = `${window.location.origin}/room/${roomId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="bottom-bar">
      <div className="footer-logo">Mono<span className="gold">Poli</span></div>

      {showShare ? (
        <div className="share-row">
          <span className="share-label">Share this game</span>
          <button className={`share-input${copied ? ' copied' : ''}`} onClick={copyLink}>
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? 'Link copied' : `/room/${roomId}`}
          </button>
        </div>
      ) : (
        <div className="turn-status">{centre}</div>
      )}

      <div className="footer-icons">
        <button className="icon-btn" aria-label="Chat"><MessageSquare size={15} /></button>
        <button className="icon-btn" aria-label="Help"><HelpCircle size={15} /></button>
        <button className="icon-btn" aria-label="Sound"><Volume2 size={15} /></button>
        <div className="pill whats-new"><Sparkles size={13} /> What&apos;s new</div>
      </div>
    </div>
  );
}
