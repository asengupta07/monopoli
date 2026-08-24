import { TILES, isOwnable } from './board';
import { houseCost, mortgageValue } from './rules';
import type { GameStats, Player, Room, RoomState, WorthSample } from '@/types/game';

export function emptyStats(): GameStats {
  return {
    startedAt: 0,
    endedAt: null,
    turns: 0,
    doubles: 0,
    tileVisits: {},
    prisonVisits: {},
    outAt: {},
    worth: [],
  };
}

export function ensureStats(room: Room): GameStats {
  if (!room.stats) room.stats = emptyStats();
  return room.stats;
}

/** Cash plus properties at list (or mortgage) value, plus buildings. */
export function playerNetWorth(room: Room, playerId: string): number {
  const player = room.players.find((p) => p.id === playerId);
  if (!player || !player.alive) return 0;

  let total = player.cash;
  for (const [key, own] of Object.entries(room.ownership)) {
    if (own.ownerId !== playerId) continue;
    const tile = TILES[Number(key)];
    if (!isOwnable(tile)) continue;
    if (own.mortgaged) {
      total += mortgageValue(tile.price, room.settings.mortgageRate);
      continue;
    }
    total += tile.price;
    if (tile.kind === 'city' && own.houses > 0) {
      total += houseCost(tile.group) * own.houses;
    }
  }
  return total;
}

export function recordWorth(room: Room): void {
  const stats = ensureStats(room);
  const values: Record<string, number> = {};
  for (const player of room.players) values[player.id] = playerNetWorth(room, player.id);

  const last = stats.worth[stats.worth.length - 1];
  if (last && last.turn === stats.turns) {
    last.values = values;
    return;
  }
  stats.worth.push({ turn: stats.turns, values });
  if (stats.worth.length > 400) {
    stats.worth = stats.worth.filter((_, i) => i % 2 === 0);
  }
}

export function noteTurn(room: Room, doubles: boolean): void {
  const stats = ensureStats(room);
  stats.turns += 1;
  if (doubles) stats.doubles += 1;
}

export function noteVisit(room: Room, tileIndex: number): void {
  const stats = ensureStats(room);
  stats.tileVisits[tileIndex] = (stats.tileVisits[tileIndex] ?? 0) + 1;
}

export function notePrison(room: Room, playerId: string): void {
  const stats = ensureStats(room);
  stats.prisonVisits[playerId] = (stats.prisonVisits[playerId] ?? 0) + 1;
}

export function finalizeStats(room: Room): void {
  const stats = ensureStats(room);
  stats.endedAt = Date.now();
  recordWorth(room);
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export function turnsSurvived(stats: GameStats, player: Player, winnerId: string | null): number {
  if (player.id === winnerId) return stats.turns;
  return stats.outAt[player.id] ?? stats.turns;
}

export function mostVisitedTile(stats: GameStats): { index: number; visits: number } | null {
  let best: { index: number; visits: number } | null = null;
  for (const [key, visits] of Object.entries(stats.tileVisits)) {
    const index = Number(key);
    const tile = TILES[index];
    if (!tile || visits <= 0) continue;
    const ownable = isOwnable(tile);
    if (!best) {
      best = { index, visits };
      continue;
    }
    const bestOwnable = isOwnable(TILES[best.index]);
    if (ownable && !bestOwnable) best = { index, visits };
    else if (ownable === bestOwnable && visits > best.visits) best = { index, visits };
  }
  return best;
}

export function mostJailed(stats: GameStats, players: Player[]): { player: Player; visits: number } | null {
  let best: { player: Player; visits: number } | null = null;
  for (const player of players) {
    const visits = stats.prisonVisits[player.id] ?? 0;
    if (visits <= 0) continue;
    if (!best || visits > best.visits) best = { player, visits };
  }
  return best;
}

export function recapDuration(state: RoomState): number {
  const stats = state.stats ?? emptyStats();
  const start = stats.startedAt;
  if (!start) return 0;
  return (stats.endedAt ?? Date.now()) - start;
}

export type { WorthSample };
