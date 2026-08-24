'use client';

import { useMemo, useState } from 'react';
import {
  FlaskConical, Play, RotateCcw, Plus, UserRound, Landmark, Hotel,
  Gavel, Lock, Palmtree, Trophy, Dices, ChevronLeft,
} from 'lucide-react';
import { GROUP_COLORS, TILES, isOwnable } from '@/lib/board';
import { HOTEL_LEVEL } from '@/lib/rules';
import Combobox from './Combobox';
import type { SandboxCommand } from '@/lib/protocol';
import type { GroupKey, Player, RoomState } from '@/types/game';

const GROUPS = Object.keys(GROUP_COLORS) as GroupKey[];
const HOUSE_LABELS = ['0', '1', '2', '3', '4', 'H'];

interface Props {
  state: RoomState;
  me: Player | null;
  send: (cmd: SandboxCommand) => void;
  selectedTile: number;
  onSelectTile: (index: number) => void;
}

export default function SandboxPanel({ state, me, send, selectedTile, onSelectTile }: Props) {
  const [open, setOpen] = useState(true);
  const [playerId, setPlayerId] = useState(me?.id ?? state.players[0]?.id ?? '');
  const [cash, setCash] = useState(String(me?.cash ?? 1500));
  const [d1, setD1] = useState(4);
  const [d2, setD2] = useState(3);

  // `playerId` can go stale (its player left, or was never set); `player`
  // below always falls back to `me`, and that's what drives the select's
  // value, so nothing needs to resync `playerId` itself — no effect required.
  const player = state.players.find((p) => p.id === playerId) ?? me ?? null;
  const owned = state.ownership[selectedTile];
  const tile = TILES[selectedTile];
  const ownable = isOwnable(tile);

  const scenes = useMemo(() => {
    if (!player) return [];
    return [
      {
        id: 'buy',
        label: 'Buy prompt',
        icon: Landmark,
        run: () => send({ op: 'offerBuy', playerId: player.id, tileIndex: selectedTile }),
      },
      {
        id: 'auction',
        label: 'Auction',
        icon: Gavel,
        run: () => send({ op: 'openAuction', tileIndex: selectedTile }),
      },
      {
        id: 'set',
        label: 'Full set + hotel',
        icon: Hotel,
        run: () => {
          const group = tile.kind === 'city' ? tile.group : 'israel';
          send({ op: 'grantGroup', playerId: player.id, group });
          const members = TILES
            .map((t, i) => (t.kind === 'city' && t.group === group ? i : -1))
            .filter((i) => i >= 0);
          members.forEach((i, n) => {
            send({ op: 'setHouses', tileIndex: i, houses: n === members.length - 1 ? HOTEL_LEVEL : 4 });
          });
        },
      },
      {
        id: 'mortgage',
        label: 'Mortgage',
        icon: Landmark,
        run: () => {
          send({ op: 'grant', playerId: player.id, tileIndex: selectedTile });
          send({ op: 'setMortgage', tileIndex: selectedTile, mortgaged: true });
        },
      },
      {
        id: 'jail',
        label: 'Prison',
        icon: Lock,
        run: () => send({ op: 'jail', playerId: player.id, inPrison: true }),
      },
      {
        id: 'pot',
        label: 'Vacation pot',
        icon: Palmtree,
        run: () => send({ op: 'setPot', amount: 500 }),
      },
      {
        id: 'win',
        label: 'Winner',
        icon: Trophy,
        run: () => send({ op: 'endGame', winnerId: player.id }),
      },
    ];
  }, [player, selectedTile, send, tile]);

  if (!open) {
    return (
      <button className="lab-tab" onClick={() => setOpen(true)} aria-label="Open lab panel">
        <FlaskConical size={15} />
        Lab
      </button>
    );
  }

  return (
    <aside className="lab-panel">
      <header className="lab-head">
        <div className="lab-title">
          <FlaskConical size={15} />
          UI lab
        </div>
        <button className="lab-icon-btn" onClick={() => setOpen(false)} aria-label="Collapse lab">
          <ChevronLeft size={15} />
        </button>
      </header>

      <div className="lab-body">
        <section className="lab-section">
          <div className="lab-label">Match</div>
          <div className="lab-row">
            <button className="lab-btn gold" onClick={() => send({ op: 'start' })}>
              <Play size={13} /> Start
            </button>
            <button className="lab-btn" onClick={() => send({ op: 'reset' })}>
              <RotateCcw size={13} /> Reset
            </button>
            <button className="lab-btn" onClick={() => send({ op: 'addDummy' })}>
              <Plus size={13} /> Dummy
            </button>
          </div>
        </section>

        <section className="lab-section">
          <div className="lab-label">Player</div>
          <Combobox
            className="lab-select"
            value={player?.id ?? ''}
            options={state.players.map((p) => ({
              value: p.id,
              label: `${p.name}${p.id === me?.id ? ' (you)' : p.dummy ? ' (dummy)' : ''}`,
            }))}
            onChange={(v) => {
              setPlayerId(v);
              const next = state.players.find((p) => p.id === v);
              if (next) setCash(String(next.cash));
            }}
          />
          {player && (
            <>
              <div className="lab-row wrap">
                <button className="lab-btn" onClick={() => send({ op: 'possess', playerId: player.id })}>
                  <UserRound size={13} /> Act as
                </button>
                <button className="lab-btn" onClick={() => send({ op: 'setTurn', playerId: player.id })}>
                  Their turn
                </button>
                <button
                  className="lab-btn"
                  onClick={() => send({ op: 'jail', playerId: player.id, inPrison: !player.inPrison })}
                >
                  {player.inPrison ? 'Free' : 'Jail'}
                </button>
                {player.alive ? (
                  <button className="lab-btn danger" onClick={() => send({ op: 'bankrupt', playerId: player.id })}>
                    Bankrupt
                  </button>
                ) : (
                  <button className="lab-btn" onClick={() => send({ op: 'revive', playerId: player.id })}>
                    Revive
                  </button>
                )}
                {player.dummy && (
                  <button className="lab-btn danger" onClick={() => send({ op: 'remove', playerId: player.id })}>
                    Remove
                  </button>
                )}
              </div>
              <div className="lab-row">
                <input
                  className="lab-input"
                  type="number"
                  min={0}
                  max={999999}
                  value={cash}
                  onChange={(e) => setCash(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') send({ op: 'setCash', playerId: player.id, cash: Number(cash) });
                  }}
                  aria-label="Cash"
                />
                <button
                  className="lab-btn"
                  onClick={() => send({ op: 'setCash', playerId: player.id, cash: Number(cash) })}
                >
                  Set $
                </button>
              </div>
            </>
          )}
        </section>

        <section className="lab-section">
          <div className="lab-label">Tile · click the board to pick</div>
          <Combobox
            className="lab-select"
            value={String(selectedTile)}
            options={TILES.map((t, i) => ({ value: String(i), label: `${i}. ${t.name}` }))}
            onChange={(v) => onSelectTile(Number(v))}
          />
          {player && (
            <div className="lab-row wrap">
              <button
                className="lab-btn"
                onClick={() => send({ op: 'setPos', playerId: player.id, pos: selectedTile })}
              >
                Go
              </button>
              <button
                className="lab-btn gold"
                onClick={() => send({ op: 'setPos', playerId: player.id, pos: selectedTile, land: true })}
              >
                Land
              </button>
              {ownable && (
                <>
                  <button
                    className="lab-btn"
                    onClick={() => send({ op: 'grant', playerId: player.id, tileIndex: selectedTile })}
                  >
                    Grant
                  </button>
                  <button
                    className="lab-btn"
                    disabled={!owned}
                    onClick={() => send({ op: 'revoke', tileIndex: selectedTile })}
                  >
                    Revoke
                  </button>
                  <button
                    className="lab-btn"
                    disabled={!owned}
                    onClick={() => send({
                      op: 'setMortgage',
                      tileIndex: selectedTile,
                      mortgaged: !owned?.mortgaged,
                    })}
                  >
                    {owned?.mortgaged ? 'Unmortgage' : 'Mortgage'}
                  </button>
                </>
              )}
            </div>
          )}
          {tile.kind === 'city' && owned && (
            <div className="lab-houses">
              {HOUSE_LABELS.map((label, level) => (
                <button
                  key={label}
                  className={`lab-house${(owned.houses ?? 0) === level ? ' on' : ''}`}
                  onClick={() => send({ op: 'setHouses', tileIndex: selectedTile, houses: level })}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          {tile.kind === 'city' && player && (
            <button
              className="lab-btn wide"
              onClick={() => send({ op: 'grantGroup', playerId: player.id, group: tile.group })}
            >
              Grant whole {tile.group} set
            </button>
          )}
          {tile.kind !== 'city' && player && (
            <Combobox
              className="lab-select"
              value=""
              placeholder="Grant a colour set…"
              options={GROUPS.map((g) => ({ value: g, label: g }))}
              onChange={(v) => {
                if (!v) return;
                send({ op: 'grantGroup', playerId: player.id, group: v as GroupKey });
              }}
            />
          )}
        </section>

        <section className="lab-section">
          <div className="lab-label">Dice</div>
          <div className="lab-row">
            <Combobox
              value={String(d1)}
              options={[1, 2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: String(n) }))}
              onChange={(v) => setD1(Number(v))}
            />
            <Combobox
              value={String(d2)}
              options={[1, 2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: String(n) }))}
              onChange={(v) => setD2(Number(v))}
            />
            <button className="lab-btn" onClick={() => send({ op: 'setDice', d1, d2 })}>
              Show
            </button>
            <button className="lab-btn gold" onClick={() => send({ op: 'forceRoll', d1, d2 })}>
              <Dices size={13} /> Walk
            </button>
          </div>
        </section>

        <section className="lab-section">
          <div className="lab-label">Scenes</div>
          <div className="lab-row wrap">
            {scenes.map((scene) => (
              <button key={scene.id} className="lab-btn" onClick={scene.run}>
                <scene.icon size={13} /> {scene.label}
              </button>
            ))}
            <button className="lab-btn" onClick={() => send({ op: 'clearPending' })}>
              Clear prompt
            </button>
          </div>
        </section>
      </div>
    </aside>
  );
}
