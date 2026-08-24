export type GroupKey =
  | 'brazil' | 'israel' | 'italy' | 'germany'
  | 'france' | 'china' | 'uk' | 'usa';

export type CornerKey = 'start' | 'jail' | 'vacation' | 'goToJail';

/** Semantic icon names; the components map these to lucide components. */
export type IconKey =
  | 'plane' | 'zap' | 'droplets' | 'receipt' | 'gem'
  | 'gift' | 'help' | 'play' | 'lock' | 'palm' | 'skull';

export interface CityTile {
  kind: 'city';
  name: string;
  price: number;
  group: GroupKey;
}
export interface AirportTile {
  kind: 'airport';
  name: string;
  price: number;
  icon: IconKey;
}
export interface UtilityTile {
  kind: 'utility';
  name: string;
  price: number;
  icon: IconKey;
}
export interface TaxTile {
  kind: 'tax';
  name: string;
  amount: number;
  icon: IconKey;
  label: string;
}
export interface CardTile {
  kind: 'treasure' | 'surprise';
  name: string;
  icon: IconKey;
}
export interface CornerTile {
  kind: 'corner';
  key: CornerKey;
  name: string;
  icon: IconKey;
}

export type Tile = CityTile | AirportTile | UtilityTile | TaxTile | CardTile | CornerTile;
export type OwnableTile = CityTile | AirportTile | UtilityTile;

export type TileSide = 't' | 'r' | 'b' | 'l' | 'corner';

export interface GameSettings {
  maxPlayers: number;
  isPrivate: boolean;
  map: string;
  x2Rent: boolean;
  vacationCash: boolean;
  auction: boolean;
  noRentInPrison: boolean;
  mortgage: boolean;
  /** Houses must be built and sold evenly across a set. */
  evenBuild: boolean;
  startingCash: number;
  randomizeOrder: boolean;
  /** Percentage of the price the bank pays when selling back. */
  sellRate: number;
  /** Percentage of the price raised by mortgaging. */
  mortgageRate: number;
  /** Percentage added to the loan when lifting a mortgage. */
  mortgageInterest: number;
}

export interface Player {
  id: string;
  name: string;
  color: string;
  cash: number;
  pos: number;
  inPrison: boolean;
  jailTurns: number;
  alive: boolean;
  connected: boolean;
  /** Lab-only seat. Omitted in real games. */
  dummy?: boolean;
}

export type LogKind = 'info' | 'good' | 'bad' | 'roll' | 'join' | 'chat';

export interface LogEntry {
  id: string;
  text: string;
  kind: LogKind;
  ts: number;
}

/** A player message. Kept apart from the game log so events cannot evict it. */
export interface ChatMessage {
  id: string;
  playerId: string;
  name: string;
  color: string;
  text: string;
  ts: number;
}

export interface Ownership {
  ownerId: string;
  houses: number;
  mortgaged: boolean;
}

export type GamePhase = 'lobby' | 'playing' | 'ended';

/** The first refusal, offered to whoever landed on the property. */
export interface PendingBuy {
  type: 'buy';
  playerId: string;
  tileIndex: number;
  price: number;
}

/** An open auction: every seated player may bid until only the leader is left. */
export interface PendingAuction {
  type: 'auction';
  tileIndex: number;
  /** 0 until the first bid; the next bid must beat it, so bidding opens at $1. */
  highestBid: number;
  highestBidderId: string | null;
  participants: string[];
  passed: string[];
  /** Whose turn opened the auction, so the turn can resume once it settles. */
  rollerId: string;
  /** Server clock deadline; every bid pushes it back. */
  endsAt: number;
  /**
   * Milliseconds left, filled in per snapshot. Clients count down from this
   * rather than from `endsAt`, so a client whose clock disagrees with the
   * server still shows the right time.
   */
  endsIn?: number;
}

export type Pending = PendingBuy | PendingAuction;

/**
 * A vote to remove a player, typically one who's gone AFK. Resolves the
 * moment every other alive player has voted, or when the clock runs out —
 * whichever comes first — so nobody can hold the table hostage by never
 * responding.
 */
export interface VoteKick {
  targetId: string;
  starterId: string;
  /** Ids of players who have voted to kick, starter included. */
  votes: string[];
  endsAt: number;
  /** Filled in per snapshot, like PendingAuction.endsIn. */
  endsIn?: number;
}

/**
 * A two-sided offer between two seated players: properties and/or cash, each
 * way. Only ever pending — accepting, declining or cancelling removes it from
 * `Room.trades` outright, so there is no status field to go stale.
 */
export interface TradeOffer {
  id: string;
  fromId: string;
  toId: string;
  /** Tiles the sender is offering up. */
  fromProperties: number[];
  /** Tiles the sender is asking for. */
  toProperties: number[];
  /** Cash the sender is offering up. */
  fromCash: number;
  /** Cash the sender is asking for. */
  toCash: number;
  message?: string;
  createdAt: number;
}

/** Running totals for the recap screen. Sampled on the server, shown as-is. */
export interface WorthSample {
  turn: number;
  values: Record<string, number>;
}

export interface GameStats {
  startedAt: number;
  endedAt: number | null;
  turns: number;
  doubles: number;
  tileVisits: Record<number, number>;
  prisonVisits: Record<string, number>;
  /** Turn when a player left the table. The winner has no entry. */
  outAt: Record<string, number>;
  worth: WorthSample[];
}

/** Server-side room, including fields never sent to clients. */
export interface Room {
  id: string;
  hostId: string | null;
  phase: GamePhase;
  settings: GameSettings;
  players: Player[];
  order: string[];
  turnIndex: number;
  dice: [number, number] | null;
  doublesCount: number;
  pending: Pending | null;
  ownership: Record<number, Ownership>;
  vacationPot: number;
  log: LogEntry[];
  chat: ChatMessage[];
  trades: TradeOffer[];
  /** Ids of players with the "create a trade" modal open right now — presence only, not persisted meaningfully. */
  composing: string[];
  voteKick: VoteKick | null;
  winner: string | null;
  createdAt: number;
  emptySince?: number | null;
  /** Cheat commands are accepted only while this is set. */
  sandbox?: boolean;
  stats: GameStats;
}

/** The snapshot broadcast to every client in a room. */
export interface RoomState {
  id: string;
  phase: GamePhase;
  hostId: string | null;
  settings: GameSettings;
  players: Player[];
  order: string[];
  currentPlayerId: string | null;
  dice: [number, number] | null;
  pending: Pending | null;
  ownership: Record<number, Ownership>;
  vacationPot: number;
  winner: string | null;
  log: LogEntry[];
  chat: ChatMessage[];
  trades: TradeOffer[];
  composing: string[];
  voteKick: VoteKick | null;
  sandbox?: boolean;
  stats?: GameStats;
}

export interface EngineResult {
  error?: string;
}
