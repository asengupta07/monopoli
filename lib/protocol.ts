import type { GameSettings, GroupKey, RoomState } from '@/types/game';

export interface TradeInput {
  toId: string;
  fromProperties: number[];
  toProperties: number[];
  fromCash: number;
  toCash: number;
  message?: string;
}

export type TradeResponse = 'accept' | 'decline' | 'cancel';

export const C2S = {
  WATCH: 'watch',
  JOIN: 'join',
  REJOIN: 'rejoin',
  SET_APPEARANCE: 'setAppearance',
  UPDATE_SETTINGS: 'updateSettings',
  START: 'start',
  REMATCH: 'rematch',
  ROLL: 'roll',
  BUY: 'buy',
  SKIP: 'skip',
  BID: 'bid',
  PASS: 'pass',
  END_TURN: 'endTurn',
  BUILD: 'build',
  SELL_HOUSE: 'sellHouse',
  SELL_PROPERTY: 'sellProperty',
  MORTGAGE: 'mortgage',
  UNMORTGAGE: 'unmortgage',
  BANKRUPT: 'bankrupt',
  PROPOSE_TRADE: 'proposeTrade',
  RESPOND_TRADE: 'respondTrade',
  TRADE_DRAFT: 'tradeDraft',
  CHAT: 'chat',
  LEAVE: 'leave',
  PING: 'ping',
  SANDBOX: 'sandbox',
} as const;

export const S2C = {
  JOINED: 'joined',
  STATE: 'state',
  ERROR: 'error',
  PONG: 'pong',
} as const;

/** Lab cheats. The server rejects these unless the room is a sandbox. */
export type SandboxCommand =
  | { op: 'reset' }
  | { op: 'start' }
  | { op: 'addDummy'; name?: string }
  | { op: 'remove'; playerId: string }
  | { op: 'possess'; playerId: string }
  | { op: 'setTurn'; playerId: string }
  | { op: 'setCash'; playerId: string; cash: number }
  | { op: 'setPos'; playerId: string; pos: number; land?: boolean }
  | { op: 'setDice'; d1: number; d2: number }
  | { op: 'forceRoll'; d1: number; d2: number }
  | { op: 'grant'; playerId: string; tileIndex: number }
  | { op: 'revoke'; tileIndex: number }
  | { op: 'grantGroup'; playerId: string; group: GroupKey }
  | { op: 'setHouses'; tileIndex: number; houses: number }
  | { op: 'setMortgage'; tileIndex: number; mortgaged: boolean }
  | { op: 'jail'; playerId: string; inPrison: boolean }
  | { op: 'setPot'; amount: number }
  | { op: 'bankrupt'; playerId: string }
  | { op: 'revive'; playerId: string }
  | { op: 'offerBuy'; playerId: string; tileIndex: number }
  | { op: 'openAuction'; tileIndex: number }
  | { op: 'clearPending' }
  | { op: 'endGame'; winnerId?: string };

export type ClientMessage =
  | { type: typeof C2S.WATCH; roomId: string; sandbox?: boolean }
  | { type: typeof C2S.JOIN; roomId: string; name: string; color: string }
  | { type: typeof C2S.SANDBOX } & SandboxCommand
  | { type: typeof C2S.REJOIN; roomId: string; playerId: string }
  | { type: typeof C2S.SET_APPEARANCE; color: string }
  | { type: typeof C2S.UPDATE_SETTINGS; settings: Partial<GameSettings> }
  | { type: typeof C2S.START }
  | { type: typeof C2S.REMATCH }
  | { type: typeof C2S.ROLL }
  | { type: typeof C2S.BUY }
  | { type: typeof C2S.SKIP }
  | { type: typeof C2S.BID; amount: number }
  | { type: typeof C2S.PASS }
  | { type: typeof C2S.END_TURN }
  | { type: typeof C2S.BUILD; tileIndex: number }
  | { type: typeof C2S.SELL_HOUSE; tileIndex: number }
  | { type: typeof C2S.SELL_PROPERTY; tileIndex: number }
  | { type: typeof C2S.MORTGAGE; tileIndex: number }
  | { type: typeof C2S.UNMORTGAGE; tileIndex: number }
  | { type: typeof C2S.BANKRUPT }
  | ({ type: typeof C2S.PROPOSE_TRADE } & TradeInput)
  | { type: typeof C2S.RESPOND_TRADE; tradeId: string; action: TradeResponse }
  | { type: typeof C2S.TRADE_DRAFT; drafting: boolean }
  | { type: typeof C2S.CHAT; text: string }
  | { type: typeof C2S.LEAVE }
  | { type: typeof C2S.PING };

export type ServerMessage =
  | { type: typeof S2C.JOINED; playerId: string; roomId: string }
  | { type: typeof S2C.STATE; state: RoomState }
  | { type: typeof S2C.ERROR; message: string }
  | { type: typeof S2C.PONG };

export const ROOM_ID_RE = /^[a-z0-9]{3,12}$/;

/** Reserved ids for the UI lab. Real games never use these prefixes. */
export function isSandboxRoomId(id: string): boolean {
  return id === 'sandbox' || id.startsWith('lab');
}

export function makeRoomCode(): string {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 5; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}
