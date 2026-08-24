'use client';

import { useState } from 'react';
import {
  Crown, Lock, WifiOff, Flag, Plus, KeyRound, PanelRightClose, PanelRightOpen, ArrowRight, Pencil,
} from 'lucide-react';
import { TILES, swatchColor } from '@/lib/board';
import { HOTEL_LEVEL, cityRent, rentWithHouses } from '@/lib/rules';
import LobbySettings from './LobbySettings';
import { SurvivalBoard } from './GameOver';
import TradeModal, { type TradeDraft } from './TradeModal';
import TradeOfferModal from './TradeOfferModal';
import type { GameActions } from '@/hooks/useGameSocket';
import type { Player, RoomState, Tile, TradeOffer } from '@/types/game';

interface Props {
  state: RoomState;
  me: Player | null;
  actions: GameActions;
  onViewStats?: () => void;
  /** Fires as the pointer enters/leaves a player row, so the board can spotlight their stuff. */
  onHoverPlayer?: (playerId: string | null) => void;
}

/** What this property currently earns, for the at-a-glance list. */
function calcRentPreview(tile: Tile, level: number, mortgaged?: boolean): number {
  if (mortgaged) return 0;
  if (tile.kind === 'city') return level > 0 ? rentWithHouses(tile.price, level) : cityRent(tile.price);
  return 0;
}

