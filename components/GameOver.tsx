'use client';

import { useRouter } from 'next/navigation';
import {
  Clock, Dices, Handshake, MessageSquare, Play, RotateCcw, Skull,
  Trophy, MapPin, X, LineChart, ArrowLeft,
} from 'lucide-react';
import { TILES } from '@/lib/board';
import Flag from './Flag';
import {
  emptyStats,
  formatDuration,
  mostJailed,
  mostVisitedTile,
  recapDuration,
  turnsSurvived,
} from '@/lib/stats';
import type { GameActions } from '@/hooks/useGameSocket';
import type { GameStats, Player, RoomState, WorthSample } from '@/types/game';

export type RecapView = 'over' | 'stats';

interface Props {
  state: RoomState;
  me: Player | null;
  view: RecapView;
  actions: GameActions;
  onBackToBoard: () => void;
}

export default function GameOver({ state, me, view, actions, onBackToBoard }: Props) {
  const router = useRouter();
  const stats = state.stats ?? emptyStats();
  const winner = state.players.find((p) => p.id === state.winner) ?? null;
  const isHost = me?.id === state.hostId;

  const backToLobby = () => {
    actions.leave();
    router.push('/');
  };

  return (
    <div className={`recap${view === 'stats' ? ' recap-stats' : ''}`}>
      {view === 'over' ? (
        <OverLay
          winner={winner}
          isHost={isHost}
          onAnother={() => actions.rematch()}
          onLobby={backToLobby}
        />
      ) : (
        <StatsLay
          state={state}
          stats={stats}
          winner={winner}
          onBack={onBackToBoard}
        />
      )}
    </div>
  );
}

function OverLay({
  winner, isHost, onAnother, onLobby,
}: {
  winner: Player | null;
  isHost: boolean;
  onAnother: () => void;
  onLobby: () => void;
}) {
  return (
    <div className="recap-over">
      <Dices className="recap-dice" strokeWidth={1.35} />
      <h2 className="recap-kicker">Game over</h2>
      <p className="recap-lead">and the winner is…</p>
      <div className="recap-winner">
        <span className="recap-token" style={{ '--tone': winner?.color ?? '#d4af37' } as React.CSSProperties} />
        <span className="recap-winner-name">{winner?.name ?? 'Nobody'}</span>
      </div>
      <div className="recap-actions">
        <button className="cta recap-cta" onClick={onAnother} disabled={!isHost}>
          <RotateCcw className="cta-icon" strokeWidth={2.5} />
          <span>Another game</span>
        </button>
        <button className="cta ghost recap-cta" onClick={onLobby}>
          <X className="cta-icon" strokeWidth={2.5} />
          <span>Back to lobby</span>
        </button>
      </div>
      {!isHost && <p className="recap-hint">The host can start another game at this table</p>}
    </div>
  );
}

function StatsLay({
  state, stats, winner, onBack,
}: {
  state: RoomState;
  stats: GameStats;
  winner: Player | null;
  onBack: () => void;
}) {
  const duration = recapDuration(state);
  const visited = mostVisitedTile(stats);
  const jailed = mostJailed(stats, state.players);
  const visitedTile = visited ? TILES[visited.index] : null;

  return (
    <div className="recap-dash">
      <button className="recap-back" onClick={onBack}>
        <ArrowLeft size={14} /> Back to board
      </button>

      <article className="recap-card recap-champ">
        <div className="recap-card-kicker"><Trophy size={13} /> Winner</div>
        <div className="recap-winner tight">
          <span className="recap-token sm" style={{ '--tone': winner?.color ?? '#d4af37' } as React.CSSProperties} />
          <span className="recap-winner-name">{winner?.name ?? 'Nobody'}</span>
        </div>
      </article>

      <article className="recap-card recap-facts">
        <Fact icon={Clock} label="Duration" value={duration ? formatDuration(duration) : '—'} />
        <Fact icon={Play} label="Turns" value={String(stats.turns)} />
        <Fact icon={Dices} label="Doubles" value={String(stats.doubles)} />
        <Fact icon={Handshake} label="Trades" value="0" />
        <Fact icon={MessageSquare} label="Chat messages" value={String(state.chat.length)} />
      </article>

      <article className="recap-card recap-chart">
        <div className="recap-card-kicker"><LineChart size={13} /> Net worth</div>
        <WorthChart players={state.players} samples={stats.worth} />
      </article>

      <article className="recap-card recap-hot">
        <div className="recap-card-kicker"><MapPin size={13} /> Most visited</div>
        {visitedTile ? (
          <div className="recap-hot-body">
            {visitedTile.kind === 'city' ? <Flag group={visitedTile.group} /> : null}
            <div>
              <div className="recap-hot-name">{visitedTile.name}</div>
              <div className="recap-hot-sub">{visited?.visits} landing{visited?.visits === 1 ? '' : 's'}</div>
            </div>
          </div>
        ) : (
          <div className="recap-hot-sub">Nobody moved</div>
        )}
      </article>

      <article className="recap-card recap-jail">
        <div className="recap-card-kicker"><Skull size={13} /> Most times in prison</div>
        {jailed ? (
          <div className="recap-hot-body">
            <span className="recap-token sm" style={{ '--tone': jailed.player.color } as React.CSSProperties} />
            <div>
              <div className="recap-hot-name">{jailed.player.name}</div>
              <div className="recap-hot-sub">{jailed.visits} visit{jailed.visits === 1 ? '' : 's'}</div>
            </div>
          </div>
        ) : (
          <div className="recap-hot-sub">The prison stayed empty</div>
        )}
      </article>
    </div>
  );
}

