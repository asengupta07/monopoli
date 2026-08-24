import { TILES, groupMembers, isOwnable } from './board';
import {
  addPlayer,
  advanceTurn,
  bankrupt,
  currentPlayerId,
  getPlayer,
  moveTo,
  openAuction,
  pushLog,
  removePlayer,
  resolveLanding,
  rollDice,
  sendToPrison,
  startGame,
} from './gameEngine';
import { HOTEL_LEVEL } from './rules';
import { makeRoomCode, type SandboxCommand } from './protocol';
import { emptyStats, finalizeStats } from './stats';
import type { EngineResult, Player, Room } from '@/types/game';

const DUMMY_NAMES = ['Ada', 'Ben', 'Cal', 'Dot', 'Eve', 'Fay', 'Gus', 'Hal', 'Ivy', 'Jay'];

function face(n: unknown): number | null {
  const v = Math.floor(Number(n));
  if (!Number.isInteger(v) || v < 1 || v > 6) return null;
  return v;
}

function tileIndex(n: unknown): number | null {
  const v = Math.floor(Number(n));
  if (!Number.isInteger(v) || v < 0 || v >= TILES.length) return null;
  return v;
}

function cashAmount(n: unknown): number | null {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v)) return null;
  return Math.max(0, Math.min(v, 999_999));
}

function needPlayer(room: Room, playerId: string): Player | null {
  return getPlayer(room, playerId);
}

/** Start if we are still in the lobby so cheats can run without a second click. */
function ensurePlaying(room: Room): EngineResult {
  if (room.phase === 'playing') return {};
  if (room.phase === 'ended') {
    room.phase = 'playing';
    room.winner = null;
    return {};
  }
  const host = room.hostId ?? room.players[0]?.id;
  if (!host) return { error: 'Sit down first' };
  return startGame(room, host);
}

function resetLab(room: Room): EngineResult {
  const keep = room.players
    .filter((p) => !p.dummy)
    .map((p) => ({ id: p.id, name: p.name, color: p.color }));

  room.hostId = null;
  room.phase = 'lobby';
  room.order = [];
  room.turnIndex = 0;
  room.dice = null;
  room.doublesCount = 0;
  room.pending = null;
  room.ownership = {};
  room.vacationPot = 0;
  room.log = [];
  room.chat = [];
  room.winner = null;
  room.players = [];
  room.emptySince = null;
  room.sandbox = true;
  room.stats = emptyStats();

  for (const seat of keep) {
    const { player } = addPlayer(room, { name: seat.name, color: seat.color });
    if (player) player.id = seat.id;
  }
  pushLog(room, 'Lab reset', 'info');
  return {};
}

/**
 * Apply a cheat. No-ops and errors stay inside the engine so a bad click
 * cannot take a real game down — the server still has to check `room.sandbox`.
 */
