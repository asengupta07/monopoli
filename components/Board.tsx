'use client';

import { useState } from 'react';
import { TILES, gridPosition, isOwnable, fullSetOwner } from '@/lib/board';
import Tile from './Tile';
import CornerTile from './CornerTile';
import BoardCenter from './BoardCenter';
import TokenLayer from './TokenLayer';
import PropertyCard from './PropertyCard';
import GameOver, { type RecapView } from './GameOver';
import type { GameActions } from '@/hooks/useGameSocket';
import type { Player, RoomState } from '@/types/game';

interface Props {
  state: RoomState;
  me: Player | null;
  rolling: boolean;
  actions: GameActions;
  onPickTile?: (index: number) => void;
  pickIndex?: number;
  recap?: RecapView;
  onBackToBoard?: () => void;
  /** Whoever the sidebar's player row is hovered over — their board footprint glows, everything else fades. */
  hoverPlayerId?: string | null;
}

export default function Board({
  state, me, rolling, actions, onPickTile, pickIndex, recap, onBackToBoard, hoverPlayerId,
}: Props) {
  const [openTile, setOpenTile] = useState<number | null>(null);
  const playersById = new Map(state.players.map((p) => [p.id, p]));

  return (
    <div className="board-area">
      <div className="board">
        {TILES.map((tile, index) => {
          const { col, row, side } = gridPosition(index);

          if (tile.kind === 'corner') {
            return (
              <CornerTile
                key={index}
                index={index}
                tile={tile}
                col={col}
                row={row}
                dim={Boolean(hoverPlayerId)}
              />
            );
          }

          const owned = state.ownership[index];
          const owner = owned ? playersById.get(owned.ownerId) ?? null : null;
          const setOwnerId = tile.kind === 'city'
            ? fullSetOwner(state.ownership, tile.group)
            : null;
          const setOwnerColor = setOwnerId ? playersById.get(setOwnerId)?.color ?? null : null;
          return (
            <Tile
              key={index}
              index={index}
              tile={tile}
              side={side}
              col={col}
              row={row}
              owner={owner}
              mortgaged={Boolean(owned?.mortgaged)}
              houses={owned?.houses ?? 0}
              setComplete={Boolean(setOwnerColor)}
              setColor={setOwnerColor}
              highlight={state.pending?.tileIndex === index || pickIndex === index}
              dim={Boolean(hoverPlayerId) && owner?.id !== hoverPlayerId}
              spotlight={Boolean(owner) && owner?.id === hoverPlayerId}
              onOpen={isOwnable(tile) ? () => {
                onPickTile?.(index);
                setOpenTile(index);
              } : undefined}
            />
          );
        })}

        <BoardCenter state={state} me={me} rolling={rolling} actions={actions} />

        <TokenLayer
          players={state.players}
          myId={me?.id ?? null}
          currentPlayerId={state.currentPlayerId}
          hoverPlayerId={hoverPlayerId}
        />

        {openTile !== null && state.phase !== 'ended' && (
          <PropertyCard
            index={openTile}
            state={state}
            me={me}
            actions={actions}
            onClose={() => setOpenTile(null)}
          />
        )}

        {state.phase === 'ended' && recap && onBackToBoard && (
          <GameOver
            state={state}
            me={me}
            view={recap}
            actions={actions}
            onBackToBoard={onBackToBoard}
          />
        )}
      </div>
    </div>
  );
}
