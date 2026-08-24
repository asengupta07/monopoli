'use client';

import { useEffect } from 'react';
import { X, Check, XCircle, Repeat, Ban, Clock } from 'lucide-react';
import { TILES, swatchColor } from '@/lib/board';
import Flag from './Flag';
import type { TradeDraft } from './TradeModal';
import type { GameActions } from '@/hooks/useGameSocket';
import type { Player, RoomState, TradeOffer } from '@/types/game';

interface Props {
  trade: TradeOffer;
  state: RoomState;
  me: Player;
  actions: GameActions;
  onClose: () => void;
  onNegotiate: (draft: TradeDraft) => void;
}

function Side({ player, cash, properties }: { player: Player; cash: number; properties: number[] }) {
  return (
    <div className="trade-side">
      <div className="trade-side-head">
        <span className="avatar-sm" style={{ '--tone': player.color } as React.CSSProperties} />
        {player.name}
      </div>
      {cash > 0 && <div className="trade-cash-chip static">${cash}</div>}
      <div className="trade-props">
        {properties.length === 0 && cash === 0 && <div className="trade-empty">Nothing</div>}
        {properties.map((idx) => {
          const tile = TILES[idx];
          return (
            <div key={idx} className="trade-prop-row static">
              {tile.kind === 'city'
                ? <Flag group={tile.group} />
                : <span className="trade-prop-swatch" style={{ background: swatchColor(tile) }} />}
              <span className="trade-prop-name">{tile.name}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function TradeOfferModal({ trade, state, me, actions, onClose, onNegotiate }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const from = state.players.find((p) => p.id === trade.fromId);
  const to = state.players.find((p) => p.id === trade.toId);
  if (!from || !to) return null;

  const iAmRecipient = trade.toId === me.id;
  const iAmSender = trade.fromId === me.id;

  const negotiate = () => {
    actions.respondTrade(trade.id, 'decline');
    onNegotiate({
      toId: trade.fromId,
      fromProperties: trade.toProperties,
      toProperties: trade.fromProperties,
      fromCash: trade.toCash,
      toCash: trade.fromCash,
    });
  };

  return (
    <>
      <button className="trade-scrim" aria-label="Close" onClick={onClose} />
      <div className="trade-modal" role="dialog" aria-label="Trade offer">
        <button className="trade-close" onClick={onClose} aria-label="Close">
          <X size={14} />
        </button>

        <div className="trade-title">Trade offer</div>
        {trade.message && <div className="trade-quoted-message">&ldquo;{trade.message}&rdquo;</div>}

        <div className="trade-columns view">
          <Side player={from} cash={trade.fromCash} properties={trade.fromProperties} />
          <div className="trade-swap"><Repeat size={16} /></div>
          <Side player={to} cash={trade.toCash} properties={trade.toProperties} />
        </div>

        {iAmRecipient && (
          <div className="trade-actions">
            <button className="trade-decline" onClick={() => { actions.respondTrade(trade.id, 'decline'); onClose(); }}>
              <XCircle size={14} /> Decline
            </button>
            <button className="trade-negotiate" onClick={negotiate}>
              <Repeat size={14} /> Negotiate
            </button>
            <button className="trade-send" onClick={() => { actions.respondTrade(trade.id, 'accept'); onClose(); }}>
              <Check size={14} /> Accept
            </button>
          </div>
        )}

        {iAmSender && (
          <div className="trade-actions">
            <div className="trade-waiting"><Clock size={13} /> Waiting for {to.name} to respond</div>
            <button className="trade-decline" onClick={() => { actions.respondTrade(trade.id, 'cancel'); onClose(); }}>
              <Ban size={14} /> Withdraw
            </button>
          </div>
        )}
      </div>
    </>
  );
}
