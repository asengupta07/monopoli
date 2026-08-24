import { randomUUID } from 'node:crypto';
import {
  TILES,
  JAIL_INDEX,
  START_BONUS,
  MAX_JAIL_TURNS,
  groupMembers,
  isOwnable,
} from './board';
import { makeRoomCode, isSandboxRoomId, type TradeInput, type TradeResponse } from './protocol';
import {
  PLAYER_COLORS,
  DEFAULT_SETTINGS,
  STARTING_CASH_OPTIONS,
  SELL_RATE_OPTIONS,
  MORTGAGE_RATE_OPTIONS,
  MORTGAGE_INTEREST_OPTIONS,
  AUCTION_WINDOW_MS,
  AIRPORT_RENTS,
  UTILITY_MULTIPLIERS,
  HOTEL_LEVEL,
  cityRent,
  rentWithHouses,
  houseCost,
  sellValue,
  mortgageValue,
  unmortgageCost,
} from './rules';
import type {
  EngineResult,
  GameSettings,
  GroupKey,
  ChatMessage,
  LogKind,
  PendingAuction,
  Player,
  Room,
  RoomState,
  TradeOffer,
} from '@/types/game';
import {
  emptyStats,
  ensureStats,
  finalizeStats,
  notePrison,
  noteTurn,
  noteVisit,
  recordWorth,
} from './stats';

export {
  PLAYER_COLORS,
  DEFAULT_SETTINGS,
  STARTING_CASH_OPTIONS,
  SELL_RATE_OPTIONS,
  MORTGAGE_RATE_OPTIONS,
  MORTGAGE_INTEREST_OPTIONS,
  AUCTION_WINDOW_MS,
  MAX_HOUSES,
  HOTEL_LEVEL,
  houseCost,
  sellValue,
  rentWithHouses,
  mortgageValue,
  unmortgageCost,
} from './rules';

interface Card {
  text: string;
  cash?: number;
  move?: number;
  jail?: boolean;
}

const TREASURE_CARDS: Card[] = [
  { text: 'Bank pays you a dividend of $50', cash: 50 },
  { text: 'You inherit $100', cash: 100 },
  { text: 'Tax refund: collect $20', cash: 20 },
  { text: 'Hospital fees: pay $100', cash: -100 },
  { text: 'School fees: pay $50', cash: -50 },
  { text: 'Sale of stock: collect $45', cash: 45 },
];

const SURPRISE_CARDS: Card[] = [
  { text: 'Advance to START', move: 0 },
  { text: 'Take a trip to TLV Airport', move: 5 },
  { text: 'Go to prison. Do not collect $200', jail: true },
  { text: 'Speeding fine: pay $15', cash: -15 },
  { text: 'Your building loan matures: collect $150', cash: 150 },
  { text: 'Advance to Berlin', move: 19 },
];

