'use client';

import { useEffect, useRef, useState } from 'react';
import { TILE_CENTRES } from '@/lib/geometry';
import { walkPath, isWalk } from '@/lib/path';
import { travelFacing } from '@/lib/board';
import type { Player } from '@/types/game';

/** Milliseconds spent travelling one tile. */
const STEP_MS = 135;

/**
 * Tokens are an overlay above the tiles rather than children of one: a piece
 * has to travel *through* the squares between its old and new position, which
 * it cannot do while parented to a single tile.
 *
 * Positions come from `lib/geometry.ts` — percentages derived from the grid —
 * so there is nothing to measure and no layout timing to get wrong.
 */
export default function TokenLayer({
  players,
  myId,
  currentPlayerId,
  hoverPlayerId,
}: {
  players: Player[];
  myId: string | null;
  currentPlayerId: string | null;
  /** Whoever the sidebar's player row is hovered over — everyone else fades out. */
  hoverPlayerId?: string | null;
}) {
  const seated = players.filter((p) => p.alive);

  return (
    <div className="token-layer" aria-hidden="true">
      {seated.map((player, i) => (
        <Token
          key={player.id}
          player={player}
          seat={i}
          seats={seated.length}
          isMe={player.id === myId}
          isTurn={player.id === currentPlayerId}
          dim={Boolean(hoverPlayerId) && player.id !== hoverPlayerId}
          spotlight={player.id === hoverPlayerId}
        />
      ))}
    </div>
  );
}

/**
 * A stable offset per seat so pieces sharing a tile stay readable.
 * Values are percentages of the board, matching the position units.
 */
function seatOffset(seat: number, seats: number): { x: number; y: number } {
  if (seats <= 1) return { x: 0, y: 0 };
  const spread = 1.05;
  const ring = [
    { x: -1, y: -1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: 1, y: 1 },
    { x: 0, y: -1.4 }, { x: 0, y: 1.4 }, { x: -1.4, y: 0 }, { x: 1.4, y: 0 },
  ];
  const slot = ring[seat % ring.length];
  return { x: slot.x * spread, y: slot.y * spread };
}

function Token({
  player, seat, seats, isMe, isTurn, dim, spotlight,
}: {
  player: Player;
  seat: number;
  seats: number;
  isMe: boolean;
  isTurn: boolean;
  dim?: boolean;
  spotlight?: boolean;
}) {
  const [index, setIndex] = useState(player.pos);
  const [walking, setWalking] = useState(false);
  const atRef = useRef(player.pos);

  useEffect(() => {
    const from = atRef.current;
    const path = walkPath(from, player.pos);
    if (path.length === 0) return undefined;

    // Cards and going to prison relocate the piece; they are not a walk.
    if (!isWalk(from, player.pos)) {
      atRef.current = player.pos;
      setIndex(player.pos);
      return undefined;
    }

    setWalking(true);
    let step = 0;
    const timer = setInterval(() => {
      const next = path[step];
      atRef.current = next; // advance as we go, so an interrupt leaves no stale state
      setIndex(next);
      step += 1;
      if (step >= path.length) {
        clearInterval(timer);
        setWalking(false);
      }
    }, STEP_MS);

    return () => clearInterval(timer);
  }, [player.pos]);

  const centre = TILE_CENTRES[index] ?? TILE_CENTRES[0];
  const offset = seatOffset(seat, seats);

  const classes = ['token', `face-${travelFacing(index)}`];
  if (isMe) classes.push('me');
  if (isTurn) classes.push('active');
  if (walking) classes.push('walking');
  if (dim) classes.push('dim');
  if (spotlight) classes.push('spotlight-glow');

  return (
    <div
      className={classes.join(' ')}
      style={{
        left: `${centre.x + offset.x}%`,
        top: `${centre.y + offset.y}%`,
        transitionDuration: `${STEP_MS}ms`,
        ['--hop' as string]: `${STEP_MS}ms`,
        ['--tone' as string]: player.color,
      }}
      title={player.name}
    >
      <span className="token-shadow" />
      <span className="token-body">
        <span className="token-eye" />
        <span className="token-eye" />
      </span>
    </div>
  );
}