export function applySandbox(room: Room, cmd: SandboxCommand): EngineResult {
  if (!room.sandbox) return { error: 'Not a lab room' };

  switch (cmd.op) {
    case 'possess':
      return {}; // session remap lives on the socket, not the room
    case 'reset':
      return resetLab(room);
    case 'start':
      return ensurePlaying(room);
    case 'addDummy': {
      const taken = new Set(room.players.map((p) => p.name));
      const name = cmd.name?.trim()
        || DUMMY_NAMES.find((n) => !taken.has(n))
        || `Dummy ${makeRoomCode()}`;
      const { player, error } = addPlayer(room, { name, dummy: true });
      if (error || !player) return { error: error ?? 'Could not add a dummy' };
      return {};
    }
    case 'remove': {
      if (!getPlayer(room, cmd.playerId)) return { error: 'No such player' };
      removePlayer(room, cmd.playerId);
      return {};
    }
    case 'setTurn': {
      const player = needPlayer(room, cmd.playerId);
      if (!player) return { error: 'No such player' };
      const ready = ensurePlaying(room);
      if (ready.error) return ready;
      if (!room.order.includes(cmd.playerId)) room.order.push(cmd.playerId);
      room.turnIndex = room.order.indexOf(cmd.playerId);
      room.pending = null;
      room.doublesCount = 0;
      pushLog(room, `Turn handed to ${player.name}`, 'info');
      return {};
    }
    case 'setCash': {
      const player = needPlayer(room, cmd.playerId);
      if (!player) return { error: 'No such player' };
      const cash = cashAmount(cmd.cash);
      if (cash === null) return { error: 'Invalid cash' };
      player.cash = cash;
      return {};
    }
    case 'setPos': {
      const player = needPlayer(room, cmd.playerId);
      if (!player) return { error: 'No such player' };
      const pos = tileIndex(cmd.pos);
      if (pos === null) return { error: 'Invalid tile' };
      const ready = ensurePlaying(room);
      if (ready.error) return ready;
      moveTo(room, player, pos, false);
      if (cmd.land) {
        const sum = room.dice ? room.dice[0] + room.dice[1] : 7;
        resolveLanding(room, player, sum);
      }
      return {};
    }
    case 'setDice': {
      const d1 = face(cmd.d1);
      const d2 = face(cmd.d2);
      if (d1 === null || d2 === null) return { error: 'Dice faces must be 1–6' };
      const ready = ensurePlaying(room);
      if (ready.error) return ready;
      room.dice = [d1, d2];
      return {};
    }
    case 'forceRoll': {
      const d1 = face(cmd.d1);
      const d2 = face(cmd.d2);
      if (d1 === null || d2 === null) return { error: 'Dice faces must be 1–6' };
      const ready = ensurePlaying(room);
      if (ready.error) return ready;
      const id = currentPlayerId(room);
      if (!id) return { error: 'No one is playing' };
      return rollDice(room, id, [d1, d2]);
    }
    case 'grant': {
      const player = needPlayer(room, cmd.playerId);
      if (!player) return { error: 'No such player' };
      const index = tileIndex(cmd.tileIndex);
      if (index === null || !isOwnable(TILES[index])) return { error: 'That tile cannot be owned' };
      const ready = ensurePlaying(room);
      if (ready.error) return ready;
      room.ownership[index] = {
        ownerId: player.id,
        houses: room.ownership[index]?.houses ?? 0,
        mortgaged: room.ownership[index]?.mortgaged ?? false,
      };
      pushLog(room, `${player.name} was granted ${TILES[index].name}`, 'good');
      return {};
    }
    case 'revoke': {
      const index = tileIndex(cmd.tileIndex);
      if (index === null) return { error: 'Invalid tile' };
      delete room.ownership[index];
      return {};
    }
    case 'grantGroup': {
      const player = needPlayer(room, cmd.playerId);
      if (!player) return { error: 'No such player' };
      const members = groupMembers(cmd.group);
      if (members.length === 0) return { error: 'Unknown set' };
      const ready = ensurePlaying(room);
      if (ready.error) return ready;
      for (const index of members) {
        room.ownership[index] = {
          ownerId: player.id,
          houses: room.ownership[index]?.houses ?? 0,
          mortgaged: false,
        };
      }
      pushLog(room, `${player.name} was granted the ${cmd.group} set`, 'good');
      return {};
    }
    case 'setHouses': {
      const index = tileIndex(cmd.tileIndex);
      if (index === null) return { error: 'Invalid tile' };
      const tile = TILES[index];
      if (tile.kind !== 'city') return { error: 'Only cities take houses' };
      const owner = room.ownership[index];
      if (!owner) return { error: 'Grant the tile first' };
      const houses = Math.floor(Number(cmd.houses));
      if (!Number.isInteger(houses) || houses < 0 || houses > HOTEL_LEVEL) {
        return { error: 'Houses must be 0–5' };
      }
      owner.houses = houses;
      owner.mortgaged = false;
      return {};
    }
    case 'setMortgage': {
      const index = tileIndex(cmd.tileIndex);
      if (index === null) return { error: 'Invalid tile' };
      const owner = room.ownership[index];
      if (!owner) return { error: 'Grant the tile first' };
      owner.mortgaged = Boolean(cmd.mortgaged);
      if (owner.mortgaged) owner.houses = 0;
      return {};
    }
    case 'jail': {
      const player = needPlayer(room, cmd.playerId);
      if (!player) return { error: 'No such player' };
      const ready = ensurePlaying(room);
      if (ready.error) return ready;
      if (cmd.inPrison) {
        sendToPrison(room, player);
      } else {
        player.inPrison = false;
        player.jailTurns = 0;
        pushLog(room, `${player.name} left prison`, 'good');
      }
      return {};
    }
    case 'setPot': {
      const amount = cashAmount(cmd.amount);
      if (amount === null) return { error: 'Invalid amount' };
      room.vacationPot = amount;
      return {};
    }
    case 'bankrupt': {
      const player = needPlayer(room, cmd.playerId);
      if (!player) return { error: 'No such player' };
      const ready = ensurePlaying(room);
      if (ready.error) return ready;
      const wasCurrent = currentPlayerId(room) === player.id;
      bankrupt(room, player);
      room.pending = null;
      if (wasCurrent && room.phase === 'playing') advanceTurn(room);
      return {};
    }
    case 'revive': {
      const player = needPlayer(room, cmd.playerId);
      if (!player) return { error: 'No such player' };
      player.alive = true;
      if (player.cash <= 0) player.cash = room.settings.startingCash;
      if (room.phase === 'ended') {
        room.phase = 'playing';
        room.winner = null;
      }
      pushLog(room, `${player.name} returned to the table`, 'good');
      return {};
    }
    case 'offerBuy': {
      const player = needPlayer(room, cmd.playerId);
      if (!player) return { error: 'No such player' };
      const index = tileIndex(cmd.tileIndex);
      if (index === null || !isOwnable(TILES[index])) return { error: 'That tile cannot be bought' };
      const ready = ensurePlaying(room);
      if (ready.error) return ready;
      delete room.ownership[index];
      player.pos = index;
      const tile = TILES[index];
      room.pending = {
        type: 'buy',
        playerId: player.id,
        tileIndex: index,
        price: tile.price,
      };
      if (!room.order.includes(player.id)) room.order.push(player.id);
      room.turnIndex = room.order.indexOf(player.id);
      return {};
    }
    case 'openAuction': {
      const index = tileIndex(cmd.tileIndex);
      if (index === null || !isOwnable(TILES[index])) return { error: 'That tile cannot be auctioned' };
      const ready = ensurePlaying(room);
      if (ready.error) return ready;
      delete room.ownership[index];
      const roller = currentPlayerId(room) ?? room.hostId ?? room.players[0]?.id;
      if (!roller) return { error: 'Sit down first' };
      openAuction(room, index, roller);
      return {};
    }
    case 'clearPending':
      room.pending = null;
      return {};
    case 'endGame': {
      const ready = ensurePlaying(room);
      if (ready.error) return ready;
      const winner = cmd.winnerId
        ? getPlayer(room, cmd.winnerId)
        : getPlayer(room, currentPlayerId(room) ?? '') ?? room.players.find((p) => p.alive) ?? null;
      room.phase = 'ended';
      room.winner = winner?.id ?? null;
      room.pending = null;
      finalizeStats(room);
      if (winner) pushLog(room, `${winner.name} wins the game!`, 'good');
      return {};
    }
    default:
      return { error: 'Unknown lab command' };
  }
}
