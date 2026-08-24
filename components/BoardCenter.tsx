'use client';

import { Play, Dices, Check, X } from 'lucide-react';
import { TILES } from '@/lib/board';
import Dice from './Dice';
import AuctionCard from './AuctionCard';
import CenterLog from './CenterLog';
import type { GameActions } from '@/hooks/useGameSocket';
import type { Player, RoomState } from '@/types/game';

interface Props {
  state: RoomState;
  me: Player | null;
  rolling: boolean;
  actions: GameActions;
}

export default function BoardCenter({ state, me, rolling, actions }: Props) {
  const isHost = me?.id === state.hostId;
  const myTurn = state.currentPlayerId === me?.id;
  const pending = state.pending;
  const current = state.players.find((p) => p.id === state.currentPlayerId) ?? null;

  const buying = pending?.type === 'buy' ? pending : null;
  const auction = pending?.type === 'auction' ? pending : null;
  const buyer = buying ? state.players.find((p) => p.id === buying.playerId) ?? null : null;

  return (
    <div className="board-center">
      <Dice dice={state.dice} rolling={rolling} />

      {state.phase === 'lobby' && (
        <>
          <button
            className="cta"
            onClick={actions.start}
            disabled={!isHost || (state.players.length < 2 && !state.sandbox)}
          >
            <Play className="cta-icon" strokeWidth={2.5} />
            <span>Start Game</span>
          </button>
          {!isHost && <div className="center-note">Waiting for the host to start the game</div>}
          {isHost && state.players.length < 2 && !state.sandbox && (
            <div className="center-note">Waiting for at least one more player</div>
          )}
        </>
      )}

      {auction && (
        <AuctionCard auction={auction} state={state} me={me} actions={actions} />
      )}

      {buying && buying.playerId === me?.id && (
        <div className="buy-card">
          <div className="title">{TILES[buying.tileIndex].name}</div>
          <div className="sub">Unowned property · ${buying.price}</div>
          <div className="cta-row">
            <button
              className="cta"
              onClick={actions.buy}
              disabled={(me?.cash ?? 0) < buying.price}
            >
              <Check className="cta-icon" strokeWidth={3} />
              <span>Buy ${buying.price}</span>
            </button>
            <button className="cta ghost" onClick={actions.skip}>
              <X className="cta-icon" strokeWidth={3} />
              <span>Skip</span>
            </button>
          </div>
        </div>
      )}

      {buying && buying.playerId !== me?.id && (
        <div className="center-note">
          <span className="who">{buyer?.name ?? 'Someone'}</span> is deciding on{' '}
          <span className="who">{TILES[buying.tileIndex].name}</span>
        </div>
      )}

      {state.phase === 'playing' && !pending && (
        myTurn ? (
          <button className="cta" onClick={actions.roll} disabled={rolling}>
            <Dices className="cta-icon" strokeWidth={2.5} />
            <span>Roll the dice</span>
          </button>
        ) : (
          <div className="center-note">
            It&apos;s <span className="who">{current?.name ?? '...'}</span>&apos;s turn
          </div>
        )
      )}

      <CenterLog log={state.log} />
    </div>
  );
}
