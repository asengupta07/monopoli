'use client';

import { useEffect, useMemo, useState } from 'react';
import { X, ArrowLeftRight, MessageSquarePlus, Send } from 'lucide-react';
import { TILES, swatchColor } from '@/lib/board';
import Flag from './Flag';
import type { GameActions } from '@/hooks/useGameSocket';
import type { Player, RoomState } from '@/types/game';

export interface TradeDraft {
  toId: string;
  fromProperties: number[];
  toProperties: number[];
  fromCash: number;
  toCash: number;
}

interface Props {
  state: RoomState;
  me: Player;
  actions: GameActions;
  onClose: () => void;
  /** Pre-fills the offer — used to reopen a counter-offer from someone else's terms. */
  initial?: TradeDraft;
}

/** Tiles a player can put on the table: owned, and free of houses. */
function tradeableProperties(state: RoomState, ownerId: string): number[] {
  return Object.entries(state.ownership)
    .filter(([, o]) => o.ownerId === ownerId && o.houses === 0)
    .map(([idx]) => Number(idx))
    .sort((a, b) => a - b);
}

function toggle(set: Set<number>, value: number): Set<number> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value); else next.add(value);
  return next;
}

export default function TradeModal({ state, me, actions, onClose, initial }: Props) {
  const [partnerId, setPartnerId] = useState<string | null>(initial?.toId ?? null);
  const [fromCash, setFromCash] = useState(initial?.fromCash ?? 0);
  const [toCash, setToCash] = useState(initial?.toCash ?? 0);
  const [fromProps, setFromProps] = useState<Set<number>>(new Set(initial?.fromProperties ?? []));
  const [toProps, setToProps] = useState<Set<number>>(new Set(initial?.toProperties ?? []));
  const [note, setNote] = useState('');
  const [showNote, setShowNote] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Presence for the sidebar's "drafting a trade" indicator — on for as long
  // as this modal is mounted, off the moment it closes (sent or cancelled).
  useEffect(() => {
    actions.setTradeDrafting(true);
    return () => actions.setTradeDrafting(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const partners = state.players.filter((p) => p.id !== me.id && p.alive);
  const partner = partnerId ? state.players.find((p) => p.id === partnerId) ?? null : null;

  const myTiles = useMemo(() => tradeableProperties(state, me.id), [state, me.id]);
  const theirTiles = useMemo(
    () => (partner ? tradeableProperties(state, partner.id) : []),
    [state, partner],
  );

  const empty = fromProps.size === 0 && toProps.size === 0 && fromCash === 0 && toCash === 0;

  const send = () => {
    if (!partner || empty) return;
    actions.proposeTrade({
      toId: partner.id,
      fromProperties: [...fromProps],
      toProperties: [...toProps],
      fromCash,
      toCash,
      message: note.trim() || undefined,
    });
    onClose();
  };

  return (
    <>
      <button className="trade-scrim" aria-label="Close" onClick={onClose} />
      <div className="trade-modal" role="dialog" aria-label="Create a trade">
        <button className="trade-close" onClick={onClose} aria-label="Close">
          <X size={14} />
        </button>

        {!partner ? (
          <>
            <div className="trade-title">Create a trade</div>
            <div className="trade-sub">Select a player to trade with:</div>
            <div className="trade-player-list">
              {partners.length === 0 && (
                <div className="trade-empty">Nobody else is left to trade with.</div>
              )}
              {partners.map((p) => (
                <button key={p.id} className="trade-player-row" onClick={() => setPartnerId(p.id)}>
                  <span className="avatar-sm" style={{ '--tone': p.color } as React.CSSProperties} />
                  {p.name}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="trade-title">Create a trade</div>
            <div className="trade-columns">
              <TradeSide
                player={me}
                cash={fromCash}
                onCash={setFromCash}
                tiles={myTiles}
                selected={fromProps}
                onToggle={(i) => setFromProps((s) => toggle(s, i))}
              />
              <div className="trade-swap"><ArrowLeftRight size={16} /></div>
              <TradeSide
                player={partner}
                cash={toCash}
                onCash={setToCash}
                tiles={theirTiles}
                selected={toProps}
                onToggle={(i) => setToProps((s) => toggle(s, i))}
              />
            </div>

            {showNote && (
              <input
                className="trade-note"
                value={note}
                maxLength={140}
                placeholder="Add a message…"
                onChange={(e) => setNote(e.target.value)}
                autoFocus
              />
            )}

            <div className="trade-actions">
              <button
                className="trade-note-btn"
                aria-label="Add a message"
                aria-pressed={showNote}
                onClick={() => setShowNote((v) => !v)}
              >
                <MessageSquarePlus size={16} />
              </button>
              <button className="trade-send" disabled={empty} onClick={send}>
                <Send size={14} /> Send trade
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function TradeSide({
  player, cash, onCash, tiles, selected, onToggle,
}: {
  player: Player;
  cash: number;
  onCash: (v: number) => void;
  tiles: number[];
  selected: Set<number>;
  onToggle: (tileIndex: number) => void;
}) {
  return (
    <div className="trade-side">
      <div className="trade-side-head">
        <span className="avatar-sm" style={{ '--tone': player.color } as React.CSSProperties} />
        {player.name}
      </div>

      <div className="trade-cash">
        <input
          type="range"
          min={0}
          max={player.cash}
          value={Math.min(cash, player.cash)}
          onChange={(e) => onCash(Number(e.target.value))}
        />
        <div className="trade-cash-scale">
          <span>0</span>
          <span>{player.cash}</span>
        </div>
        <div className="trade-cash-chip">{cash} $</div>
      </div>

      <div className="trade-props">
        {tiles.length === 0 && <div className="trade-empty">No tradeable properties</div>}
        {tiles.map((idx) => {
          const tile = TILES[idx];
          const on = selected.has(idx);
          return (
            <button
              key={idx}
              className={`trade-prop-row${on ? ' on' : ''}`}
              onClick={() => onToggle(idx)}
            >
              {tile.kind === 'city'
                ? <Flag group={tile.group} />
                : <span className="trade-prop-swatch" style={{ background: swatchColor(tile) }} />}
              <span className="trade-prop-name">{tile.name}</span>
              <span className="trade-prop-price">
                ${tile.kind === 'city' || tile.kind === 'airport' || tile.kind === 'utility' ? tile.price : 0}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