export function createRoom(existingIds: Set<string>, forcedId?: string): Room {
  let id = forcedId ?? makeRoomCode();
  while (!forcedId && existingIds.has(id)) id = makeRoomCode();
  return {
    id,
    hostId: null,
    phase: 'lobby',
    settings: { ...DEFAULT_SETTINGS },
    players: [],
    order: [],
    turnIndex: 0,
    dice: null,
    doublesCount: 0,
    pending: null,
    ownership: {},
    vacationPot: 0,
    log: [],
    chat: [],
    trades: [],
    composing: [],
    winner: null,
    createdAt: Date.now(),
    emptySince: null,
    sandbox: isSandboxRoomId(id),
    stats: emptyStats(),
  };
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

export function pushLog(room: Room, text: string, kind: LogKind = 'info'): void {
  room.log.push({ id: randomUUID(), text, kind, ts: Date.now() });
  if (room.log.length > 60) room.log.shift();
}

export function getPlayer(room: Room, playerId: string): Player | null {
  return room.players.find((p) => p.id === playerId) ?? null;
}

export function currentPlayerId(room: Room): string | null {
  if (room.phase !== 'playing') return null;
  return room.order[room.turnIndex] ?? null;
}

function takenColors(room: Room): Set<string> {
  return new Set(room.players.map((p) => p.color));
}

/** Fisher-Yates. A comparator returning random values does not shuffle evenly. */
function shuffle<T>(input: T[]): T[] {
  const out = [...input];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function ownedOfKind(room: Room, ownerId: string, kind: 'airport' | 'utility'): number {
  return Object.entries(room.ownership).filter(
    ([idx, o]) => o.ownerId === ownerId && TILES[Number(idx)].kind === kind,
  ).length;
}

function ownsFullGroup(room: Room, ownerId: string, group: GroupKey): boolean {
  return groupMembers(group).every((i) => room.ownership[i]?.ownerId === ownerId);
}

export function calcRent(room: Room, tileIndex: number, diceSum: number): number {
  const tile = TILES[tileIndex];
  const owner = room.ownership[tileIndex];
  if (!owner || !isOwnable(tile)) return 0;
  if (owner.mortgaged) return 0; // a mortgaged property earns nothing

  if (tile.kind === 'airport') {
    const count = ownedOfKind(room, owner.ownerId, 'airport');
    return AIRPORT_RENTS[Math.min(Math.max(count, 1), AIRPORT_RENTS.length) - 1];
  }
  if (tile.kind === 'utility') {
    const count = ownedOfKind(room, owner.ownerId, 'utility');
    return diceSum * (count >= 2 ? UTILITY_MULTIPLIERS[1] : UTILITY_MULTIPLIERS[0]);
  }
  if (owner.houses > 0) return rentWithHouses(tile.price, owner.houses);

  let rent = cityRent(tile.price);
  // the doubling rule applies to a complete but unimproved set
  if (room.settings.x2Rent && ownsFullGroup(room, owner.ownerId, tile.group)) rent *= 2;
  return rent;
}

/** Move money. Returns false when the payer went bankrupt. */
function transfer(room: Room, fromId: string, toId: string | null, amount: number): boolean {
  const from = getPlayer(room, fromId);
  if (!from) return true;
  from.cash -= amount;

  if (toId) {
    const to = getPlayer(room, toId);
    if (to) to.cash += amount;
  } else if (room.settings.vacationCash) {
    room.vacationPot += amount;
  }

  if (from.cash < 0) {
    bankrupt(room, from);
    return false;
  }
  return true;
}

export function bankrupt(room: Room, player: Player): void {
  player.alive = false;
  player.cash = 0;
  for (const idx of Object.keys(room.ownership)) {
    if (room.ownership[Number(idx)]?.ownerId === player.id) delete room.ownership[Number(idx)];
  }
  releaseTrades(room, player.id);
  clearDrafting(room, player.id);
  const stats = ensureStats(room);
  if (stats.outAt[player.id] === undefined) stats.outAt[player.id] = stats.turns;
  pushLog(room, `${player.name} went bankrupt`, 'bad');
  recordWorth(room);
  checkWinner(room);
}

/** Withdraw every trade a departed or bankrupt player was party to, either side. */
function releaseTrades(room: Room, playerId: string): void {
  room.trades = room.trades.filter((t) => t.fromId !== playerId && t.toId !== playerId);
}

/** Drop a player's "drafting a trade" presence marker — leaving or a dead socket ends it. */
export function clearDrafting(room: Room, playerId: string): void {
  const idx = room.composing.indexOf(playerId);
  if (idx !== -1) room.composing.splice(idx, 1);
}

export function setTradeDrafting(room: Room, playerId: string, drafting: boolean): EngineResult {
  if (!getPlayer(room, playerId)) return { error: 'Not in this room' };
  if (drafting) {
    if (!room.composing.includes(playerId)) room.composing.push(playerId);
  } else {
    clearDrafting(room, playerId);
  }
  return {};
}

/**
 * Detach a player from whatever decision is open, so leaving or going bankrupt
 * mid-auction cannot stall the table.
 */
function releasePending(room: Room, playerId: string): void {
  const pending = room.pending;
  if (!pending) return;
  if (pending.type === 'buy') {
    if (pending.playerId === playerId) room.pending = null;
    return;
  }
  dropFromAuction(room, playerId);
}

function checkWinner(room: Room): void {
  // a lab with one seated player would otherwise end the moment it starts
  if (room.sandbox) return;
  const alive = room.players.filter((p) => p.alive);
  if (room.phase === 'playing' && alive.length === 1) {
    room.phase = 'ended';
    room.winner = alive[0].id;
    room.pending = null;
    finalizeStats(room);
    pushLog(room, `${alive[0].name} wins the game!`, 'good');
  }
}

/* ------------------------------------------------------------------ */
/* lobby                                                               */
/* ------------------------------------------------------------------ */

export function addPlayer(
  room: Room,
  { name, color, dummy }: { name?: string; color?: string; dummy?: boolean },
): { player?: Player; error?: string } {
  if (room.phase !== 'lobby' && !room.sandbox) return { error: 'Game already started' };
  if (room.players.length >= room.settings.maxPlayers) {
    if (room.sandbox) {
      room.settings.maxPlayers = Math.min(12, room.players.length + 1);
    } else {
      return { error: 'Room is full' };
    }
  }

  const cleanName = String(name ?? '').trim().slice(0, 16) || `Player${room.players.length + 1}`;
  const startingCash = room.settings.startingCash;
  const taken = takenColors(room);
  const wanted = color && PLAYER_COLORS.includes(color) && !taken.has(color)
    ? color
    : PLAYER_COLORS.find((c) => !taken.has(c)) ?? PLAYER_COLORS[0];

  const player: Player = {
    id: randomUUID(),
    name: cleanName,
    color: wanted,
    cash: startingCash,
    pos: 0,
    inPrison: false,
    jailTurns: 0,
    alive: true,
    connected: true,
    ...(dummy ? { dummy: true } : {}),
  };
  room.players.push(player);
  if (!room.hostId) room.hostId = player.id;
  if (room.phase === 'playing') room.order.push(player.id);
  pushLog(room, `${player.name} joined the game`, 'join');
  return { player };
}

export function removePlayer(room: Room, playerId: string): void {
  const idx = room.players.findIndex((p) => p.id === playerId);
  if (idx === -1) return;
  const [player] = room.players.splice(idx, 1);
  pushLog(room, `${player.name} left the game`, 'info');

  for (const key of Object.keys(room.ownership)) {
    if (room.ownership[Number(key)]?.ownerId === playerId) delete room.ownership[Number(key)];
  }
  releaseTrades(room, playerId);
  clearDrafting(room, playerId);

  if (room.phase === 'playing') {
    const orderIdx = room.order.indexOf(playerId);
    if (orderIdx !== -1) {
      room.order.splice(orderIdx, 1);
      if (orderIdx < room.turnIndex) room.turnIndex--;
      if (room.turnIndex >= room.order.length) room.turnIndex = 0;
    }
    releasePending(room, playerId);
    checkWinner(room);
  }

  if (room.hostId === playerId) room.hostId = room.players[0]?.id ?? null;
}

export function setAppearance(room: Room, playerId: string, color: string): EngineResult {
  if (room.phase !== 'lobby') return { error: 'Game already started' };
  if (!PLAYER_COLORS.includes(color)) return { error: 'Unknown appearance' };
  const player = getPlayer(room, playerId);
  if (!player) return { error: 'Not in this room' };
  if (player.color === color) return {};
  if (takenColors(room).has(color)) return { error: 'Appearance already taken' };
  player.color = color;
  return {};
}

export function updateSettings(
  room: Room,
  playerId: string,
  patch: Partial<GameSettings>,
): EngineResult {
  if (playerId !== room.hostId && !room.sandbox) return { error: 'Only the host can change settings' };
  if (room.phase !== 'lobby') return { error: 'Game already started' };

  const next: GameSettings = { ...room.settings };
  if (patch.maxPlayers !== undefined) {
    const n = Number(patch.maxPlayers);
    if (Number.isInteger(n) && n >= 2 && n <= 12 && n >= room.players.length) next.maxPlayers = n;
  }
  if (typeof patch.map === 'string') next.map = patch.map.slice(0, 24);
  if (patch.startingCash !== undefined) {
    const cash = Number(patch.startingCash);
    if (STARTING_CASH_OPTIONS.includes(cash)) next.startingCash = cash;
  }
  const percentages = [
    ['sellRate', SELL_RATE_OPTIONS],
    ['mortgageRate', MORTGAGE_RATE_OPTIONS],
    ['mortgageInterest', MORTGAGE_INTEREST_OPTIONS],
  ] as const;
  for (const [key, allowed] of percentages) {
    if (patch[key] === undefined) continue;
    const value = Number(patch[key]);
    if (allowed.includes(value)) next[key] = value;
  }
  for (const key of [
    'isPrivate', 'x2Rent', 'vacationCash', 'auction',
    'noRentInPrison', 'mortgage', 'evenBuild', 'randomizeOrder',
  ] as const) {
    if (patch[key] !== undefined) next[key] = Boolean(patch[key]);
  }
  room.settings = next;

  // Nobody has played yet, so a starting-cash change applies to everyone seated.
  if (next.startingCash !== room.players[0]?.cash) {
    for (const player of room.players) player.cash = next.startingCash;
  }
  return {};
}

export function startGame(room: Room, playerId: string): EngineResult {
  if (playerId !== room.hostId) return { error: 'Only the host can start the game' };
  if (room.phase !== 'lobby') return { error: 'Game already started' };
  if (room.players.length < 2 && !room.sandbox) return { error: 'Need at least 2 players' };
  if (room.players.length < 1) return { error: 'Need at least one player' };

  const ids = room.players.map((p) => p.id);
  room.order = room.settings.randomizeOrder ? shuffle(ids) : ids;
  room.turnIndex = 0;
  room.phase = 'playing';
  room.dice = null;
  room.doublesCount = 0;
  room.log = [];
  room.stats = emptyStats();
  room.stats.startedAt = Date.now();
  for (const player of room.players) player.cash = room.settings.startingCash;
  recordWorth(room);

  pushLog(
    room,
    room.settings.randomizeOrder
      ? 'Game started with a randomized players order. Good luck!'
      : 'Game started in join order. Good luck!',
    'good',
  );
  return {};
}

/* ------------------------------------------------------------------ */
/* turns                                                               */
/* ------------------------------------------------------------------ */

export function advanceTurn(room: Room): void {
  room.pending = null;
  room.doublesCount = 0;
  if (room.phase !== 'playing') return;

  for (let i = 0; i < room.order.length; i++) {
    room.turnIndex = (room.turnIndex + 1) % room.order.length;
    const p = getPlayer(room, room.order[room.turnIndex]);
    if (p && p.alive) return;
  }
}

export function moveTo(room: Room, player: Player, target: number, collectStart = true): void {
  const passedStart = target < player.pos;
  player.pos = target;
  noteVisit(room, target);
  if (collectStart && passedStart) {
    player.cash += START_BONUS;
    pushLog(room, `${player.name} passed START and collected $${START_BONUS}`, 'good');
  }
}

export function sendToPrison(room: Room, player: Player): void {
  player.pos = JAIL_INDEX;
  player.inPrison = true;
  player.jailTurns = 0;
  room.doublesCount = 0;
  notePrison(room, player.id);
  noteVisit(room, JAIL_INDEX);
  pushLog(room, `${player.name} was sent to prison`, 'bad');
}

function drawCard(room: Room, player: Player, kind: 'treasure' | 'surprise'): { endTurn?: boolean } {
  const deck = kind === 'treasure' ? TREASURE_CARDS : SURPRISE_CARDS;
  const card = deck[Math.floor(Math.random() * deck.length)];
  pushLog(room, `${player.name}: ${card.text}`, 'info');

  if (card.jail) {
    sendToPrison(room, player);
    return { endTurn: true };
  }
  if (typeof card.move === 'number') {
    moveTo(room, player, card.move);
    return resolveLanding(room, player, 0, true);
  }
  if (card.cash && card.cash > 0) {
    player.cash += card.cash;
  } else if (card.cash && card.cash < 0) {
    if (!transfer(room, player.id, null, -card.cash)) return { endTurn: true };
  }
  return {};
}

/** Apply the tile a player just landed on. `endTurn` means the turn cannot continue. */
export function resolveLanding(
  room: Room,
  player: Player,
  diceSum: number,
  fromCard = false,
): { endTurn?: boolean } {
  const index = player.pos;
  const tile = TILES[index];

  if (tile.kind === 'corner') {
    if (tile.key === 'goToJail') {
      sendToPrison(room, player);
      return { endTurn: true };
    }
    if (tile.key === 'vacation' && room.settings.vacationCash && room.vacationPot > 0) {
      player.cash += room.vacationPot;
      pushLog(room, `${player.name} collected the $${room.vacationPot} vacation pot`, 'good');
      room.vacationPot = 0;
    }
    return {};
  }

  if (tile.kind === 'tax') {
    pushLog(room, `${player.name} paid $${tile.amount} ${tile.name}`, 'bad');
    if (!transfer(room, player.id, null, tile.amount)) return { endTurn: true };
    return {};
  }

  if (tile.kind === 'treasure' || tile.kind === 'surprise') {
    if (fromCard) return {}; // never chain a card into another card
    return drawCard(room, player, tile.kind);
  }

  if (isOwnable(tile)) {
    const owner = room.ownership[index];

    if (!owner) {
      if (player.cash >= tile.price) {
        room.pending = { type: 'buy', playerId: player.id, tileIndex: index, price: tile.price };
      } else if (room.settings.auction) {
        // cannot afford the asking price, so it goes straight to auction
        openAuction(room, index, player.id);
      }
      return {};
    }

    if (owner.ownerId === player.id) return {};

    const ownerPlayer = getPlayer(room, owner.ownerId);
    if (!ownerPlayer || !ownerPlayer.alive) return {};
    if (room.settings.noRentInPrison && ownerPlayer.inPrison) {
      pushLog(room, `${ownerPlayer.name} is in prison — no rent collected`, 'info');
      return {};
    }
    if (owner.mortgaged) {
      pushLog(room, `${tile.name} is mortgaged — no rent collected`, 'info');
      return {};
    }

    const rent = calcRent(room, index, diceSum);
    pushLog(room, `${player.name} paid $${rent} rent to ${ownerPlayer.name}`, 'bad');
    if (!transfer(room, player.id, ownerPlayer.id, rent)) return { endTurn: true };
  }

  return {};
}

/**
 * Put a property up for open auction. Every seated player may bid, including
 * the one who declined it — bidding opens at $1 and each bid must beat the
 * standing one, capped by what the bidder actually holds.
 */
export function openAuction(room: Room, tileIndex: number, rollerId: string): void {
  const tile = TILES[tileIndex];
  if (!isOwnable(tile)) return;

  const participants = room.order.filter((id) => {
    const p = getPlayer(room, id);
    return Boolean(p && p.alive && p.connected);
  });

  if (participants.length === 0) {
    room.pending = null;
    finishPendingTurn(room, rollerId);
    return;
  }

  pushLog(room, `${tile.name} goes to auction — bidding starts at $1`, 'info');
  room.pending = {
    type: 'auction',
    tileIndex,
    highestBid: 0,
    highestBidderId: null,
    participants,
    passed: [],
    rollerId,
    endsAt: Date.now() + AUCTION_WINDOW_MS,
  };
}

/** The smallest bid that would take the lead. */
export function minimumBid(auction: PendingAuction): number {
  return auction.highestBid + 1;
}

export function placeBid(room: Room, playerId: string, amount: number): EngineResult {
  const auction = room.pending;
  if (!auction || auction.type !== 'auction') return { error: 'No auction is running' };
  if (!auction.participants.includes(playerId)) return { error: 'You are not in this auction' };
  if (auction.passed.includes(playerId)) return { error: 'You already passed' };

  const player = getPlayer(room, playerId);
  if (!player || !player.alive) return { error: 'You are out of the game' };

  const bid = Math.floor(Number(amount));
  if (!Number.isFinite(bid)) return { error: 'Invalid bid' };

  const minimum = minimumBid(auction);
  if (bid < minimum) return { error: `Bid must be at least $${minimum}` };
  if (bid > player.cash) return { error: `You only have $${player.cash}` };

  auction.highestBid = bid;
  auction.highestBidderId = playerId;
  // Every bid restarts the clock, so the table always gets a full window to answer.
  auction.endsAt = Date.now() + AUCTION_WINDOW_MS;
  pushLog(room, `${player.name} bid $${bid} for ${TILES[auction.tileIndex].name}`, 'info');
  // A bid can end the auction outright when nobody is left to answer it.
  settleAuction(room);
  return {};
}

/**
 * Close an auction whose clock has run out: the standing bid wins.
 * The server owns the scheduling; the engine stays free of timers.
 */
export function expireAuction(room: Room, now: number = Date.now()): boolean {
  const auction = room.pending;
  if (!auction || auction.type !== 'auction') return false;
  if (now < auction.endsAt) return false;

  pushLog(
    room,
    auction.highestBidderId ? 'Going once, going twice — sold!' : 'The auction timed out',
    'info',
  );
  closeAuction(room);
  return true;
}

export function passAuction(room: Room, playerId: string): EngineResult {
  const auction = room.pending;
  if (!auction || auction.type !== 'auction') return { error: 'No auction is running' };
  if (!auction.participants.includes(playerId)) return { error: 'You are not in this auction' };
  if (auction.passed.includes(playerId)) return { error: 'You already passed' };
  // A standing bid is a commitment; you cannot walk away from your own lead.
  if (auction.highestBidderId === playerId) return { error: 'You are the highest bidder' };

  const player = getPlayer(room, playerId);
  auction.passed.push(playerId);
  pushLog(room, `${player?.name ?? 'A player'} passed`, 'info');
  settleAuction(room);
  return {};
}

/** Drop someone who left mid-auction, so a disconnect cannot stall the game. */
export function dropFromAuction(room: Room, playerId: string): void {
  const auction = room.pending;
  if (!auction || auction.type !== 'auction') return;
  if (!auction.participants.includes(playerId)) return;
  if (!auction.passed.includes(playerId)) auction.passed.push(playerId);
  settleAuction(room);
}

/** Close the auction once nobody is left who could outbid the leader. */
function settleAuction(room: Room): void {
  const auction = room.pending;
  if (!auction || auction.type !== 'auction') return;

  const remaining = auction.participants.filter((id) => !auction.passed.includes(id));
  const everyonePassed = remaining.length === 0;
  const leaderAlone = remaining.length === 1 && auction.highestBidderId === remaining[0];
  if (!everyonePassed && !leaderAlone) return;

  closeAuction(room);
}

/** Award the property to the standing bid (if any) and hand the turn back. */
function closeAuction(room: Room): void {
  const auction = room.pending;
  if (!auction || auction.type !== 'auction') return;

  const tile = TILES[auction.tileIndex];
  const winner = auction.highestBidderId ? getPlayer(room, auction.highestBidderId) : null;

  if (winner && auction.highestBid > 0 && winner.cash >= auction.highestBid) {
    winner.cash -= auction.highestBid;
    room.ownership[auction.tileIndex] = { ownerId: winner.id, houses: 0, mortgaged: false };
    pushLog(room, `${winner.name} won ${tile.name} at auction for $${auction.highestBid}`, 'good');
  } else {
    pushLog(room, `${tile.name} received no bids`, 'info');
  }

  const { rollerId } = auction;
  room.pending = null;
  finishPendingTurn(room, rollerId);
}

export function rollDice(room: Room, playerId: string, forced?: [number, number]): EngineResult {
  if (room.phase !== 'playing') return { error: 'Game is not running' };
  if (currentPlayerId(room) !== playerId) return { error: 'Not your turn' };
  if (room.pending) return { error: 'Resolve the current property first' };

  const player = getPlayer(room, playerId);
  if (!player || !player.alive) return { error: 'You are out of the game' };

  const d1 = forced?.[0] ?? 1 + Math.floor(Math.random() * 6);
  const d2 = forced?.[1] ?? 1 + Math.floor(Math.random() * 6);
  if (!Number.isInteger(d1) || d1 < 1 || d1 > 6 || !Number.isInteger(d2) || d2 < 1 || d2 > 6) {
    return { error: 'Dice faces must be 1–6' };
  }
  const sum = d1 + d2;
  const isDoubles = d1 === d2;
  room.dice = [d1, d2];
  noteTurn(room, isDoubles);

  const done = (): EngineResult => {
    recordWorth(room);
    return {};
  };

  if (player.inPrison) {
    if (isDoubles) {
      player.inPrison = false;
      player.jailTurns = 0;
      pushLog(room, `${player.name} rolled doubles and left prison`, 'good');
    } else {
      player.jailTurns++;
      if (player.jailTurns >= MAX_JAIL_TURNS) {
        player.inPrison = false;
        player.jailTurns = 0;
        pushLog(room, `${player.name} paid $50 to leave prison`, 'info');
        if (!transfer(room, player.id, null, 50)) {
          advanceTurn(room);
          return done();
        }
      } else {
        pushLog(room, `${player.name} rolled ${d1} + ${d2} and stays in prison`, 'info');
        advanceTurn(room);
        return done();
      }
    }
  }

  if (isDoubles) {
    room.doublesCount++;
    if (room.doublesCount >= 3) {
      pushLog(room, `${player.name} rolled three doubles in a row`, 'bad');
      sendToPrison(room, player);
      advanceTurn(room);
      return done();
    }
  } else {
    room.doublesCount = 0;
  }

  pushLog(room, `${player.name} rolled ${d1} + ${d2} = ${sum}`, 'roll');
  moveTo(room, player, (player.pos + sum) % TILES.length);

  const { endTurn } = resolveLanding(room, player, sum);

  if (endTurn || room.phase !== 'playing') {
    if (room.phase === 'playing') advanceTurn(room);
    return done();
  }
  // A pending purchase holds the turn open; buy/skip closes it.
  if (!room.pending && !isDoubles) advanceTurn(room);
  return done();
}

export function buyProperty(room: Room, playerId: string): EngineResult {
  const pending = room.pending;
  if (!pending || pending.type !== 'buy') return { error: 'Nothing to buy' };
  if (pending.playerId !== playerId) return { error: 'Not your decision' };

  const player = getPlayer(room, playerId);
  if (!player || player.cash < pending.price) return { error: 'Not enough cash' };

  player.cash -= pending.price;
  room.ownership[pending.tileIndex] = { ownerId: playerId, houses: 0, mortgaged: false };
  pushLog(room, `${player.name} bought ${TILES[pending.tileIndex].name} for $${pending.price}`, 'good');

  room.pending = null;
  finishPendingTurn(room, playerId);
  return {};
}

export function skipProperty(room: Room, playerId: string): EngineResult {
  const pending = room.pending;
  if (!pending || pending.type !== 'buy') return { error: 'Nothing to skip' };
  if (pending.playerId !== playerId) return { error: 'Not your decision' };

  const player = getPlayer(room, playerId);
  const tile = TILES[pending.tileIndex];
  pushLog(room, `${player?.name ?? 'Player'} skipped ${tile.name}`, 'info');
  room.pending = null;

  if (room.settings.auction) {
    openAuction(room, pending.tileIndex, playerId);
    if (room.pending) return {};
    return {};
  }

  finishPendingTurn(room, playerId);
  return {};
}

/** After a property resolves, the roller keeps the turn only if they rolled doubles. */
function finishPendingTurn(room: Room, rollerId: string): void {
  if (currentPlayerId(room) !== rollerId) return;
  const rolledDoubles = room.dice !== null && room.dice[0] === room.dice[1];
  if (!rolledDoubles) advanceTurn(room);
}

export function mortgageProperty(room: Room, playerId: string, tileIndex: number): EngineResult {
  if (!room.settings.mortgage) return { error: 'Mortgages are disabled in this game' };
  if (room.phase !== 'playing') return { error: 'Game is not running' };

  const owner = room.ownership[tileIndex];
  const tile = TILES[tileIndex];
  if (!owner || owner.ownerId !== playerId) return { error: 'You do not own that property' };
  if (!isOwnable(tile)) return { error: 'That property cannot be mortgaged' };
  if (owner.mortgaged) return { error: 'Already mortgaged' };
  if (owner.houses > 0) return { error: 'Sell the buildings first' };

  const player = getPlayer(room, playerId);
  if (!player || !player.alive) return { error: 'You are out of the game' };

  const value = mortgageValue(tile.price, room.settings.mortgageRate);
  owner.mortgaged = true;
  player.cash += value;
  pushLog(room, `${player.name} mortgaged ${tile.name} for $${value}`, 'info');
  return {};
}

export function unmortgageProperty(room: Room, playerId: string, tileIndex: number): EngineResult {
  if (!room.settings.mortgage) return { error: 'Mortgages are disabled in this game' };
  if (room.phase !== 'playing') return { error: 'Game is not running' };

  const owner = room.ownership[tileIndex];
  const tile = TILES[tileIndex];
  if (!owner || owner.ownerId !== playerId) return { error: 'You do not own that property' };
  if (!isOwnable(tile)) return { error: 'That property cannot be mortgaged' };
  if (!owner.mortgaged) return { error: 'That property is not mortgaged' };

  const player = getPlayer(room, playerId);
  if (!player || !player.alive) return { error: 'You are out of the game' };

  const cost = unmortgageCost(tile.price, room.settings.mortgageRate, room.settings.mortgageInterest);
  if (player.cash < cost) return { error: `You need $${cost} to lift that mortgage` };

  owner.mortgaged = false;
  player.cash -= cost;
  pushLog(room, `${player.name} lifted the mortgage on ${tile.name} for $${cost}`, 'info');
  return {};
}

/* ------------------------------------------------------------------ */
/* building                                                            */
/* ------------------------------------------------------------------ */

/** Houses in each tile of a set, so even-build can be checked. */
function groupHouses(room: Room, group: GroupKey): number[] {
  return groupMembers(group).map((i) => room.ownership[i]?.houses ?? 0);
}

/**
 * Shared checks for building on, or selling from, a city.
 * Only a complete, unmortgaged set can be developed.
 */
function developable(room: Room, playerId: string, tileIndex: number) {
  if (room.phase !== 'playing') return { error: 'Game is not running' };

  const tile = TILES[tileIndex];
  if (tile.kind !== 'city') return { error: 'Only cities can be built on' };

  const owner = room.ownership[tileIndex];
  if (!owner || owner.ownerId !== playerId) return { error: 'You do not own that property' };

  const player = getPlayer(room, playerId);
  if (!player || !player.alive) return { error: 'You are out of the game' };

  if (!ownsFullGroup(room, playerId, tile.group)) {
    return { error: 'You need the whole set to build' };
  }
  if (groupMembers(tile.group).some((i) => room.ownership[i]?.mortgaged)) {
    return { error: 'Lift the mortgages on this set first' };
  }
  return { tile, owner, player };
}

export function buildHouse(room: Room, playerId: string, tileIndex: number): EngineResult {
  const check = developable(room, playerId, tileIndex);
  if ('error' in check) return { error: check.error };
  const { tile, owner, player } = check;
  if (tile.kind !== 'city') return { error: 'Only cities can be built on' };

  if (owner.houses >= HOTEL_LEVEL) return { error: 'This property already has a hotel' };

  // even build: never get more than one ahead of the least developed tile
  if (room.settings.evenBuild) {
    const lowest = Math.min(...groupHouses(room, tile.group));
    if (owner.houses > lowest) return { error: 'Build evenly across the set' };
  }

  const cost = houseCost(tile.group);
  if (player.cash < cost) return { error: `A house here costs $${cost}` };

  player.cash -= cost;
  owner.houses += 1;
  const what = owner.houses === HOTEL_LEVEL ? 'a hotel' : `house ${owner.houses}`;
  pushLog(room, `${player.name} built ${what} on ${tile.name} for $${cost}`, 'good');
  return {};
}

export function sellHouse(room: Room, playerId: string, tileIndex: number): EngineResult {
  const check = developable(room, playerId, tileIndex);
  if ('error' in check) return { error: check.error };
  const { tile, owner, player } = check;
  if (tile.kind !== 'city') return { error: 'Only cities can be built on' };

  if (owner.houses <= 0) return { error: 'Nothing to sell here' };

  // even build applies in reverse: never leave one tile trailing the set
  if (room.settings.evenBuild) {
    const highest = Math.max(...groupHouses(room, tile.group));
    if (owner.houses < highest) return { error: 'Sell evenly across the set' };
  }

  const refund = sellValue(houseCost(tile.group), room.settings.sellRate);
  const what = owner.houses === HOTEL_LEVEL ? 'the hotel' : 'a house';
  owner.houses -= 1;
  player.cash += refund;
  pushLog(room, `${player.name} sold ${what} on ${tile.name} for $${refund}`, 'info');
  return {};
}

/** Sell a property back to the bank at the rate the host set. */
export function sellProperty(room: Room, playerId: string, tileIndex: number): EngineResult {
  if (room.phase !== 'playing') return { error: 'Game is not running' };

  const tile = TILES[tileIndex];
  const owner = room.ownership[tileIndex];
  if (!owner || owner.ownerId !== playerId) return { error: 'You do not own that property' };
  if (!isOwnable(tile)) return { error: 'That property cannot be sold' };

  const player = getPlayer(room, playerId);
  if (!player || !player.alive) return { error: 'You are out of the game' };

  if (owner.houses > 0) return { error: 'Sell the buildings first' };
  // otherwise the bank would be buying back a property it is still owed for
  if (owner.mortgaged) return { error: 'Lift the mortgage before selling' };

  const proceeds = sellValue(tile.price, room.settings.sellRate);
  delete room.ownership[tileIndex];
  player.cash += proceeds;
  pushLog(room, `${player.name} sold ${tile.name} to the bank for $${proceeds}`, 'info');
  return {};
}

/* ------------------------------------------------------------------ */
/* trades                                                              */
/* ------------------------------------------------------------------ */

const MAX_TRADE_MESSAGE = 140;

/** A tile can change hands only free and clear — sell the houses first. */
function checkTradeable(room: Room, ownerId: string, tileIndex: number, ownerLabel: string): string | null {
  const tile = TILES[tileIndex];
  if (!tile) return 'That property does not exist';
  const owner = room.ownership[tileIndex];
  if (!owner || owner.ownerId !== ownerId) return `${ownerLabel} does not own ${tile.name}`;
  if (owner.houses > 0) return `Sell the houses on ${tile.name} before trading it`;
  return null;
}

/** Trades run off-turn between any two seated players, so nothing here checks whose turn it is. */
export function proposeTrade(room: Room, playerId: string, input: TradeInput): EngineResult {
  if (room.phase !== 'playing') return { error: 'Game is not running' };

  const from = getPlayer(room, playerId);
  if (!from || !from.alive) return { error: 'You are out of the game' };
  if (input.toId === playerId) return { error: 'Pick someone else to trade with' };
  const to = getPlayer(room, input.toId);
  if (!to || !to.alive) return { error: 'No such player' };

  const fromCash = Math.max(0, Math.floor(Number(input.fromCash) || 0));
  const toCash = Math.max(0, Math.floor(Number(input.toCash) || 0));
  if (fromCash > from.cash) return { error: `You only have $${from.cash}` };
  if (toCash > to.cash) return { error: `${to.name} only has $${to.cash}` };

  const fromProperties = [...new Set(input.fromProperties ?? [])];
  const toProperties = [...new Set(input.toProperties ?? [])];
  if (fromProperties.length === 0 && toProperties.length === 0 && fromCash === 0 && toCash === 0) {
    return { error: 'Offer at least something' };
  }
  for (const idx of fromProperties) {
    const problem = checkTradeable(room, playerId, idx, 'You');
    if (problem) return { error: problem };
  }
  for (const idx of toProperties) {
    const problem = checkTradeable(room, to.id, idx, to.name);
    if (problem) return { error: problem };
  }

  const trade: TradeOffer = {
    id: randomUUID(),
    fromId: playerId,
    toId: to.id,
    fromProperties,
    toProperties,
    fromCash,
    toCash,
    message: input.message ? String(input.message).slice(0, MAX_TRADE_MESSAGE) : undefined,
    createdAt: Date.now(),
  };
  room.trades.push(trade);
  pushLog(room, `${from.name} proposed a trade to ${to.name}`, 'info');
  return {};
}

export function respondTrade(room: Room, playerId: string, tradeId: string, action: TradeResponse): EngineResult {
  const trade = room.trades.find((t) => t.id === tradeId);
  if (!trade) return { error: 'That trade is no longer available' };

  if (action === 'cancel') {
    if (trade.fromId !== playerId) return { error: 'Only the sender can cancel this trade' };
    room.trades = room.trades.filter((t) => t.id !== tradeId);
    pushLog(room, 'A trade offer was withdrawn', 'info');
    return {};
  }

  if (trade.toId !== playerId) return { error: 'This trade is not addressed to you' };
  const from = getPlayer(room, trade.fromId);
  const to = getPlayer(room, trade.toId);

  if (action === 'decline') {
    room.trades = room.trades.filter((t) => t.id !== tradeId);
    pushLog(room, `${to?.name ?? 'A player'} declined ${from?.name ?? 'a'} trade`, 'info');
    return {};
  }

  // accept — re-validate against current state, since cash and ownership can
  // have moved since the offer went out.
  if (!from || !from.alive || !to || !to.alive) {
    room.trades = room.trades.filter((t) => t.id !== tradeId);
    return { error: 'That player is no longer in the game' };
  }
  if (trade.fromCash > from.cash) return { error: `${from.name} can no longer afford this trade` };
  if (trade.toCash > to.cash) return { error: 'You can no longer afford this trade' };
  for (const idx of trade.fromProperties) {
    if (checkTradeable(room, trade.fromId, idx, from.name)) return { error: 'This offer is no longer valid' };
  }
  for (const idx of trade.toProperties) {
    if (checkTradeable(room, trade.toId, idx, to.name)) return { error: 'This offer is no longer valid' };
  }

  for (const idx of trade.fromProperties) room.ownership[idx].ownerId = trade.toId;
  for (const idx of trade.toProperties) room.ownership[idx].ownerId = trade.fromId;
  from.cash += trade.toCash - trade.fromCash;
  to.cash += trade.fromCash - trade.toCash;

  room.trades = room.trades.filter((t) => t.id !== tradeId);
  pushLog(room, `${to.name} accepted a trade with ${from.name}`, 'good');
  return {};
}

export function endTurn(room: Room, playerId: string): EngineResult {
  if (room.phase !== 'playing') return { error: 'Game is not running' };
  if (currentPlayerId(room) !== playerId) return { error: 'Not your turn' };
  if (room.pending) return { error: 'Resolve the current property first' };
  advanceTurn(room);
  return {};
}

export function declareBankrupt(room: Room, playerId: string): EngineResult {
  if (room.phase !== 'playing') return { error: 'Game is not running' };
  const player = getPlayer(room, playerId);
  if (!player || !player.alive) return { error: 'You are out of the game' };
  const wasCurrent = currentPlayerId(room) === playerId;
  bankrupt(room, player);
  releasePending(room, playerId);
  if (wasCurrent && room.phase === 'playing') advanceTurn(room);
  return {};
}

/** Put the same table back in the lobby for another match. */
export function rematch(room: Room, playerId: string): EngineResult {
  if (playerId !== room.hostId) return { error: 'Only the host can start another game' };
  if (room.phase !== 'ended' && !room.sandbox) return { error: 'Finish the game first' };

  room.phase = 'lobby';
  room.order = [];
  room.turnIndex = 0;
  room.dice = null;
  room.doublesCount = 0;
  room.pending = null;
  room.ownership = {};
  room.vacationPot = 0;
  room.log = [];
  room.trades = [];
  room.composing = [];
  room.winner = null;
  room.stats = emptyStats();
  for (const player of room.players) {
    player.cash = room.settings.startingCash;
    player.pos = 0;
    player.inPrison = false;
    player.jailTurns = 0;
    player.alive = true;
  }
  pushLog(room, 'Ready for another game', 'info');
  return {};
}

export const MAX_CHAT = 80;

export function sendChat(room: Room, playerId: string, text: string): EngineResult {
  const player = getPlayer(room, playerId);
  if (!player) return { error: 'Not in this room' };
  const clean = String(text ?? '').trim().slice(0, 200);
  if (!clean) return { error: 'Empty message' };

  // Chat has its own history: sharing the game log meant a busy turn could
  // push every message out of view before anyone read it.
  const message: ChatMessage = {
    id: randomUUID(),
    playerId: player.id,
    name: player.name,
    color: player.color,
    text: clean,
    ts: Date.now(),
  };
  room.chat.push(message);
  if (room.chat.length > MAX_CHAT) room.chat.shift();
  return {};
}

/* ------------------------------------------------------------------ */
/* serialisation                                                       */
/* ------------------------------------------------------------------ */

/** Room state holds no secrets, so the snapshot is the whole room minus internals. */
export function serialize(room: Room): RoomState {
  return {
    id: room.id,
    phase: room.phase,
    hostId: room.hostId,
    settings: room.settings,
    players: room.players.map((p) => ({ ...p })),
    order: room.order,
    currentPlayerId: currentPlayerId(room),
    dice: room.dice,
    // Bids are public, so the pending state ships as-is — plus the time left,
    // which clients count down from instead of trusting their own clock.
    pending: room.pending
      ? room.pending.type === 'auction'
        ? { ...room.pending, endsIn: Math.max(0, room.pending.endsAt - Date.now()) }
        : { ...room.pending }
      : null,
    ownership: room.ownership,
    vacationPot: room.vacationPot,
    winner: room.winner,
    log: room.log,
    chat: room.chat,
    trades: room.trades ?? [],
    composing: room.composing ?? [],
    sandbox: room.sandbox,
    stats: room.stats ?? emptyStats(),
  };
}
