'use client';

import { useEffect, useMemo, useState } from 'react';
import { Gavel, Minus, Plus, Timer, X } from 'lucide-react';
import { TILES } from '@/lib/board';
import type { GameActions } from '@/hooks/useGameSocket';
import type { PendingAuction, Player, RoomState } from '@/types/game';

const QUICK_RAISES = [1, 10, 50, 100];

interface Props {
  auction: PendingAuction;
  state: RoomState;
  me: Player | null;
  actions: GameActions;
}

/**
 * Counts down from the milliseconds the server reported, not from a shared
 * wall clock, so a client whose clock is off still shows the right time.
 * Remounted by its key whenever the server restarts the window.
 */
function AuctionClock({ total }: { total: number }) {
  const [left, setLeft] = useState(total);

  useEffect(() => {
    const startedAt = Date.now();
    const tick = setInterval(() => {
      setLeft(Math.max(0, total - (Date.now() - startedAt)));
    }, 100);
    return () => clearInterval(tick);
  }, [total]);

  const seconds = Math.ceil(left / 1000);
  const fraction = total > 0 ? left / total : 0;
  const urgent = left <= 3000;

  return (
    <div className={`auction-timer${urgent ? ' urgent' : ''}`}>
      <div className="auction-timer-bar">
        <span style={{ width: `${fraction * 100}%` }} />
      </div>
      <span className="auction-timer-label">
        <Timer size={12} /> {seconds}s
      </span>
    </div>
  );
}

export default function AuctionCard({ auction, state, me, actions }: Props) {
  const tile = TILES[auction.tileIndex];
  const price = 'price' in tile ? tile.price : 0;

  const minimum = auction.highestBid + 1;
  const cash = me?.cash ?? 0;

  const inAuction = Boolean(me && auction.participants.includes(me.id));
  const hasPassed = Boolean(me && auction.passed.includes(me.id));
  const isLeader = auction.highestBidderId === me?.id;
  const canAfford = cash >= minimum;
  const canBid = inAuction && !hasPassed && canAfford;

  /**
   * The typed value is kept as a draft string so typing stays free, and the
   * amount actually bid is always clamped into range. Deriving it this way
   * means a rival's bid raising the floor needs no effect to stay correct —
   * an empty draft simply follows the current minimum.
   */
  const [draft, setDraft] = useState('');

  const clamp = (value: number) => Math.max(minimum, Math.min(value, cash));
  const typed = draft === '' ? minimum : Number(draft);
  const amount = clamp(Number.isFinite(typed) ? typed : minimum);
  const valid = cash >= minimum;

  const leader = useMemo(
    () => state.players.find((p) => p.id === auction.highestBidderId) ?? null,
    [state.players, auction.highestBidderId],
  );

  return (
    <div className="auction-card">
      <div className="auction-head">
        <span className="auction-tag"><Gavel size={13} /> Auction</span>
        <span className="auction-tile">{tile.name}</span>
        {price > 0 && <span className="auction-list">list ${price}</span>}
      </div>

      <div className="auction-bid">
        {auction.highestBid > 0 ? (
          <>
            <span className="auction-bid-value">${auction.highestBid}</span>
            <span className="auction-bid-by">
              by <b style={{ color: leader?.color }}>{leader?.name ?? '—'}</b>
            </span>
          </>
        ) : (
          <span className="auction-bid-empty">No bids yet — opens at $1</span>
        )}
      </div>

      <AuctionClock
        key={`${auction.highestBid}:${auction.endsIn ?? 0}`}
        total={auction.endsIn ?? 0}
      />

      <div className="auction-players">
        {auction.participants.map((id) => {
          const player = state.players.find((p) => p.id === id);
          if (!player) return null;
          const passed = auction.passed.includes(id);
          return (
            <span
              key={id}
              className={[
                'auction-chip',
                passed ? 'passed' : '',
                id === auction.highestBidderId ? 'leading' : '',
              ].filter(Boolean).join(' ')}
            >
              <i style={{ background: player.color }} />
              {player.name}
              {passed && <X size={11} />}
            </span>
          );
        })}
      </div>

      {!inAuction && (
        <div className="auction-note">You are not part of this auction</div>
      )}

      {inAuction && hasPassed && (
        <div className="auction-note">You passed — waiting for the others</div>
      )}

      {inAuction && !hasPassed && !canAfford && (
        <div className="auction-note">You can&apos;t reach ${minimum}. Pass to end your part.</div>
      )}

      {canBid && (
        <div className="auction-controls">
          <div className="auction-amount">
            <button
              className="step"
              aria-label="Lower bid"
              disabled={amount <= minimum}
              onClick={() => setDraft(String(clamp(amount - 1)))}
            >
              <Minus size={14} />
            </button>

            <input
              className="auction-input"
              type="number"
              min={minimum}
              max={cash}
              value={draft === '' ? minimum : draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => setDraft(String(amount))}
            />

            <button
              className="step"
              aria-label="Raise bid"
              disabled={amount >= cash}
              onClick={() => setDraft(String(clamp(amount + 1)))}
            >
              <Plus size={14} />
            </button>
          </div>

          <input
            className="auction-slider"
            type="range"
            min={minimum}
            max={Math.max(cash, minimum)}
            value={amount}
            onChange={(e) => setDraft(e.target.value)}
            aria-label="Bid amount"
          />

          <div className="auction-quick">
            {QUICK_RAISES.map((step) => (
              <button
                key={step}
                className="quick"
                disabled={auction.highestBid + step > cash}
                onClick={() => setDraft(String(clamp(auction.highestBid + step)))}
              >
                +{step}
              </button>
            ))}
            <button
              className="quick"
              disabled={cash < minimum}
              onClick={() => setDraft(String(cash))}
            >
              All in
            </button>
          </div>

          <div className="auction-actions">
            <button
              className="cta"
              disabled={!valid}
              onClick={() => actions.bid(amount)}
            >
              <Gavel className="cta-icon" strokeWidth={2.5} />
              <span>Bid ${amount}</span>
            </button>
            <button
              className="cta ghost"
              disabled={isLeader}
              title={isLeader ? 'You are the highest bidder' : 'Drop out of the auction'}
              onClick={actions.pass}
            >
              <X className="cta-icon" strokeWidth={3} />
              <span>Pass</span>
            </button>
          </div>

          <div className="auction-cash">Your cash ${cash}</div>
        </div>
      )}
    </div>
  );
}