export default function Sidebar({ state, me, actions, onViewStats, onHoverPlayer }: Props) {
  const [open, setOpen] = useState(true);
  const [tradeOpen, setTradeOpen] = useState(false);
  const [tradeInitial, setTradeInitial] = useState<TradeDraft | undefined>(undefined);
  const [viewTradeId, setViewTradeId] = useState<string | null>(null);
  const isHost = me?.id === state.hostId || Boolean(state.sandbox);
  const inLobby = state.phase === 'lobby';
  const ended = state.phase === 'ended';

  const myProperties = Object.entries(state.ownership)
    .filter(([, o]) => o.ownerId === me?.id)
    .map(([idx]) => Number(idx));

  const myTrades = me ? state.trades.filter((t) => t.fromId === me.id || t.toId === me.id) : [];
  const drafting = state.composing
    .map((id) => state.players.find((p) => p.id === id))
    .filter((p): p is Player => Boolean(p));
  const viewTrade: TradeOffer | undefined = myTrades.find((t) => t.id === viewTradeId);
  const otherPlayers = me ? state.players.filter((p) => p.id !== me.id && p.alive) : [];

  if (!open) {
    return (
      <button className="sidebar-rail" onClick={() => setOpen(true)} aria-label="Open sidebar">
        <PanelRightOpen size={16} />
      </button>
    );
  }

  return (
    <div className="sidebar">
      <button className="sidebar-collapse" onClick={() => setOpen(false)} aria-label="Collapse sidebar">
        <PanelRightClose size={15} />
      </button>
      <div className="player-list">
        {state.players.map((player) => (
          <div
            key={player.id}
            className={[
              'player-row',
              player.id === state.currentPlayerId ? 'is-turn' : '',
              player.alive ? '' : 'dead',
            ].filter(Boolean).join(' ')}
            onMouseEnter={() => onHoverPlayer?.(player.id)}
            onMouseLeave={() => onHoverPlayer?.(null)}
          >
            <span className="avatar-sm" style={{ '--tone': player.color } as React.CSSProperties} />
            <div className="player-name">
              {player.name}
              {player.id === me?.id && <span className="you-tag">you</span>}
              {player.dummy && <span className="you-tag">bot</span>}
            </div>
            {player.id === state.hostId && (
              <span className="host-badge" title="Host"><Crown size={11} /></span>
            )}
            {!player.connected && (
              <span className="chip-badge" title="Disconnected"><WifiOff size={11} /></span>
            )}
            {player.inPrison && (
              <span className="chip-badge" title="In prison"><Lock size={11} /></span>
            )}
            {!inLobby && <div className="player-money">${player.cash}</div>}
          </div>
        ))}
      </div>

      {inLobby ? (
        <LobbySettings
          settings={state.settings}
          isHost={isHost}
          locked={false}
          actions={actions}
        />
      ) : ended ? (
        onViewStats ? <SurvivalBoard state={state} onViewAll={onViewStats} /> : null
      ) : (
        <>
          <button
            className="bankrupt-btn"
            onClick={actions.bankrupt}
            disabled={!me?.alive || state.phase !== 'playing'}
          >
            <Flag size={14} /> Declare bankruptcy
          </button>

          <div className="panel-block">
            <div className="head">
              <div className="t">
                Trades
                {drafting.length > 0 && (
                  <span className="drafting-stack" title={`${drafting.map((p) => p.name).join(', ')} ${drafting.length > 1 ? 'are' : 'is'} drafting a trade`}>
                    {drafting.map((p) => (
                      <span key={p.id} className="drafting-avatar" style={{ '--tone': p.color } as React.CSSProperties}>
                        <Pencil size={9} className="drafting-pencil" />
                      </span>
                    ))}
                  </span>
                )}
              </div>
              <button
                className="create-btn"
                disabled={!me?.alive || otherPlayers.length === 0}
                onClick={() => { setTradeInitial(undefined); setTradeOpen(true); }}
              >
                <Plus size={13} /> Create
              </button>
            </div>
            {myTrades.length === 0 ? (
              <div className="desc">
                No open trades. Properties otherwise change hands through
                purchases, rent and bankruptcies.
              </div>
            ) : (
              <div className="trade-list">
                {myTrades.map((t) => {
                  const outgoing = t.fromId === me?.id;
                  const other = state.players.find((p) => p.id === (outgoing ? t.toId : t.fromId));
                  const mine = outgoing ? t.fromProperties.length + (t.fromCash > 0 ? 1 : 0)
                    : t.toProperties.length + (t.toCash > 0 ? 1 : 0);
                  const theirs = outgoing ? t.toProperties.length + (t.toCash > 0 ? 1 : 0)
                    : t.fromProperties.length + (t.fromCash > 0 ? 1 : 0);
                  return (
                    <button key={t.id} className="trade-row" onClick={() => setViewTradeId(t.id)}>
                      <span className="avatar-sm" style={{ '--tone': other?.color } as React.CSSProperties} />
                      <span className="trade-row-text">
                        {outgoing ? `You → ${other?.name}` : `${other?.name} → you`}
                      </span>
                      <span className="trade-row-count">
                        {mine} <ArrowRight size={11} /> {theirs}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="section-title">My properties ({myProperties.length})</div>
          {myProperties.length === 0 ? (
            <div className="empty-state">
              <KeyRound size={22} />
              <span>You don&apos;t own any properties yet.<br />Land on one and buy it.</span>
            </div>
          ) : (
            <div className="prop-list">
              {myProperties.map((idx) => {
                const tile = TILES[idx];
                const owned = state.ownership[idx];
                const level = owned?.houses ?? 0;

                return (
                  <div key={idx} className={`prop-item${owned?.mortgaged ? ' mortgaged' : ''}`}>
                    <span className="prop-swatch" style={{ background: swatchColor(tile) }} />
                    <div className="prop-name">
                      {tile.name}
                      {owned?.mortgaged && <span className="prop-tag">mortgaged</span>}
                      {level > 0 && (
                        <span className="prop-tag houses">
                          {level === HOTEL_LEVEL ? 'hotel' : `${level}h`}
                        </span>
                      )}
                    </div>
                    <div className="prop-rent">
                      ${calcRentPreview(tile, level, owned?.mortgaged)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {tradeOpen && me && (
        <TradeModal
          state={state}
          me={me}
          actions={actions}
          initial={tradeInitial}
          onClose={() => setTradeOpen(false)}
        />
      )}
      {viewTrade && me && (
        <TradeOfferModal
          trade={viewTrade}
          state={state}
          me={me}
          actions={actions}
          onClose={() => setViewTradeId(null)}
          onNegotiate={(draft) => {
            setViewTradeId(null);
            setTradeInitial(draft);
            setTradeOpen(true);
          }}
        />
      )}
    </div>
  );
}