function Fact({
  icon: Icon, label, value,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
}) {
  return (
    <div className="recap-fact">
      <Icon size={14} />
      <span className="recap-fact-label">{label}</span>
      <span className="recap-fact-value">{value}</span>
    </div>
  );
}

export function SurvivalBoard({
  state, onViewAll,
}: {
  state: RoomState;
  onViewAll: () => void;
}) {
  const stats = state.stats ?? emptyStats();
  const ranked = [...state.players].sort(
    (a, b) => turnsSurvived(stats, b, state.winner) - turnsSurvived(stats, a, state.winner),
  );
  const max = Math.max(1, ...ranked.map((p) => turnsSurvived(stats, p, state.winner)));

  return (
    <div className="panel-block recap-side">
      <div className="head"><div className="t">Game statistics</div></div>
      <ol className="survive-list">
        {ranked.map((player, i) => {
          const turns = turnsSurvived(stats, player, state.winner);
          const won = player.id === state.winner;
          return (
            <li key={player.id} className="survive-row">
              <span className="survive-rank">{i + 1}</span>
              <span className="avatar-sm" style={{ '--tone': player.color } as React.CSSProperties} />
              <span className="survive-name">{player.name}</span>
              <div className="survive-bar-wrap">
                <div
                  className={`survive-bar${won ? ' win' : ''}`}
                  style={{
                    width: `${Math.max(8, (turns / max) * 100)}%`,
                    background: player.color,
                  }}
                >
                  {won ? 'winner' : turns}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      <button className="survive-all" onClick={onViewAll}>
        <LineChart size={14} /> View all statistics
      </button>
    </div>
  );
}

function WorthChart({ players, samples }: { players: Player[]; samples: WorthSample[] }) {
  if (samples.length < 2) {
    return <div className="recap-hot-sub">Not enough turns for a chart yet</div>;
  }

  const width = 320;
  const height = 168;
  const pad = { l: 36, r: 8, t: 10, b: 22 };
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;

  let min = 0;
  let max = 1;
  for (const sample of samples) {
    for (const value of Object.values(sample.values)) {
      if (value < min) min = value;
      if (value > max) max = value;
    }
  }
  const span = max - min || 1;
  const lastTurn = samples[samples.length - 1].turn || 1;

  const x = (turn: number) => pad.l + (turn / lastTurn) * innerW;
  const y = (value: number) => pad.t + (1 - (value - min) / span) * innerH;
  const zeroY = y(0);

  const ticks = [min, 0, max].filter((v, i, all) => all.indexOf(v) === i);

  return (
    <div className="worth-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Net worth over turns">
        <rect x={pad.l} y={zeroY} width={innerW} height={Math.max(0, pad.t + innerH - zeroY)} fill="rgba(224,85,95,.08)" />
        <line x1={pad.l} y1={zeroY} x2={width - pad.r} y2={zeroY} stroke="rgba(224,85,95,.45)" strokeWidth="1" />
        {ticks.map((tick) => (
          <text
            key={tick}
            x={pad.l - 6}
            y={y(tick) + 3}
            textAnchor="end"
            fill="#7a7059"
            fontSize="8"
            fontWeight="700"
          >
            {tick === 0 ? '0' : `${Math.round(tick / 100) * 100}`}
          </text>
        ))}
        {players.map((player) => {
          const d = samples
            .map((sample, i) => {
              const value = sample.values[player.id] ?? 0;
              const cmd = i === 0 ? 'M' : 'L';
              return `${cmd}${x(sample.turn).toFixed(1)},${y(value).toFixed(1)}`;
            })
            .join(' ');
          return (
            <path
              key={player.id}
              d={d}
              fill="none"
              stroke={player.color}
              strokeWidth="2.2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          );
        })}
        <text x={width - pad.r} y={height - 4} textAnchor="end" fill="#7a7059" fontSize="8" fontWeight="700">
          Turn {lastTurn}
        </text>
      </svg>
      <div className="worth-legend">
        {players.map((player) => (
          <span key={player.id} className="worth-key">
            <i style={{ background: player.color }} />
            {player.name}
          </span>
        ))}
      </div>
    </div>
  );
}
